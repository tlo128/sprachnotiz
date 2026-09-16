# Sprachnotiz-App, Google-Variante mit Outlook-Anbindung

Stand: 16. September 2026. Ersetzt alle früheren Fassungen. Sessions 1 bis 5 sind umgesetzt und im Betrieb, dazwischen zwei Review-Nachbesserungsrunden. Als Nächstes: Session 6 (Feinschliff).

## Ziel

Sprechen, fertig. Eine Sprachnotiz wird automatisch strukturiert und gespeichert. Die KI schlägt vor, was daraus wird (Aufgabe, Termin, Ablage). Der Nutzer entscheidet im Eingang mit einem Tipp. Aufgaben und Termine leben danach in Outlook (Microsoft To Do und Kalender) weiter, in beide Richtungen abgeglichen. Einzelnutzer, keine laufenden Kosten außer Claude-Tokens (ca. 2 bis 3 $ pro Monat).

## Bausteine

| Baustein | Aufgabe |
|---|---|
| Google Sheet "Notizen" | Datenbank. Eine Zeile pro Eintrag. |
| Google Apps Script | Backend. Nimmt Text an, ruft Claude auf, schreibt die Zeile, spricht mit Microsoft Graph, gleicht alle 15 Minuten mit Outlook ab. |
| PWA auf GitHub Pages | Oberfläche auf Handy und PC: Erfassen und Dashboard (Eingang, Heute, Woche, Projekt/Person, Suche). Offline-Puffer. |
| Microsoft Graph (in M365 enthalten) | Aufgaben in die To-Do-Liste "Notizen", Termine in den Kalender "Notizen". Erinnerungen kommen von Outlook auf allen Geräten. |
| Claude API | Haiku 4.5 für die Routine, Sonnet 5 bei unsicheren Fällen. |

Keine E-Mail, kein Push, kein Server, kein Docker.

## Datenmodell (Spalten im Sheet)

Kernfelder (Pflicht, unverändert): ID | Titel | Datum | Status | Erinnerungsdatum | Person | Projekt | Typ

Zusatzfelder: Uhrzeit | Kurzfassung | Originaltext | Confidence | Prüfen | Eingang | Aktion_Vorschlag | Outlook_ID | Outlook_Typ | Outlook_Geaendert | Erstellt | Geaendert

- Status: offen, erledigt, abgelegt, prüfen
- Typ: Aufgabe, Termin, Notiz, Entscheidung, Kontakt
- Eingang: ja, solange der Nutzer den Eintrag noch nicht angefasst hat
- Aktion_Vorschlag: Aufgabe, Termin, Ablegen (von der KI gesetzt)
- Outlook_ID und Outlook_Typ (Aufgabe oder Termin, gleiche Werte wie in Typ): Verknüpfung zu Outlook, leer solange nicht übernommen
- Blätter "Personen" und "Projekte": bekannte Namen plus Schreibvarianten, wachsen automatisch

## Ablauf im Alltag

1. Homescreen-Icon, Mikrofon, sprechen (oder tippen). "Fertig". Gespeichert, mit 5 Sekunden "Rückgängig".
2. Die KI setzt Typ, Datum, Uhrzeit, Person, Projekt und einen Aktionsvorschlag. Der Eintrag liegt im Eingang.
3. Im Eingang (Handy oder PC): ein Tipp auf "Übernehmen" führt den Vorschlag aus, oder eine der anderen Aktionen wählen. Erst dann schreibt die App nach Outlook. Nichts geht ohne Entscheidung des Nutzers nach Outlook.
4. Einträge mit erkanntem Datum erscheinen in der App unter Heute und Woche, auch wenn sie noch im Eingang liegen. Der Eingang blockiert nichts.

Aktionen pro Eintrag: Übernehmen (Vorschlag ausführen, nur bei Einträgen im Eingang, die auch wirklich einen Vorschlag haben), Aufgabe (Fälligkeit, nach To Do), Termin (Datum plus Uhrzeit, in den Kalender), Verschieben (+1 Tag, nächste Woche, Datum wählen), Ablegen (kein Datum, nur noch in der Suche), Erledigt, Bearbeiten, Löschen. Die übrigen sieben stehen in jeder Ansicht über das Aktionen-Menü bereit.

Abgleich mit Outlook: Änderungen in der App gehen sofort nach Outlook. Abhaken oder Verschieben in To Do oder Outlook wird alle 15 Minuten in die App übernommen. Bei Konflikt gewinnt die zuletzt geänderte Seite.

