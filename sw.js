// sw.js - Service Worker para Villa Sahores Dashboard
const CACHE_NAME = "sahores-v20";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/entrenamiento.html",
  "/styles.css",
  "/app.js",
  "/futsal.js",
  "/futsal_reducido.js",
  "/futsal_femenino.js",
  "/futsal_stats.js",
  "/share.js",
  "/weather.js",
  "/manifest.json",
  "/images/logo-sahores.jpeg",
  "/images/icon-192.png",
  "/images/icon-512.png"
];

// Instalación: precargar assets estáticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activación: limpiar todas las caches viejas de inmediato
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: estrategia "Network First" para HTML y datos, "Cache First" solo para imágenes/fonts estáticos
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Para páginas HTML y navegación: SIEMPRE RED PRIMERO para que los deploys se vean al instante
  if (event.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname.includes("/entrenamiento")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Para archivos de datos JSON: siempre intentar red primero, con fallback a caché
  if (url.pathname.includes("/data/") || url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Para APIs externas (clima, etc.): solo red, sin cachear
  if (!url.origin.includes(self.location.origin)) {
    event.respondWith(fetch(event.request).catch(() => new Response("", { status: 503 })));
    return;
  }

  // Para todo lo demás (CSS, JS, imágenes): Cache First con actualización en background
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
