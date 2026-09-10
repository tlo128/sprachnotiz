// Legt die Blattstruktur an bzw. prüft sie. Einmal im Editor ausführen: einrichtenSheet()

function einrichtenSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var notizen = sheetSicherstellen_(ss, SHEET_NOTIZEN, SPALTEN_NOTIZEN);
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
  return sheet;
}
