'use strict';

// Bei jeder Änderung an der PWA erhöhen. Der Cache-Name in sw.js zieht mit (gleiche Nummer),
// damit das Handy die neue Version beim zweiten Start sicher übernimmt.
const APP_VERSION = '2.1';
const APP_STAND = '15.09.2026';

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
    tx.objectStore(STORE).add({ typ: 'erfassen', text, zeitstempel });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// eintragId statt id, weil "id" bereits der Primärschlüssel des IndexedDB-Objects ist.
async function warteschlangeAktionHinzufuegen(aktion, eintragId, extra) {
  const db = await dbOeffnen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ typ: 'aktion', aktion, eintragId, extra: extra || null });
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

// Netzfehler: kein Netz oder Server nicht erreichbar -> Notiz/Aktion wird gepuffert.
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
        if (eintrag.typ === 'aktion') {
          await aktionSynchronisieren_(eintrag);
        } else {
          cacheNeueEintraege(await apiErfassen(eintrag.text, eintrag.zeitstempel));
        }
        await warteschlangeEntfernen(eintrag.id);
      } catch (fehler) {
        break; // Beim ersten Fehler abbrechen, später erneut versuchen.
      }
    }
  } finally {
    synchronisiertGerade = false;
    warteschlangenHinweisAktualisieren();
    aktuelleAnsichtAktualisieren();
  }
}

async function aktionSynchronisieren_(eintrag) {
  if (eintrag.aktion === 'loeschen') {
    await apiAufruf({ aktion: 'loeschen', id: eintrag.eintragId });
    return;
  }
  const daten = { aktion: eintrag.aktion, id: eintrag.eintragId };
  if (eintrag.aktion === 'aufgabe' || eintrag.aktion === 'termin' || eintrag.aktion === 'bearbeiten') {
    daten.felder = eintrag.extra || {};
  }
  if (eintrag.aktion === 'verschieben') daten.datum = eintrag.extra && eintrag.extra.datum;
  const antwort = await apiAufruf(daten);
  cacheEintragAktualisieren(antwort.eintrag);
}

async function warteschlangenHinweisAktualisieren() {
  const hinweis = document.getElementById('warteschlangen-hinweis');
  const eintraege = await warteschlangeAlle();
  if (eintraege.length > 0) {
    hinweis.textContent = eintraege.length + (eintraege.length === 1 ? ' Änderung wartet' : ' Änderungen warten');
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
        aktuelleAnsichtAktualisieren();
      } catch (e) { /* ignorieren */ }
    }
  };

  toast.classList.add('sichtbar');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('sichtbar'), 5000);
}

/* ===================== Datumshilfen ===================== */

function isoDatum(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function heuteIso() { return isoDatum(new Date()); }
function wocheEndeIso() { const d = new Date(); d.setDate(d.getDate() + 6); return isoDatum(d); }

const WOCHENTAGE_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function formatDatumKurz(isoText) {
  const d = new Date(isoText);
  if (isNaN(d)) return '';
  return WOCHENTAGE_KURZ[d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.';
}
function formatDatum(isoText) {
  if (!isoText) return '';
  const datum = new Date(isoText);
  if (isNaN(datum)) return '';
  return datum.toLocaleDateString('de-DE');
}

/* ===================== Listen-Zwischenspeicher ===================== */
// Apps Script braucht pro Aufruf oft 1 bis 4 Sekunden (Containerstart bei Google).
// Deshalb: zuletzt geladene Liste sofort anzeigen, aktuelle Version im Hintergrund holen.

const CACHE_PRAEFIX = 'notiz_liste_';
const CACHE_FILTER = ['eingang', 'heute', 'woche', 'person', 'projekt'];

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
      const rest = schluessel.slice(CACHE_PRAEFIX.length);
      const teile = rest.split(':');
      const filter = teile[0];
      const wert = teile.length > 1 ? teile.slice(1).join(':') : '';
      const neu = funktion(JSON.parse(localStorage.getItem(schluessel)) || [], filter, wert);
      localStorage.setItem(schluessel, JSON.stringify(neu));
    } catch (e) { localStorage.removeItem(schluessel); }
  });
}

