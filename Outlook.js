// Outlook-Anbindung (Session 5, Microsoft Graph) über die OAuth2-Bibliothek für Apps
// Script (googleworkspace/apps-script-oauth2, siehe CLAUDE.md). Delegierte Anmeldung,
// nur das eigene Konto im eigenen M365-Tenant.
//
// Einmalige Einrichtung:
// 1. App-Registrierung in Entra anlegen (siehe CLAUDE.md), Redirect-URI:
//    https://script.google.com/macros/d/{SCRIPT-ID}/usercallback
// 2. Script-Eigenschaften MS_CLIENT_ID, MS_TENANT_ID, MS_CLIENT_SECRET setzen.
// 3. Bibliothek "OAuth2" (Script-ID 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF)
//    im Editor unter "Bibliotheken" hinzufügen.
// 4. autorisieren() im Editor ausführen, den geloggten Link im Browser öffnen, anmelden.

var GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

function outlookService_() {
  var tenantId = scriptEigenschaft_('MS_TENANT_ID');
  return OAuth2.createService('microsoft-outlook')
    .setAuthorizationBaseUrl('https://login.microsoftonline.com/' + tenantId + '/oauth2/v2.0/authorize')
    .setTokenUrl('https://login.microsoftonline.com/' + tenantId + '/oauth2/v2.0/token')
    .setClientId(scriptEigenschaft_('MS_CLIENT_ID'))
    .setClientSecret(scriptEigenschaft_('MS_CLIENT_SECRET'))
    .setCallbackFunction('outlookAuthCallback_')
    .setPropertyStore(PropertiesService.getScriptProperties())
    .setScope('offline_access Tasks.ReadWrite Calendars.ReadWrite User.Read')
    .setParam('prompt', 'consent');
}

/**
 * Einmalig im Editor ausführen, um die Anmeldung bei Outlook zu starten. Loggt den
 * Link, der im Browser geöffnet werden muss (Anmeldung + Zustimmung zu den Rechten).
 */
function autorisieren() {
  var service = outlookService_();
  if (service.hasAccess()) {
    Logger.log('Bereits mit Outlook verbunden.');
  } else {
    Logger.log('Bitte diesen Link im Browser öffnen und mit dem Microsoft-Konto anmelden: ' + service.getAuthorizationUrl());
  }
}

// Wird von der OAuth2-Bibliothek automatisch über die usercallback-URL aufgerufen,
// nicht Teil von doGet/doPost.
function outlookAuthCallback_(request) {
  var service = outlookService_();
  var erfolgreich = service.handleCallback(request);
  return HtmlService.createHtmlOutput(erfolgreich
    ? 'Erfolgreich mit Outlook verbunden. Dieses Fenster kann geschlossen werden.'
    : 'Verbindung fehlgeschlagen. Bitte autorisieren() erneut ausführen.');
}

/**
 * Ruft die Microsoft Graph API auf (Bearer-Token aus der OAuth2-Bibliothek).
 * @param {string} pfad Pfad ab GRAPH_BASE_URL, z.B. "/me/todo/lists".
 * @param {string} [methode] 'get' (Standard), 'post', 'patch', 'delete'.
 * @param {Object} [payload] Wird als JSON-Body mitgeschickt, falls angegeben.
 */
function graphFetch_(pfad, methode, payload) {
  var service = outlookService_();
  if (!service.hasAccess()) {
    throw new Error('Nicht mit Outlook verbunden. Bitte autorisieren() im Editor ausführen.');
  }
  var optionen = {
    method: methode || 'get',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + service.getAccessToken() },
    muteHttpExceptions: true
  };
  if (payload !== undefined) optionen.payload = JSON.stringify(payload);

  var antwort = UrlFetchApp.fetch(GRAPH_BASE_URL + pfad, optionen);
  var code = antwort.getResponseCode();
  var text = antwort.getContentText();
  var body = text ? JSON.parse(text) : {};

  if (code < 200 || code >= 300) {
    throw new Error('Microsoft Graph Fehler (' + code + '): ' + (body.error && body.error.message ? body.error.message : text));
  }
  return body;
}

