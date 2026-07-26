// Offline support for the installed app.
//
// The site is already installable — there is a web manifest, and macOS/iOS/Android will all give it
// its own window — but installing only ever changed the CHROME. Every asset still came off the
// network, so the app was a website in a frame and a dead connection was a dead game. This makes an
// installed copy actually playable offline.
//
// DESIGN: runtime caching, not a precache manifest. A precache needs a build-time list of every
// asset — the WASM runtime, the three.js vendor tree, every render module, the content pack — and a
// list like that goes stale silently and fails closed. Instead the first online sortie populates the
// cache with exactly what the app really loads, and everything after that works offline. The honest
// statement of the contract is "play once online, then it works on a plane", which is both true and
// checkable.
//
// The cache name carries the release build, so shipping a new build orphans the old cache and
// activate() deletes it. That reuses the existing stamp ritual rather than inventing a second
// versioning scheme — see web/wwwroot/render/release/release_identity.js.
const RELEASE_BUILD = "137";
const CACHE = `guns-only-${RELEASE_BUILD}`;

// Never cached: telemetry and the multiplayer room are live services, and a cached reply would be
// a lie. They must fail honestly when the network is gone.
const NEVER_CACHE = [/\/telemetry/, /\/api\//, /telemetry-admin/];

// The terrain bundle is read with HTTP Range requests, and the Cache API refuses to store a 206.
// It does not need to: TerrainBundleReader already handles a server that ignores Range and returns
// the whole file (korea_terrain.js — `completeBuffer`), slicing every later record out of it. So a
// cached FULL bundle answers a Range request perfectly well, and offline terrain costs one extra
// background fetch rather than a range-aware cache layer.
const TERRAIN_BUNDLE = /\.terrain(\?|$)/;

self.addEventListener("install", (event) => {
  // Nothing to precache; take over as soon as possible so the first sortie starts filling the cache.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("guns-only-") && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

const terrainBundlesPrimed = new Set();

/// Pull each whole terrain bundle into the cache once, in the background, the first time the app
/// asks for a piece of it. Korea and the fictional Ukraine training sector are separate products,
/// so this is keyed by bare bundle URL rather than one global latch. Doing it lazily rather than on
/// install means a pilot who never flies never pays the download, and one who does pays it while
/// already streaming terrain anyway.
function primeTerrainBundle(url) {
  const bare = new URL(url);
  bare.search = "";
  if (terrainBundlesPrimed.has(bare.href)) return Promise.resolve();
  terrainBundlesPrimed.add(bare.href);
  return (async () => {
    try {
      const response = await fetch(bare.href, { cache: "no-store" });
      if (response.ok && response.status === 200) {
        await (await caches.open(CACHE)).put(bare.href, response.clone());
      } else {
        terrainBundlesPrimed.delete(bare.href);
      }
    } catch {
      // Offline, or the bundle moved. A later online request must be allowed to try again.
      terrainBundlesPrimed.delete(bare.href);
    }
  })();
}

async function cachedTerrainBundle(url) {
  const bare = new URL(url);
  bare.search = "";
  return (await caches.open(CACHE)).match(bare.href);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) return;

  if (TERRAIN_BUNDLE.test(url.pathname)) {
    // A service worker may be terminated as soon as the response settles. Extend this fetch event
    // through the full-bundle cache write so "fly once online" is a reliable offline contract.
    event.waitUntil(primeTerrainBundle(request.url));
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        // Offline: hand back the whole bundle. The reader detects the ignored Range and switches
        // to slicing it locally, which is the same path a non-Range-capable server produces.
        const whole = await cachedTerrainBundle(request.url);
        if (whole) return whole;
        throw error;
      }
    })());
    return;
  }

  // A navigation must never be answered from a stale cache while online — that is how a PWA gets
  // permanently stuck on an old build — but it must still open when there is no network at all.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        (await caches.open(CACHE)).put(request, response.clone());
        return response;
      } catch (error) {
        const cached = await caches.match(request)
          ?? await caches.match("index.html")
          ?? await caches.match("/");
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  // Everything else is content-addressed in practice: app.js carries ?v=BUILD, the WASM runtime and
  // vendor tree are versioned by path, and the cache is dropped wholesale on a new build. Cache
  // first is therefore both correct and the reason a cold offline start is fast.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.status === 200 && response.type === "basic") {
      (await caches.open(CACHE)).put(request, response.clone());
    }
    return response;
  })());
});
