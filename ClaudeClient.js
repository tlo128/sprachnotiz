// Ruft die Claude API auf (Tool Use mit festem JSON-Schema). Kein SDK für Apps Script
// verfügbar, daher raw HTTP über UrlFetchApp.

var STRUKTUR_TOOL_NAME = 'sprachnotiz_strukturieren';

function strukturTool_() {
  return {
    name: STRUKTUR_TOOL_NAME,
    description: 'Wandelt eine deutsche Sprachnotiz aus dem Immobilienalltag (Bauträger, Vermietung, Vertrieb) in einen oder mehrere strukturierte Einträge um.',
    input_schema: {
      type: 'object',
      properties: {
        eintraege: {
          type: 'array',
          description: 'Ein Eintrag pro erkannter Aufgabe/Notiz/Entscheidung/Kontakt. Enthält der Text mehrere getrennte Aufgaben, mehrere Einträge zurückgeben.',
          items: {
            type: 'object',
            properties: {
              titel: { type: 'string', description: 'Kurzer, prägnanter Titel.' },
              datum: { type: 'string', description: 'Datum im Format JJJJ-MM-TT, falls genannt oder aus "jetzt" ableitbar (z.B. "nächsten Dienstag"). Sonst leerer String.' },
              status: { type: 'string', enum: STATUS_WERTE },
              erinnerungsdatum: { type: 'string', description: 'Datum JJJJ-MM-TT für eine Erinnerung, falls im Text genannt. Sonst leerer String.' },
              person: { type: 'string', description: 'Name der beteiligten Person. Falls eine bekannte Schreibvariante erkannt wird, den kanonischen Namen aus der Liste verwenden. Sonst leerer String.' },
              projekt: { type: 'string', description: 'Name des Projekts/Bauträgers. Falls eine bekannte Schreibvariante erkannt wird, den kanonischen Namen aus der Liste verwenden. Sonst leerer String.' },
              typ: { type: 'string', enum: TYP_WERTE },
              kurzfassung: { type: 'string', description: 'Ein bis zwei Sätze Zusammenfassung.' },
              neue_person: { type: 'boolean', description: 'true, falls "person" nicht in der übergebenen Liste bekannter Personen/Schreibvarianten vorkommt.' },
              neues_projekt: { type: 'boolean', description: 'true, falls "projekt" nicht in der übergebenen Liste bekannter Projekte/Schreibvarianten vorkommt.' },
              confidence: { type: 'number', description: 'Zahl zwischen 0 und 1: wie sicher ist die Zuordnung von Feldern, Namen und Datum.' }
            },
            required: ['titel', 'datum', 'status', 'erinnerungsdatum', 'person', 'projekt', 'typ', 'kurzfassung', 'neue_person', 'neues_projekt', 'confidence']
          }
        }
      },
      required: ['eintraege']
    }
  };
}

function systemPrompt_(jetztText, personenListe, projekteListe) {
  return [
    'Du strukturierst deutsche Sprachnotizen aus dem Immobilienalltag (Bauträger, Vermietung, Vertrieb) in Einträge für eine Notiz-Datenbank.',
    'Jetzt ist: ' + jetztText + '. Löse relative Datumsangaben ("nächsten Dienstag", "Ende des Monats", "morgen") relativ zu diesem Zeitpunkt auf.',
    'Bekannte Personen (Name: Schreibvarianten): ' + (personenListe || '(keine)'),
    'Bekannte Projekte (Name: Schreibvarianten): ' + (projekteListe || '(keine)'),
    'Antworte ausschließlich über das Werkzeug ' + STRUKTUR_TOOL_NAME + '.'
  ].join('\n');
}

/**
 * Ruft ein Claude-Modell mit dem Struktur-Tool auf.
 * @return {{eintraege: Array, usage: Object, modell: string, kosten: number}}
 */
function rufeClaudeAuf_(modell, text, jetztText, personenListe, projekteListe) {
  var payload = {
    model: modell,
    max_tokens: 2000,
    system: systemPrompt_(jetztText, personenListe, projekteListe),
    tools: [strukturTool_()],
    tool_choice: { type: 'tool', name: STRUKTUR_TOOL_NAME },
    messages: [{ role: 'user', content: text }]
  };

  var response = UrlFetchApp.fetch(ANTHROPIC_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': scriptEigenschaft_('ANTHROPIC_API_KEY'),
      'anthropic-version': ANTHROPIC_VERSION
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = JSON.parse(response.getContentText());

  if (code !== 200) {
    throw new Error('Claude API Fehler (' + code + '): ' + (body.error && body.error.message ? body.error.message : response.getContentText()));
  }

  var toolBlock = null;
  for (var i = 0; i < body.content.length; i++) {
    if (body.content[i].type === 'tool_use') {
      toolBlock = body.content[i];
      break;
    }
  }
  if (!toolBlock) {
    throw new Error('Claude API Antwort enthält keinen tool_use-Block.');
  }

  var kosten = berechneKosten_(modell, body.usage);
  Logger.log('Modell: %s | Tokens: %s in / %s out | Kosten: $%s',
    modell, body.usage.input_tokens, body.usage.output_tokens, kosten.toFixed(5));

  return {
    eintraege: toolBlock.input.eintraege,
    usage: body.usage,
    modell: modell,
    kosten: kosten
  };
}

function berechneKosten_(modell, usage) {
  var preis = PREISE[modell];
  if (!preis) return 0;
  return (usage.input_tokens / 1e6) * preis.input + (usage.output_tokens / 1e6) * preis.output;
}
