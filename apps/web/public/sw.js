/**
 * PulseDock Service Worker
 *
 * Strategy:
 * - Static assets (/_next/static/*) → Cache-first (immutable, content-hashed)
 * - Fonts → Cache-first with long TTL
 * - API requests (/api/*) → Network-only (never cache auth/data)
 * - HTML pages → Network-first, fallback to /offline
 */

const CACHE_NAME = 'pulsedock-v1';
const OFFLINE_URL = '/offline';

const PRECACHE = [
  '/offline',
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/site.webmanifest',
];

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
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

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API requests: network-only — never serve stale auth/data
  if (url.pathname.startsWith('/api/')) return;

  // Static assets: cache-first (content-hashed → immutable)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Fonts: cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML pages / app routes: network-first, offline fallback
  event.respondWith(networkFirstWithOfflineFallback(request));
});

// ── Strategies ─────────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    // Cache successful HTML responses so we can serve them while offline
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache first
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last resort: offline page
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? new Response('Offline', { status: 503 });
  }
}
