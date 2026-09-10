# Sprachnotiz-App, Google-Variante

Stand: September 2026. Ersetzt den NAS-Plan vollständig.

## Ziel

Sprechen, fertig. Eine Sprachnotiz wird automatisch in einen strukturierten Eintrag umgewandelt und gespeichert. Einzelnutzer, keine laufenden Kosten außer Claude-Tokens (ca. 2 bis 3 $ pro Monat).

## Bausteine

| Baustein | Aufgabe |
|---|---|
| Google Sheet "Notizen" | Datenbank. Eine Zeile pro Eintrag. Am PC direkt nutzbar (Filter, Suche). |
| Google Apps Script (am Sheet gebunden) | Backend. Nimmt Text an, ruft Claude auf, schreibt die Zeile, verschickt Erinnerungs-Mails. |
| PWA auf GitHub Pages | Oberfläche fürs Handy und den PC. Mikrofon-Button, Liste, Suche. Läuft offline an und puffert Notizen, bis Netz da ist. |
| Outlook | Empfängt jeden Morgen um 8:00 die Erinnerungs-Mail. |
| Claude API | Strukturiert den Text. Haiku 4.5 für die Routine, Sonnet 5 bei unsicheren Fällen. |

Kein Server, kein Docker, kein VPN. Einzige zusätzlichen Konten: GitHub (kostenlos) für die Seite.

## Datenmodell (Spalten im Sheet)

ID | Titel | Datum | Status | Erinnerungsdatum | Person | Projekt | Typ | Kurzfassung | Originaltext | Confidence | Prüfen | Erstellt

- Status: offen, erledigt, wartend, prüfen
- Typ: Aufgabe, Notiz, Entscheidung, Kontakt
- Blatt "Personen" und Blatt "Projekte": bekannte Namen plus Schreibvarianten, dienen der KI als Abgleichliste, wachsen automatisch

## Ablauf im Alltag

1. Homescreen-Icon antippen, Mikrofon-Button drücken, sprechen. Alternativ jederzeit ins Textfeld darunter tippen (Stichworte reichen), auch als Ergänzung oder Korrektur nach dem Sprechen.
2. "Fertig" antippen. Sicherheitsnetz: Nach 8 Sekunden Stille speichert die App auch ohne Tipp. Kurzer Hinweis "Gespeichert", 5 Sekunden "Rückgängig".

Ohne Netz: Die App erkennt das und zeigt stattdessen ein Textfeld. Diktat über die Tastatur (Samsung oder Gboard, Offline-Sprachpaket Deutsch einmal herunterladen). Der Text wird gepuffert und automatisch nachgesendet, sobald Netz da ist.

Zugriffsschutz: Apps-Script-Web-App auf "jeder mit Link", jeder Aufruf trägt einen langen geheimen Schlüssel, den die PWA einmal gespeichert hat. Kein Login, kein Passwort im Alltag.

## Modell-Routing im Betrieb

| Aufgabe | Modell | Regel |
|---|---|---|
| Text zu Feldern, Namen abgleichen, Datum auflösen | Haiku 4.5 | Immer, ein Aufruf mit festem JSON-Schema |
| Unsicher (Confidence unter 0,7, neuer Name, mehrere Aufgaben in einem Satz) | Sonnet 5 | Automatischer zweiter Durchlauf, Eintrag bekommt "Prüfen" |
| Wöchentliche Durchsicht (Duplikate, vergessene Follow-ups) | Opus 5 | Optional, Session 4 |
| Suche im Sheet | kein Modell | Filter und Volltext im Sheet, 0 $ |

## Wer macht was

| Rolle | Wer | Wann |
|---|---|---|
| Planung, Rückfragen, Prompts formulieren, Ergebnisse prüfen | Dieser Chat (Claude Fable 5.1) | Vor und zwischen den Sessions |
| Code schreiben, testen, ins Apps Script übertragen | Claude Code auf dem PC, Standardmodell belassen. Bei hartnäckigen Fehlern mit /model auf das stärkste verfügbare Modell wechseln | In den Sessions |
| Konten anlegen, Login-Klicks, API-Key einfügen, Testsätze sprechen | Du | Vorbereitung und Tests |
| Text strukturieren im laufenden Betrieb | Haiku 4.5, Sonnet 5 | Automatisch, jede Notiz |

## Vorbereitung (du, ca. 60 Minuten, Details in Startanleitung_und_Prompts.md)

1. Claude Code installieren: PowerShell öffnen, `irm https://claude.ai/install.ps1 | iex` ausführen, dann `claude` starten und anmelden. Zusätzlich Node.js (LTS) und Git für Windows installieren, jeweils Standard-Installer.
1a. GitHub-Konto anlegen (kostenlos), Claude Code richtet den Rest ein.
2. Claude API-Key anlegen (Anthropic Console, getrennt vom Claude.ai-Abo), 10 bis 20 $ Guthaben laden.
3. Google Sheet anlegen, Name "Notizen", leer lassen. Link kopieren.
4. Im Sheet: Erweiterungen, Apps Script öffnen, einmal speichern. Damit existiert das Projekt. Unter script.google.com, Einstellungen, "Google Apps Script API" aktivieren.
5. Notion-Datenbanken (Archiv, Kontakte) als CSV exportieren, Dateien bereitlegen.
6. Projektordner anlegen, z.B. Dokumente\notiz, diese Datei als CLAUDE.md hineinkopieren.

## Sessions mit Claude Code

Prompt-Muster für jede Session: "Lies CLAUDE.md. Aufgabe dieser Session: [Ziel]. Fertig ist es, wenn: [Test]. Arbeite in kleinen Schritten, sag mir nach jedem Schritt, was ich prüfen soll."

