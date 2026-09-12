// Dairy Manager - Service Worker
// ---------------------------------------------------------------
// The whole app is one self-contained HTML file (no separate CSS/JS/image
// files - even the manifest and its icon are inlined as data: URIs), so
// there is exactly one thing worth caching for offline use: that HTML
// document itself. All real farm data already lives safely in IndexedDB,
// independent of this cache - this file only makes the *app shell* (the
// page load) work without a network connection.
//
// Strategy: network-first for navigation, falling back to the cached copy
// when offline. This means:
//   - Online: you always get the latest version of the app immediately,
//     and the cache is refreshed in the background for next time.
//   - Offline: the last successfully loaded version opens instantly
//     instead of showing the browser's "no internet" error page.
//
// Bump CACHE_VERSION any time you deploy a new version of the HTML file,
// so old caches get cleaned up and the new one takes over.
// ---------------------------------------------------------------

const CACHE_VERSION = 'dairy-manager-v1';
const APP_SHELL_URL = './';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Cache both the scope root and the actual request URL that loaded
      // this service worker, so a fallback lookup succeeds either way.
      return cache.addAll([APP_SHELL_URL, self.registration.scope]).catch(() => {
        // If addAll fails (e.g. one of the two URLs 404s in some hosting
        // setups), still try caching just the scope root so install
        // doesn't fail outright and offline support degrades gracefully.
        return cache.add(APP_SHELL_URL);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle top-level page navigations (opening/reloading the app).
  // Everything else the app needs (fonts via CSS, etc.) is already inlined
  // in the document itself, so there's nothing else to intercept.
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Got a fresh copy - update the cache for next time we're offline.
        const responseClone = networkResponse.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(APP_SHELL_URL, responseClone));
        return networkResponse;
      })
      .catch(() =>
        // Offline (or request failed) - serve the last cached version.
        caches.match(APP_SHELL_URL).then((cached) => cached || caches.match(event.request))
      )
  );
});