Ohne Netz: Textfeld statt Mikrofon, Puffer in IndexedDB, automatisches Nachsenden. Zugriffsschutz: Apps-Script-Web-App "jeder mit Link", jeder Aufruf trägt den geheimen Schlüssel aus den Script-Eigenschaften.

## Modell-Routing

| Aufgabe | Modell | Regel |
|---|---|---|
| Text zu Feldern, Aktionsvorschlag, Namen abgleichen, Datum und Uhrzeit auflösen | Haiku 4.5 | Immer, ein Aufruf, festes JSON-Schema |
| Unsicher (Confidence unter 0,7, neuer Name, mehrere Aufgaben) | Sonnet 5 | Zweiter Durchlauf, Markierung "prüfen" im Eingang |
| Wöchentliche Durchsicht | Opus 5 | Optional, später |
| Suche | kein Modell | Filter im Sheet und in der PWA |

## Outlook-Anbindung (technisch)

- Delegierte Anmeldung über eine App-Registrierung im eigenen M365-Tenant (Entra). Berechtigungen: Tasks.ReadWrite, Calendars.ReadWrite, offline_access, User.Read. Nur das Konto des Nutzers.
- Apps Script nutzt die OAuth2-Bibliothek (googleworkspace/apps-script-oauth2). Redirect-URI: https://script.google.com/macros/d/SKRIPT-ID/usercallback
- Client-ID, Tenant-ID und Client-Secret liegen in den Script-Eigenschaften. Das Secret läuft nach 24 Monaten ab: Erneuerung September 2028.
- Aufgaben: To-Do-Liste "Notizen" (POST /me/todo/lists, /me/todo/lists/{id}/tasks), mit dueDateTime, reminderDateTime, body = Kurzfassung plus Projekt und Person.
- Termine: Kalender "Notizen" (POST /me/calendars, /me/calendars/{id}/events), Dauer standardmäßig 60 Minuten, Erinnerung 30 Minuten vorher.
- Abgleich: zeitgesteuerter Trigger alle 15 Minuten, liest Änderungen aus To Do und Kalender (lastModifiedDateTime nach Outlook_Geaendert), schreibt Status und Datum ins Sheet.

## Sessions

Sessions 1 bis 5: erledigt (Backend, PWA, E-Mail-Erinnerung eingeführt und wieder entfernt, Dashboard/Eingang, Outlook-Anbindung, Notion-Import weiterhin bewusst ausgelassen).

### Session 4: Dashboard und Eingang, E-Mail entfernen — erledigt

- Bestandsaufnahme des vorhandenen Codes, dann E-Mail-Trigger und E-Mail-Code entfernt.
- Datenmodell um die Zusatzfelder erweitert (idempotente Migration in SheetSetup.js, fügt Spalten an der richtigen Position ein statt ans Ende), bestehende Zeilen migriert (Eingang = nein, Geaendert = Erstellt).
- Claude-Schema um empfohlene_aktion und uhrzeit erweitert (ClaudeClient.js), Systemprompt entsprechend angepasst.
- Backend-Aktionen in Aktionen.js: uebernehmen, aufgabe, termin, verschieben, ablegen, erledigt, bearbeiten, loeschen. Schließen jeweils den Eingang und stempeln Geaendert. Outlook.js enthält die drei vorgesehenen Stub-Funktionen (outlook_erstellen/aktualisieren/loeschen), die aktuell nur loggen - die Aufrufstellen liegen aber schon an der richtigen Stelle.
- PWA zum Dashboard umgebaut: Tabs Neu/Eingang/Heute/Woche/Suche, Projekt/Person weiterhin über anklickbare Chips erreichbar. Jede Karte zeigt bei offenem Eingang den KI-Vorschlag als Text plus großem "Übernehmen"-Button und "Andere Aktion" daneben. Alle sieben Aktionen über ein Bottom-Sheet-Menü, dazu Wischgesten auf dem Handy (rechts = übernehmen/erledigt, links = Menü), Buttons bleiben überall zusätzlich nutzbar (PC-Fallback).
- Offline-Puffer (IndexedDB) gilt jetzt für alle Aktionen, nicht nur fürs Erfassen: neues Feld "typ" (erfassen/aktion) in der Warteschlange, optimistische Kartenaktualisierung, automatisches Nachsenden beim Online-Gehen.
- Manueller "Jetzt aktualisieren"-Button im Header (sendet Warteschlange, lädt die aktuell sichtbare Liste neu) plus "Aktualisiert HH:MM"-Anzeige, weil bei PC+Handy-Nutzung parallel unklar war, wie aktuell die Ansicht ist.
- Web-App-Deployment lief in Session 4 mehrfach auf dieselbe Deployment-ID neu aus, PWA auf GitHub Pages mehrfach neu veröffentlicht.
- Getestet und bestätigt: neue Notiz erscheint im Eingang mit passendem Vorschlag, Übernehmen/Verschieben/Abhaken funktionieren auf Galaxy und PC, im Flugmodus abgehakte Einträge werden nachgesendet, kein E-Mail-Trigger mehr vorhanden, Refresh-Button auf beiden Geräten bestätigt.

