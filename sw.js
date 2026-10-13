const CACHE_NAME = 'altfoot-elite-v1';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

const AUDIO_FILES = [
  'INTRO 1.mp3',
  'INTRO 2.mp3',
  'INTRO 3.mp3',
  'INTRO 4.mp3',
  'INTRO 5.mp3',
  'INTRO PARA JOGOS DE FINAIS.mp3',
  'PASSE 1.mp3',
  'PASSE 2.mp3',
  'PASSE 3.mp3',
  'PASSE 4.mp3',
  'PASSE 5.mp3',
  'DRIBLE 1.mp3',
  'DRIBLE 2.mp3',
  'DRIBLE 3.mp3',
  'DRIBLE 4.mp3',
  'CRUZAMENTO 1.mp3',
  'CRUZAMENTO 2.mp3',
  'CONTRA ATAQUE 1.mp3',
  'CONTRA ATAQUE 2.mp3',
  'curtas/anulado-1.mp3',
  'curtas/defesa-1.mp3',
  'curtas/fim-1.mp3',
  'curtas/gol-1.mp3',
  'curtas/gol-3.mp3',
  'curtas/gol-4.mp3',
  'curtas/substituicao-1.mp3',
  'curtas/substituicao-2.mp3',
  'curtas/var-1.mp3',
  'curtas/var-2.mp3'
].map((file) => encodeURI(`./SONS DA NARRAÇÃO DO GAME/${file}`));

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS);
      // Guarda cada áudio individualmente sem travar a instalação caso algum falhe na rede
      await Promise.allSettled(
        AUDIO_FILES.map((url) => cache.add(url))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Se estiver offline e tentar abrir a página, entrega o index.html salvo
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
