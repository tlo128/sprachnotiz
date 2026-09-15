// Lesezugriffe für die PWA: Liste mit Filtern.

function listeAbrufen_(filter, wert) {
  var notizen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTIZEN);
  var alle = alleZeilenAlsObjekte_(notizen);
  var heute = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd');
  var wocheEnde = Utilities.formatDate(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), 'Europe/Berlin', 'yyyy-MM-dd');
  var gefiltert;

  switch (filter) {
    case 'eingang':
      gefiltert = alle.filter(function (e) { return e.Eingang === 'ja'; });
      break;
    case 'heute':
      gefiltert = alle.filter(function (e) { return aktivesDatum_(e) && String(e.Datum || '').substring(0, 10) === heute; });
      break;
    case 'woche':
      gefiltert = alle.filter(function (e) {
        var d = String(e.Datum || '').substring(0, 10);
        return aktivesDatum_(e) && d && d >= heute && d <= wocheEnde;
      });
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
    default:
      gefiltert = alle;
  }

  if (filter === 'heute' || filter === 'woche') {
    gefiltert.sort(function (a, b) {
      var da = String(a.Datum || '').substring(0, 10) + ' ' + (a.Uhrzeit || '00:00');
      var db = String(b.Datum || '').substring(0, 10) + ' ' + (b.Uhrzeit || '00:00');
      return da < db ? -1 : da > db ? 1 : 0;
    });
  } else {
    gefiltert.sort(function (a, b) { return new Date(b.Erstellt) - new Date(a.Erstellt); });
  }
  return gefiltert;
}

// Abgelegtes und Erledigtes taucht nur noch in der Suche auf, nicht unter Heute/Woche.
function aktivesDatum_(e) {
  return e.Status !== 'abgelegt' && e.Status !== 'erledigt';
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
