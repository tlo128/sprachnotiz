'use strict';

// Bei jeder Änderung an der PWA erhöhen. Der Cache-Name in sw.js zieht mit (gleiche Nummer),
// damit das Handy die neue Version beim zweiten Start sicher übernimmt.
const APP_VERSION = '1.4';
const APP_STAND = '10.09.2026';

/* ===================== Konfiguration ===================== */

const SPEICHER_URL = 'notiz_webapp_url';
const SPEICHER_SCHLUESSEL = 'notiz_schluessel';

function konfigLaden() {
  return {
    url: localStorage.getItem(SPEICHER_URL) || '',
    schluessel: localStorage.getItem(SPEICHER_SCHLUESSEL) || ''
  };
}

function konfigSpeichern(url, schluessel) {
  localStorage.setItem(SPEICHER_URL, url.trim());
  localStorage.setItem(SPEICHER_SCHLUESSEL, schluessel.trim());
}

/* ===================== IndexedDB Warteschlange (Offline-Puffer) ===================== */

const DB_NAME = 'sprachnotiz-db';
const DB_VERSION = 1;
const STORE = 'warteschlange';

function dbOeffnen() {
  return new Promise((resolve, reject) => {
    const anfrage = indexedDB.open(DB_NAME, DB_VERSION);
    anfrage.onupgradeneeded = () => {
      anfrage.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error);
  });
}

async function warteschlangeHinzufuegen(text, zeitstempel) {
  const db = await dbOeffnen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ text, zeitstempel });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function warteschlangeAlle() {
  const db = await dbOeffnen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const anfrage = tx.objectStore(STORE).getAll();
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error);
  });
}

async function warteschlangeEntfernen(id) {
  const db = await dbOeffnen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/* ===================== API-Client ===================== */

// Netzfehler: kein Netz oder Server nicht erreichbar -> Notiz wird gepuffert.
// Alle anderen Fehler (falsche URL, falscher Schlüssel, Serverfehler) werden angezeigt.
class NetzFehler extends Error {}

async function apiAufruf(daten) {
  const { url, schluessel } = konfigLaden();
  if (!url || !schluessel) throw new Error('Web-App-URL und Schlüssel fehlen. Bitte Einstellungen öffnen.');

  let http;
  try {
    http = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({}, daten, { schluessel }))
    });
  } catch (fehler) {
    throw new NetzFehler('Keine Verbindung.');
  }

  let antwort;
  try {
    antwort = await http.json();
  } catch (fehler) {
    throw new Error('Unerwartete Antwort vom Server. Web-App-URL in den Einstellungen prüfen.');
  }
  if (!antwort.ok) throw new Error(antwort.fehler || 'Unbekannter Fehler.');
  return antwort;
}

async function apiErfassen(text, zeitstempel) {
  return (await apiAufruf({ aktion: 'erfassen', text, zeitstempel })).eintraege;
}

async function apiListe(filter, wert) {
  return (await apiAufruf({ aktion: 'liste', filter: filter || '', wert: wert || '' })).eintraege;
}

async function apiAendern(id, felder) {
  return (await apiAufruf({ aktion: 'aendern', id, felder })).eintrag;
}

async function apiRueckgaengig(ids) {
  await apiAufruf({ aktion: 'rueckgaengig', ids });
}

/* ===================== Warteschlange <-> Server abgleichen ===================== */

let synchronisiertGerade = false;

async function warteschlangeSynchronisieren() {
  if (synchronisiertGerade || !navigator.onLine) return;
  synchronisiertGerade = true;
  try {
    const eintraege = await warteschlangeAlle();
    for (const eintrag of eintraege) {
      try {
        cacheNeueEintraege(await apiErfassen(eintrag.text, eintrag.zeitstempel));
        await warteschlangeEntfernen(eintrag.id);
      } catch (fehler) {
        break; // Beim ersten Fehler abbrechen, später erneut versuchen.
      }
    }
  } finally {
    synchronisiertGerade = false;
    warteschlangenHinweisAktualisieren();
  }
}

async function warteschlangenHinweisAktualisieren() {
  const hinweis = document.getElementById('warteschlangen-hinweis');
  const eintraege = await warteschlangeAlle();
  if (eintraege.length > 0) {
    hinweis.textContent = eintraege.length + (eintraege.length === 1 ? ' Notiz wartet' : ' Notizen warten');
    hinweis.classList.add('sichtbar');
  } else {
    hinweis.classList.remove('sichtbar');
  }
}

/* ===================== Spracherkennung ===================== */

const SpracherkennungKlasse = window.SpeechRecognition || window.webkitSpeechRecognition;
let erkennung = null;
let erkennungLaeuft = false;

