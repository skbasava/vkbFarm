const CACHE_NAME = "vkb-shell-v1";
const SHELL_URL = "/";

function isCacheable(response, url) {
  return response.ok && !response.redirected && url.origin === self.location.origin;
}

function isAppAsset(request, url) {
  return (
    url.origin === self.location.origin &&
    ["font", "image", "manifest", "script", "style"].includes(request.destination)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const response = await fetch(SHELL_URL);
      if (isCacheable(response, new URL(response.url))) {
        await cache.put(SHELL_URL, response);
      }
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (cacheNames) => {
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("vkb-") && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (isCacheable(response, url)) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(SHELL_URL, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(SHELL_URL);
          if (!cached) {
            throw new Error("The application shell is not cached.");
          }
          return cached;
        }),
    );
    return;
  }

  if (isAppAsset(request, url)) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) {
          return cached;
        }
        const response = await fetch(request);
        if (isCacheable(response, url)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      }),
    );
  }
});
