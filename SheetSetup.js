// Legt die Blattstruktur an bzw. prüft sie. Einmal im Editor ausführen: einrichtenSheet()

function einrichtenSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  notizenDatenmodellMigrieren_(ss);
  sheetSicherstellen_(ss, SHEET_PERSONEN, SPALTEN_NAMENSLISTE);
  sheetSicherstellen_(ss, SHEET_PROJEKTE, SPALTEN_NAMENSLISTE);

  // Das Standardblatt "Tabelle1" (falls leer und ungenutzt) aufräumen.
  var standard = ss.getSheetByName('Tabelle1');
  if (standard && ss.getSheets().length > 1) {
    var belegt = standard.getLastRow() > 0 || standard.getLastColumn() > 0;
    if (!belegt) {
      ss.deleteSheet(standard);
    }
  }

  Logger.log('Sheet-Struktur eingerichtet: ' + SHEET_NOTIZEN + ', ' + SHEET_PERSONEN + ', ' + SHEET_PROJEKTE);
}

// Backend liest/schreibt Spalten rein nach Position (SPALTEN_NOTIZEN-Index). Wird die
// Kopfzeile manuell verändert (Spalte verschoben/umbenannt), würde das sonst still zu
// falsch zugeordneten Werten führen. Deshalb vor jedem Aufruf prüfen.
function notizenHeaderPruefen_() {
  var notizen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTIZEN);
  if (!notizen) throw new Error('Blatt "' + SHEET_NOTIZEN + '" fehlt. Bitte einrichtenSheet() im Editor ausführen.');
  var header = notizen.getRange(1, 1, 1, SPALTEN_NOTIZEN.length).getValues()[0];
  var passt = SPALTEN_NOTIZEN.every(function (spalte, i) { return header[i] === spalte; });
  if (!passt) {
    throw new Error('Spalten im Blatt "' + SHEET_NOTIZEN + '" stimmen nicht mit dem erwarteten Datenmodell überein ' +
      '(wurden vermutlich manuell verschoben/umbenannt). Bitte einrichtenSheet() im Editor ausführen und die Kopfzeile prüfen.');
  }
}

/**
 * Legt "Notizen" frisch an, oder migriert ein bestehendes Blatt auf das
 * aktuelle Datenmodell: fehlende Spalten werden an der richtigen Stelle
 * eingefügt (nicht ans Ende gehängt), damit bestehende Daten nicht unter
 * falschen Überschriften landen. Mehrfach sicher ausführbar.
 */
// Spalten, die reinen (unausgewerteten) Text enthalten müssen: verhindert, dass Sheets
// ein diktiertes/getipptes "=..." als Formel ausführt (Titel, Person, Projekt, Kurzfassung,
// Originaltext), und dass "14:00" in der Uhrzeit-Spalte zu einem Zeitwert konvertiert wird
// (das würde vorschlagText(), die Sortierung und das Bearbeiten-Feld <input type="time"> brechen).
var NOTIZEN_TEXTSPALTEN = ['Titel', 'Person', 'Projekt', 'Uhrzeit', 'Kurzfassung', 'Originaltext'];

function spalteAlsTextFormatieren_(sheet, header, spaltenName) {
  var index = header.indexOf(spaltenName);
  if (index === -1) return;
  sheet.getRange(1, index + 1, Math.max(sheet.getMaxRows(), 1000), 1).setNumberFormat('@');
}