// IDs der To-Do-Liste/des Kalenders "Notizen" werden nach dem ersten Auflösen in den
// Script-Eigenschaften gemerkt, damit nicht bei jeder Aktion erst die Liste aller
// Listen/Kalender abgefragt werden muss.
function outlookListeId_() {
  var eigenschaften = PropertiesService.getScriptProperties();
  var id = eigenschaften.getProperty('MS_TODO_LISTE_ID');
  if (id) return id;

  var listen = graphFetch_('/me/todo/lists?$top=100').value || [];
  var gefunden = listen.filter(function (l) { return l.displayName === 'Notizen'; })[0];
  if (!gefunden) {
    gefunden = graphFetch_('/me/todo/lists', 'post', { displayName: 'Notizen' });
  }
  eigenschaften.setProperty('MS_TODO_LISTE_ID', gefunden.id);
  return gefunden.id;
}

function outlookKalenderId_() {
  var eigenschaften = PropertiesService.getScriptProperties();
  var id = eigenschaften.getProperty('MS_KALENDER_ID');
  if (id) return id;

  var kalender = graphFetch_('/me/calendars?$top=100').value || [];
  var gefunden = kalender.filter(function (k) { return k.name === 'Notizen'; })[0];
  if (!gefunden) {
    gefunden = graphFetch_('/me/calendars', 'post', { name: 'Notizen' });
  }
  eigenschaften.setProperty('MS_KALENDER_ID', gefunden.id);
  return gefunden.id;
}

/**
 * Einmalig im Editor ausführen (nach autorisieren()): legt die To-Do-Liste und den
 * Kalender "Notizen" an, falls sie noch nicht existieren, und merkt sich die IDs in
 * den Script-Eigenschaften.
 */
function outlookEinrichten() {
  Logger.log('To-Do-Liste "Notizen": ID ' + outlookListeId_());
  Logger.log('Kalender "Notizen": ID ' + outlookKalenderId_());
}

// Nur zum manuellen Debuggen im Editor: legt direkt eine Testaufgabe an, ohne den
// try/catch von outlook_erstellen - ein Fehler erscheint dadurch direkt (rot, mit
// Stacktrace) im Ausführungsprotokoll statt nur geloggt zu werden. Kein Unterstrich
// am Ende (sonst blendet der Editor die Funktion aus dem Ausführen-Dropdown aus).
function outlookTestAufgabeErstellen() {
  // Datum bewusst wie zeileZuObjekt_ es liefert (volles ISO), um den echten Ablauf nachzustellen.
  var ergebnis = outlookAufgabeErstellen_({
    ID: 'test', Titel: 'Testaufgabe mit Datum (kann in To Do gelöscht werden)',
    Datum: '2026-09-22T00:00:00', Erinnerungsdatum: '', Kurzfassung: 'Testnotiz', Projekt: '', Person: '', Status: 'offen'
  });
  Logger.log('Erstellt: ' + JSON.stringify(ergebnis));
}

// Aufruf-Fehler (abgelaufenes Token, Graph kurz nicht erreichbar ...) werden geloggt,
// nicht geworfen: der Sheet-Eintrag ist zu diesem Zeitpunkt schon geschrieben (siehe
// outlookSynchronisieren_ in Aktionen.js), das darf durch einen Outlook-Ausfall nicht
// rückgängig gemacht/als Fehler an die PWA gemeldet werden. Bleibt Outlook_ID leer,
// wird beim nächsten Anfassen des Eintrags automatisch erneut versucht.

function outlook_erstellen(eintrag) {
  try {
    var ergebnis;
    if (eintrag.Typ === 'Aufgabe') ergebnis = outlookAufgabeErstellen_(eintrag);
    else if (eintrag.Typ === 'Termin') ergebnis = outlookTerminErstellen_(eintrag);
    else { outlookFehlerMerken_('outlook_erstellen: ID ' + eintrag.ID + ' hat Typ "' + eintrag.Typ + '", weder Aufgabe noch Termin - übersprungen.'); return; }
    outlookVerknuepfungSpeichern_(eintrag.ID, ergebnis.id, eintrag.Typ, ergebnis.lastModifiedDateTime);
    outlookFehlerMerken_('OK: erstellen ID ' + eintrag.ID + ' -> Outlook-ID ' + ergebnis.id);
  } catch (fehler) {
    var nachricht = 'Outlook erstellen fehlgeschlagen (ID ' + eintrag.ID + '): ' + fehler;
    Logger.log(nachricht);
    outlookFehlerMerken_(nachricht);
  }
}

