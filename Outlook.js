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

// Platzhalter, folgen im nächsten Schritt dieser Session.

function outlook_erstellen(eintrag) {
  Logger.log('[Outlook-Stub] erstellen: ID=%s Typ=%s Titel=%s Datum=%s Uhrzeit=%s',
    eintrag.ID, eintrag.Typ, eintrag.Titel, eintrag.Datum, eintrag.Uhrzeit);
}

function outlook_aktualisieren(eintrag) {
  Logger.log('[Outlook-Stub] aktualisieren: ID=%s Outlook_ID=%s Status=%s', eintrag.ID, eintrag.Outlook_ID, eintrag.Status);
}

function outlook_loeschen(eintrag) {
  Logger.log('[Outlook-Stub] loeschen: ID=%s Outlook_ID=%s', eintrag.ID, eintrag.Outlook_ID);
}
