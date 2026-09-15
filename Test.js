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

// Testet empfohlene_aktion/uhrzeit: je ein klarer Fall für Aufgabe, Termin, Ablegen.
// Im Editor ausführen: testAktionsvorschlag()
function testAktionsvorschlag() {
  var jetzt = '2026-09-09T10:00:00+02:00';

  var faelle = [
    { erwartet: 'Aufgabe', satz: 'Ich muss Frau Nguyen noch wegen der Kaution zurückrufen.' },
    { erwartet: 'Termin', satz: 'Morgen um 14 Uhr Besichtigung mit Herrn Bauer im Lindenpark.' },
    { erwartet: 'Ablegen', satz: 'Notiz: Der Bauträger hat sich für Fenster von Glasbau Reiter entschieden, das ist final.' }
  ];

  faelle.forEach(function (fall) {
    Logger.log('--- Erwartet: %s | Satz: %s', fall.erwartet, fall.satz);
    verarbeite(fall.satz, jetzt).forEach(function (e) {
      Logger.log('  -> Aktion_Vorschlag=%s | Uhrzeit=%s | Eingang=%s | Typ=%s',
        e.Aktion_Vorschlag, e.Uhrzeit, e.Eingang, e.Typ);
    });
  });
}

// Testet die Dashboard-Aktionen: uebernehmen, verschieben, erledigt, ablegen, loeschen.
// Im Editor ausführen: testAktionen()
function testAktionen() {
  var jetzt = '2026-09-09T10:00:00+02:00';

  var e1 = verarbeite('Ich muss Frau Nguyen noch wegen der Kaution zurückrufen.', jetzt)[0];
  Logger.log('Eintrag 1 (ID %s) vor Übernehmen: Eingang=%s Aktion_Vorschlag=%s', e1.ID, e1.Eingang, e1.Aktion_Vorschlag);
  var e1b = aktionUebernehmen_(e1.ID);
  Logger.log('  -> nach uebernehmen: Eingang=%s Status=%s Typ=%s (Eingang sollte "nein" sein)', e1b.Eingang, e1b.Status, e1b.Typ);

  var e1c = aktionVerschieben_(e1.ID, '2026-09-20');
  Logger.log('  -> nach verschieben: Datum=%s (sollte 2026-09-20 sein)', e1c.Datum);

  var e1d = aktionErledigt_(e1.ID);
  Logger.log('  -> nach erledigt: Status=%s (sollte erledigt sein)', e1d.Status);

  var e2 = verarbeite('Notiz: Der Bauträger hat sich für Fenster von Glasbau Reiter entschieden, das ist final.', jetzt)[0];
  var e2b = aktionAblegen_(e2.ID);
  Logger.log('Eintrag 2 (ID %s) nach ablegen: Status=%s Datum=%s Eingang=%s (Status abgelegt, Datum leer, Eingang nein erwartet)',
    e2.ID, e2b.Status, e2b.Datum, e2b.Eingang);

  aktionLoeschen_(e2.ID);
  var notizen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTIZEN);
  Logger.log('Eintrag 2 gelöscht, Zeile jetzt: %s (sollte -1 sein)', findeZeileNachId_(notizen, e2.ID));

  Logger.log('Fertig. Im Ausführungsprotokoll sollten dazwischen auch [Outlook-Stub]-Zeilen für Eintrag 1 auftauchen.');
}
