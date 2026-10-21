// Offline support for the installed app.
//
// The site is already installable — there is a web manifest, and macOS/iOS/Android will all give it
// its own window — but installing only ever changed the CHROME. Every asset still came off the
// network, so the app was a website in a frame and a dead connection was a dead game. This gives an
// installed copy an offline path for every asset the browser successfully admits to Cache Storage.
//
// Publication generates a bounded core manifest with content digests. An update activates only
// after those files are durable; the previous bucket remains available for verified asset reuse.
// Optional terrain/media are cached as used, within the browser's storage budget.
const RELEASE_BUILD = "__RELEASE_BUILD__";
const CACHE = `guns-only-${RELEASE_BUILD}`;

// Never cached: telemetry and the multiplayer room are live services, and a cached reply would be
// a lie. They must fail honestly when the network is gone.
const NEVER_CACHE = [
  /^\/telemetry(?:\/|$)/,
  /^\/report(?:\/|$)/,
  /^\/telemetry-admin(?:\/|$)/,
  /^\/api(?:\/|$)/,
];

// The terrain bundle is read with HTTP Range requests, and the Cache API refuses to store a 206.
// It does not need to: TerrainBundleReader already handles a server that ignores Range and returns
// the whole file (korea_terrain.js — `completeBuffer`), slicing every later record out of it. So a
// cached FULL bundle answers a Range request perfectly well. A successfully admitted terrain page
// costs one extra background fetch rather than requiring a range-aware cache layer.
const TERRAIN_BUNDLE = /\.terrain(\?|$)/;
// Area 51½ district models are several MB; on a slow link the 8 s body deadline would abort them.
const LARGE_ASSET = /\.glb$/;
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

// Network deadlines cover the response BODY as well as headers. A resolved fetch can still
// contain a stream that never finishes on weak Wi-Fi.
const NETWORK_DEADLINE_MS = 8_000;
const STORAGE_DEADLINE_MS = 1_000;
const MANIFEST_URL = "/offline-manifest.json";
const READY_URL = "/.guns-offline-ready";
const DIAGNOSTICS_DB = "guns-offline-diagnostics-v1";
const MAX_INCIDENTS = 200;
const manifests = new Map();
const clientCaches = new Map();
let diagnosticQueue = Promise.resolve();
let pendingDiagnostics = 0;

async function storageRequired(operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("cache storage timeout")), STORAGE_DEADLINE_MS); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function storageOrFallback(operation, failureType) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation).catch(() => {
        if (failureType) void diagnostic(failureType, "/");
        return undefined;
      }),
      new Promise(resolve => { timer = setTimeout(() => {
        if (failureType) void diagnostic(failureType, "/");
        resolve();
      }, STORAGE_DEADLINE_MS); }),
    ]);
  } finally { clearTimeout(timer); }
}

function resourceKind(request) {
  const path = new URL(request.url ?? request, self.location.origin).pathname;
  if (path.endsWith(".terrain")) return "terrain";
  if (path.startsWith("/_framework/")) return "runtime";
  if (path === MANIFEST_URL) return "manifest";
  if (request.mode === "navigate" || path.endsWith(".html") || path.endsWith("/")) return "navigation";
  return "asset";
}

// A bounded, local journal. It survives worker termination and browser restarts. Store only
// coarse resource classes: no URLs, query strings, pilot identifiers, content or credentials.
function diagnostic(type, request, fields = {}) {
  if (pendingDiagnostics >= 64) return Promise.resolve();
  pendingDiagnostics++;
  const row = { type, at: Date.now(), build: RELEASE_BUILD,
    resource: resourceKind(request), online: self.navigator?.onLine !== false,
    status: Number(fields.status) || 0, elapsedMs: Math.max(0, Number(fields.elapsedMs) || 0) };
  diagnosticQueue = diagnosticQueue.then(() => storageOrFallback(async () => {
    const db = await openDiagnostics();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("incidents", "readwrite");
        const store = tx.objectStore("incidents");
        store.add(row);
        const keys = store.getAllKeys();
        keys.onsuccess = () => keys.result.slice(0, Math.max(0, keys.result.length - MAX_INCIDENTS))
          .forEach(key => store.delete(key));
        const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(new Error("diagnostic transaction timeout")); }, 750);
        tx.oncomplete = () => { clearTimeout(timer); resolve(); };
        tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(tx.error); };
      });
    } finally { db.close(); }
  })).finally(() => { pendingDiagnostics--; });
  return storageOrFallback(() => diagnosticQueue);
}

