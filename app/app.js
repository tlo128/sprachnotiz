'use strict';

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

function apiFehler(antwort) {
  return new Error(antwort && antwort.fehler ? antwort.fehler : 'Unbekannter Fehler.');
}

async function apiErfassen(text, zeitstempel) {
  const { url, schluessel } = konfigLaden();
  const antwort = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ aktion: 'erfassen', schluessel, text, zeitstempel })
  }).then((r) => r.json());
  if (!antwort.ok) throw apiFehler(antwort);
  return antwort.eintraege;
}

async function apiListe(filter, wert) {
  const { url, schluessel } = konfigLaden();
  const parameter = new URLSearchParams({ schluessel, filter: filter || '' });
  if (wert) parameter.set('wert', wert);
  const antwort = await fetch(url + '?' + parameter.toString()).then((r) => r.json());
  if (!antwort.ok) throw apiFehler(antwort);
  return antwort.eintraege;
}

async function apiAendern(id, felder) {
  const { url, schluessel } = konfigLaden();
  const antwort = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ aktion: 'aendern', schluessel, id, felder })
  }).then((r) => r.json());
  if (!antwort.ok) throw apiFehler(antwort);
  return antwort.eintrag;
}

async function apiRueckgaengig(ids) {
  const { url, schluessel } = konfigLaden();
  const antwort = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ aktion: 'rueckgaengig', schluessel, ids })
  }).then((r) => r.json());
  if (!antwort.ok) throw apiFehler(antwort);
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
        await apiErfassen(eintrag.text, eintrag.zeitstempel);
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
      const ids = eintraege.map((e) => e.ID);
      toastZeigen('Gespeichert', ids);
      return;
    } catch (fehler) {
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
      try { await apiRueckgaengig(ruecknaehmbareIds); } catch (e) { /* ignorieren */ }
    }
  };

  toast.classList.add('sichtbar');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('sichtbar'), 5000);
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
  container.innerHTML = '<p class="leer-hinweis">Lädt…</p>';
  try {
    const eintraege = await apiListe(filter, wert);
    eintraegeRendern(eintraege, container);
  } catch (fehler) {
    container.innerHTML = '<p class="fehler-hinweis">Keine Verbindung zum Sheet. ' + fehler.message + '</p>';
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
    Kurzfassung: document.getElementById('b-kurzfassung').value.trim()
  };
  try {
    await apiAendern(bearbeitenAktuelleId, felder);
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
  warteschlangeSynchronisieren();
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
warteschlangeSynchronisieren();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* Offline-Cache optional */ });
}
