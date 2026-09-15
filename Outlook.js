// Platzhalter für die Outlook-Anbindung (Session 5, Microsoft Graph). Loggen aktuell nur,
// damit die Aufrufstellen in den Aktionen schon existieren und getestet werden können.

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
