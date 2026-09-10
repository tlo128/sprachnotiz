// Lesezugriffe für die PWA: Liste mit Filtern.

function listeAbrufen_(filter, wert) {
  var notizen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTIZEN);
  var alle = alleZeilenAlsObjekte_(notizen);
  var heute = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd');
  var gefiltert;

  switch (filter) {
    case 'offen':
      gefiltert = alle.filter(function (e) { return e.Status === 'offen'; });
      break;
    case 'pruefen':
      gefiltert = alle.filter(function (e) { return e['Prüfen'] === true || e.Status === 'prüfen'; });
      break;
    case 'person':
      gefiltert = alle.filter(function (e) { return gleich_(e.Person, wert); });
      break;
    case 'projekt':
      gefiltert = alle.filter(function (e) { return gleich_(e.Projekt, wert); });
      break;
    case 'suche':
      var suchwert = (wert || '').toLowerCase();
      gefiltert = alle.filter(function (e) {
        return [e.Titel, e.Kurzfassung, e.Originaltext, e.Person, e.Projekt].some(function (feld) {
          return (feld || '').toString().toLowerCase().indexOf(suchwert) !== -1;
        });
      });
      break;
    case 'alle':
      gefiltert = alle;
      break;
    case 'heute_offen':
    default:
      gefiltert = alle.filter(function (e) {
        var erstelltDatum = e.Erstellt ? String(e.Erstellt).substring(0, 10) : '';
        return erstelltDatum === heute || e.Status === 'offen';
      });
  }

  gefiltert.sort(function (a, b) { return new Date(b.Erstellt) - new Date(a.Erstellt); });
  return gefiltert;
}

function gleich_(wert, gesucht) {
  return (wert || '').toString().toLowerCase() === (gesucht || '').toString().toLowerCase();
}

function alleZeilenAlsObjekte_(sheet) {
  var letzteZeile = sheet.getLastRow();
  if (letzteZeile < 2) return [];
  var werte = sheet.getRange(2, 1, letzteZeile - 1, SPALTEN_NOTIZEN.length).getValues();
  return werte.map(zeileZuObjekt_);
}

function zeileZuObjekt_(zeile) {
  var obj = {};
  SPALTEN_NOTIZEN.forEach(function (spalte, i) {
    var wert = zeile[i];
    obj[spalte] = (wert instanceof Date)
      ? Utilities.formatDate(wert, 'Europe/Berlin', "yyyy-MM-dd'T'HH:mm:ss")
      : wert;
  });
  return obj;
}
