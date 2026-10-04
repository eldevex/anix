/* AnixWeb service worker: оболочка кэшируется, API — всегда сеть. */
var CACHE = 'anixweb-v8';
var SHELL = ['./', './index.html', './assets/style.css', './assets/anix.js', './assets/app.js', './manifest.webmanifest', './assets/icon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Запросы к API Anixart и любые сторонние — только сеть, без кэша.
  if (url.origin !== self.location.origin) return;
  // Оболочка: сначала кэш, потом сеть (устойчиво к офлайну).
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).catch(function () { return caches.match('./index.html'); });
    })
  );
});
