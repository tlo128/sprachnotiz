// Tägliche Erinnerungs-Mail (8:00 Europe/Berlin) für fällige/überfällige Einträge.

function erinnerungenFaellig_() {
  var notizen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTIZEN);
  var letzteZeile = notizen.getLastRow();
  if (letzteZeile < 2) return [];

  var werte = notizen.getRange(2, 1, letzteZeile - 1, SPALTEN_NOTIZEN.length).getValues();
  var idxErinnerung = SPALTEN_NOTIZEN.indexOf('Erinnerungsdatum');
  var idxStatus = SPALTEN_NOTIZEN.indexOf('Status');
  var idxTitel = SPALTEN_NOTIZEN.indexOf('Titel');
  var idxPerson = SPALTEN_NOTIZEN.indexOf('Person');
  var idxProjekt = SPALTEN_NOTIZEN.indexOf('Projekt');

  var heute = new Date();
  heute.setHours(0, 0, 0, 0);

  var faellig = [];
  werte.forEach(function (zeile, i) {
    var erinnerungsdatum = zeile[idxErinnerung];
    if (!(erinnerungsdatum instanceof Date)) return;
    if (zeile[idxStatus] === 'erledigt') return;
    if (erinnerungsdatum > heute) return; // liegt noch in der Zukunft

    faellig.push({
      zeilenNummer: i + 2,
      titel: zeile[idxTitel],
      status: zeile[idxStatus],
      person: zeile[idxPerson],
      projekt: zeile[idxProjekt]
    });
  });
  return faellig;
}

function escapeHtml_(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function erinnerungsMailSenden() {
  var faellig = erinnerungenFaellig_();
  if (faellig.length === 0) {
    Logger.log('Keine fälligen Erinnerungen heute.');
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var notizen = ss.getSheetByName(SHEET_NOTIZEN);
  var empfaenger = scriptEigenschaft_('ERINNERUNGS_EMAIL');

  var htmlZeilen = faellig.map(function (e) {
    var link = ss.getUrl() + '#gid=' + notizen.getSheetId() + '&range=A' + e.zeilenNummer;
    var zusatz = [e.person, e.projekt].filter(String).join(' · ');
    return '<li><a href="' + link + '">' + escapeHtml_(e.titel || '(ohne Titel)') + '</a>' +
      (zusatz ? ' — ' + escapeHtml_(zusatz) : '') +
      ' <span style="color:#888888;">[' + escapeHtml_(e.status) + ']</span></li>';
  }).join('');

  var textZeilen = faellig.map(function (e) {
    var zusatz = [e.person, e.projekt].filter(String).join(', ');
    return '- ' + e.titel + (zusatz ? ' (' + zusatz + ')' : '') + ' [' + e.status + ']';
  }).join('\n');

  MailApp.sendEmail({
    to: empfaenger,
    subject: 'Sprachnotiz: ' + faellig.length + ' Erinnerung' + (faellig.length === 1 ? '' : 'en') + ' fällig',
    body: textZeilen,
    htmlBody: '<p>Erinnerungen für heute (' + Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy') + '):</p><ul>' + htmlZeilen + '</ul>'
  });

  Logger.log('Erinnerungs-Mail gesendet an ' + empfaenger + ' (' + faellig.length + ' Einträge).');
}

// Einmal im Editor ausführen, um den täglichen 8:00-Uhr-Trigger einzurichten.
function erinnerungsTriggerEinrichten() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'erinnerungsMailSenden') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('erinnerungsMailSenden')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .inTimezone('Europe/Berlin')
    .create();
  Logger.log('Täglicher Trigger für 8:00 Uhr (Europe/Berlin) eingerichtet.');
}