function erkennungVerfuegbar() {
  return !!SpracherkennungKlasse;
}

function erkennungStarten() {
  if (!erkennungVerfuegbar()) return;
  erkennung = new SpracherkennungKlasse();
  erkennung.lang = 'de-DE';
  erkennung.continuous = true;
  erkennung.interimResults = false;

  erkennung.onresult = (ereignis) => {
    let neuerText = '';
    for (let i = ereignis.resultIndex; i < ereignis.results.length; i++) {
      if (ereignis.results[i].isFinal) {
        neuerText += ereignis.results[i][0].transcript;
      }
    }
    if (neuerText) {
      const feld = document.getElementById('text-eingabe');
      feld.value = (feld.value ? feld.value + ' ' : '') + neuerText.trim();
      stilleTimerZuruecksetzen();
    }
  };

  erkennung.onend = () => {
    if (erkennungLaeuft) {
      try { erkennung.start(); } catch (e) { /* bereits gestartet */ }
    }
  };

  erkennung.onerror = (ereignis) => {
    if (ereignis.error === 'not-allowed' || ereignis.error === 'service-not-allowed') {
      erkennungLaeuft = false;
      mikrofonAnsichtAktualisieren();
    }
    // andere Fehler (z.B. no-speech) ignorieren, onend startet automatisch neu
  };

  erkennungLaeuft = true;
  try { erkennung.start(); } catch (e) { /* schon aktiv */ }
  mikrofonAnsichtAktualisieren();
}

function erkennungStoppen() {
  erkennungLaeuft = false;
  if (erkennung) {
    try { erkennung.stop(); } catch (e) { /* ignorieren */ }
  }
  mikrofonAnsichtAktualisieren();
}

function mikrofonAnsichtAktualisieren() {
  document.getElementById('mikrofon-btn').classList.toggle('hoert-zu', erkennungLaeuft);
}

/* ===================== Stille-Timer (8 Sekunden Sicherheitsnetz) ===================== */

let stilleTimer = null;

function stilleTimerZuruecksetzen() {
  clearTimeout(stilleTimer);
  const text = document.getElementById('text-eingabe').value.trim();
  if (text) {
    stilleTimer = setTimeout(fertig, 8000);
  }
}

/* ===================== Fertig / Speichern ===================== */

async function fertig() {
  clearTimeout(stilleTimer);
  erkennungStoppen();

  const feld = document.getElementById('text-eingabe');
  const text = feld.value.trim();
  if (!text) return;
  feld.value = '';

  const zeitstempel = new Date().toISOString();

  if (navigator.onLine) {
    try {
      const eintraege = await apiErfassen(text, zeitstempel);
      cacheNeueEintraege(eintraege);
      const ids = eintraege.map((e) => e.ID);
      toastZeigen('Gespeichert', ids);
      return;
    } catch (fehler) {
      if (!(fehler instanceof NetzFehler)) {
        // Konfigurations- oder Serverfehler: Text behalten, damit nichts verloren geht.
        feld.value = text;
        toastZeigen('Nicht gespeichert: ' + fehler.message, null);
        return;
      }
      // Server nicht erreichbar trotz "online" -> puffern
    }
  }

  await warteschlangeHinzufuegen(text, zeitstempel);
  warteschlangenHinweisAktualisieren();
  toastZeigen('Offline gespeichert – wird nachgesendet', null);
}

/* ===================== Toast mit Rückgängig ===================== */

let toastTimer = null;

function toastZeigen(nachricht, ruecknaehmbareIds) {
  const toast = document.getElementById('toast');
  const rueckgaengigBtn = document.getElementById('toast-rueckgaengig');
  document.getElementById('toast-text').textContent = nachricht;
  rueckgaengigBtn.hidden = !ruecknaehmbareIds;

  rueckgaengigBtn.onclick = async () => {
    clearTimeout(toastTimer);
    toast.classList.remove('sichtbar');
    if (ruecknaehmbareIds) {
      try {
        await apiRueckgaengig(ruecknaehmbareIds);
        cacheEintraegeEntfernen(ruecknaehmbareIds);
      } catch (e) { /* ignorieren */ }
    }
  };

  toast.classList.add('sichtbar');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('sichtbar'), 5000);
}

/* ===================== Listen-Zwischenspeicher ===================== */
// Apps Script braucht pro Aufruf oft 1 bis 4 Sekunden (Containerstart bei Google).
// Deshalb: zuletzt geladene Liste sofort anzeigen, aktuelle Version im Hintergrund holen.

