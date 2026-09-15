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

function aktionAufgabe_(id, felder) {
  var setzen = { Typ: 'Aufgabe', Status: 'offen' };
  if (felder && felder.datum !== undefined) setzen.Datum = felder.datum;
  if (felder && felder.erinnerungsdatum !== undefined) setzen.Erinnerungsdatum = felder.erinnerungsdatum;
  var eintrag = eintragFelderSetzen_(id, setzen, true);
  outlookSynchronisieren_(eintrag);
  return eintrag;
}

function aktionTermin_(id, felder) {
  var setzen = { Typ: 'Termin', Status: 'offen' };
  if (felder && felder.datum !== undefined) setzen.Datum = felder.datum;
  if (felder && felder.uhrzeit !== undefined) setzen.Uhrzeit = felder.uhrzeit;
  var eintrag = eintragFelderSetzen_(id, setzen, true);
  outlookSynchronisieren_(eintrag);
  return eintrag;
}

function aktionVerschieben_(id, neuesDatum) {
  var eintrag = eintragFelderSetzen_(id, { Datum: neuesDatum }, true);
  outlookSynchronisieren_(eintrag);
  return eintrag;
}

function aktionAblegen_(id) {
  return eintragFelderSetzen_(id, { Status: 'abgelegt', Datum: '', Erinnerungsdatum: '' }, true);
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
  var eintrag = eintragFelderSetzen_(id, gefiltert, true);
  outlookSynchronisieren_(eintrag);
  return eintrag;
}

function aktionLoeschen_(id) {
  var eintrag = eintragLesen_(id);
  outlook_loeschen(eintrag);
  eintraegeLoeschen_([id]);
}

function outlookSynchronisieren_(eintrag) {
  if (eintrag.Typ !== 'Aufgabe' && eintrag.Typ !== 'Termin') return;
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
      if (feldName === 'Status' && STATUS_WERTE.indexOf(wert) === -1) return;
      if (feldName === 'Typ' && TYP_WERTE.indexOf(wert) === -1) return;
      if ((feldName === 'Datum' || feldName === 'Erinnerungsdatum') && !(wert instanceof Date)) {
        wert = datumAusText_(wert);
      }
      if (feldName === 'Uhrzeit') wert = uhrzeitAusText_(wert);
      if (feldName === 'Prüfen') wert = wert === true;
      notizen.getRange(zeileNr, spaltenIndex).setValue(wert);
    });

    var neueWerte = notizen.getRange(zeileNr, 1, 1, SPALTEN_NOTIZEN.length).getValues()[0];
    return zeileZuObjekt_(neueWerte);
  } finally {
    lock.releaseLock();
  }
}