### Nachbesserung nach externer Code-Review (16. September) — erledigt

Eine Review in einem separaten Chat deckte mehrere echte Bugs auf, alle behoben und getestet:

- Kritisch: Offline-Warteschlange blockierte dauerhaft bei jedem fachlichen Fehler (nicht nur Netzfehlern) - ein einzelner permanent scheiternder Eintrag verhinderte für immer, dass spätere Notizen/Aktionen nachgesendet wurden. Jetzt unterscheidet die Warteschlange Netzfehler (Reihenfolge bleibt, später erneut versuchen) von fachlichen Fehlern (werden entfernt und gemeldet).
- "Rohtext immer speichern" griff nicht bei leerem Claude-Ergebnis oder Fehlern nach dem Haiku-Aufruf (Sonnet-Routing, Lock-Timeout) - verarbeite() fängt jetzt die gesamte Pipeline ab.
- Idempotenz gegen doppelte Notizen/Kosten bei abgebrochener Antwort: clientId pro Erfassungsversuch, serverseitig per CacheService dedupliziert (6h-Fenster).
- ID-Vergabe auf persistenten Zähler in den Script-Eigenschaften umgestellt (war zuvor "letzte Zeile + 1", kollisionsanfällig bei gelöschter letzter Zeile oder manuell umsortiertem Sheet).
- "+1 Tag"/"Nächste Woche" rechnen jetzt vom Eintragsdatum statt vom heutigen Datum.
- Aufgabe/Termin aus dem Aktionen-Menü ohne vorhandenes Datum öffnen jetzt das Bearbeiten-Formular statt leere Felder zu senden.
- Formel-Injektion und Uhrzeit-Spalte als Zeitwert (Sheets wandelte "14:00" sonst um): führendes Apostroph beim Schreiben erzwingt Klartext - `klartext_()` in Config.js, angewendet in Verarbeiten.js, Aktionen.js, Namenslisten.js. `setNumberFormat('@')` allein reicht bei per API geschriebenen Werten nachweislich nicht.
- doPost validiert jetzt vor jeder Aktion die Sheet-Kopfzeile gegen SPALTEN_NOTIZEN (notizenHeaderPruefen_ in SheetSetup.js).
- Diverse kleinere Fixes: Übernehmen-Button nur bei echtem Vorschlag, Offline-Toast wird nicht mehr vom Netz-Refresh überschrieben, Race bei parallelen Listenaufrufen, Verschieben setzt Status zurück, Bearbeiten gleicht Person/Projekt ab, max_tokens 2000 auf 4000.
- Auf Nutzerwunsch entfernt: das 8-Sekunden-Stille-Sicherheitsnetz beim Erfassen (weder Sprache noch Tippen speichern mehr automatisch, nur noch "Fertig").
- Datei claude.md zu CLAUDE.md umbenannt (Großschreibung, case-sensitive Dateisysteme).
- Bekannt/hingenommen (geringer Nutzen für den Aufwand): keine Längenprüfung bei Bearbeiten-Feldern/Suchwert, Person/Projekt-Filter-Cache in der PWA wird nie aufgeräumt, Test.js bleibt im Produktivprojekt ausgerollt.

### Session 5: Outlook-Anbindung — erledigt