const CACHE_PRAEFIX = 'notiz_liste_';
const CACHE_FILTER = ['heute_offen', 'pruefen', 'person', 'projekt'];

function cacheSchluessel(filter, wert) {
  return CACHE_PRAEFIX + filter + (wert ? ':' + wert.toLowerCase() : '');
}

function cacheLesen(filter, wert) {
  if (CACHE_FILTER.indexOf(filter) === -1) return null;
  try {
    const roh = localStorage.getItem(cacheSchluessel(filter, wert));
    return roh ? JSON.parse(roh) : null;
  } catch (e) { return null; }
}

function cacheSchreiben(filter, wert, eintraege) {
  if (CACHE_FILTER.indexOf(filter) === -1) return;
  try { localStorage.setItem(cacheSchluessel(filter, wert), JSON.stringify(eintraege)); } catch (e) { /* voll */ }
}

// Wendet eine Funktion auf jede gespeicherte Liste an (für lokale Aktualisierung nach Änderungen).
function cacheAlleAendern(funktion) {
  Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PRAEFIX)).forEach((schluessel) => {
    try {
      const filter = schluessel.slice(CACHE_PRAEFIX.length).split(':')[0];
      const neu = funktion(JSON.parse(localStorage.getItem(schluessel)) || [], filter);
      localStorage.setItem(schluessel, JSON.stringify(neu));
    } catch (e) { localStorage.removeItem(schluessel); }
  });
}

function istPruefen(e) { return e['Prüfen'] === true || e.Status === 'prüfen'; }

function heuteIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Neue Einträge (gerade gespeichert) vorne in die passenden Listen einfügen.
function cacheNeueEintraege(eintraege) {
  cacheAlleAendern((liste, filter) => {
    const passend = eintraege.filter((e) => {
      if (filter === 'heute_offen') return true;
      if (filter === 'pruefen') return istPruefen(e);
      return false; // Personen-/Projektfilter werden beim nächsten Anzeigen ohnehin aktualisiert
    });
    return passend.concat(liste);
  });
}

// Geänderten Eintrag in allen Listen ersetzen bzw. entfernen, wenn er nicht mehr passt.
function cacheEintragAktualisieren(eintrag) {
  const heute = heuteIso();
  cacheAlleAendern((liste, filter) => {
    const ohne = liste.filter((e) => e.ID !== eintrag.ID);
    const passt = filter === 'pruefen' ? istPruefen(eintrag)
      : filter === 'heute_offen' ? (eintrag.Status === 'offen' || String(eintrag.Erstellt || '').substring(0, 10) === heute)
      : true;
    if (!passt) return ohne;
    const index = liste.findIndex((e) => e.ID === eintrag.ID);
    if (index === -1) return [eintrag].concat(ohne);
    liste[index] = eintrag;
    return liste;
  });
}

function cacheEintraegeEntfernen(ids) {
  cacheAlleAendern((liste) => liste.filter((e) => ids.indexOf(e.ID) === -1));
}

// Beim Start die beiden Tab-Listen im Hintergrund holen, damit sie beim Antippen schon da sind.
async function listenVorladen() {
  const { url, schluessel } = konfigLaden();
  if (!url || !schluessel || !navigator.onLine) return;
  for (const filter of ['heute_offen', 'pruefen']) {
    try { cacheSchreiben(filter, '', await apiListe(filter)); } catch (e) { break; }
  }
}

/* ===================== Ansichten / Navigation ===================== */

function ansichtZeigen(name) {
  document.querySelectorAll('.ansicht').forEach((el) => {
    el.hidden = el.dataset.ansicht !== name;
  });
  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.classList.toggle('aktiv', btn.dataset.ziel === name);
  });

  if (name === 'liste') {
    listeFilterLeisteVerstecken();
    listeLaden('liste-inhalt', 'heute_offen');
  } else if (name === 'pruefen') {
    listeLaden('pruefen-inhalt', 'pruefen');
  } else if (name === 'suche') {
    document.getElementById('suche-inhalt').innerHTML = '';
  }
}

async function listeLaden(containerId, filter, wert) {
  const container = document.getElementById(containerId);
  const anfrage = String(Date.now()) + Math.random();
  container.dataset.anfrage = anfrage; // nur die jüngste Anfrage darf rendern

  const gespeichert = cacheLesen(filter, wert);
  if (gespeichert) {
    eintraegeRendern(gespeichert, container);
  } else {
    container.innerHTML = '<p class="leer-hinweis">Lädt…</p>';
  }

  try {
    const eintraege = await apiListe(filter, wert);
    cacheSchreiben(filter, wert, eintraege);
    if (container.dataset.anfrage !== anfrage) return;
    eintraegeRendern(eintraege, container);
  } catch (fehler) {
    if (container.dataset.anfrage !== anfrage) return;
    if (gespeichert) {
      toastZeigen('Keine Verbindung, zeige letzten Stand', null);
      return;
    }
    const hinweis = document.createElement('p');
    hinweis.className = 'fehler-hinweis';
    hinweis.textContent = 'Keine Verbindung zum Sheet. ' + fehler.message;
    container.replaceChildren(hinweis);
  }
}

