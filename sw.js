// Dairy Manager - offline app-shell service worker
//
// SETUP: place this file in the SAME folder as index.html on your server
// (a service worker can only control pages that are its own siblings/children,
// and browsers require it to be a real fetchable file - it can't be embedded
// inside index.html itself). Nothing else to configure.
//
// All your actual data (animals, customers, bills, etc.) already lives safely
// in IndexedDB on the device and is untouched by this file - this only caches
// the app shell (the HTML/CSS/JS) so the app can still OPEN with no signal.

const CACHE_NAME = 'dairy-manager-shell-v1';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Network-first, falling back to the last cached copy when offline. This
// keeps the app shell fresh whenever there IS a connection (so updates you
// deploy show up normally), while still opening instantly with zero signal
// by serving whatever was last successfully loaded.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    // Only handle same-origin navigations/assets - don't try to cache
    // cross-origin requests (fonts/CDNs), which behave better going straight
    // to the network with the browser's own HTTP cache.
    if (new URL(event.request.url).origin !== self.location.origin) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Only cache good responses - caching a transient 404/500 would
                // otherwise get served back as the "offline" copy indefinitely.
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});