function openDiagnostics() {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error("diagnostic storage timeout")); }, 750);
    const request = indexedDB.open(DIAGNOSTICS_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("incidents", { autoIncrement: true });
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) request.result.close(); else resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
  });
}

async function readDiagnostics() {
  await diagnosticQueue;
  return await storageOrFallback(async () => {
    const db = await openDiagnostics();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("incidents").objectStore("incidents").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }) ?? [];
}

async function fetchComplete(request, init = {}, deadline = NETWORK_DEADLINE_MS) {
  const controller = new AbortController();
  const started = Date.now();
  let timer;
  let timedOut = false;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(request, { ...init, signal: controller.signal });
        if (response.status >= 500 || response.status === 408 || response.status === 429) {
          const error = new Error("unavailable"); error.status = response.status;
          error.response = new Response(null, { status: response.status }); throw error;
        }
        // Read a clone through completion before selecting this response over a saved copy.
        // Cap the tee's queued body: no response can make this worker buffer without limit.
        const reader = response.clone().body?.getReader();
        if (reader) {
          let size = 0;
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 128 * 1024 * 1024) throw new Error("response-too-large");
            }
          } finally { reader.releaseLock(); }
        }
        return response;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("deadline"));
        }, deadline);
      }),
    ]);
  } catch (error) {
    controller.abort();
    await diagnostic(timedOut ? "network-timeout" : error.status ? "http-error" : "network-error",
      request, { status: error.status, elapsedMs: Date.now() - started });
    throw error;
  } finally { clearTimeout(timer); }
}

function assetFor(manifest, request, cacheName = CACHE) {
  const url = new URL(request.url ?? request, self.location.origin);
  if ([...url.searchParams.keys()].some(key => key !== "v")) return null;
  if (url.searchParams.has("v") && url.searchParams.get("v") !== cacheName.slice("guns-only-".length)) return null;
  return manifest?.assets?.find(asset => asset.url === url.pathname);
}

async function digestMatches(response, asset) {
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength !== asset.size) return false;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("") === asset.sha256;
}

function readManifest(cacheName = CACHE) {
  if (!manifests.has(cacheName)) manifests.set(cacheName, storageOrFallback(async () => {
    const response = await (await caches.open(cacheName)).match(MANIFEST_URL);
    return response ? await response.json() : null;
  }).then(value => { if (!value) manifests.delete(cacheName); return value; }));
  return manifests.get(cacheName);
}

async function cacheForClient(event) {
  if (!event.clientId) return CACHE;
  if (clientCaches.has(event.clientId)) return clientCaches.get(event.clientId);
  // The existing main-shell handshake already replies with its build. Omitting the activation
  // build deliberately asks for identity without telling a running sortie to reload.
  let timer;
  let channel;
  const build = await Promise.race([
    (async () => {
      const client = await self.clients.get(event.clientId);
      if (!client) return null;
      return new Promise(resolve => {
        channel = new MessageChannel();
        channel.port1.onmessage = event => { channel.port1.close(); resolve(event.data?.build); };
        client.postMessage({ type: "guns-release-activated" }, [channel.port2]);
      });
    })().catch(() => null),
    new Promise(resolve => { timer = setTimeout(() => resolve(null), 250); }),
  ]);
  clearTimeout(timer);
  channel?.port1.close();
  const hinted = build ?? new URL(event.request.url).searchParams.get("v");
  const name = /^\d+$/.test(String(hinted)) ? `guns-only-${hinted}` : CACHE;
  if (clientCaches.size >= 128) clientCaches.delete(clientCaches.keys().next().value);
  clientCaches.set(event.clientId, name);
  return name;
}