function listeFilterLeisteVerstecken() {
  document.getElementById('liste-filter-leiste').hidden = true;
}

function nachPersonOderProjektFiltern(art, name) {
  ansichtZeigen('liste');
  const leiste = document.getElementById('liste-filter-leiste');
  document.getElementById('liste-filter-text').textContent = (art === 'person' ? 'Person: ' : 'Projekt: ') + name;
  leiste.hidden = false;
  listeLaden('liste-inhalt', art, name);
}

document.getElementById('liste-filter-loeschen').addEventListener('click', () => {
  listeFilterLeisteVerstecken();
  listeLaden('liste-inhalt', 'heute_offen');
});

const STATUS_KLASSE = { offen: 'status-offen', erledigt: 'status-erledigt', wartend: 'status-wartend', 'prüfen': 'status-pruefen' };

function formatDatum(isoText) {
  if (!isoText) return '';
  const datum = new Date(isoText);
  if (isNaN(datum)) return '';
  return datum.toLocaleDateString('de-DE');
}

function eintraegeRendern(eintraege, container) {
  container.innerHTML = '';
  if (!eintraege || eintraege.length === 0) {
    container.innerHTML = '<p class="leer-hinweis">Keine Einträge.</p>';
    return;
  }

  eintraege.forEach((eintrag) => {
    const karte = document.createElement('div');
    karte.className = 'karte';

    const zeile1 = document.createElement('div');
    zeile1.className = 'zeile1';
    const titel = document.createElement('span');
    titel.className = 'titel';
    titel.textContent = eintrag.Titel || '(ohne Titel)';
    const datum = document.createElement('span');
    datum.className = 'datum';
    datum.textContent = formatDatum(eintrag.Datum) || formatDatum(eintrag.Erstellt);
    zeile1.append(titel, datum);
    karte.appendChild(zeile1);

    if (eintrag.Kurzfassung) {
      const kurz = document.createElement('div');
      kurz.className = 'kurzfassung';
      kurz.textContent = eintrag.Kurzfassung;
      karte.appendChild(kurz);
    }

    const chips = document.createElement('div');
    chips.className = 'chip-reihe';

    const typChip = document.createElement('span');
    typChip.className = 'chip typ';
    typChip.textContent = eintrag.Typ;
    chips.appendChild(typChip);

    const statusChip = document.createElement('span');
    statusChip.className = 'chip ' + (STATUS_KLASSE[eintrag.Status] || '');
    statusChip.textContent = eintrag.Status;
    chips.appendChild(statusChip);

    if (eintrag['Prüfen'] === true) {
      const pruefenChip = document.createElement('span');
      pruefenChip.className = 'chip pruefen';
      pruefenChip.textContent = 'prüfen';
      chips.appendChild(pruefenChip);
    }

    if (eintrag.Person) {
      const personChip = document.createElement('span');
      personChip.className = 'chip klickbar';
      personChip.textContent = '👤 ' + eintrag.Person;
      personChip.addEventListener('click', (ev) => { ev.stopPropagation(); nachPersonOderProjektFiltern('person', eintrag.Person); });
      chips.appendChild(personChip);
    }

    if (eintrag.Projekt) {
      const projektChip = document.createElement('span');
      projektChip.className = 'chip klickbar';
      projektChip.textContent = '🏗 ' + eintrag.Projekt;
      projektChip.addEventListener('click', (ev) => { ev.stopPropagation(); nachPersonOderProjektFiltern('projekt', eintrag.Projekt); });
      chips.appendChild(projektChip);
    }

    karte.appendChild(chips);
    karte.addEventListener('click', () => bearbeitenOeffnen(eintrag));
    container.appendChild(karte);
  });
}

/* ===================== Suche ===================== */

let sucheTimer = null;
document.getElementById('suche-eingabe').addEventListener('input', (ev) => {
  clearTimeout(sucheTimer);
  const wert = ev.target.value.trim();
  if (!wert) { document.getElementById('suche-inhalt').innerHTML = ''; return; }
  sucheTimer = setTimeout(() => listeLaden('suche-inhalt', 'suche', wert), 400);
});

