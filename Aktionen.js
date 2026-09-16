// Aktionen fürs Dashboard: uebernehmen, aufgabe, termin, verschieben, ablegen,
// erledigt, bearbeiten, loeschen. Ändern in dieser Session nur das Sheet, rufen
// aber schon die (noch leeren) Outlook-Funktionen aus Outlook.js auf.

var AENDERBARE_FELDER = ['Titel', 'Datum', 'Uhrzeit', 'Status', 'Erinnerungsdatum', 'Person', 'Projekt', 'Typ', 'Kurzfassung', 'Prüfen'];

function aktionUebernehmen_(id) {
  var eintrag = eintragLesen_(id);
  switch (eintrag.Aktion_Vorschlag) {
    case 'Aufgabe': return aktionAufgabe_(id, {});
    case 'Termin': return aktionTermin_(id, {});
    case 'Ablegen': return aktionAblegen_(id);
    default: throw new Error('Kein Aktionsvorschlag für ID ' + id + ' vorhanden - bitte Aktion manuell wählen.');
  }
}

// felder nutzt dieselben (großgeschriebenen) Feldnamen wie AENDERBARE_FELDER/das Sheet,
// nicht die kleingeschriebenen Claude-Schema-Namen - Konsistenz mit aktionBearbeiten_.
function aktionAufgabe_(id, felder) {
  var setzen = { Typ: 'Aufgabe', Status: 'offen' };
  if (felder && felder.Datum !== undefined) setzen.Datum = felder.Datum;
  if (felder && felder.Erinnerungsdatum !== undefined) setzen.Erinnerungsdatum = felder.Erinnerungsdatum;
  var eintrag = eintragFelderSetzen_(id, setzen, true);
  outlookSynchronisieren_(eintrag);
  return eintrag;
}

function aktionTermin_(id, felder) {
  var setzen = { Typ: 'Termin', Status: 'offen' };
  if (felder && felder.Datum !== undefined) setzen.Datum = felder.Datum;
  if (felder && felder.Uhrzeit !== undefined) setzen.Uhrzeit = felder.Uhrzeit;
  var eintrag = eintragFelderSetzen_(id, setzen, true);
  outlookSynchronisieren_(eintrag);
  return eintrag;
}

// Setzt Status mit auf "offen" zurück: Verschieben eines erledigten/abgelegten Eintrags
// bedeutet, dass er wieder aktiv ist - sonst bliebe er trotz neuem Datum unsichtbar in
// Heute/Woche (die abgelegt/erledigt herausfiltern).
function aktionVerschieben_(id, neuesDatum) {
  var eintrag = eintragFelderSetzen_(id, { Datum: neuesDatum, Status: 'offen' }, true);
  outlookSynchronisieren_(eintrag);
  return eintrag;
}

function aktionAblegen_(id) {
  var eintrag = eintragFelderSetzen_(id, { Status: 'abgelegt', Datum: '', Erinnerungsdatum: '' }, true);
  outlookSynchronisieren_(eintrag);
  return eintrag;
}

function aktionErledigt_(id) {
  var eintrag = eintragFelderSetzen_(id, { Status: 'erledigt' }, true);
  outlookSynchronisieren_(eintrag);
  return eintrag;
}

function aktionBearbeiten_(id, felder) {
  var gefiltert = {};
  Object.keys(felder || {}).forEach(function (feldName) {
    if (AENDERBARE_FELDER.indexOf(feldName) !== -1) gefiltert[feldName] = felder[feldName];
  });

  // Wie beim Claude-Pfad: Person/Projekt gegen die bekannten Listen abgleichen statt
  // roh zu übernehmen, sonst wachsen die Listen nur noch über neue Sprachnotizen.
  var jetzt = new Date();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (gefiltert.Person) {
    gefiltert.Person = nameAbgleichen_(ss.getSheetByName(SHEET_PERSONEN), gefiltert.Person, jetzt).kanonisch;
  }
  if (gefiltert.Projekt) {
    gefiltert.Projekt = nameAbgleichen_(ss.getSheetByName(SHEET_PROJEKTE), gefiltert.Projekt, jetzt).kanonisch;
  }

  var eintrag = eintragFelderSetzen_(id, gefiltert, true);
  outlookSynchronisieren_(eintrag);
  return eintrag;
}

