/* Service worker — caches the app shell so this works with zero signal
   (a parking lot, a basement venue, airplane mode). Everything this app
   needs is these six files; nothing here ever calls out to a network API.

   CACHE_VERSION: bump this string any time app.js/gear-data.js/styles.css/
   index.html change, so returning visitors actually get the update instead
   of a stale cached copy forever. Easy to forget — that's the whole risk
   with a cache-first strategy, so it's called out here on purpose. */
const CACHE_VERSION = 'gig-checklist-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './gear-data.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first, falling back to network, falling back to the cached shell
// page for navigations (so a stale-but-usable app beats a browser error
// screen when there's no connection).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
