/* Student Exam Tracker — service worker
   Network-first HTML + cache-first assets.
*/

const CACHE_NAME = 'student-tracker-v4';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/signup.html',
  '/styles.css',
  '/css/enhanced.css',
  '/css/auth.css',
  '/manifest.json',
  '/js/state.js',
  '/js/firebase-config.js',
  '/js/firebase.js',
  '/js/auth.js',
  '/js/auth-page.js',
  '/js/analytics.js',
  '/js/students.js',
  '/js/charts.js',
  '/js/heatmap.js',
  '/js/export.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/sidebar.js',
  '/icons/launchericon-48x48.png',
  '/icons/launchericon-72x72.png',
  '/icons/launchericon-96x96.png',
  '/icons/launchericon-144x144.png',
  '/icons/launchericon-192x192.png',
  '/icons/launchericon-512x512.png'
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

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(req, resClone);

              const reqUrl = new URL(req.url);
              if (reqUrl.pathname === '/') {
                cache.put('/index.html', networkRes.clone());
              }
            });
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(req).then(cachedPage => {
            return cachedPage || caches.match('/index.html');
          });
        })
    );
    return;
  }

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