function outlook_aktualisieren(eintrag) {
  try {
    if (eintrag.Typ !== eintrag.Outlook_Typ) {
      // Zwischen Aufgabe und Termin gewechselt, während schon mit Outlook verknüpft:
      // eine Aufgabe kann nicht zu einem Termin "umgewandelt" werden (und umgekehrt) -
      // altes Outlook-Element löschen, passendes neu anlegen.
      outlook_loeschen(eintrag);
      outlook_erstellen(Object.assign({}, eintrag, { Outlook_ID: '', Outlook_Typ: '' }));
      return;
    }
    var ergebnis = eintrag.Outlook_Typ === 'Aufgabe' ? outlookAufgabeAktualisieren_(eintrag) : outlookTerminAktualisieren_(eintrag);
    outlookVerknuepfungSpeichern_(eintrag.ID, eintrag.Outlook_ID, eintrag.Outlook_Typ, ergebnis.lastModifiedDateTime);
    outlookFehlerMerken_('OK: aktualisieren ID ' + eintrag.ID);
  } catch (fehler) {
    var nachricht = 'Outlook aktualisieren fehlgeschlagen (ID ' + eintrag.ID + '): ' + fehler;
    Logger.log(nachricht);
    outlookFehlerMerken_(nachricht);
  }
}

function outlook_loeschen(eintrag) {
  if (!eintrag.Outlook_ID) return;
  try {
    if (eintrag.Outlook_Typ === 'Aufgabe') outlookAufgabeLoeschen_(eintrag);
    else if (eintrag.Outlook_Typ === 'Termin') outlookTerminLoeschen_(eintrag);
  } catch (fehler) {
    Logger.log('Outlook löschen fehlgeschlagen (ID ' + eintrag.ID + '): ' + fehler);
  }
}

function outlookVerknuepfungSpeichern_(id, outlookId, outlookTyp, lastModifiedDateTime) {
  eintragFelderSetzen_(id, {
    Outlook_ID: outlookId,
    Outlook_Typ: outlookTyp,
    Outlook_Geaendert: lastModifiedDateTime ? new Date(lastModifiedDateTime) : new Date()
  }, false);
}

function outlookVerknuepfungLoeschen_(id) {
  eintragFelderSetzen_(id, { Outlook_ID: '', Outlook_Typ: '', Outlook_Geaendert: '' }, false);
}

// Merkt sich Erfolg/Misserfolg des letzten Outlook-Sync-Versuchs (auch aus einem
// doPost-Aufruf der PWA, wo Logger.log-Ausgaben nicht bequem einsehbar sind).
// outlookLetzterFehler im Editor ausführen, um nachzusehen.
function outlookFehlerMerken_(nachricht) {
  try {
    PropertiesService.getScriptProperties().setProperty('OUTLOOK_LETZTES_ERGEBNIS', new Date().toISOString() + ' - ' + nachricht);
  } catch (e) { /* Speichern des Debug-Hinweises darf nie die eigentliche Aktion stören */ }
}

function outlookLetzterFehler() {
  Logger.log(PropertiesService.getScriptProperties().getProperty('OUTLOOK_LETZTES_ERGEBNIS') || '(noch kein Outlook-Sync-Versuch gespeichert)');
}

// Kurzfassung plus Projekt und Person als Beschreibungstext für Aufgabe/Termin.
function outlookBeschreibung_(eintrag) {
  var teile = [];
  if (eintrag.Kurzfassung) teile.push(eintrag.Kurzfassung);
  var zusatz = [];
  if (eintrag.Projekt) zusatz.push('Projekt: ' + eintrag.Projekt);
  if (eintrag.Person) zusatz.push('Person: ' + eintrag.Person);
  if (zusatz.length) teile.push(zusatz.join(' · '));
  return teile.join('\n\n');
}