async function cachedResponse(request, cacheName = CACHE) {
  return storageOrFallback(async () => {
    const cache = await caches.open(cacheName);
    const exact = await cache.match(request);
    if (exact) return exact;
    const manifest = await readManifest(cacheName);
    const asset = assetFor(manifest, request, cacheName);
    if (!asset) return undefined;
    const canonical = await storageRequired(() => cache.match(asset.url));
    if (canonical) return canonical;
    // Retained assets are reusable only with the NEW release's digest. Never mix old WASM/JS.
    const names = (await caches.keys()).filter(name => name.startsWith("guns-only-") && name !== cacheName).reverse();
    for (const name of names) {
      const previous = await caches.open(name);
      const keys = await previous.keys();
      for (const key of keys.filter(key => new URL(key.url).pathname === asset.url)) {
        const response = await previous.match(key);
        if (response && await digestMatches(response, asset)) return response;
      }
    }
  }, "cache-read-failed");
}

async function installRelease() {
  // Development source has no published manifest. Production always fails closed if its
  // stamped manifest or any core file is missing, leaving the prior worker in charge.
  if (RELEASE_BUILD === "__RELEASE_" + "BUILD__") return self.skipWaiting();
  try {
    const response = await fetchComplete(MANIFEST_URL, { cache: "no-store" }, 30_000);
    if (!response.ok) throw new Error("manifest unavailable");
    const manifest = await response.json();
    if (manifest.build !== RELEASE_BUILD || !Array.isArray(manifest.assets)
      || manifest.assets.length > 10000) throw new Error("invalid offline manifest");
    const core = manifest.assets.filter(asset => asset.core);
    if (!core.some(asset => asset.url === "/index.html")
      || core.reduce((sum, asset) => sum + asset.size, 0) > 64 * 1024 * 1024
      || manifest.assets.some(asset => !/^\/[^?#]*$/.test(asset.url) || asset.url.startsWith("//")
        || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size < 0)) {
      throw new Error("invalid offline assets");
    }
    const cache = await storageRequired(() => caches.open(CACHE));
    let index = 0;
    let indexDocument;
    await Promise.all(Array.from({ length: Math.min(4, core.length) }, async () => {
      while (index < core.length) {
        const asset = core[index++];
        let bytes = await storageRequired(() => cache.match(asset.url));
        if (!bytes || !await digestMatches(bytes, asset)) {
          bytes = await fetchComplete(asset.url, { cache: "no-store" }, 30_000);
          if (!bytes.ok || !await digestMatches(bytes, asset)) throw new Error("incomplete offline release");
          if (asset.url === "/index.html") indexDocument = bytes.clone();
          await storageRequired(() => cache.put(asset.url, bytes));
        } else if (asset.url === "/index.html") indexDocument = bytes.clone();
      }
    }));
    if (!indexDocument) throw new Error("offline index unavailable");
    await storageRequired(() => cache.put("/", indexDocument));
    await storageRequired(() => cache.put(MANIFEST_URL, new Response(JSON.stringify(manifest))));
    await storageRequired(() => cache.put(READY_URL, new Response(RELEASE_BUILD)));
    // Let an existing sortie finish on its original worker. The browser activates this
    // complete replacement once the last controlled window closes; first installs activate
    // normally. Claiming an old client here would strand uncached old-release assets.
  } catch (error) {
    await diagnostic("install-failed", MANIFEST_URL);
    throw error;
  }
}

self.addEventListener("install", event => event.waitUntil(installRelease()));
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // Keep one previous bucket for digest-checked reuse. Installation has already verified a
    // complete replacement shell; failure never activates or erases the working release.
    await storageOrFallback(async () => {
      const old = (await caches.keys()).filter(name => /^guns-only-\d+$/.test(name) && name !== CACHE)
        .sort((a, b) => Number(b.slice(10)) - Number(a.slice(10)));
      for (const name of old.slice(1)) await caches.delete(name);
    });
    await self.clients.claim();
  })());
});

const terrainBundlesPrimed = new Set();
const terrainBundleRetryAfter = new Map();

