/* Service worker for offline app shell.
 *
 * Deliberately simple: cache-first for same-origin GETs (the app bundle, styles,
 * and the onnxruntime wasm files under /ort/), network-first for navigations with
 * a cached fallback. Cross-origin traffic is never touched — the LLM weights and
 * Whisper weights are cached by their own runtimes (WebLLM's Cache API backend and
 * transformers.js's browser cache), so duplicating them here would waste quota.
 */

const CACHE = 'zhongwen-shell-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Individually so a single 404 can't abort the whole install.
      await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network so deploys land, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put('./index.html', fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) {
        // Refresh in the background; serve instantly either way.
        fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          })
          .catch(() => {});
        return hit;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (err) {
        const fallback = await cache.match(req, { ignoreSearch: true });
        if (fallback) return fallback;
        throw err;
      }
    })(),
  );
});
