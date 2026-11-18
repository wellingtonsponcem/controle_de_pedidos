const CACHE_NAME = 'bemavi-cache-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './admin.html',
  './manifest.json',
  './assets/css/catalogo.css',
  './assets/js/catalogo-publico.js',
  './assets/css/styles.css',
  './assets/js/app.js',
  './assets/images/icons/icon-192.png'
];

// Instalar o Service Worker e cachear os arquivos estáticos estruturais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Cacheando ativos iniciais...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Ativar o Service Worker e limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptar requisições HTTP e aplicar a estratégia Stale-While-Revalidate para estáticos
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorar chamadas de API do Neon/Vercel (devem ir sempre para a rede de forma dinâmica)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Se a rede falhar em chamadas de API, retornamos uma resposta offline padrão amigável
        return new Response(
          JSON.stringify({ error: 'Você está offline. Lançamentos serão sincronizados ao reestabelecer conexão.' }),
          { headers: { 'Content-Type': 'application/json' }, status: 503 }
        );
      })
    );
    return;
  }

  // Estratégia Stale-While-Revalidate para o restante dos ativos estáticos
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Disparar busca na rede em background para atualizar o cache
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {
          console.log('[Service Worker] Falha ao atualizar cache em background (Offline)');
        });
        
        return cachedResponse;
      }
      
      return fetch(event.request);
    })
  );
});