### Session 1: Backend (ca. 2 Stunden)

- Claude Code richtet `clasp` ein (Google-Werkzeug, mit dem Code direkt ins Apps Script geschoben wird). Du klickst einmal den Google-Login.
- Sheet-Struktur anlegen (Spalten, Blätter Personen und Projekte).
- Funktion `verarbeite(text)`: Haiku-Aufruf mit JSON-Schema, Routing zu Sonnet, Zeile schreiben, Namen in die Listen übernehmen. API-Key liegt in den Script-Eigenschaften, nicht im Code.
- **Test:** 10 Testsätze über eine Testfunktion im Editor, jede erzeugt eine korrekte Zeile. Relative Angaben wie "nächsten Dienstag" werden richtig aufgelöst.

### Session 2: PWA fürs Handy (ca. 3 Stunden)

- Apps Script als reine API bereitstellen (doPost/doGet, Zugriff jeder mit Link, Prüfung des geheimen Schlüssels).
- PWA auf GitHub Pages: Mikrofon-Button (Web Speech API, de-DE, automatischer Neustart bei Pausen), Textfeld als gleichwertiger Eingabeweg (tippen, ergänzen, korrigieren), großer "Fertig"-Button, Auto-Speichern nach 8 Sekunden Stille, Rückgängig-Hinweis, Liste "heute und offen", Suche, Prüfliste, Eintrag bearbeiten.
- Offline: Service Worker lädt die App ohne Netz, Textfeld statt Mikrofon, Puffer in IndexedDB, automatisches Nachsenden.
- **Test:** Icon auf dem Galaxy-Homescreen, Notiz gesprochen, Zeile im Sheet ohne weiteren Klick. Flugmodus an, Notiz per Tastatur diktiert, Flugmodus aus, Zeile erscheint. Am PC im Browser dieselbe Liste.

### Session 3: Erinnerungen und Import (ca. 1,5 Stunden)

- Zeitgesteuerter Trigger 8:00: Mail an deine Outlook-Adresse mit allen Einträgen, deren Erinnerungsdatum heute oder überfällig ist, je mit Link zum Eintrag.
- Import der Notion-CSVs, daraus Personen- und Projektlisten ableiten.
- **Test:** Testeintrag mit Erinnerung "morgen", am nächsten Morgen kommt die Mail in Outlook. Notion-Daten sind im Sheet durchsuchbar.

### Session 4, optional nach zwei Wochen Nutzung

- Wöchentliche Durchsicht per Opus 5 (Mail mit Vorschlägen).
- Falls das Offline-Tastatur-Diktat zu ungenau ist: Audio-Aufnahme in der PWA (funktioniert offline) plus "Teilen" aus der Samsung-Sprachmemo-App in die PWA. Transkription über die Gemini API (kostenloses Kontingent, zweiter Schlüssel), danach wie gewohnt Claude. Nur bauen, wenn der Bedarf sich zeigt.
- Falls gewünscht: tägliche Excel-Kopie nach OneDrive.

## Aktueller Stand (10.09.2026)

Sessions 1 bis 3 sind umgesetzt und im Betrieb. Danach Sicherheits- und Komfortdurchsicht:

- API nur per POST mit JSON-Body, der Schlüssel steht nie in einer URL. doGet lehnt ab. Aktionen: erfassen, liste, aendern, rueckgaengig (Code.js).
- Web-App-Deployment: eine feste Deployment-ID, neue Backend-Stände mit `clasp push` und anschließend `clasp deploy -i <Deployment-ID> -d "..."` als neue Version auf dasselbe Deployment. Die URL bleibt gleich. `clasp deployments` zeigt die ID.
- PWA hat eine Versionsnummer: `APP_VERSION` oben in app/app.js, sichtbar im Einstellungs-Bildschirm. Bei jeder PWA-Änderung erhöhen und `CACHE_NAME` in app/sw.js auf dieselbe Nummer setzen. Das Handy übernimmt eine neue Version beim zweiten Start.
- Listen werden am Handy zwischengespeichert (localStorage) und sofort angezeigt, der Abgleich mit Google läuft im Hintergrund. Grund: Apps Script braucht pro Aufruf 1 bis 4 Sekunden, gelegentlich länger.
- Fehlerfälle in der PWA: Netzfehler puffern die Notiz, Konfigurations- und Serverfehler zeigen eine Meldung und lassen den Text stehen.
- Content-Security-Policy in index.html: Verbindungen nur zu script.google.com und script.googleusercontent.com.
- Textlimit 5000 Zeichen, Status und Typ werden serverseitig validiert, Prüfen-Markierung wird beim Speichern aus dem Bearbeiten-Formular gelöscht.
- .clasp.json liegt nur lokal (in .gitignore), das Repository ist öffentlich, weil GitHub Pages im kostenlosen Konto das voraussetzt. Es enthält keine Schlüssel, keine URLs, keine Daten.
- Bekannt und akzeptiert: Bei jeder Notiz geht die komplette Personen- und Projektliste als Kontext an die Claude API.

## Regeln für Claude Code

- Keine zusätzlichen Dienste, Bibliotheken oder Konten ohne Rückfrage.
- Rohtext immer speichern, auch wenn der Claude-Aufruf fehlschlägt (dann Status "prüfen").
- Zeitzone Europe/Berlin. Sprache der Oberfläche Deutsch.
- Backend-Änderungen mit `clasp push`, PWA-Änderungen mit `git push` übertragen und mir sagen, wie ich sie teste.
- Geheimer Schlüssel und API-Key stehen nie im Code oder im Git-Repository.
