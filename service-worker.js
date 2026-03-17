/* Student Exam Tracker — service worker
   Simple cache-first strategy for core assets.
*/

const CACHE_NAME = 'se-tracker-cache-v1';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/css/enhanced.css',
  '/manifest.json',
  '/js/state.js',
  '/js/analytics.js',
  '/js/students.js',
  '/js/charts.js',
  '/js/heatmap.js',
  '/js/export.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/sidebar.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(networkRes => {
          if (
            networkRes &&
            networkRes.status === 200 &&
            networkRes.type === 'basic'
          ) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(req, resClone);
            });
          }
          return networkRes;
        })
        .catch(() => {
          if (req.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
          return new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
    })
  );
});

