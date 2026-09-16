const CACHE_NAME = 'sprachnotiz-v2-6'; // Nummer = APP_VERSION in app.js
const APP_SHELL = ['./', './index.html', './app.js', './styles.css', './manifest.json', './icon.svg'];

self.addEventListener('install', (ereignis) => {
  ereignis.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(
    caches.keys().then((namen) => Promise.all(namen.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (ereignis) => {
  const url = new URL(ereignis.request.url);
  // Nur die App-Shell cachen. API-Aufrufe zu Apps Script gehen unverändert übers Netz.
  if (url.origin !== self.location.origin || ereignis.request.method !== 'GET') return;

  ereignis.respondWith(
    caches.match(ereignis.request).then((zwischengespeichert) => {
      const netzwerk = fetch(ereignis.request)
        .then((antwort) => {
          if (antwort.ok) {
            const kopie = antwort.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(ereignis.request, kopie));
          }
          return antwort;
        })
        .catch(() => zwischengespeichert || Response.error());
      return zwischengespeichert || netzwerk;
    })
  );
});