// Spiegelt die serverseitige Filterlogik aus Liste.js, für optimistische Updates im Cache.
function eintragPasstZuFilter_(eintrag, filter, wert) {
  const aktiv = eintrag.Status !== 'abgelegt' && eintrag.Status !== 'erledigt';
  const datum = String(eintrag.Datum || '').substring(0, 10);
  if (filter === 'eingang') return eintrag.Eingang === 'ja';
  if (filter === 'heute') return aktiv && datum === heuteIso();
  if (filter === 'woche') return aktiv && datum && datum >= heuteIso() && datum <= wocheEndeIso();
  if (filter === 'person') return (eintrag.Person || '').toLowerCase() === (wert || '').toLowerCase();
  if (filter === 'projekt') return (eintrag.Projekt || '').toLowerCase() === (wert || '').toLowerCase();
  return true;
}

// Neue Einträge (gerade gespeichert) vorne in die passenden Listen einfügen.
function cacheNeueEintraege(eintraege) {
  cacheAlleAendern((liste, filter, wert) => {
    const passend = eintraege.filter((e) => eintragPasstZuFilter_(e, filter, wert));
    return passend.concat(liste);
  });
}

// Geänderten Eintrag (voll oder als Teil-Update) in allen Listen einsetzen bzw. entfernen,
// wenn er nicht mehr passt. Merged mit der bestehenden Cache-Kopie, damit ein optimistisches
// Teil-Update (z.B. nur Status+Eingang) nicht die übrigen Felder der Karte leert.
function cacheEintragAktualisieren(teilupdate) {
  cacheAlleAendern((liste, filter, wert) => {
    const bestehend = liste.find((e) => e.ID === teilupdate.ID);
    const voll = bestehend ? Object.assign({}, bestehend, teilupdate) : teilupdate;
    const ohne = liste.filter((e) => e.ID !== teilupdate.ID);
    if (!eintragPasstZuFilter_(voll, filter, wert)) return ohne;
    return [voll].concat(ohne);
  });
}

// Bildet nach, was eine Aktion serverseitig ändern würde - für die sofortige Anzeige,
// solange die Aktion noch offline in der Warteschlange liegt.
function eintragOptimistischAendern_(eintrag, aktion, extra) {
  const basis = { ID: eintrag.ID, Eingang: 'nein' };
  if (aktion === 'uebernehmen') {
    if (eintrag.Aktion_Vorschlag === 'Aufgabe') return Object.assign(basis, { Typ: 'Aufgabe', Status: 'offen' });
    if (eintrag.Aktion_Vorschlag === 'Termin') return Object.assign(basis, { Typ: 'Termin', Status: 'offen' });
    if (eintrag.Aktion_Vorschlag === 'Ablegen') return Object.assign(basis, { Status: 'abgelegt', Datum: '', Erinnerungsdatum: '' });
    return basis;
  }
  if (aktion === 'aufgabe') {
    return Object.assign(basis, { Typ: 'Aufgabe', Status: 'offen' }, extra && extra.datum !== undefined ? { Datum: extra.datum } : {});
  }
  if (aktion === 'termin') {
    return Object.assign(basis, { Typ: 'Termin', Status: 'offen' }, extra && extra.uhrzeit !== undefined ? { Uhrzeit: extra.uhrzeit } : {});
  }
  if (aktion === 'verschieben') return Object.assign(basis, { Datum: extra.datum });
  if (aktion === 'ablegen') return Object.assign(basis, { Status: 'abgelegt', Datum: '', Erinnerungsdatum: '' });
  if (aktion === 'erledigt') return Object.assign(basis, { Status: 'erledigt' });
  if (aktion === 'bearbeiten') return Object.assign({ ID: eintrag.ID, Eingang: 'nein' }, extra);
  return basis;
}

function cacheEintraegeEntfernen(ids) {
  cacheAlleAendern((liste) => liste.filter((e) => ids.indexOf(e.ID) === -1));
}

// Beim Start die drei Dashboard-Listen im Hintergrund holen, damit sie beim Antippen schon da sind.
async function listenVorladen() {
  const { url, schluessel } = konfigLaden();
  if (!url || !schluessel || !navigator.onLine) return;
  for (const filter of ['eingang', 'heute', 'woche']) {
    try { cacheSchreiben(filter, '', await apiListe(filter)); } catch (e) { break; }
  }
}

/* ===================== Ansichten / Navigation ===================== */

// Zeigt, welche Liste zuletzt geladen wurde - für den Refresh nach einer Aktion
// und für die Rückkehr aus dem Bearbeiten-Formular.
let aktiveListenAnsicht = null;