function aktionLoeschen_(id) {
  var eintrag = eintragLesen_(id);
  outlook_loeschen(eintrag);
  eintraegeLoeschen_([id]);
}

// Aufgabe/Termin: anlegen oder aktualisieren. Wechselt ein Eintrag weg von Aufgabe/Termin
// (z.B. über Bearbeiten zu Notiz), aber war schon mit Outlook verknüpft, dort entfernen -
// sonst bleibt ein verwaistes Outlook-Element stehen.
function outlookSynchronisieren_(eintrag) {
  var syncFaehig = eintrag.Typ === 'Aufgabe' || eintrag.Typ === 'Termin';
  if (!syncFaehig) {
    if (eintrag.Outlook_ID) {
      outlook_loeschen(eintrag);
      outlookVerknuepfungLoeschen_(eintrag.ID);
    }
    return;
  }
  if (eintrag.Outlook_ID) {
    outlook_aktualisieren(eintrag);
  } else {
    outlook_erstellen(eintrag);
  }
}

function eintragLesen_(id) {
  var notizen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTIZEN);
  var zeileNr = findeZeileNachId_(notizen, id);
  if (zeileNr === -1) throw new Error('Eintrag mit ID ' + id + ' nicht gefunden.');
  return zeileZuObjekt_(notizen.getRange(zeileNr, 1, 1, SPALTEN_NOTIZEN.length).getValues()[0]);
}

/**
 * Setzt beliebige Felder einer Zeile (per ID), stempelt Geaendert und schließt
 * optional den Eingang. "felder"-Werte sind vom Aufrufer kontrolliert (außer bei
 * aktionBearbeiten_, das vorher filtert) - hier keine erneute Whitelist nötig.
 */
function eintragFelderSetzen_(id, felder, eingangSchliessen) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var notizen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTIZEN);
    var zeileNr = findeZeileNachId_(notizen, id);
    if (zeileNr === -1) throw new Error('Eintrag mit ID ' + id + ' nicht gefunden.');

    var alleFelder = {};
    Object.keys(felder || {}).forEach(function (k) { alleFelder[k] = felder[k]; });
    if (eingangSchliessen) alleFelder.Eingang = 'nein';
    alleFelder.Geaendert = new Date();

    Object.keys(alleFelder).forEach(function (feldName) {
      var spaltenIndex = SPALTEN_NOTIZEN.indexOf(feldName) + 1;
      if (spaltenIndex < 1) return;
      var wert = alleFelder[feldName];
      // Früher wurde ein ungültiger Wert still übersprungen - die PWA bekam ok:true und
      // einen unveränderten Eintrag zurück, ohne dass jemand den Fehler bemerkt hätte.
      if (feldName === 'Status' && STATUS_WERTE.indexOf(wert) === -1) {
        throw new Error('Ungültiger Status: ' + JSON.stringify(wert));
      }
      if (feldName === 'Typ' && TYP_WERTE.indexOf(wert) === -1) {
        throw new Error('Ungültiger Typ: ' + JSON.stringify(wert));
      }
      if ((feldName === 'Datum' || feldName === 'Erinnerungsdatum') && !(wert instanceof Date)) {
        wert = datumAusText_(wert);
      }
      if (feldName === 'Uhrzeit') wert = uhrzeitAusText_(wert);
      if (feldName === 'Prüfen') wert = wert === true;
      notizen.getRange(zeileNr, spaltenIndex).setValue(klartext_(wert));
    });

    var neueWerte = notizen.getRange(zeileNr, 1, 1, SPALTEN_NOTIZEN.length).getValues()[0];
    return zeileZuObjekt_(neueWerte);
  } finally {
    lock.releaseLock();
  }
}
