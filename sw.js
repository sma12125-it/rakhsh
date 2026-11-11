/* Rakhsh offline service worker.
 *
 * The placeholders below are filled in by tooling/scripts/pwa_postbuild.mjs after `flutter build web`:
 * the list of files with their content hashes and a version derived from them. Until then (flutter run) this file
 * has an empty list and the worker does nothing harmful: it falls through to the network.
 *
 *  - install: every listed file is downloaded into one versioned cache; if any fails the install fails and the previous
 *    version keeps serving (no half-installed app).
 *  - activate: caches of other versions are deleted. A new version waits until the old one is released (all tabs closed or
 *    a "skipWaiting" message), so a running page never has its files swapped underneath it.
 *  - fetch: same-origin GETs are answered from the cache first, then the network (and cached when they are part of the app).
 *    Navigations fall back to the cached shell, so the app opens offline. API calls (/v1/) and anything cross-origin are
 *    never touched: the sync engine owns offline behaviour for data.
 */
'use strict';

const VERSION = '50338ed41bd6';
const PRECACHE = [".last_build_id","assets/AssetManifest.bin","assets/AssetManifest.bin.json","assets/FontManifest.json","assets/NOTICES","assets/assets/audio/engine_start.mp3","assets/assets/fonts/Estedad-200.ttf","assets/assets/fonts/Estedad-300.ttf","assets/assets/fonts/Estedad-400.ttf","assets/assets/fonts/Estedad-500.ttf","assets/assets/fonts/Estedad-700.ttf","assets/assets/fonts/Estedad-800.ttf","assets/assets/fonts/JetBrainsMono-300.ttf","assets/assets/fonts/JetBrainsMono-400.ttf","assets/assets/fonts/JetBrainsMono-500.ttf","assets/assets/fonts/TitilliumWeb-200.ttf","assets/assets/fonts/TitilliumWeb-300.ttf","assets/assets/fonts/TitilliumWeb-400.ttf","assets/assets/fonts/TitilliumWeb-600.ttf","assets/assets/fonts/Vazirmatn-300.ttf","assets/assets/fonts/Vazirmatn-400.ttf","assets/assets/fonts/Vazirmatn-700.ttf","assets/assets/images/closeup_dark.jpg","assets/assets/images/front_dark.jpg","assets/assets/images/part_filter.jpg","assets/assets/images/part_oil.jpg","assets/assets/images/q34_dark.jpg","assets/assets/images/side_dark.jpg","assets/assets/images/side_light.jpg","assets/assets/images/top_dark.jpg","assets/assets/licenses/Estedad-OFL.txt","assets/assets/licenses/JetBrainsMono-OFL.txt","assets/assets/licenses/TitilliumWeb-OFL.txt","assets/assets/licenses/Vazirmatn-OFL.txt","assets/assets/licenses/engine_start-CC0.txt","assets/assets/packs/ikco.dena-1.1.0.zip","assets/assets/packs/ikco.runna-1.1.0.zip","assets/assets/packs/ikco.samand-1.1.0.zip","assets/assets/packs/index.json","assets/assets/packs/manifest.schema.json","assets/assets/packs/peugeot.206-1.1.0.zip","assets/assets/packs/peugeot.207-1.1.0.zip","assets/assets/packs/peugeot.207i-1.1.0.zip","assets/assets/packs/peugeot.405-1.1.0.zip","assets/assets/packs/peugeot.pars-1.1.0.zip","assets/assets/packs/saipa.pride-1.1.0.zip","assets/assets/packs/saipa.quik-1.1.0.zip","assets/assets/packs/saipa.saina-1.1.0.zip","assets/assets/packs/saipa.shahin-1.1.0.zip","assets/assets/packs/saipa.tiba-1.1.0.zip","assets/fonts/MaterialIcons-Regular.otf","assets/packages/flutter_local_notifications_web/web/notifications_service_worker.js","assets/packages/material_ui/shaders/ink_sparkle.frag","assets/shaders/ink_sparkle.frag","assets/shaders/stretch_effect.frag","canvaskit/canvaskit.js","canvaskit/canvaskit.wasm","canvaskit/chromium/canvaskit.js","canvaskit/chromium/canvaskit.wasm","canvaskit/webparagraph/canvaskit.js","canvaskit/webparagraph/canvaskit.wasm","canvaskit/wimp.js","canvaskit/wimp.wasm","drift_worker.js","favicon.png","flutter.js","flutter_bootstrap.js","icons/Icon-192.png","icons/Icon-512.png","icons/Icon-maskable-192.png","icons/Icon-maskable-512.png","index.html","main.dart.js","manifest.json","sqlite3.wasm","version.json"];
const CACHE = `rakhsh-${VERSION}`;
const SCOPE = self.registration.scope;
const abs = (p) => new URL(p, SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Few at a time: the list is long and some files are large.
    const queue = PRECACHE.slice();
    const worker = async () => {
      while (queue.length) {
        const path = queue.shift();
        const res = await fetch(new Request(abs(path), { cache: 'reload' }));
        if (!res.ok) throw new Error(`precache ${path}: ${res.status}`);
        await cache.put(abs(path), res);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('rakhsh-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'version') event.source?.postMessage({ type: 'version', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/v1/')) return;
  if (!url.href.startsWith(SCOPE)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match(abs('index.html'));
      if (shell) return shell;
    }
    try {
      const res = await fetch(req);
      // Files of the app that were not in the list (e.g. a font loaded on demand) are kept for next time.
      if (res.ok && res.type === 'basic' && !url.search) await cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') {
        const shell = await cache.match(abs('index.html'));
        if (shell) return shell;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'content-type': 'text/plain' } });
    }
  })());
});
