# Sprachnotiz-App, Google-Variante mit Outlook-Anbindung

Stand: 16. September 2026. Ersetzt alle früheren Fassungen. Sessions 1 bis 4 sind umgesetzt und im Betrieb, danach eine Review-Nachbesserungsrunde. Als Nächstes: Session 5 (Outlook-Anbindung).

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
- Outlook_ID und Outlook_Typ (task oder event): Verknüpfung zu Outlook, leer solange nicht übernommen
- Blätter "Personen" und "Projekte": bekannte Namen plus Schreibvarianten, wachsen automatisch

## Ablauf im Alltag

1. Homescreen-Icon, Mikrofon, sprechen (oder tippen). "Fertig". Gespeichert, mit 5 Sekunden "Rückgängig".
2. Die KI setzt Typ, Datum, Uhrzeit, Person, Projekt und einen Aktionsvorschlag. Der Eintrag liegt im Eingang.
3. Im Eingang (Handy oder PC): ein Tipp auf "Übernehmen" führt den Vorschlag aus, oder eine der anderen Aktionen wählen. Erst dann schreibt die App nach Outlook. Nichts geht ohne Entscheidung des Nutzers nach Outlook.
4. Einträge mit erkanntem Datum erscheinen in der App unter Heute und Woche, auch wenn sie noch im Eingang liegen. Der Eingang blockiert nichts.

Aktionen pro Eintrag (überall gleich): Übernehmen (Vorschlag ausführen), Aufgabe (Fälligkeit, nach To Do), Termin (Datum plus Uhrzeit, in den Kalender), Verschieben (+1 Tag, nächste Woche, Datum wählen), Ablegen (kein Datum, nur noch in der Suche), Erledigt, Bearbeiten, Löschen.

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

Sessions 1 bis 4: erledigt (Backend, PWA, E-Mail-Erinnerung eingeführt und wieder entfernt, Dashboard/Eingang, Notion-Import bewusst ausgelassen).

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

### Session 5: Outlook-Anbindung

- OAuth2-Bibliothek einbinden, Anmeldefunktion, einmalige Bestätigung im Browser.
- Liste "Notizen" in To Do und Kalender "Notizen" anlegen, falls nicht vorhanden.
- Übernehmen, Aufgabe, Termin, Verschieben, Erledigt, Löschen schreiben nach Outlook. Outlook_ID im Sheet.
- Abgleich-Trigger alle 15 Minuten.
- PWA zeigt pro Eintrag ein kleines Outlook-Symbol, wenn verknüpft.
- Fertig, wenn: eine Aufgabe aus dem Eingang übernommen erscheint innerhalb von Sekunden in To Do auf Handy und PC, Abhaken in To Do setzt den Eintrag in der App spätestens nach 15 Minuten auf erledigt, ein Termin erscheint im Outlook-Kalender mit Erinnerung.

### Session 6: Feinschliff

- Notion-Import, falls noch offen. Wochen-Durchsicht per Opus 5 als Liste im Dashboard. Kosten-Statistik.

## Regeln für Claude Code

- Vor jeder Session zuerst den vorhandenen Code lesen und den Stand in drei Sätzen zusammenfassen, dann erst ändern.
- Keine zusätzlichen Dienste, Bibliotheken oder Konten ohne Rückfrage. Ausnahme: die OAuth2-Bibliothek für Apps Script in Session 5.
- Rohtext immer speichern, auch wenn der Claude-Aufruf fehlschlägt (dann Status "prüfen").
- Zeitzone Europe/Berlin. Sprache der Oberfläche Deutsch. Keine Frameworks, keine Build-Schritte in der PWA.
- Backend-Änderungen mit clasp push, PWA-Änderungen mit git push übertragen und sagen, wie sie zu testen sind.
- API-Key, geheimer Schlüssel, Microsoft-Secret stehen nie im Code oder im Repository.
