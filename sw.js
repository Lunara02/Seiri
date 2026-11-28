/* Seiri: funciona sin conexión una vez abierta (solo versión web). Lo reescribe tools/build-web.js */
const VERSION = '6.2.0';
const FILES = ["./","app.js","core.js","home.js","i18n-en.js","i18n.js","index.html","manifest.webmanifest","photos.js","pwa.js","search.js","seiri.css","settings.js","setup.js","shell.js","style.css","timers.js","v5.js","icons/icon-192.png","icons/icon-256.png","icons/icon-512.png","icons/sample-miku.png"];
const CACHE = 'seiri-' + VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('seiri-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Solo archivos de la propia app: primero la copia guardada y, en segundo plano, se actualiza
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