function ansichtZeigen(name) {
  document.querySelectorAll('.ansicht').forEach((el) => {
    el.hidden = el.dataset.ansicht !== name;
  });
  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.classList.toggle('aktiv', btn.dataset.ziel === name);
  });

  if (name === 'eingang') listeLaden('eingang-inhalt', 'eingang');
  else if (name === 'heute') listeLaden('heute-inhalt', 'heute');
  else if (name === 'woche') listeLaden('woche-inhalt', 'woche');
  else if (name === 'suche') {
    const wert = document.getElementById('suche-eingabe').value.trim();
    if (wert) listeLaden('suche-inhalt', 'suche', wert);
  }
  // 'liste' (Person/Projekt-Filter) lädt nicht automatisch - siehe
  // nachPersonOderProjektFiltern() und die Rückkehr aus dem Bearbeiten-Formular.
}

function aktuelleAnsichtAktualisieren() {
  if (aktiveListenAnsicht) listeLaden(aktiveListenAnsicht.containerId, aktiveListenAnsicht.filter, aktiveListenAnsicht.wert);
}

async function listeLaden(containerId, filter, wert) {
  aktiveListenAnsicht = { containerId, filter, wert };
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
  ansichtZeigen('eingang');
});

const STATUS_KLASSE = {
  offen: 'status-offen', erledigt: 'status-erledigt', abgelegt: 'status-abgelegt',
  wartend: 'status-abgelegt', 'prüfen': 'status-pruefen'
};

function vorschlagText(eintrag) {
  const datumTeil = eintrag.Datum ? formatDatumKurz(eintrag.Datum) : '';
  if (eintrag.Aktion_Vorschlag === 'Aufgabe') return 'Aufgabe' + (datumTeil ? ' bis ' + datumTeil : '');
  if (eintrag.Aktion_Vorschlag === 'Termin') {
    return 'Termin' + (datumTeil ? ' am ' + datumTeil : '') + (eintrag.Uhrzeit ? ', ' + eintrag.Uhrzeit + ' Uhr' : '');
  }
  if (eintrag.Aktion_Vorschlag === 'Ablegen') return 'Ablegen vorgeschlagen (nur Info)';
  return 'Keine Empfehlung – bitte Aktion wählen';
}

function eintraegeRendern(eintraege, container) {
  container.innerHTML = '';
  if (!eintraege || eintraege.length === 0) {
    container.innerHTML = '<p class="leer-hinweis">Keine Einträge.</p>';
    return;
  }
  eintraege.forEach((eintrag) => container.appendChild(karteErstellen(eintrag)));
}

function karteErstellen(eintrag) {
  const wrapper = document.createElement('div');
  wrapper.className = 'karte-wrapper';

  const hintLinks = document.createElement('div');
  hintLinks.className = 'karte-hint links';
  hintLinks.textContent = eintrag.Eingang === 'ja' ? '✅' : '✓';
  const hintRechts = document.createElement('div');
  hintRechts.className = 'karte-hint rechts';
  hintRechts.textContent = '⋯';
  wrapper.append(hintLinks, hintRechts);

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

  const vorschlagZeile = document.createElement('div');
  vorschlagZeile.className = 'vorschlag-zeile';
  if (eintrag.Eingang === 'ja') {
    const text = document.createElement('span');
    text.className = 'vorschlag-text';
    text.textContent = vorschlagText(eintrag);
    const uebernehmenBtn = document.createElement('button');
    uebernehmenBtn.type = 'button';
    uebernehmenBtn.className = 'btn-uebernehmen';
    uebernehmenBtn.textContent = 'Übernehmen';
    uebernehmenBtn.addEventListener('click', (ev) => { ev.stopPropagation(); aktionAusfuehren('uebernehmen', eintrag); });
    const andereBtn = document.createElement('button');
    andereBtn.type = 'button';
    andereBtn.className = 'btn-andere-aktion';
    andereBtn.textContent = 'Andere Aktion';
    andereBtn.addEventListener('click', (ev) => { ev.stopPropagation(); aktionenMenuOeffnen(eintrag); });
    vorschlagZeile.append(text, uebernehmenBtn, andereBtn);
  } else {
    const andereBtn = document.createElement('button');
    andereBtn.type = 'button';
    andereBtn.className = 'btn-andere-aktion';
    andereBtn.textContent = '⋯ Aktion';
    andereBtn.addEventListener('click', (ev) => { ev.stopPropagation(); aktionenMenuOeffnen(eintrag); });
    vorschlagZeile.appendChild(andereBtn);
  }
  karte.appendChild(vorschlagZeile);

  karte.addEventListener('click', () => bearbeitenOeffnen(eintrag));
  wrapper.appendChild(karte);
  swipeAktivieren(karte, eintrag);

  return wrapper;
}

