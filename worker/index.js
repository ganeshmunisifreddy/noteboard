// Bundled by next-pwa and imported at the top of the service worker, so this
// fetch handler runs before Workbox's routes.
//
// The board and editor are static pages that read everything from IndexedDB,
// so one cached copy of each serves every query string (?view=…, ?id=…)
// offline, including notes never opened before.
const SHELL_CACHE = 'app-shell';
const SHELL_PATHS = ['/', '/note'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_PATHS))
      .catch(() => {}),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.mode !== 'navigate' || url.origin !== self.location.origin || !SHELL_PATHS.includes(url.pathname)) {
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(url.pathname, copy)));
        }
        return response;
      })
      .catch(async () => (await caches.match(url.pathname, { cacheName: SHELL_CACHE })) || Response.error()),
  );
});
