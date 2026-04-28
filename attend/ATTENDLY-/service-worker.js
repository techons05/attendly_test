// Service Worker pour ATTENDLY
const CACHE_NAME = 'attendly-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/loginE.html',
  '/loginP.html',
  '/student/emploi.html',
  '/student/notes.html',
  '/student/profile.html',
  '/student/notifications.html',
  '/student/parametres.html',
  '/student/css/style.css',
  '/student/js/app.js',
  '/js/database.js',
  '/js/supabase-client.js',
  '/main.css',
  '/style.css',
];

// Installation du Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache ouvert');
      return cache.addAll(urlsToCache).catch(err => {
        console.log('Erreur cache:', err);
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activation du Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network first, fallback to cache
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Pour les requêtes CDN/API, utiliser network first
  if (url.hostname.includes('cdnjs.cloudflare.com') || 
      url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request)
        .then(response => response)
        .catch(() => caches.match(request))
    );
    return;
  }

  // Pour les fichiers locaux, utiliser cache first
  event.respondWith(
    caches.match(request)
      .then(response => response || fetch(request))
      .catch(() => {
        // Retourner une page offline si disponible
        return caches.match('/index.html');
      })
  );
});
