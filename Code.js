// Einstiegspunkt für die PWA (Web-App-Deployment: Ausführung als Ich, Zugriff Jeder).
// Alle Aufrufe laufen über POST mit JSON-Body, damit der Schlüssel nie in einer URL steht.

var MAX_TEXTLAENGE = 5000;

function doPost(e) {
  var antwort;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Leerer Aufruf - erwartet wird ein POST mit JSON-Body.');
    }
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

// Vergleich ohne frühzeitigen Abbruch. Über HTTPS auf Apps Script praktisch nicht
// ausnutzbar, aber billig genug, um die Zeitmessung gar nicht erst als Angriffsfläche
// stehen zu lassen.
function schluesselGueltig_(schluessel) {
  var erwartet = PropertiesService.getScriptProperties().getProperty('GEHEIMER_SCHLUESSEL');
  if (!erwartet || typeof schluessel !== 'string' || schluessel.length !== erwartet.length) return false;
  var abweichung = 0;
  for (var i = 0; i < erwartet.length; i++) {
    abweichung |= schluessel.charCodeAt(i) ^ erwartet.charCodeAt(i);
  }
  return abweichung === 0;
}

// "" und null würden über Number() beide zu 0 und könnten so eine Zeile mit leerer
// ID-Zelle treffen (findeZeileNachId_ vergleicht numerisch). Deshalb vorher hart prüfen.
function idPruefen_(id) {
  var zahl = Number(id);
  if ((typeof id !== 'number' && typeof id !== 'string') || String(id).trim() === '' ||
      !isFinite(zahl) || zahl <= 0) {
    throw new Error('Ungültige ID: ' + JSON.stringify(id));
  }
  return zahl;
}

function aktionAusfuehren_(daten) {
  switch (daten.aktion) {
    case 'liste':
      return { ok: true, eintraege: listeAbrufen_(daten.filter, daten.wert) };
    case 'uebernehmen':
      return { ok: true, eintrag: aktionUebernehmen_(idPruefen_(daten.id)) };
    case 'aufgabe':
      return { ok: true, eintrag: aktionAufgabe_(idPruefen_(daten.id), daten.felder || {}) };
    case 'termin':
      return { ok: true, eintrag: aktionTermin_(idPruefen_(daten.id), daten.felder || {}) };
    case 'verschieben':
      if (!daten.datum) return { ok: false, fehler: 'Kein Datum übergeben.' };
      return { ok: true, eintrag: aktionVerschieben_(idPruefen_(daten.id), daten.datum) };
    case 'ablegen':
      return { ok: true, eintrag: aktionAblegen_(idPruefen_(daten.id)) };
    case 'erledigt':
      return { ok: true, eintrag: aktionErledigt_(idPruefen_(daten.id)) };
    case 'bearbeiten':
    case 'aendern': // Alias, solange ältere PWA-Versionen noch "aendern" senden
      return { ok: true, eintrag: aktionBearbeiten_(idPruefen_(daten.id), daten.felder) };
    case 'loeschen':
      aktionLoeschen_(idPruefen_(daten.id));
      return { ok: true };
    case 'rueckgaengig':
      var rueckIds = Array.isArray(daten.ids) ? daten.ids : [daten.id];
      eintraegeLoeschen_(rueckIds.map(function (id) { return idPruefen_(id); }));
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
