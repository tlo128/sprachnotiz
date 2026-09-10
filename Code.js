// Einstiegspunkt für die PWA (Web-App-Deployment: Ausführung als Ich, Zugriff Jeder).

function doPost(e) {
  var antwort;
  try {
    var daten = JSON.parse(e.postData.contents);

    if (daten.schluessel !== scriptEigenschaft_('GEHEIMER_SCHLUESSEL')) {
      antwort = { ok: false, fehler: 'Ungültiger Schlüssel.' };
    } else {
      switch (daten.aktion) {
        case 'aendern':
          antwort = { ok: true, eintrag: eintragAendern_(daten.id, daten.felder) };
          break;
        case 'rueckgaengig':
          eintraegeLoeschen_(daten.ids || [daten.id]);
          antwort = { ok: true };
          break;
        case 'erfassen':
        default:
          if (!daten.text) {
            antwort = { ok: false, fehler: 'Kein Text übergeben.' };
          } else {
            antwort = { ok: true, eintraege: verarbeite(daten.text, daten.zeitstempel) };
          }
      }
    }
  } catch (fehler) {
    antwort = { ok: false, fehler: String(fehler) };
  }

  return ContentService.createTextOutput(JSON.stringify(antwort))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var antwort;
  try {
    var p = e.parameter;
    if (p.schluessel !== scriptEigenschaft_('GEHEIMER_SCHLUESSEL')) {
      antwort = { ok: false, fehler: 'Ungültiger Schlüssel.' };
    } else if (p.filter === 'stammdaten') {
      antwort = { ok: true, stammdaten: stammdatenAbrufen_() };
    } else {
      antwort = { ok: true, eintraege: listeAbrufen_(p.filter, p.wert) };
    }
  } catch (fehler) {
    antwort = { ok: false, fehler: String(fehler) };
  }

  return ContentService.createTextOutput(JSON.stringify(antwort))
    .setMimeType(ContentService.MimeType.JSON);
}

