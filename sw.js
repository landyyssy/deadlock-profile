const C = 'dp1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const key = u.origin + u.pathname;
  e.respondWith(caches.open(C).then(async c => {
    const hit = await c.match(key), net = fetch(key, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(key, r.clone()); return r; });
    if (!hit) return net;
    e.waitUntil(net.catch(() => {}));
    return hit;
  }));
});
