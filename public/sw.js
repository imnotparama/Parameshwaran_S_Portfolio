// ============================================================
// Service Worker: Parama PCB Hardware OS Offline Engine
// Network-First for HTML documents, stale-while-revalidate for assets
// ============================================================

const CACHE_NAME = 'parama-pcb-os-v3.0';
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.svg'
];

// 1. Install: Precache core shell assets & take control immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('[SW] Precache partial error:', err);
            });
        })
    );
});

// 2. Activate: Delete all legacy cache versions immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch strategy:
// Navigation (HTML document): Network-First (so updates appear instantly), fallback to cache
// Static assets: Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (!url.protocol.startsWith('http')) return;

    // Navigation requests (HTML): Always fetch fresh from network
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return networkResponse;
            }).catch(() => {
                return caches.match('/index.html') || caches.match('/');
            })
        );
        return;
    }

    // Static assets: Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return networkResponse;
            }).catch(() => {});

            return cachedResponse || fetchPromise;
        })
    );
});