async function availableStorageBytes() {
  const estimate = self.navigator?.storage?.estimate;
  if (typeof estimate !== "function") return null;
  try {
    const result = await storageRequired(() => estimate.call(self.navigator.storage));
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
  const manifest = await readManifest();
  const urls = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (urls.length >= MAX_RUNTIME_PRIME_URLS) break;
    try {
      const url = new URL(String(candidate), self.location.origin);
      if (url.origin !== self.location.origin
        || (url.searchParams.has("v") && url.searchParams.get("v") !== RELEASE_BUILD)
        || NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) continue;
      if (!url.searchParams.has("v") && !assetFor(manifest, url.href)) continue;
      if (!urls.includes(url.href)) urls.push(url.href);
    } catch {
      // Ignore malformed client-provided resource names.
    }
  }
  const cache = await storageRequired(() => caches.open(CACHE));
  let cached = 0;
  let reused = 0;
  let failed = 0;
  let nextUrl = 0;
  async function primeNextUrl() {
    while (nextUrl < urls.length) {
      const url = urls[nextUrl];
      const asset = assetFor(manifest, url);
      nextUrl += 1;
      let existing;
      try {
        existing = await storageRequired(() => cache.match(url));
      } catch {
        // A transient Cache Storage read failure must not suppress the network retry that can
        // repair the entry. A failed write below will still report the URL as failed.
      }
      if (existing?.ok && existing.status === 200 && existing.type === "basic"
        && (!asset || await digestMatches(existing, asset))) {
        reused += 1;
        continue;
      }
      try {
        const response = await fetchComplete(url, { cache: "no-store" }, 30_000);
        if (!response.ok || response.status !== 200 || response.type !== "basic") {
          failed += 1;
          continue;
        }
        if (asset && !await digestMatches(response, asset)) {
          await diagnostic("runtime-prime-incompatible", url);
          failed += 1;
          continue;
        }
        await storageRequired(() => cache.put(url, response.clone()));
        cached += 1;
      } catch {
        await diagnostic("runtime-prime-failed", url);
        failed += 1;
      }
    }
  }
  const workers = Math.min(MAX_RUNTIME_PRIME_CONCURRENCY, urls.length);
  await Promise.all(Array.from({ length: workers }, () => primeNextUrl()));
  return { requested: urls.length, cached, reused, failed, build: RELEASE_BUILD };
}

self.addEventListener("message", (event) => {
  // A new-release document is itself controlled by the old worker, so this verified replacement
  // can only activate on request. Honour it for this exact build only; activation claims clients,
  // and old documents keep reading their own retained release bucket (cacheForClient).
  if (event.data?.type === "guns-skip-waiting") {
    if (event.data.build === RELEASE_BUILD) event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type === "offline-diagnostics") {
    event.waitUntil(readDiagnostics().then(incidents => event.ports?.[0]?.postMessage({ build: RELEASE_BUILD, incidents })));
    return;
  }
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
      const cache = await storageRequired(() => caches.open(CACHE));
      const existing = await storageRequired(() => cache.match(bare.href));
      const cached = existing ?? await cachedTerrainBundle(bare.href);
      if (cached?.ok && cached.status === 200) {
        if (!existing) await storageRequired(() => cache.put(bare.href, cached.clone()));
        terrainBundleRetryAfter.delete(bare.href);
        return;
      }
      // A known-low storage budget cannot accept a terrain page. Check before fetching so every
      // Range request does not also trigger a doomed whole-page transfer.
      if (!await terrainCacheHasCapacity()) {
        deferTerrainBundleRetry(bare.href);
        return;
      }
      const response = await fetchComplete(bare.href, { cache: "no-store" }, 30_000);
      if (response.ok && response.status === 200 && await terrainCacheHasCapacity(response)) {
        await storageRequired(() => cache.put(bare.href, response.clone()));
        terrainBundleRetryAfter.delete(bare.href);
      } else {
        deferTerrainBundleRetry(bare.href);
      }
    } catch {
      // Offline, the bundle moved, or Cache Storage rejected the write. Keep serving the original
      // Range path, but suppress another whole-page attempt until the deterministic cooldown ends.
      await diagnostic("terrain-prime-failed", bare.href);
      deferTerrainBundleRetry(bare.href);
    }
  })();
}

async function cachedTerrainBundle(url, cacheName = CACHE) {
  const bare = new URL(url);
  bare.search = "";
  return cachedResponse(bare.href, cacheName);
}