/* ===================== Wischgesten (Handy) ===================== */
// Rechts wischen: Übernehmen (falls im Eingang) bzw. schnell Erledigt.
// Links wischen: Aktionen-Menü öffnen. Buttons bleiben immer zusätzlich nutzbar (PC-Fallback).

function swipeAktivieren(karte, eintrag) {
  const schwelle = 70;
  let startX = null, startY = null, deltaX = 0, aktiv = false;

  karte.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    startX = ev.touches[0].clientX;
    startY = ev.touches[0].clientY;
    deltaX = 0;
    aktiv = false;
  }, { passive: true });

  karte.addEventListener('touchmove', (ev) => {
    if (startX === null) return;
    const dx = ev.touches[0].clientX - startX;
    const dy = ev.touches[0].clientY - startY;
    if (!aktiv && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) aktiv = true;
    if (!aktiv) return;
    deltaX = dx;
    karte.style.transition = 'none';
    karte.style.transform = 'translateX(' + dx + 'px)';
  }, { passive: true });

  karte.addEventListener('touchend', () => {
    karte.style.transition = '';
    karte.style.transform = '';
    if (!aktiv) { startX = null; return; }
    if (deltaX > schwelle) {
      aktionAusfuehren(eintrag.Eingang === 'ja' ? 'uebernehmen' : 'erledigt', eintrag);
    } else if (deltaX < -schwelle) {
      aktionenMenuOeffnen(eintrag);
    }
    startX = null; deltaX = 0; aktiv = false;
  });
}

/* ===================== Aktionen (uebernehmen/aufgabe/termin/verschieben/ablegen/erledigt/loeschen) ===================== */

// Führt eine Aktion aus. Ohne Netz (oder wenn der Server trotz "online" nicht erreichbar
// ist) wird sie gepuffert und die Karte sofort optimistisch aktualisiert; beim nächsten
// Online-Gehen sendet warteschlangeSynchronisieren() sie nach.
async function aktionAusfuehren(aktion, eintrag, extra) {
  if (aktion === 'loeschen') {
    if (navigator.onLine) {
      try {
        await apiAufruf({ aktion: 'loeschen', id: eintrag.ID });
        cacheEintraegeEntfernen([eintrag.ID]);
        toastZeigen('Gelöscht', null);
        aktuelleAnsichtAktualisieren();
        return;
      } catch (fehler) {
        if (!(fehler instanceof NetzFehler)) { toastZeigen('Fehler: ' + fehler.message, null); return; }
      }
    }
    await warteschlangeAktionHinzufuegen('loeschen', eintrag.ID, null);
    cacheEintraegeEntfernen([eintrag.ID]);
    warteschlangenHinweisAktualisieren();
    toastZeigen('Offline gelöscht – wird nachgesendet', null);
    aktuelleAnsichtAktualisieren();
    return;
  }

  if (navigator.onLine) {
    try {
      const daten = { aktion, id: eintrag.ID };
      if (aktion === 'aufgabe' || aktion === 'termin' || aktion === 'bearbeiten') daten.felder = extra || {};
      if (aktion === 'verschieben') daten.datum = extra.datum;
      const antwort = await apiAufruf(daten);
      cacheEintragAktualisieren(antwort.eintrag);
      aktuelleAnsichtAktualisieren();
      return;
    } catch (fehler) {
      if (!(fehler instanceof NetzFehler)) {
        toastZeigen('Fehler: ' + fehler.message, null);
        return;
      }
      // sonst weiter zum Offline-Puffer
    }
  }

  await warteschlangeAktionHinzufuegen(aktion, eintrag.ID, extra || null);
  cacheEintragAktualisieren(eintragOptimistischAendern_(eintrag, aktion, extra));
  warteschlangenHinweisAktualisieren();
  toastZeigen('Offline gespeichert – wird nachgesendet', null);
  aktuelleAnsichtAktualisieren();
}

/* ===================== Aktionen-Menü (Bottom Sheet) ===================== */

let aktuellesMenuEintrag = null;

function aktionenMenuOeffnen(eintrag) {
  aktuellesMenuEintrag = eintrag;
  document.getElementById('aktionen-menu-titel').textContent = eintrag.Titel || '(ohne Titel)';
  document.getElementById('aktionen-menu-liste').hidden = false;
  document.getElementById('verschieben-liste').hidden = true;
  document.getElementById('aktionen-menu').hidden = false;
}

function aktionenMenuSchliessen() {
  document.getElementById('aktionen-menu').hidden = true;
  aktuellesMenuEintrag = null;
}

