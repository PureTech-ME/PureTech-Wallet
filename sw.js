/**
 * PureTech Wallet V7 - Progressive Web App (PWA) Offline Service Worker
 * Ensures 100% offline access by pre-caching core assets and third-party CDNs from first install
 */

const CACHE_NAME = "puretech-wallet-cache-v23";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./apple-touch-icon.png",
  "./apple-touch-icon-precomposed.png",
  "./css/styles.css",
  "./js/i18n.js",
  "./js/db.js",
  "./js/app.js",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

const CDN_ASSETS = [
  "https://cdn.tailwindcss.com",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
  "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap"
];

// Install Event - Pre-cache core local files & best-effort pre-cache CDN libraries
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(STATIC_ASSETS);
      // Pre-cache CDN assets individually so an offline/CORS hiccup on one never aborts SW install
      await Promise.allSettled(
        CDN_ASSETS.map(async (cdnUrl) => {
          try {
            let res;
            try {
              res = await fetch(cdnUrl);
            } catch (_) {
              res = await fetch(new Request(cdnUrl, { mode: "no-cors" }));
            }
            if (res && (res.status === 200 || res.type === "opaque")) {
              await cache.put(cdnUrl, res);
            }
          } catch (e) {
            // Silently ignore if offline during install
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up obsolete caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-while-revalidate for assets, Network-first for rates
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Live currency/gold rates are dynamic, bypass caching or network-first
  const isRatesApi = url.hostname.includes("open.er-api.com") ||
                     url.hostname.includes("api.gold-api.com") ||
                     url.pathname.includes("@fawazahmed0/currency-api") ||
                     url.pathname.includes("currency-api");
  if (isRatesApi) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: "offline" }), {
        headers: { "Content-Type": "application/json" }
      }))
    );
    return;
  }

  // All other resources (Local files + CDNs: Tailwind, FontAwesome, Chart.js, Google Fonts):
  // Cache First, falling back to network, then caching new CDN responses for future offline use
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse) return networkResponse;

        // Cache valid standard responses (200) and CDN no-cors responses (opaque)
        if (networkResponse.status === 200 || networkResponse.type === "opaque") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return networkResponse;
      }).catch(() => {
        // Fallback if completely offline and resource not yet cached
        if (event.request.destination === "document") {
          return caches.match("./index.html");
        }
      });
    })
  );
});
