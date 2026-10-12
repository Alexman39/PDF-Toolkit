// Service worker: keeps a copy of the built app so every tool works offline after the first
// visit (CLAUDE.md §1). It only ever stores and serves this app's own files; PDFs never pass
// through it, because they are read from disk and saved through blob: URLs.
//
// The build (vite.config.js) replaces the two placeholders below with the bundle's file list
// and a hash of it, so each deploy gets a fresh cache.

/** @type {string[]} Paths relative to this file, e.g. `assets/merge-abc123.js`. */
const ASSETS = self.__PRECACHE_ASSETS__;
const CACHE = `pdf-toolkit-${self.__PRECACHE_VERSION__}`;
// The page itself, as the browser requests it on a visit.
const PAGE = './';

self.addEventListener('install', (event) => {
  // No skipWaiting(): a tab still running the previous version keeps that version's files
  // until it closes, instead of lazy-loading chunks that this version deleted.
  event.waitUntil(cacheApp());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(activate());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? servePage(request) : serveAsset(request));
});

async function cacheApp() {
  const cache = await caches.open(CACHE);
  await cache.addAll([PAGE, ...ASSETS]);
}

async function activate() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
  // Take over the tab that installed us, so it works offline without a reload.
  await self.clients.claim();
}

/**
 * Network first, so a visit picks up a new deploy; the cached page when offline. The cache is
 * not refreshed from the network here: a newer page would point at chunks this cache lacks.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function servePage(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await caches.match(PAGE, { cacheName: CACHE });
    if (cached) return cached;
    throw error;
  }
}

/**
 * Cache first: asset names contain a content hash, so a cached copy is never stale.
 * `ignoreVary`, because servers send `Vary: Origin` and module scripts are requested with an
 * Origin header that the copies cached by addAll() were not, so they would never match.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function serveAsset(request) {
  return (await caches.match(request, { cacheName: CACHE, ignoreVary: true })) ?? fetch(request);
}
