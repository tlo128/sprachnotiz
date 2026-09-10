// Einstiegspunkt für die PWA. Erwartet POST-Body: {text, zeitstempel, schluessel}.
function doPost(e) {
  var antwort;
  try {
    var daten = JSON.parse(e.postData.contents);

    if (daten.schluessel !== scriptEigenschaft_('GEHEIMER_SCHLUESSEL')) {
      antwort = { ok: false, fehler: 'Ungültiger Schlüssel.' };
    } else if (!daten.text) {
      antwort = { ok: false, fehler: 'Kein Text übergeben.' };
    } else {
      var eintraege = verarbeite(daten.text, daten.zeitstempel);
      antwort = { ok: true, eintraege: eintraege };
    }
  } catch (fehler) {
    antwort = { ok: false, fehler: String(fehler) };
  }

  return ContentService.createTextOutput(JSON.stringify(antwort))
    .setMimeType(ContentService.MimeType.JSON);
}

// Für einen schnellen Erreichbarkeits-Check im Browser.
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, info: 'Sprachnotiz-Backend läuft.' }))
    .setMimeType(ContentService.MimeType.JSON);
}