function fetchWithCacheWrite(request, { basicOnly = false, deadline = NETWORK_DEADLINE_MS } = {}) {
  // An unversioned URL can be satisfied by the browser HTTP cache with bytes from an older
  // build, and a plain fetch would then persist those stale bytes into this build's cache.
  // Unversioned assets therefore revalidate; ?v=BUILD URLs are immutable per build and skip it.
  const versioned = new URL(request.url).searchParams.has("v");
  return fetchComplete(request, versioned ? {} : { cache: "no-cache" }, deadline).then(async (response) => {
    let cacheWrite = Promise.resolve();
    const manifest = await readManifest();
    const path = new URL(request.url).pathname;
    const assetPath = request.mode === "navigate" && path.endsWith("/") ? `${path}index.html` : path;
    const asset = manifest?.assets?.find(asset => asset.url === assetPath);
    const compatible = !asset || await digestMatches(response, asset);
    // A new HTML document is not a complete update. Keep this worker's coherent shell until
    // replacement installation verifies its runtime; a partial online deployment must not boot
    // a new document against the saved old graph.
    if (!compatible && request.mode === "navigate") {
      const saved = await cachedResponse(request);
      if (saved) {
        await diagnostic("update-shell-retained", request);
        return { response: saved, cacheWrite };
      }
    }
    if (compatible && response.ok && response.status === 200 && (!basicOnly || response.type === "basic")) {
      // Clone while the body is unquestionably unused. The response can then be returned
      // immediately while waitUntil() keeps the asynchronous Cache API write alive.
      const copy = response.clone();
      cacheWrite = storageOrFallback(() => caches.open(CACHE).then((cache) => cache.put(request, copy)), "cache-write-failed");
    }
    return { response, cacheWrite };
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NEVER_CACHE.some(pattern => pattern.test(url.pathname))) return;

  if (TERRAIN_BUNDLE.test(url.pathname)) {
    const task = (async () => {
      const cacheName = await cacheForClient(event);
      const whole = await cachedTerrainBundle(request.url, cacheName);
      if (whole) return whole;
      if (cacheName !== CACHE) { await diagnostic("release-cache-miss", request); throw new Error("Saved release asset unavailable"); }
      try { return await fetchComplete(request, {}, 30_000); }
      catch (error) { await diagnostic("cache-miss", request); throw error; }
    })();
    event.respondWith(task);
    event.waitUntil(Promise.all([task.catch(() => {}), primeTerrainBundle(request.url)]));
    return;
  }

  if (request.mode === "navigate") {
    const task = (async () => {
      try {
        const { response, cacheWrite } = await fetchWithCacheWrite(request);
        return { response, cacheWrite };
      } catch (error) {
        const cached = await storageOrFallback(async () => {
          const cache = await storageRequired(() => caches.open(CACHE));
          // A sub-app must fall back to its own entrypoint, never the main simulator.
          const path = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
          return await cache.match(request) ?? await cache.match(path);
        });
        await diagnostic(cached ? "cache-fallback" : "cache-miss", request);
        if (cached) return { response: cached, cacheWrite: Promise.resolve() };
        if (error.response) return { response: error.response, cacheWrite: Promise.resolve() };
        throw error;
      }
    })();
    event.respondWith(task.then(result => result.response));
    event.waitUntil(task.then(result => result.cacheWrite).catch(() => {}).then(() => storageOrFallback(() => diagnosticQueue)));
    return;
  }

  const task = (async () => {
    const cacheName = await cacheForClient(event);
    const cached = await cachedResponse(request, cacheName);
    if (cached) return { response: cached, cacheWrite: Promise.resolve() };
    if (cacheName !== CACHE) { await diagnostic("release-cache-miss", request); throw new Error("Saved release asset unavailable"); }
    try { return await fetchWithCacheWrite(request, { basicOnly: true, deadline: LARGE_ASSET.test(url.pathname) ? 60_000 : NETWORK_DEADLINE_MS }); }
    catch (error) { await diagnostic("cache-miss", request); throw error; }
  })();
  event.respondWith(task.then(result => result.response));
  event.waitUntil(task.then(result => result.cacheWrite).catch(() => {}).then(() => storageOrFallback(() => diagnosticQueue)));
});
