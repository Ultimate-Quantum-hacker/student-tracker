/* Student Exam Tracker — service worker
   Network-first HTML + cache-first assets.
*/

const CACHE_NAME = 'student-tracker-v5';

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
  '/services/db.js',
  '/icons/launchericon-48x48.png',
  '/icons/launchericon-72x72.png',
  '/icons/launchericon-96x96.png',
  '/icons/launchericon-144x144.png',
  '/icons/launchericon-192x192.png',
  '/icons/launchericon-512x512.png'
];

const canCacheRequest = request => {
  try {
    const url = new URL(request?.url || '');
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_error) {
    console.warn('Skipping cache for unsupported request:', request?.url || '');
    return false;
  }
};

const isNetworkFirstRequest = request => {
  try {
    const url = new URL(request?.url || '');
    if (url.origin !== self.location.origin) {
      return false;
    }
    return request.mode === 'navigate'
      || url.pathname === '/'
      || url.pathname.endsWith('.html')
      || url.pathname.endsWith('.js')
      || url.pathname.endsWith('.css')
      || url.pathname.endsWith('.json');
  } catch (_error) {
    return false;
  }
};

const cacheSuccessfulResponse = (request, response) => {
  if (
    !response
    || response.status !== 200
    || response.type !== 'basic'
    || !canCacheRequest(request)
  ) {
    return;
  }

  const responseClone = response.clone();
  caches.open(CACHE_NAME).then(cache => {
    cache.put(request, responseClone);

    if (request.mode === 'navigate') {
      const reqUrl = new URL(request.url);
      if (reqUrl.pathname === '/') {
        cache.put('/index.html', response.clone());
      }
    }
  });
};

const buildOfflineResponse = request => {
  if (request.headers.get('accept')?.includes('text/html')) {
    return caches.match('/index.html');
  }

  return Promise.resolve(new Response('Offline', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain' }
  }));
};

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

  if (isNetworkFirstRequest(req)) {
    event.respondWith(
      fetch(req)
        .then(networkRes => {
          cacheSuccessfulResponse(req, networkRes);
          return networkRes;
        })
        .catch(() => {
          return caches.match(req).then(cached => {
            return cached || buildOfflineResponse(req);
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
          cacheSuccessfulResponse(req, networkRes);
          return networkRes;
        })
        .catch(() => buildOfflineResponse(req));
    })
  );
});

