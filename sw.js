// Service worker do AltFoot ELITE.
// Não é registrado pelo index.html hoje (o jogo funciona por file:// e offline sem
// ele). Mantido publicado para uso futuro: se for registrado, já entrega o
// comportamento correto — a versão do cache muda a cada revisão e o documento vai à
// rede primeiro, então uma publicação nova substitui a antiga em vez de deixar o
// index.html congelado no cache.
const CACHE_NAME = 'altfoot-elite-20261014';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Documento principal: rede primeiro. Sem isso, um jogador que já tem o service
  // worker registrado continuaria recebendo a versão antiga depois de uma publicação.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia)).catch(() => {});
          return resposta;
        })
        .catch(() => caches.match('./index.html').then((c) => c || caches.match('./')))
    );
    return;
  }
  // Demais recursos: cache primeiro, rede como reserva.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