/* ===================== Bearbeiten ===================== */

let bearbeitenAktuelleId = null;

function bearbeitenOeffnen(eintrag) {
  bearbeitenAktuelleId = eintrag.ID;
  document.getElementById('b-titel').value = eintrag.Titel || '';
  document.getElementById('b-status').value = eintrag.Status || 'offen';
  document.getElementById('b-typ').value = eintrag.Typ || 'Notiz';
  document.getElementById('b-datum').value = (eintrag.Datum || '').substring(0, 10);
  document.getElementById('b-erinnerung').value = (eintrag.Erinnerungsdatum || '').substring(0, 10);
  document.getElementById('b-person').value = eintrag.Person || '';
  document.getElementById('b-projekt').value = eintrag.Projekt || '';
  document.getElementById('b-kurzfassung').value = eintrag.Kurzfassung || '';
  ansichtZeigen('bearbeiten');
}

document.getElementById('bearbeiten-abbrechen').addEventListener('click', () => ansichtZeigen('liste'));

document.getElementById('bearbeiten-formular').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const felder = {
    Titel: document.getElementById('b-titel').value.trim(),
    Status: document.getElementById('b-status').value,
    Typ: document.getElementById('b-typ').value,
    Datum: document.getElementById('b-datum').value,
    Erinnerungsdatum: document.getElementById('b-erinnerung').value,
    Person: document.getElementById('b-person').value.trim(),
    Projekt: document.getElementById('b-projekt').value.trim(),
    Kurzfassung: document.getElementById('b-kurzfassung').value.trim(),
    'Prüfen': false // wurde gerade vom Nutzer durchgesehen
  };
  try {
    const eintrag = await apiAendern(bearbeitenAktuelleId, felder);
    cacheEintragAktualisieren(eintrag);
    ansichtZeigen('liste');
  } catch (fehler) {
    alert('Speichern fehlgeschlagen: ' + fehler.message);
  }
});

/* ===================== Verbindungsstatus ===================== */

function verbindungsAnzeigeAktualisieren() {
  document.body.classList.toggle('offline', !navigator.onLine);
}

window.addEventListener('online', () => { verbindungsAnzeigeAktualisieren(); warteschlangeSynchronisieren(); });
window.addEventListener('offline', verbindungsAnzeigeAktualisieren);

/* ===================== Einrichtung ===================== */

function einrichtungPruefen() {
  const { url, schluessel } = konfigLaden();
  const konfiguriert = !!(url && schluessel);
  document.getElementById('einrichtung').hidden = konfiguriert;
  document.getElementById('einrichtung-abbrechen').hidden = !konfiguriert;
}

function einrichtungOeffnen() {
  document.getElementById('app-version').textContent = 'Version ' + APP_VERSION + ' vom ' + APP_STAND;
  const { url, schluessel } = konfigLaden();
  document.getElementById('eingabe-url').value = url;
  document.getElementById('eingabe-schluessel').value = schluessel;
  document.getElementById('einrichtung-abbrechen').hidden = !(url && schluessel);
  document.getElementById('einrichtung').hidden = false;
}

document.getElementById('einstellungen-btn').addEventListener('click', einrichtungOeffnen);

document.getElementById('einrichtung-abbrechen').addEventListener('click', () => {
  document.getElementById('einrichtung').hidden = true;
});

document.getElementById('einrichtung-formular').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const url = document.getElementById('eingabe-url').value.trim();
  const schluessel = document.getElementById('eingabe-schluessel').value.trim();
  if (!url || !schluessel) return;
  konfigSpeichern(url, schluessel);
  document.getElementById('einrichtung').hidden = true;
  document.getElementById('einrichtung-abbrechen').hidden = false;
  warteschlangeSynchronisieren().then(listenVorladen);
});

/* ===================== Start ===================== */

document.getElementById('mikrofon-btn').addEventListener('click', () => {
  if (erkennungLaeuft) erkennungStoppen(); else erkennungStarten();
});

document.getElementById('fertig-btn').addEventListener('click', fertig);

document.getElementById('text-eingabe').addEventListener('input', stilleTimerZuruecksetzen);

document.querySelectorAll('#tabs button').forEach((btn) => {
  btn.addEventListener('click', () => ansichtZeigen(btn.dataset.ziel));
});

if (!erkennungVerfuegbar()) {
  document.body.classList.add('keine-spracherkennung');
}

verbindungsAnzeigeAktualisieren();
einrichtungPruefen();
warteschlangenHinweisAktualisieren();
warteschlangeSynchronisieren().then(listenVorladen);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* Offline-Cache optional */ });
}
