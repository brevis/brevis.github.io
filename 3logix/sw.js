/* TriX service worker: precaches the whole game so it works offline. Bump CACHE together with the ?v= asset version in index.html. */
const CACHE = 'trix-20260909a';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/fonts.css?v=20260909a', './css/style.css?v=20260909a', './js/engine.js?v=20260909a', './js/app.js?v=20260909a',
  './icons/icon-192.png', './icons/icon-512.png',
  './fonts/fredoka-400-latin-ext.woff2',
  './fonts/fredoka-400-latin.woff2',
  './fonts/fredoka-500-latin-ext.woff2',
  './fonts/fredoka-500-latin.woff2',
  './fonts/fredoka-600-latin-ext.woff2',
  './fonts/fredoka-600-latin.woff2',
  './fonts/fredoka-700-latin-ext.woff2',
  './fonts/fredoka-700-latin.woff2',
  './fonts/luckiest-guy-400-latin-ext.woff2',
  './fonts/luckiest-guy-400-latin.woff2',
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then((hit) => hit || caches.match(req, { ignoreSearch: true }).then((h2) => h2 || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })))
  );
});
