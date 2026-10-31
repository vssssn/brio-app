// Brio service worker: caches ONLY the static app shell (same origin, relative to the Pages scope).
// Relay traffic (ntfy.sh HTTPS polls, MQTT WebSocket) is cross-origin and is never intercepted or cached.
const CACHE = 'brio-pages-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'relay.js', 'config.js', 'sw-register.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/favicon-32.png'];
const SHELL_URLS = SHELL.map(p => new URL(p, self.registration.scope).href);
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(()=>{})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;        // relay & anything cross-origin: network only, untouched
  const key = u.origin + u.pathname;
  if (!SHELL_URLS.includes(key)) return;
  // network-first so a new deploy shows up immediately; cached shell when offline
  e.respondWith(fetch(e.request, {cache: 'no-store'}).then(r => {
    if (r.ok && !r.redirected) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(key, cp)); }
    return r;
  }).catch(() => caches.match(key).then(r => r || caches.match(SHELL_URLS[0]))));
});