- App-Registrierung in Entra angelegt (Single-Tenant), OAuth2-Bibliothek für Apps Script eingebunden (Script-ID 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF, im Editor unter "Bibliotheken" hinzugefügt, Eintrag jetzt auch in appsscript.json). Script-Eigenschaften MS_CLIENT_ID, MS_TENANT_ID, MS_CLIENT_SECRET. `autorisieren()` einmalig im Editor ausgeführt, Redirect läuft über die script-eigene usercallback-URL (kein doGet-Routing nötig).
- `outlookEinrichten()` legt To-Do-Liste "Notizen" und Kalender "Notizen" an, falls nicht vorhanden, merkt sich beide IDs in den Script-Eigenschaften (MS_TODO_LISTE_ID, MS_KALENDER_ID).
- Outlook.js: outlook_erstellen/aktualisieren/loeschen rufen jetzt wirklich Microsoft Graph auf (To-Do-Tasks bzw. Kalender-Events), aufgerufen aus den bestehenden Aufrufstellen in Aktionen.js (uebernehmen/aufgabe/termin/verschieben/ablegen/erledigt/bearbeiten/loeschen). Outlook_ID/Outlook_Typ/Outlook_Geaendert werden im Sheet nachgezogen. Wechselt ein Eintrag den Typ weg von Aufgabe/Termin, wird die Outlook-Verknüpfung im Sheet mit gelöscht; wechselt er zwischen Aufgabe und Termin während schon verknüpft, wird das alte Outlook-Element gelöscht und passend neu angelegt (Graph kann einen Task nicht zu einem Event "umwandeln"). Fehler beim Outlook-Aufruf werden geloggt (plus `outlookFehlerMerken_`/`outlookLetzterFehler()` als Script-Eigenschaft, praktisch zum Nachsehen nach einem PWA-Aufruf), nicht an die PWA durchgereicht - der Sheet-Eintrag ist zu dem Zeitpunkt schon geschrieben, bei leerer Outlook_ID wird beim nächsten Anfassen automatisch erneut versucht.
- `outlookAbgleichen()` per Zeit-Trigger alle 15 Minuten (eingerichtet über `outlookTriggerEinrichten()`): vergleicht lastModifiedDateTime aus Outlook mit Outlook_Geaendert, übernimmt Status/Datum/Uhrzeit ins Sheet. Bei Konflikt (Sheet seitdem auch geändert) gewinnt die zuletzt geänderte Seite (Vergleich gegen Geaendert).
- PWA zeigt ein kleines 🔗-Symbol neben dem Titel, wenn ein Eintrag mit Outlook verknüpft ist (App-Version 2.5).
- Zwei Bugs beim Testen gefunden und behoben: (1) `clasp push` ohne vorher `clasp pull` hätte eine im Editor manuell hinzugefügte Bibliothek aus appsscript.json wieder entfernt - Bibliothek jetzt im lokalen Manifest festgehalten. (2) Datum/Erinnerungsdatum kommen aus dem Sheet immer als volles ISO ("2026-09-22T00:00:00"), nicht als reines yyyy-MM-dd - die Outlook-Aufrufe hängten daran ein zweites "T..." an, Microsoft Graph lehnte das ab, der Fehler wurde nur geloggt statt aufzufallen (`outlookNurDatum_` behebt das). Ebenso liefert Graph Datumswerte beim Lesen standardmäßig in UTC ohne "Z"-Suffix zurück - `outlookAlsBerlinerZeit_` kennzeichnet das vor der Umrechnung eindeutig, sonst kann das Datum beim Rücklesen um einen Tag kippen.
- Wichtig für künftige Backend-Änderungen: `clasp push` aktualisiert nur den Editor-Stand (HEAD) - die laufende Web-App-Bereitstellung bleibt auf ihrer festen Version stehen, bis sie über "Bereitstellen → Bereitstellungen verwalten → Neue Version" neu bereitgestellt wird. Zeit-Trigger sind davon unabhängig und laufen immer auf dem aktuellen Editor-Stand.
- Getestet und bestätigt: Aufgabe aus dem Eingang übernommen erscheint innerhalb von Sekunden in To Do auf Handy und PC, Abhaken in To Do setzt den Eintrag in der App nach manuellem `outlookAbgleichen()` (bzw. spätestens nach 15 Minuten) auf erledigt, Termin erscheint im Outlook-Kalender "Notizen" mit Erinnerung 30 Minuten vorher, Outlook-Symbol erscheint in der PWA bei verknüpften Einträgen.
- Bekannt/hingenommen (geringer Nutzen für den Aufwand in einer Einzelnutzer-App): kein Zurücksetzen von dueDateTime/Erinnerung in Outlook, wenn Datum im Sheet wieder geleert wird (Ablegen); Abgleich liest maximal die ersten 200 Aufgaben/Termine (keine Pagination); Abgleich-Trigger muss nach dieser Session einmalig per `outlookTriggerEinrichten()` gesetzt werden (nicht automatisch bei jedem Deployment).

