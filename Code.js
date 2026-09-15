// Einstiegspunkt für die PWA (Web-App-Deployment: Ausführung als Ich, Zugriff Jeder).
// Alle Aufrufe laufen über POST mit JSON-Body, damit der Schlüssel nie in einer URL steht.

var MAX_TEXTLAENGE = 5000;

function doPost(e) {
  var antwort;
  try {
    var daten = JSON.parse(e.postData.contents);
    if (!schluesselGueltig_(daten.schluessel)) {
      antwort = { ok: false, fehler: 'Ungültiger Schlüssel.' };
    } else {
      notizenHeaderPruefen_();
      antwort = aktionAusfuehren_(daten);
    }
  } catch (fehler) {
    antwort = { ok: false, fehler: String(fehler) };
  }
  return jsonAntwort_(antwort);
}

function doGet() {
  return jsonAntwort_({ ok: false, fehler: 'Nur POST erlaubt.' });
}

function schluesselGueltig_(schluessel) {
  var erwartet = PropertiesService.getScriptProperties().getProperty('GEHEIMER_SCHLUESSEL');
  return !!erwartet && typeof schluessel === 'string' && schluessel === erwartet;
}

function aktionAusfuehren_(daten) {
  switch (daten.aktion) {
    case 'liste':
      return { ok: true, eintraege: listeAbrufen_(daten.filter, daten.wert) };
    case 'uebernehmen':
      return { ok: true, eintrag: aktionUebernehmen_(daten.id) };
    case 'aufgabe':
      return { ok: true, eintrag: aktionAufgabe_(daten.id, daten.felder || {}) };
    case 'termin':
      return { ok: true, eintrag: aktionTermin_(daten.id, daten.felder || {}) };
    case 'verschieben':
      if (!daten.datum) return { ok: false, fehler: 'Kein Datum übergeben.' };
      return { ok: true, eintrag: aktionVerschieben_(daten.id, daten.datum) };
    case 'ablegen':
      return { ok: true, eintrag: aktionAblegen_(daten.id) };
    case 'erledigt':
      return { ok: true, eintrag: aktionErledigt_(daten.id) };
    case 'bearbeiten':
    case 'aendern': // Alias, solange ältere PWA-Versionen noch "aendern" senden
      return { ok: true, eintrag: aktionBearbeiten_(daten.id, daten.felder) };
    case 'loeschen':
      aktionLoeschen_(daten.id);
      return { ok: true };
    case 'rueckgaengig':
      eintraegeLoeschen_(daten.ids || [daten.id]);
      return { ok: true };
    case 'erfassen':
      var text = typeof daten.text === 'string' ? daten.text.trim() : '';
      if (!text) return { ok: false, fehler: 'Kein Text übergeben.' };
      if (text.length > MAX_TEXTLAENGE) {
        return { ok: false, fehler: 'Text zu lang (max. ' + MAX_TEXTLAENGE + ' Zeichen).' };
      }
      return { ok: true, eintraege: verarbeite(text, daten.zeitstempel, daten.clientId) };
    default:
      return { ok: false, fehler: 'Unbekannte Aktion.' };
  }
}

function jsonAntwort_(objekt) {
  return ContentService.createTextOutput(JSON.stringify(objekt))
    .setMimeType(ContentService.MimeType.JSON);
}
