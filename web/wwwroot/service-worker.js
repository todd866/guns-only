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
const RELEASE_BUILD = "208";
const CACHE = `guns-only-${RELEASE_BUILD}`;

// Never cached: telemetry and the multiplayer room are live services, and a cached reply would be
// a lie. They must fail honestly when the network is gone.
const NEVER_CACHE = [
  /^\/telemetry(?:\/|$)/,
  /^\/telemetry-admin(?:\/|$)/,
  /^\/api(?:\/|$)/,
];

// The terrain bundle is read with HTTP Range requests, and the Cache API refuses to store a 206.
// It does not need to: TerrainBundleReader already handles a server that ignores Range and returns
// the whole file (korea_terrain.js — `completeBuffer`), slicing every later record out of it. So a
// cached FULL bundle answers a Range request perfectly well, and offline terrain costs one extra
// background fetch rather than a range-aware cache layer.
const TERRAIN_BUNDLE = /\.terrain(\?|$)/;
const MAX_RUNTIME_PRIME_URLS = 768;

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

async function primeRuntimeUrls(candidates) {
  const urls = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (urls.length >= MAX_RUNTIME_PRIME_URLS) break;
    try {
      const url = new URL(String(candidate), self.location.origin);
      if (url.origin !== self.location.origin
        || NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) continue;
      if (!urls.includes(url.href)) urls.push(url.href);
    } catch {
      // Ignore malformed client-provided resource names.
    }
  }
  const cache = await caches.open(CACHE);
  let cached = 0;
  let failed = 0;
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok || response.status !== 200 || response.type !== "basic") {
        failed += 1;
        continue;
      }
      await cache.put(url, response.clone());
      cached += 1;
    } catch {
      failed += 1;
    }
  }
  return { requested: urls.length, cached, failed, build: RELEASE_BUILD };
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "prime-runtime") return;
  const task = primeRuntimeUrls(event.data.urls).then((result) => {
    event.ports?.[0]?.postMessage(result);
    return result;
  });
  event.waitUntil(task);
});

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

function fetchWithCacheWrite(request, { basicOnly = false } = {}) {
  // An unversioned URL can be satisfied by the browser HTTP cache with bytes from an older
  // build, and a plain fetch would then persist those stale bytes into this build's cache.
  // Unversioned assets therefore revalidate; ?v=BUILD URLs are immutable per build and skip it.
  const versioned = new URL(request.url).searchParams.has("v");
  return fetch(request, versioned ? undefined : { cache: "no-cache" }).then((response) => {
    let cacheWrite = Promise.resolve();
    if (response.ok && response.status === 200 && (!basicOnly || response.type === "basic")) {
      // Clone while the body is unquestionably unused. The response can then be returned
      // immediately while waitUntil() keeps the asynchronous Cache API write alive.
      const copy = response.clone();
      cacheWrite = caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return { response, cacheWrite };
  });
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
    const network = fetchWithCacheWrite(request);
    event.waitUntil(network.then(({ cacheWrite }) => cacheWrite).catch(() => undefined));
    event.respondWith(
      network.then(({ response }) => response).catch(async (error) => {
        // Match only this build's cache: during the activate window an older build's bucket may
        // still exist, and an unscoped match could revive it.
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request)
          ?? await cache.match("index.html")
          ?? await cache.match("/");
        if (cached) return cached;
        throw error;
      }),
    );
    return;
  }

  // Everything else is content-addressed in practice: the entrypoint and every release-mutated
  // direct module carry ?v=BUILD, the WASM assemblies/vendor tree are versioned by path, and the
  // index preboot gate drops an older controller's cache before Blazor reads its boot manifest.
  // Cache first is therefore both correct and the reason a cold offline start is fast.
  const responseRecord = (async () => {
    const cached = await (await caches.open(CACHE)).match(request);
    if (cached) return { response: cached, cacheWrite: Promise.resolve() };
    return fetchWithCacheWrite(request, { basicOnly: true });
  })();
  event.waitUntil(responseRecord.then(({ cacheWrite }) => cacheWrite).catch(() => undefined));
  event.respondWith(responseRecord.then(({ response }) => response));
});
