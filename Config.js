// Zentrale Konstanten für die Sprachnotiz-App.

var SHEET_NOTIZEN = 'Notizen';
var SHEET_PERSONEN = 'Personen';
var SHEET_PROJEKTE = 'Projekte';

// Kernfelder (Position 1-8, unverändert seit Session 1) + Zusatzfelder.
// Reihenfolge ist bewusst genau so wie in CLAUDE.md dokumentiert - notizenDatenmodellMigrieren_
// in SheetSetup.js fügt neue Spalten an der jeweils richtigen Stelle ein, statt sie ans Ende
// zu hängen, damit bestehende Daten nicht unter falschen Überschriften landen.
var SPALTEN_NOTIZEN = [
  'ID', 'Titel', 'Datum', 'Status', 'Erinnerungsdatum', 'Person', 'Projekt', 'Typ',
  'Uhrzeit', 'Kurzfassung', 'Originaltext', 'Confidence', 'Prüfen',
  'Eingang', 'Aktion_Vorschlag', 'Outlook_ID', 'Outlook_Typ', 'Outlook_Geaendert',
  'Erstellt', 'Geaendert'
];

var SPALTEN_NAMENSLISTE = ['Name', 'Schreibvarianten', 'Zuletzt'];

var STATUS_WERTE = ['offen', 'erledigt', 'abgelegt', 'prüfen'];
var TYP_WERTE = ['Aufgabe', 'Termin', 'Notiz', 'Entscheidung', 'Kontakt'];
var AKTION_VORSCHLAG_WERTE = ['Aufgabe', 'Termin', 'Ablegen'];

var MODELL_HAIKU = 'claude-haiku-4-5';
var MODELL_SONNET = 'claude-sonnet-5';

// Preise in USD pro 1 Million Tokens (Stand: Anthropic-Preisliste).
var PREISE = {
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'claude-sonnet-5': { input: 2.00, output: 10.00 }
};

var CONFIDENCE_SCHWELLE = 0.7;

var ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_VERSION = '2023-06-01';

function scriptEigenschaft_(name) {
  var wert = PropertiesService.getScriptProperties().getProperty(name);
  if (!wert) {
    throw new Error('Script-Eigenschaft fehlt: ' + name + '. Bitte in den Projekteinstellungen eintragen.');
  }
  return wert;
}