### Nachbesserung nach zweiter Review (16. September) — erledigt

Vollständige Review von Backend und PWA in einer eigenen Session. Behoben:

- **Kritisch: Die Offline-Warteschlange verwarf gepufferte Notizen bei jedem fachlichen Fehler.** Die erste Nachbesserungsrunde hatte "blockiert für immer" korrekt beseitigt, war dabei aber ins andere Extrem gekippt: Alles, was kein `fetch`-Netzfehler war, wurde sofort gelöscht. Dazu zählen auch vorübergehende Zustände - Apps-Script-Kontingent oder HTML-Fehlerseite, `doPost`-Fehler wie ein Lock-Timeout, ein gerade gewechselter Schlüssel, oder fehlende Zugangsdaten beim App-Start. Der Rohtext einer diktierten Notiz existiert an dieser Stelle nirgends sonst. Jetzt: Zähler `versuche` am Warteschlangen-Eintrag, `MAX_VERSUCHE = 3`, danach aufgeben - und bei einer Notiz den Text zurück ins Eingabefeld unter "Neu" schreiben statt ihn wegzuwerfen. Netzfehler verbrauchen weiterhin keinen Versuch und halten die Reihenfolge. Fehlen URL oder Schlüssel, beginnt der Abgleich gar nicht erst.
- **Kritisch: `erfassen` und `liste` lieferten Datumswerte in unterschiedlichen Formaten.** `verarbeite()` gab rohe `Date`-Objekte zurück, die `JSON.stringify` als UTC serialisiert ("2026-09-21T22:00:00.000Z" für den 22.09.), während `zeileZuObjekt_` Berliner Ortszeit liefert. Die PWA schneidet für ihre Tagesfilter und das Bearbeiten-Formular die ersten zehn Zeichen ab und lag damit bei frisch erfassten Notizen einen Tag daneben: Der Eintrag fehlte in Heute/Woche, und ein Speichern im Bearbeiten-Formular ohne Anfassen des Datumsfeldes schrieb den Vortag ins Sheet und nach Outlook. Jetzt laufen beide Wege über `feldwertFuerAntwort_`/`objektFuerAntwort_` in Liste.js.
- Geleertes Datum zog einen verknüpften Outlook-Termin stillschweigend auf heute (`outlookTerminKoerper_` hatte einen `|| heute`-Rückfall). Beim Aktualisieren werden `start`/`end` jetzt weggelassen, wenn kein Datum da ist - der Termin bleibt stehen, so wie es `outlookAufgabeKoerper_` mit `dueDateTime` ohnehin schon machte. Beim Anlegen bleibt der Rückfall, Graph braucht dort eine Startzeit.
- Fehlgeschlagene Outlook-*Aktualisierungen* wurden nie wiederholt: Anders als beim Anlegen (leere Outlook_ID als Marker) ändert sich bei einem gescheiterten PATCH Outlooks `lastModifiedDateTime` nicht, der 15-Minuten-Abgleich sah also nichts, und Sheet und Outlook liefen still auseinander. Neu: Nachholliste in der Script-Eigenschaft `OUTLOOK_NACHHOLEN` (Einträge `{id, v}`), die `outlookAbgleichen()` vorweg abarbeitet; nach `OUTLOOK_NACHHOLEN_VERSUCHE = 8` Anläufen (rund zwei Stunden) wird aufgegeben und das über `outlookLetzterFehler()` gemeldet. Ein 404/410 beim PATCH (Element in Outlook von Hand gelöscht) löst zusätzlich die Verknüpfung im Sheet, damit der nächste Versuch ein frisches Element anlegt.
- Der Outlook-Rücksync setzte `abgelegt` und `prüfen` auf `offen` zurück, sobald in To Do irgendetwas geändert wurde (Titel, Notiz, Priorität). `outlookAufgabeAlsFelder_` schaltet jetzt nur noch zwischen `erledigt` und `offen` um und lässt jeden anderen Status in Ruhe.
- `fertig()` leerte das Textfeld, bevor die Notiz gepuffert war - schlug `warteschlangeHinzufuegen` fehl (IndexedDB blockiert oder nicht nutzbar), war sie ohne Meldung weg. Jetzt abgefangen, Text kommt zurück ins Feld. Dieselbe Absicherung für die beiden Stellen, die Aktionen puffern.
- Die Migration in SheetSetup.js hängte eine Spalte ans Ende, wenn sie ihren Anker nicht fand. Das Ergebnis war eine Kopfzeile, die `notizenHeaderPruefen_` nie akzeptiert - jeder doPost-Aufruf scheiterte, und `einrichtenSheet()` konnte es nicht mehr reparieren. Jetzt bricht die Migration an dieser Stelle mit Ist-/Soll-Kopfzeile ab und prüft am Ende zusätzlich das Gesamtergebnis.
- Kostendeckel: `MAX_ERFASSEN_PRO_TAG = 200` (Script-Eigenschaft `ERFASSEN_ZAEHLER`). Darüber wird die Notiz nur noch als Rohtext mit Status "prüfen" gespeichert, es entstehen keine Tokenkosten mehr. Schützt das Monatsbudget, falls der Schlüssel abhandenkommt oder die PWA in eine Sendeschleife gerät.
- Test.js: `TESTS_AKTIV = false` als Sicherung. Seit Session 5 sind die Outlook-Aufrufe keine Stubs mehr - `testAktionen()` legt echte Aufgaben und Termine an. Zum Ausführen die Konstante auf true setzen, danach zurück.
- Kleinere Fixes: `idPruefen_` in Code.js (eine leere ID hätte über `Number('') === 0` eine Zeile mit leerer ID-Zelle treffen können, `findeZeileNachId_` überspringt solche Zellen jetzt ebenfalls); `doPost` fängt einen Aufruf ohne Body ab; Schlüsselvergleich ohne frühzeitigen Abbruch; ungültiger Status/Typ wird in `eintragFelderSetzen_` gemeldet statt still übersprungen; `Math.max` → `Math.min` in `spalteAlsTextFormatieren_` (warf bei Blättern unter 1000 Zeilen); Sortierung nach `Erstellt` läuft bei leerem Wert nicht mehr auf NaN; `verarbeite()` prüft das Notizen-Blatt, weil sonst auch der Rohtext-Fallback scheitert; IndexedDB-Verbindungen werden wieder geschlossen; die optimistischen Feldnamen für Aufgabe/Termin heißen jetzt wie im Sheet (`Datum`/`Uhrzeit` statt `datum`/`uhrzeit`); toter Statuswert `wartend` entfernt. PWA auf Version 2.6.
- Geprüft und unauffällig: keine XSS-Fläche in der PWA (alle vier `innerHTML`-Zuweisungen sind statische Literale, alle Sheet-Daten gehen über `textContent`, CSP ohne Inline-Skripte), keine Secrets im Repository, `klartext_()` greift an allen Schreibstellen, die Spaltenzuordnung nach der Migration stimmt für den dokumentierten Ausgangszustand, alle Aktionsnamen und `felder`-Schlüssel decken sich zwischen PWA und Backend, der Datums-Round-Trip zu Graph ist symmetrisch.
- Weiterhin bekannt/hingenommen: kein Zurücksetzen von `dueDateTime`/Erinnerung in Outlook beim Ablegen (der Termin wird jetzt immerhin nicht mehr verschoben); Abgleich liest maximal die ersten 200 Aufgaben/Termine ohne Pagination; keine Längenprüfung bei Bearbeiten-Feldern und Suchwert; Person/Projekt-Filter-Cache in der PWA wird nie aufgeräumt; Test.js bleibt im Produktivprojekt ausgerollt (jetzt aber standardmäßig inaktiv); `frame-ancestors` lässt sich per `<meta>`-CSP auf GitHub Pages nicht setzen.

### Session 6: Feinschliff

- Notion-Import, falls noch offen. Wochen-Durchsicht per Opus 5 als Liste im Dashboard. Kosten-Statistik.

## Regeln für Claude Code

- Vor jeder Session zuerst den vorhandenen Code lesen und den Stand in drei Sätzen zusammenfassen, dann erst ändern.
- Keine zusätzlichen Dienste, Bibliotheken oder Konten ohne Rückfrage. Ausnahme: die OAuth2-Bibliothek für Apps Script in Session 5.
- Rohtext immer speichern, auch wenn der Claude-Aufruf fehlschlägt (dann Status "prüfen").
- Zeitzone Europe/Berlin. Sprache der Oberfläche Deutsch. Keine Frameworks, keine Build-Schritte in der PWA.
- Backend-Änderungen mit clasp push, PWA-Änderungen mit git push übertragen und sagen, wie sie zu testen sind.
- API-Key, geheimer Schlüssel, Microsoft-Secret stehen nie im Code oder im Repository.
