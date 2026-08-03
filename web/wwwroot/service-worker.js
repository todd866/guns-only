// Offline support for the installed app.
//
// The site is already installable — there is a web manifest, and macOS/iOS/Android will all give it
// its own window — but installing only ever changed the CHROME. Every asset still came off the
// network, so the app was a website in a frame and a dead connection was a dead game. This gives an
// installed copy an offline path for every asset the browser successfully admits to Cache Storage.
//
// DESIGN: runtime caching, not a precache manifest. A precache needs a build-time list of every
// asset — the WASM runtime, the three.js vendor tree, every render module, the content pack — and a
// list like that goes stale silently and fails closed. Instead the first online sortie populates the
// cache with exactly what the app really loads. Resources successfully admitted to Cache Storage
// are then available offline; large terrain pages remain subject to the browser's storage budget.
//
// The cache name carries the release build, so shipping a new build orphans the old cache and
// activate() deletes it. That reuses the existing stamp ritual rather than inventing a second
// versioning scheme — see web/wwwroot/render/release/release_identity.js.
const RELEASE_BUILD = "252";
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
// cached FULL bundle answers a Range request perfectly well. A successfully admitted terrain page
// costs one extra background fetch rather than requiring a range-aware cache layer.
const TERRAIN_BUNDLE = /\.terrain(\?|$)/;
const MAX_RUNTIME_PRIME_URLS = 768;
// A failed whole-page prime must not restart for every small Range request. Five minutes is long
// enough to prevent a streaming sortie from repeatedly downloading the same multi-megabyte page,
// while still allowing the current worker to recover when connectivity or quota changes.
const TERRAIN_PRIME_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
// Do not consume the final sliver of an origin's quota. The StorageManager estimate is advisory,
// so unsupported or temporarily unavailable estimates preserve the existing Cache API path; a
// known-insufficient estimate fails closed before another large background download begins.
const TERRAIN_CACHE_RESERVE_BYTES = 32 * 1024 * 1024;
// Four workers remove the serialized first-boot bottleneck without letting a resource inventory
// containing large WASM or terrain responses turn into an unbounded burst of network/body work.
const MAX_RUNTIME_PRIME_CONCURRENCY = 4;

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
const terrainBundleRetryAfter = new Map();

async function availableStorageBytes() {
  const estimate = self.navigator?.storage?.estimate;
  if (typeof estimate !== "function") return null;
  try {
    const result = await estimate.call(self.navigator.storage);
    const quota = Number(result?.quota);
    const usage = Number(result?.usage);
    if (!Number.isFinite(quota) || !Number.isFinite(usage) || quota < 0 || usage < 0) return null;
    return Math.max(0, quota - usage);
  } catch {
    // Older browsers and private modes can expose StorageManager but reject estimate(). Falling
    // back to Cache API behavior preserves compatibility; cache.put still rejects quota overflow.
    return null;
  }
}

function terrainPrimeCoolingDown(url, now = Date.now()) {
  const retryAfter = terrainBundleRetryAfter.get(url);
  if (!Number.isFinite(retryAfter)) return false;
  if (now < retryAfter) return true;
  terrainBundleRetryAfter.delete(url);
  return false;
}

function deferTerrainBundleRetry(url) {
  terrainBundleRetryAfter.set(url, Date.now() + TERRAIN_PRIME_RETRY_COOLDOWN_MS);
  terrainBundlesPrimed.delete(url);
}

async function terrainCacheHasCapacity(response = null) {
  const available = await availableStorageBytes();
  if (available === null) return true;
  if (available <= TERRAIN_CACHE_RESERVE_BYTES) return false;

  const encodedLength = Number(response?.headers?.get?.("content-length"));
  if (!Number.isFinite(encodedLength) || encodedLength <= 0) return true;
  return encodedLength + TERRAIN_CACHE_RESERVE_BYTES <= available;
}

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
  let reused = 0;
  let failed = 0;
  let nextUrl = 0;
  async function primeNextUrl() {
    while (nextUrl < urls.length) {
      const url = urls[nextUrl];
      nextUrl += 1;
      let existing;
      try {
        existing = await cache.match(url);
      } catch {
        // A transient Cache Storage read failure must not suppress the network retry that can
        // repair the entry. A failed write below will still report the URL as failed.
      }
      if (existing?.ok && existing.status === 200 && existing.type === "basic") {
        reused += 1;
        continue;
      }
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
  }
  const workers = Math.min(MAX_RUNTIME_PRIME_CONCURRENCY, urls.length);
  await Promise.all(Array.from({ length: workers }, () => primeNextUrl()));
  return { requested: urls.length, cached, reused, failed, build: RELEASE_BUILD };
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
  if (terrainBundlesPrimed.has(bare.href) || terrainPrimeCoolingDown(bare.href)) {
    return Promise.resolve();
  }
  terrainBundlesPrimed.add(bare.href);
  return (async () => {
    try {
      // The in-memory Set is only an in-flight/process-lifetime latch. Service workers are
      // routinely terminated between requests, while Cache Storage survives; consult this
      // build's persisted bucket before paying for the same multi-megabyte whole page again.
      const cache = await caches.open(CACHE);
      const cached = await cache.match(bare.href);
      if (cached?.ok && cached.status === 200) {
        terrainBundleRetryAfter.delete(bare.href);
        return;
      }
      // A known-low storage budget cannot accept a terrain page. Check before fetching so every
      // Range request does not also trigger a doomed whole-page transfer.
      if (!await terrainCacheHasCapacity()) {
        deferTerrainBundleRetry(bare.href);
        return;
      }
      const response = await fetch(bare.href, { cache: "no-store" });
      if (response.ok && response.status === 200 && await terrainCacheHasCapacity(response)) {
        await cache.put(bare.href, response.clone());
        terrainBundleRetryAfter.delete(bare.href);
      } else {
        deferTerrainBundleRetry(bare.href);
      }
    } catch {
      // Offline, the bundle moved, or Cache Storage rejected the write. Keep serving the original
      // Range path, but suppress another whole-page attempt until the deterministic cooldown ends.
      deferTerrainBundleRetry(bare.href);
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
    // through the full-bundle cache attempt so successful writes survive worker termination.
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
