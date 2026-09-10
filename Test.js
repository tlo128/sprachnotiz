// Testfunktion mit 10 Beispielsätzen aus dem Immobilienalltag. Im Editor
// ausführen: testMitBeispielsaetzen(). "Jetzt" ist fest auf Mittwoch,
// 09.09.2026 10:00 Uhr gesetzt, damit relative Daten nachprüfbar sind:
// "nächsten Dienstag" -> 2026-09-15, "übermorgen" -> 2026-09-11,
// "Ende des Monats" -> 2026-09-30.

function testMitBeispielsaetzen() {
  var jetzt = '2026-09-09T10:00:00+02:00';

  var saetze = [
    'Erinnere mich, dass ich Frau Nguyen von der Hausverwaltung Sonnenhof nächsten Dienstag wegen der Kaution zurückrufen muss.',
    'Herr Bauer hat sich für die 3-Zimmer-Wohnung im Projekt Lindenpark entschieden, Vertragsunterschrift ist für Ende des Monats geplant.',
    'Notiz: Die Baugenehmigung für das Projekt Ahornweg liegt noch nicht vor, der Bauträger wartet auf das Bauamt.',
    'Kontakt notieren: Architekt Herr Feldmann, neue Nummer 0171 2345678, arbeitet für den Bauträger Ahornweg.',
    'Aufgabe: Exposé für die Penthouse-Wohnung im Lindenpark überarbeiten und gleichzeitig den Energieausweis bei Frau Nguyen anfordern.',
    'Vermietung Sonnenhof: Herr Krüger hat die Kaution überwiesen, Wohnung 4B ist damit erledigt.',
    'Wichtig: Frau Yilmaz vom Vertrieb möchte, dass wir sie übermorgen wegen der Musterwohnung im Ahornweg anrufen.',
    'Entscheidung: Der Bauträger hat sich gegen den ursprünglichen Fensteranbieter entschieden und nimmt jetzt die Firma Glasbau Reiter für das Projekt Lindenpark.',
    'Notiz zur Musterwohnung: Die Küche im Sonnenhof muss noch fotografiert werden, bevor das Exposé raus geht.',
    'Herr Bauer möchte am Ende des Monats den restlichen Kaufpreis überweisen, das müssen wir im Blick behalten.'
  ];

  saetze.forEach(function (satz, i) {
    Logger.log('--- Testsatz ' + (i + 1) + ': ' + satz);
    try {
      var eintraege = verarbeite(satz, jetzt);
      eintraege.forEach(function (e) {
        Logger.log('  -> ID %s | %s | %s | Status=%s | Datum=%s | Person=%s | Projekt=%s | Prüfen=%s',
          e.ID, e.Typ, e.Titel, e.Status, e.Datum, e.Person, e.Projekt, e['Prüfen']);
      });
    } catch (fehler) {
      Logger.log('  FEHLER: ' + fehler);
    }
  });

  Logger.log('Fertig. Bitte im Sheet "Notizen" prüfen, dazu "Personen" und "Projekte".');
}

// Testet, ob ausdrücklich genannte Aliase (Spitzname, Firma) in die
// Schreibvarianten übernommen werden und spätere Notizen darüber wieder
// gefunden werden. Im Editor ausführen: testAliase()
function testAliase() {
  var jetzt = '2026-09-09T10:00:00+02:00';

  var satz1 = 'Herr Eckert, den nennen manche auch Alex, ist von der Firma Inwatec und möchte die Musterwohnung im Lindenpark besichtigen.';
  Logger.log('--- Satz 1: ' + satz1);
  verarbeite(satz1, jetzt).forEach(function (e) {
    Logger.log('  -> Person=%s | Projekt=%s', e.Person, e.Projekt);
  });

  var satz2 = 'Alex hat abgesagt, neuer Termin nächsten Dienstag.';
  Logger.log('--- Satz 2 (nur Alias "Alex"): ' + satz2);
  verarbeite(satz2, jetzt).forEach(function (e) {
    Logger.log('  -> Person=%s (sollte "Herr Eckert" sein, falls Alias erkannt wurde)', e.Person);
  });

  Logger.log('Fertig. Bitte im Blatt "Personen" prüfen: Zeile "Herr Eckert" sollte Schreibvarianten "Alex, Inwatec" haben.');
}

// Legt direkt (ohne Claude-Aufruf) einen Testeintrag mit Erinnerung "heute" an,
// um erinnerungsMailSenden() sofort testen zu können. Im Editor ausführen.
function testErinnerungErstellen() {
  var notizen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTIZEN);
  var jetzt = new Date();
  var heuteDatum = new Date();
  heuteDatum.setHours(0, 0, 0, 0);
  var zeile = {
    ID: naechsteId_(notizen),
    Titel: 'TEST: Erinnerungs-Mail',
    Datum: '',
    Status: 'offen',
    Erinnerungsdatum: heuteDatum,
    Person: '',
    Projekt: '',
    Typ: 'Aufgabe',
    Kurzfassung: 'Testeintrag für die Erinnerungs-Mail, kann danach gelöscht werden.',
    Originaltext: '(Testeintrag, kein echter Sprachtext)',
    Confidence: 1,
    'Prüfen': false,
    Erstellt: jetzt
  };
  notizen.appendRow(SPALTEN_NOTIZEN.map(function (spalte) { return zeile[spalte]; }));
  Logger.log('Testeintrag ID %s angelegt. Jetzt erinnerungsMailSenden() ausführen.', zeile.ID);
}