// Datum/Erinnerungsdatum kommen aus dem Sheet (zeileZuObjekt_) immer als volles ISO
// ("2026-09-22T00:00:00"), nicht als reines Datum - erst auf die ersten 10 Zeichen kürzen.
function outlookNurDatum_(text) {
  return String(text || '').substring(0, 10);
}

function outlookGraphZeit_(datumText, uhrzeitText) {
  return { dateTime: outlookNurDatum_(datumText) + 'T' + (uhrzeitText || '09:00') + ':00', timeZone: 'Europe/Berlin' };
}

/* ----- Aufgaben (To Do) ----- */

function outlookAufgabeErstellen_(eintrag) {
  return graphFetch_('/me/todo/lists/' + outlookListeId_() + '/tasks', 'post', outlookAufgabeKoerper_(eintrag));
}

function outlookAufgabeAktualisieren_(eintrag) {
  return graphFetch_('/me/todo/lists/' + outlookListeId_() + '/tasks/' + eintrag.Outlook_ID, 'patch', outlookAufgabeKoerper_(eintrag));
}

function outlookAufgabeLoeschen_(eintrag) {
  graphFetch_('/me/todo/lists/' + outlookListeId_() + '/tasks/' + eintrag.Outlook_ID, 'delete');
}

function outlookAufgabeKoerper_(eintrag) {
  var body = {
    title: eintrag.Titel || '(ohne Titel)',
    status: eintrag.Status === 'erledigt' ? 'completed' : 'notStarted'
  };
  if (eintrag.Datum) body.dueDateTime = outlookGraphZeit_(eintrag.Datum, '00:00');
  if (eintrag.Erinnerungsdatum) {
    body.reminderDateTime = outlookGraphZeit_(eintrag.Erinnerungsdatum, '09:00');
    body.isReminderOn = true;
  }
  var beschreibung = outlookBeschreibung_(eintrag);
  if (beschreibung) body.body = { content: beschreibung, contentType: 'text' };
  return body;
}

/* ----- Termine (Kalender) ----- */

var TERMIN_DAUER_MINUTEN = 60;
var TERMIN_ERINNERUNG_MINUTEN = 30;

function outlookTerminErstellen_(eintrag) {
  return graphFetch_('/me/calendars/' + outlookKalenderId_() + '/events', 'post', outlookTerminKoerper_(eintrag));
}

function outlookTerminAktualisieren_(eintrag) {
  return graphFetch_('/me/calendars/' + outlookKalenderId_() + '/events/' + eintrag.Outlook_ID, 'patch', outlookTerminKoerper_(eintrag));
}

function outlookTerminLoeschen_(eintrag) {
  graphFetch_('/me/calendars/' + outlookKalenderId_() + '/events/' + eintrag.Outlook_ID, 'delete');
}

function outlookTerminKoerper_(eintrag) {
  var datum = outlookNurDatum_(eintrag.Datum) || Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd');
  var uhrzeit = eintrag.Uhrzeit || '09:00';
  var start = new Date(datum + 'T' + uhrzeit + ':00');
  var ende = new Date(start.getTime() + TERMIN_DAUER_MINUTEN * 60 * 1000);

  var body = {
    subject: eintrag.Titel || '(ohne Titel)',
    start: { dateTime: datum + 'T' + uhrzeit + ':00', timeZone: 'Europe/Berlin' },
    end: { dateTime: Utilities.formatDate(ende, 'Europe/Berlin', "yyyy-MM-dd'T'HH:mm:ss"), timeZone: 'Europe/Berlin' },
    isReminderOn: true,
    reminderMinutesBeforeStart: TERMIN_ERINNERUNG_MINUTEN
  };
  var beschreibung = outlookBeschreibung_(eintrag);
  if (beschreibung) body.body = { content: beschreibung, contentType: 'text' };
  return body;
}
