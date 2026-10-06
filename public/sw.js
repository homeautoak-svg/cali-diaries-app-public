const CACHE_NAME = 'camping-logbuch-shell-v13';
const SHELL_FILES = ['/', '/bundle.js', '/manifest.json', '/icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Nur das App-Grundgeruest (HTML/JS/Icon/Manifest) wird zwischengespeichert, damit die
// Oberflaeche auch ohne Netz laedt. API-Aufrufe (/api/...) gehen immer direkt ans Netz,
// Daten werden bewusst nicht offline zwischengespeichert.
//
// Strategie: zuerst das Netz versuchen (damit neue Versionen sofort ankommen, sobald online),
// nur bei echtem Verbindungsfehler auf den letzten zwischengespeicherten Stand zurueckfallen.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // fremde Server (Wetter, Kurse, Karten-APIs etc.) nie abfangen
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
