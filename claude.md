# Sprachnotiz-App, Google-Variante mit Outlook-Anbindung

Stand: 13. September 2026. Ersetzt alle früheren Fassungen. Sessions 1 bis 3 sind umgesetzt, die E-Mail-Erinnerung aus Session 3 wird in Session 4 wieder entfernt.

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

Sessions 1 bis 3: erledigt (Backend, PWA, E-Mail-Erinnerung, Notion-Import falls bereits geschehen).

### Session 4: Dashboard und Eingang, E-Mail entfernen

- Bestandsaufnahme des vorhandenen Codes, dann E-Mail-Trigger und E-Mail-Code entfernen.
- Datenmodell um die Zusatzfelder erweitern, bestehende Zeilen migrieren (Eingang = nein für alles, was älter ist als der Umbau).
- Claude-Schema um empfohlene_aktion und uhrzeit erweitern.
- PWA zum Dashboard umbauen: Eingang mit Vorschlag und Übernehmen, Heute, Woche, Projekt/Person, Suche. Aktionen als Buttons (PC) und Wischgesten (Handy). Outlook-Aktionen rufen bereits Backend-Funktionen auf, die in Session 4 noch nur das Sheet ändern.
- Fertig, wenn: eine neue Notiz erscheint im Eingang mit Vorschlag, "Übernehmen" verschiebt sie korrekt nach Heute oder Woche oder Archiv, Verschieben und Abhaken funktionieren auf Handy und PC, keine E-Mail kommt mehr.

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