function notizenDatenmodellMigrieren_(ss) {
  var notizen = ss.getSheetByName(SHEET_NOTIZEN);
  if (!notizen) {
    notizen = ss.insertSheet(SHEET_NOTIZEN);
    notizen.getRange(1, 1, 1, SPALTEN_NOTIZEN.length).setValues([SPALTEN_NOTIZEN]);
    notizen.setFrozenRows(1);
    notizen.getRange(1, 1, 1, SPALTEN_NOTIZEN.length).setFontWeight('bold');
    NOTIZEN_TEXTSPALTEN.forEach(function (spalte) { spalteAlsTextFormatieren_(notizen, SPALTEN_NOTIZEN, spalte); });
    return notizen;
  }

  // Reihenfolge wichtig: jeder Anker existiert entweder schon immer (Kernfeld/Altbestand)
  // oder wurde im selben Durchlauf einen Schritt vorher eingefügt.
  var einzufuegen = [
    { name: 'Uhrzeit', nach: 'Typ' },
    { name: 'Eingang', nach: 'Prüfen' },
    { name: 'Aktion_Vorschlag', nach: 'Eingang' },
    { name: 'Outlook_ID', nach: 'Aktion_Vorschlag' },
    { name: 'Outlook_Typ', nach: 'Outlook_ID' },
    { name: 'Outlook_Geaendert', nach: 'Outlook_Typ' },
    { name: 'Geaendert', nach: 'Erstellt' }
  ];

  einzufuegen.forEach(function (spalte) {
    var header = notizen.getRange(1, 1, 1, notizen.getLastColumn()).getValues()[0];
    if (header.indexOf(spalte.name) !== -1) return; // bereits vorhanden

    var nachIndex = header.indexOf(spalte.nach); // 0-basiert
    if (nachIndex === -1) {
      // Anker unerwartet nicht gefunden -> sicherheitshalber ans Ende, nichts verlieren.
      notizen.getRange(1, notizen.getLastColumn() + 1).setValue(spalte.name);
      return;
    }
    notizen.insertColumnAfter(nachIndex + 1);
    notizen.getRange(1, nachIndex + 2).setValue(spalte.name);
  });

  notizenBestandsdatenMigrieren_(notizen);
  notizen.setFrozenRows(1);
  notizen.getRange(1, 1, 1, notizen.getLastColumn()).setFontWeight('bold');

  var aktuellerHeader = notizen.getRange(1, 1, 1, notizen.getLastColumn()).getValues()[0];
  NOTIZEN_TEXTSPALTEN.forEach(function (spalte) { spalteAlsTextFormatieren_(notizen, aktuellerHeader, spalte); });

  return notizen;
}

// Bestehende Zeilen: Eingang = nein (falls noch leer), Geaendert = Erstellt (falls noch leer).
// Überschreibt nie einen bereits gesetzten Wert - sicher mehrfach ausführbar.
function notizenBestandsdatenMigrieren_(notizen) {
  var letzteZeile = notizen.getLastRow();
  if (letzteZeile < 2) return;

  var header = notizen.getRange(1, 1, 1, notizen.getLastColumn()).getValues()[0];
  var idxEingang = header.indexOf('Eingang') + 1;
  var idxErstellt = header.indexOf('Erstellt') + 1;
  var idxGeaendert = header.indexOf('Geaendert') + 1;

  var eingangBereich = notizen.getRange(2, idxEingang, letzteZeile - 1, 1);
  eingangBereich.setValues(eingangBereich.getValues().map(function (z) { return [z[0] || 'nein']; }));

  var erstelltWerte = notizen.getRange(2, idxErstellt, letzteZeile - 1, 1).getValues();
  var geaendertBereich = notizen.getRange(2, idxGeaendert, letzteZeile - 1, 1);
  geaendertBereich.setValues(geaendertBereich.getValues().map(function (z, i) { return [z[0] || erstelltWerte[i][0]]; }));
}

function sheetSicherstellen_(ss, name, spalten) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  var kopfzeile = sheet.getRange(1, 1, 1, spalten.length).getValues()[0];
  var passtSchon = spalten.every(function (spalte, i) { return kopfzeile[i] === spalte; });
  if (!passtSchon) {
    sheet.getRange(1, 1, 1, spalten.length).setValues([spalten]);
  }
  sheet.setFrozenRows(1);
  var kopfBereich = sheet.getRange(1, 1, 1, spalten.length);
  kopfBereich.setFontWeight('bold');
  spalteAlsTextFormatieren_(sheet, spalten, 'Name');
  spalteAlsTextFormatieren_(sheet, spalten, 'Schreibvarianten');
  return sheet;
}
