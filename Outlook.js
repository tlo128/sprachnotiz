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

// Platzhalter, folgen in einem der nächsten Schritte dieser Session.

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
