const VERSION = 'v3';
const CACHE_NAME = `sessionvault-${VERSION}`;
const API_CACHE_NAME = `sessionvault-api-${VERSION}`;
const APP_SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (url) => {
      try { const res = await fetch(url, { cache: 'no-cache' }); if (res?.ok) await cache.put(url, res.clone()); } catch (_) { /* offline install */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CACHE_NAME, API_CACHE_NAME]);
    await Promise.all((await caches.keys()).map((name) => keep.has(name) ? null : caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) { event.respondWith(networkFirst(request, API_CACHE_NAME)); return; }
  if (request.mode === 'navigate') { event.respondWith(networkFirstNavigation(request)); return; }
  event.respondWith(networkFirst(request, CACHE_NAME));
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response?.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response?.ok) cache.put('/', response.clone()).catch(() => {});
    return response;
  } catch (_) {
    const cached = (await cache.match(request)) || (await cache.match('/'));
    if (cached) return cached;
    return new Response('<!doctype html><meta charset="utf-8"><title>SessionVault offline</title><body style="font-family:system-ui;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>SessionVault is offline and no cached shell is available.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 });
  }
}
