const CACHE_NAME = 'pasti-infanzia-v6';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './favicon.svg'
];

// Installa e metti in cache il "guscio" dell'app (funziona offline)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
});

// Attiva e rimuovi vecchie cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

// Strategia: network-first per l'API, cache-first per il guscio
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API del Comune e proxy: prova la rete, altrimenti rispondi che sei offline
  if (
    url.hostname.includes('comune.roma.it') ||
    url.hostname.includes('allorigins.win') ||
    url.hostname.includes('workers.dev')
  ) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ errore: 'Sei offline. Connetti a internet per vedere il menù.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Guscio dell'app: cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});