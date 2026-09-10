// Kernfunktion: verarbeite(text, zeitstempel) strukturiert eine Sprachnotiz und
// schreibt eine oder mehrere Zeilen ins Sheet.

var WOCHENTAGE_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function jetztAlsText_(jetzt) {
  var wochentag = WOCHENTAGE_DE[Number(Utilities.formatDate(jetzt, 'Europe/Berlin', 'u')) % 7];
  var datum = Utilities.formatDate(jetzt, 'Europe/Berlin', 'yyyy-MM-dd');
  var uhrzeit = Utilities.formatDate(jetzt, 'Europe/Berlin', 'HH:mm');
  return wochentag + ', ' + datum + ' ' + uhrzeit + ' Uhr';
}

function datumAusText_(text) {
  if (!text) return '';
  var teile = String(text).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!teile) return '';
  return new Date(Number(teile[1]), Number(teile[2]) - 1, Number(teile[3]));
}

/**
 * Verarbeitet eine Sprachnotiz: ruft Claude auf, gleicht Namen ab und schreibt
 * die resultierenden Zeilen ins Blatt "Notizen".
 * @param {string} text Roher Notiztext.
 * @param {string} zeitstempel ISO-Zeitstempel, wann die Notiz gesprochen wurde.
 * @return {Array} Die geschriebenen Einträge (als einfache Objekte).
 */
function verarbeite(text, zeitstempel) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var notizen = ss.getSheetByName(SHEET_NOTIZEN);
  var personen = ss.getSheetByName(SHEET_PERSONEN);
  var projekte = ss.getSheetByName(SHEET_PROJEKTE);

  var jetzt = zeitstempel ? new Date(zeitstempel) : new Date();
  var jetztText = jetztAlsText_(jetzt);

  var ergebnis;
  var muessenPruefen = false;

  try {
    ergebnis = rufeClaudeAuf_(
      MODELL_HAIKU, text, jetztText,
      ladeNamenslisteAlsText_(personen), ladeNamenslisteAlsText_(projekte)
    );
  } catch (fehlerHaiku) {
    Logger.log('Haiku-Aufruf fehlgeschlagen: ' + fehlerHaiku);
    return [schreibeRohtextZeile_(notizen, text, jetzt)];
  }

  var unsicher = ergebnis.eintraege.length > 1 || ergebnis.eintraege.some(function (e) {
    return e.confidence < CONFIDENCE_SCHWELLE || e.neue_person || e.neues_projekt ||
      (e.person_aliase && e.person_aliase.length) || (e.projekt_aliase && e.projekt_aliase.length);
  });

  if (unsicher) {
    muessenPruefen = true;
    try {
      ergebnis = rufeClaudeAuf_(
        MODELL_SONNET, text, jetztText,
        ladeNamenslisteAlsText_(personen), ladeNamenslisteAlsText_(projekte)
      );
    } catch (fehlerSonnet) {
      Logger.log('Sonnet-Aufruf fehlgeschlagen, verwende Haiku-Ergebnis: ' + fehlerSonnet);
    }
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var geschrieben = ergebnis.eintraege.map(function (eintrag) {
      return schreibeEintragZeile_(notizen, personen, projekte, eintrag, text, jetzt, muessenPruefen);
    });
  } finally {
    lock.releaseLock();
  }

  return geschrieben;
}

function naechsteId_(sheet) {
  var letzteZeile = sheet.getLastRow();
  if (letzteZeile < 2) return 1;
  var letzteId = Number(sheet.getRange(letzteZeile, 1).getValue());
  return (isNaN(letzteId) ? letzteZeile - 1 : letzteId) + 1;
}

function schreibeEintragZeile_(notizen, personen, projekte, eintrag, originaltext, jetzt, muessenPruefen) {
  var person = eintrag.person ? nameAbgleichen_(personen, eintrag.person, jetzt) : null;
  var projekt = eintrag.projekt ? nameAbgleichen_(projekte, eintrag.projekt, jetzt) : null;

  if (person && eintrag.person_aliase) aliaseHinzufuegen_(personen, person.kanonisch, eintrag.person_aliase, jetzt);
  if (projekt && eintrag.projekt_aliase) aliaseHinzufuegen_(projekte, projekt.kanonisch, eintrag.projekt_aliase, jetzt);

  var zeile = {
    ID: naechsteId_(notizen),
    Titel: eintrag.titel,
    Datum: datumAusText_(eintrag.datum),
    Status: STATUS_WERTE.indexOf(eintrag.status) !== -1 ? eintrag.status : 'prüfen',
    Erinnerungsdatum: datumAusText_(eintrag.erinnerungsdatum),
    Person: person ? person.kanonisch : '',
    Projekt: projekt ? projekt.kanonisch : '',
    Typ: TYP_WERTE.indexOf(eintrag.typ) !== -1 ? eintrag.typ : 'Notiz',
    Kurzfassung: eintrag.kurzfassung,
    Originaltext: originaltext,
    Confidence: eintrag.confidence,
    'Prüfen': muessenPruefen,
    Erstellt: jetzt
  };

  notizen.appendRow(SPALTEN_NOTIZEN.map(function (spalte) { return zeile[spalte]; }));
  return zeile;
}

function schreibeRohtextZeile_(notizen, originaltext, jetzt) {
  var zeile = {
    ID: 0,
    Titel: originaltext.substring(0, 60),
    Datum: '',
    Status: 'prüfen',
    Erinnerungsdatum: '',
    Person: '',
    Projekt: '',
    Typ: 'Notiz',
    Kurzfassung: '',
    Originaltext: originaltext,
    Confidence: 0,
    'Prüfen': true,
    Erstellt: jetzt
  };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    zeile.ID = naechsteId_(notizen);
    notizen.appendRow(SPALTEN_NOTIZEN.map(function (spalte) { return zeile[spalte]; }));
  } finally {
    lock.releaseLock();
  }
  return zeile;
}
