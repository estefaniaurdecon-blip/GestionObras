// Service Worker para PWA con cache offline completo
const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// Assets críticos para precarga
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/favicon.png',
  '/manifest.json'
];

// Patrones de URL para diferentes estrategias
// Nota: Se mantiene supabase.co por compatibilidad legacy, pero la app ahora usa localhost:8000
const API_PATTERN = /(supabase\.co|localhost:8000|127\.0\.0\.1:8000)\/(rest|functions|storage|auth|realtime|api)/;
const IMAGE_PATTERN = /\.(png|jpg|jpeg|svg|gif|webp|ico)$/i;
const STATIC_PATTERN = /\.(js|css|woff2?)$/i;

// Instalación: precachear assets críticos
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activación: limpiar caches antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('static-') || name.startsWith('runtime-') || name.startsWith('images-'))
            .filter(name => name !== STATIC_CACHE && name !== RUNTIME_CACHE && name !== IMAGE_CACHE)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: estrategias de cache según tipo de recurso
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar chrome-extension y otros protocolos
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Estrategia para API: Network First con fallback
  if (API_PATTERN.test(url.href)) {
    event.respondWith(networkFirstStrategy(request, RUNTIME_CACHE));
    return;
  }

  // Estrategia para imágenes: Cache First con fallback a network
  if (IMAGE_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request, IMAGE_CACHE));
    return;
  }

  // Estrategia para assets estáticos: Cache First
  if (STATIC_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // Estrategia por defecto: Network First
  event.respondWith(networkFirstStrategy(request, RUNTIME_CACHE));
});

// Network First: intenta red, fallback a cache
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    
    // Cachear respuestas exitosas
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Si es HTML, devolver página offline personalizada
    if (request.headers.get('Accept')?.includes('text/html')) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Sin conexión</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
                padding: 20px;
              }
              .container {
                max-width: 500px;
              }
              h1 { font-size: 3rem; margin: 0 0 1rem 0; }
              p { font-size: 1.2rem; opacity: 0.9; }
              button {
                margin-top: 2rem;
                padding: 1rem 2rem;
                font-size: 1rem;
                background: white;
                color: #667eea;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: bold;
              }
              button:hover { opacity: 0.9; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>📡</h1>
              <h2>Sin conexión</h2>
              <p>No hay conexión a Internet. La aplicación se sincronizará automáticamente cuando vuelva la conexión.</p>
              <button onclick="window.location.reload()">Reintentar</button>
            </div>
          </body>
        </html>
        `,
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }
    
    // Para otros recursos, devolver error
    return new Response('Sin conexión', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Cache First: busca en cache primero, fallback a network
async function cacheFirstStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Actualizar cache en background
    fetch(request).then(networkResponse => {
      if (networkResponse.ok) {
        caches.open(cacheName).then(cache => {
          cache.put(request, networkResponse);
        });
      }
    }).catch(() => {});
    
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Failed to fetch:', request.url, error);
    return new Response('Resource not available offline', { status: 503 });
  }
}

// Mensajes desde la app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(name => caches.delete(name))
        );
      })
    );
  }
  
  if (event.data?.type === 'PRECACHE_URLS') {
    const urls = event.data.urls || [];
    event.waitUntil(
      caches.open(RUNTIME_CACHE).then(cache => {
        return cache.addAll(urls);
      })
    );
  }
});

// Background Sync para sincronización cuando vuelve conexión
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-pending-operations') {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_PENDING_OPERATIONS'
    });
  });
}

console.log('[SW] Service Worker loaded successfully');