document.getElementById('aktionen-menu-schliessen').addEventListener('click', aktionenMenuSchliessen);
document.getElementById('aktionen-menu').addEventListener('click', (ev) => {
  if (ev.target.id === 'aktionen-menu') aktionenMenuSchliessen();
});

document.getElementById('aktionen-menu-liste').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-aktion]');
  if (!btn || !aktuellesMenuEintrag) return;
  const aktion = btn.dataset.aktion;
  const eintrag = aktuellesMenuEintrag;

  if (aktion === 'verschieben-oeffnen') {
    document.getElementById('aktionen-menu-liste').hidden = true;
    document.getElementById('verschieben-liste').hidden = false;
    document.getElementById('verschieben-datum').value = '';
    return;
  }
  if (aktion === 'bearbeiten') {
    aktionenMenuSchliessen();
    bearbeitenOeffnen(eintrag);
    return;
  }
  if (aktion === 'loeschen') {
    if (!confirm('"' + (eintrag.Titel || 'Eintrag') + '" wirklich löschen?')) return;
    aktionenMenuSchliessen();
    await aktionAusfuehren('loeschen', eintrag);
    return;
  }
  aktionenMenuSchliessen();
  await aktionAusfuehren(aktion, eintrag);
});

document.getElementById('verschieben-liste').addEventListener('click', async (ev) => {
  const tage = ev.target.dataset.verschieben;
  if (!tage || !aktuellesMenuEintrag) return;
  const ziel = new Date();
  ziel.setDate(ziel.getDate() + Number(tage));
  const eintrag = aktuellesMenuEintrag;
  aktionenMenuSchliessen();
  await aktionAusfuehren('verschieben', eintrag, { datum: isoDatum(ziel) });
});

document.getElementById('verschieben-bestaetigen').addEventListener('click', async () => {
  const datum = document.getElementById('verschieben-datum').value;
  if (!datum || !aktuellesMenuEintrag) return;
  const eintrag = aktuellesMenuEintrag;
  aktionenMenuSchliessen();
  await aktionAusfuehren('verschieben', eintrag, { datum });
});

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
let bearbeitenHerkunft = 'eingang';

function bearbeitenOeffnen(eintrag) {
  bearbeitenAktuelleId = eintrag.ID;
  const sichtbar = document.querySelector('.ansicht:not([hidden])');
  bearbeitenHerkunft = sichtbar ? sichtbar.dataset.ansicht : 'eingang';

  document.getElementById('b-titel').value = eintrag.Titel || '';
  document.getElementById('b-status').value = eintrag.Status || 'offen';
  document.getElementById('b-typ').value = eintrag.Typ || 'Notiz';
  document.getElementById('b-datum').value = (eintrag.Datum || '').substring(0, 10);
  document.getElementById('b-uhrzeit').value = eintrag.Uhrzeit || '';
  document.getElementById('b-erinnerung').value = (eintrag.Erinnerungsdatum || '').substring(0, 10);
  document.getElementById('b-person').value = eintrag.Person || '';
  document.getElementById('b-projekt').value = eintrag.Projekt || '';
  document.getElementById('b-kurzfassung').value = eintrag.Kurzfassung || '';
  ansichtZeigen('bearbeiten');
}

function bearbeitenSchliessenUndZurueck() {
  ansichtZeigen(bearbeitenHerkunft);
  if (bearbeitenHerkunft === 'liste') aktuelleAnsichtAktualisieren();
}

document.getElementById('bearbeiten-abbrechen').addEventListener('click', bearbeitenSchliessenUndZurueck);

document.getElementById('bearbeiten-formular').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const felder = {
    Titel: document.getElementById('b-titel').value.trim(),
    Status: document.getElementById('b-status').value,
    Typ: document.getElementById('b-typ').value,
    Datum: document.getElementById('b-datum').value,
    Uhrzeit: document.getElementById('b-uhrzeit').value,
    Erinnerungsdatum: document.getElementById('b-erinnerung').value,
    Person: document.getElementById('b-person').value.trim(),
    Projekt: document.getElementById('b-projekt').value.trim(),
    Kurzfassung: document.getElementById('b-kurzfassung').value.trim(),
    'Prüfen': false // wurde gerade vom Nutzer durchgesehen
  };
  await aktionAusfuehren('bearbeiten', { ID: bearbeitenAktuelleId, Aktion_Vorschlag: '' }, felder);
  bearbeitenSchliessenUndZurueck();
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
