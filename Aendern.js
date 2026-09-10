// Schreibzugriffe für die PWA: Eintrag ändern, Rückgängig (letzte Einträge löschen).

var AENDERBARE_FELDER = ['Titel', 'Datum', 'Status', 'Erinnerungsdatum', 'Person', 'Projekt', 'Typ', 'Kurzfassung', 'Prüfen'];

function eintragAendern_(id, felder) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var notizen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTIZEN);
    var zeileNr = findeZeileNachId_(notizen, id);
    if (zeileNr === -1) throw new Error('Eintrag mit ID ' + id + ' nicht gefunden.');

    Object.keys(felder || {}).forEach(function (feldName) {
      if (AENDERBARE_FELDER.indexOf(feldName) === -1) return;
      var spaltenIndex = SPALTEN_NOTIZEN.indexOf(feldName) + 1;
      var wert = felder[feldName];
      if ((feldName === 'Datum' || feldName === 'Erinnerungsdatum') && wert) {
        wert = datumAusText_(wert);
      }
      notizen.getRange(zeileNr, spaltenIndex).setValue(wert);
    });

    var neueWerte = notizen.getRange(zeileNr, 1, 1, SPALTEN_NOTIZEN.length).getValues()[0];
    return zeileZuObjekt_(neueWerte);
  } finally {
    lock.releaseLock();
  }
}

function eintraegeLoeschen_(ids) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var notizen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTIZEN);
    var zeilenNummern = ids
      .map(function (id) { return findeZeileNachId_(notizen, id); })
      .filter(function (z) { return z !== -1; })
      .sort(function (a, b) { return b - a; }); // von unten nach oben löschen
    zeilenNummern.forEach(function (z) { notizen.deleteRow(z); });
    return zeilenNummern.length;
  } finally {
    lock.releaseLock();
  }
}

function findeZeileNachId_(sheet, id) {
  var letzteZeile = sheet.getLastRow();
  if (letzteZeile < 2) return -1;
  var idSpalte = sheet.getRange(2, 1, letzteZeile - 1, 1).getValues();
  for (var i = 0; i < idSpalte.length; i++) {
    if (Number(idSpalte[i][0]) === Number(id)) return i + 2;
  }
  return -1;
}
