// The Ledger — service worker: lets the site load and show cached data offline.
// HTML pages use "network first" so new deployments show up right away (no stale-cache confusion);
// the cache is only used when you're offline.
const CACHE = 'ledger-v1';
const SHELL = ['./', './index.html', './staff.html', './manifest.json', './manifest-staff.json',
               './icon-192.png', './icon-512.png'];
const CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
  'https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(u => cache.add(u).catch(() => {})));
    await Promise.all(CDN.map(async (u) => {
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await cache.put(u, r); } catch (e) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache live data / email calls — the app handles offline for those itself.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.includes('emailjs.com')) return;

  // Pages: network first, fall back to cache when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Everything else (scripts, fonts, icons, photos): cached copy right away, refreshed in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
