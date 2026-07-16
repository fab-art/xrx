/* RSSB CVS Service Worker
 * --------------------------------------------------
 * Offline-first PWA caching strategy:
 *  - Precache: app shell + critical static assets
 *  - Runtime cache (stale-while-revalidate): same-origin static, images, fonts
 *  - Network-first: navigation (HTML) requests — falls back to cached shell offline
 *  - Bypass: API calls, POST/PUT/DELETE, non-GET
 *
 * Bump CACHE_VERSION on every deploy to invalidate old caches.
 */

const CACHE_VERSION = 'rssb-cvs-v1.0.0';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// App-shell URLs to precache on install (relative to site root).
const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon.ico',
];

// Maximum number of entries to keep in the runtime cache (LRU eviction).
const RUNTIME_CACHE_LIMIT = 60;

// ---------------------------------------------------------------------------
// INSTALL — precache the app shell
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Use addAll but tolerate individual failures (e.g. favicon.ico missing)
      await Promise.allSettled(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' }))
        )
      );
      // Activate immediately — don't wait for old SW clients to close.
      self.skipWaiting();
    })()
  );
});

// ---------------------------------------------------------------------------
// ACTIVATE — purge old caches
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      // Take control of all open clients immediately.
      await self.clients.claim();
    })()
  );
});

// ---------------------------------------------------------------------------
// FETCH — routing
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET; let the browser handle everything else.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip cross-origin requests (e.g. Vercel analytics, Google Fonts CDN is OK below).
  // Skip API and Next.js data routes — always hit network so live data is fresh.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/data/')
  ) {
    return;
  }

  // Navigation requests (HTML pages) — network-first with offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Google Fonts (cross-origin) — stale-while-revalidate, tolerate opacity.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Same-origin static assets (JS, CSS, images, fonts, icons).
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Everything else — try network, fall back to cache, tolerate failure.
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((r) => r || Response.error()))
  );
});

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

// Network-first for navigations — shows latest app, falls back to cached shell.
async function networkFirstNavigation(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && fresh.type === 'basic') {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fall back to the app shell (cached at install) for offline SPA navigation.
    const shell = await caches.match('/');
    if (shell) return shell;
    throw err;
  }
}

// Stale-while-revalidate for static assets — fast from cache, refresh in background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
        trimCache(cache);
      }
      return response;
    })
    .catch(() => null);

  // Return cached immediately if available; otherwise wait for network.
  return cached || (await networkPromise) || Response.error();
}

// Keep the runtime cache under the size limit (simple LRU-ish eviction).
async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= RUNTIME_CACHE_LIMIT) return;
  // Delete oldest entries (first in, first out — keys() is insertion-ordered).
  const toRemove = keys.slice(0, keys.length - RUNTIME_CACHE_LIMIT);
  await Promise.all(toRemove.map((k) => cache.delete(k)));
}

// ---------------------------------------------------------------------------
// MESSAGE — allow pages to trigger an immediate update
// ---------------------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
