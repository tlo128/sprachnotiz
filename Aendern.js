// Rückgängig (letzte Einträge löschen) und die von Aktionen.js genutzte Zeilensuche.
// Das Feld-Setzen selbst (inkl. Whitelist AENDERBARE_FELDER) lebt in Aktionen.js.

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
  var gesucht = Number(id);
  // Leere ID-Zellen und eine leere/ungültige Suchvorgabe ergeben über Number() beide 0 -
  // ohne diese Prüfung könnte ein Aufruf ohne ID die erste unvollständige Zeile treffen.
  if (!isFinite(gesucht) || gesucht <= 0) return -1;

  var letzteZeile = sheet.getLastRow();
  if (letzteZeile < 2) return -1;
  var idSpalte = sheet.getRange(2, 1, letzteZeile - 1, 1).getValues();
  for (var i = 0; i < idSpalte.length; i++) {
    if (String(idSpalte[i][0]).trim() === '') continue;
    if (Number(idSpalte[i][0]) === gesucht) return i + 2;
  }
  return -1;
}
