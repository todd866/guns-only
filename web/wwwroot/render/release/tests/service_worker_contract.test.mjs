import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const workerUrl = new URL("../../../service-worker.js", import.meta.url);

async function workerHarness({ fetchImpl, fetchResponse, match, put, storageEstimate, now } = {}) {
  const source = await readFile(workerUrl, "utf8");
  const listeners = new Map();
  const puts = [];
  const networkRequests = [];
  const cache = {
    match: match ?? (async () => null),
    put: put ?? (async (request, response) => {
      puts.push({ request, response });
    }),
  };
  const caches = {
    keys: async () => [],
    delete: async () => true,
    open: async () => cache,
    match: async () => null,
  };
  const response = fetchResponse ?? {
    ok: true,
    status: 200,
    type: "basic",
    clone() { return { ...this, cloned: true }; },
  };
  const self = {
    location: { origin: "https://guns-only.vercel.app" },
    navigator: storageEstimate
      ? { storage: { estimate: storageEstimate } }
      : {},
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const context = {
    self,
    caches,
    fetch: async (...args) => {
      networkRequests.push(args);
      if (fetchImpl) return fetchImpl(...args);
      return response;
    },
    URL,
    Date: now
      ? class WorkerDate extends Date { static now() { return now(); } }
      : Date,
    Set,
    Promise,
  };
  runInNewContext(source, context);
  return {
    networkRequests,
    puts,
    primeRuntimeUrls: (urls) => context.primeRuntimeUrls(urls),
    primeTerrainBundle: (url) => context.primeTerrainBundle(url),
    dispatchMessage(data) {
      const lifetime = [];
      const messages = [];
      listeners.get("message")({
        data,
        // Real MessagePort delivery structured-clones across realms. Normalize here as well so
        // assertions compare host-realm records rather than VM object prototypes.
        ports: [{ postMessage(message) { messages.push({ ...message }); } }],
        waitUntil(promise) { lifetime.push(Promise.resolve(promise)); },
      });
      return {
        messages,
        lifetime: Promise.all(lifetime),
        lifetimeCount: lifetime.length,
      };
    },
    dispatchFetch(request) {
      const lifetime = [];
      let responsePromise;
      listeners.get("fetch")({
        request,
        waitUntil(promise) { lifetime.push(Promise.resolve(promise)); },
        respondWith(promise) { responsePromise = Promise.resolve(promise); },
      });
      return {
        response: responsePromise,
        lifetime: Promise.all(lifetime),
        lifetimeCount: lifetime.length,
      };
    },
  };
}

test("offline terrain cache primes every theatre bundle independently and cools down failures", async () => {
  const source = await readFile(workerUrl, "utf8");
  assert.match(source, /const terrainBundlesPrimed = new Set\(\)/);
  assert.match(source, /const terrainBundleRetryAfter = new Map\(\)/);
  assert.match(source, /const TERRAIN_PRIME_RETRY_COOLDOWN_MS = 5 \* 60 \* 1000/);
  assert.match(source,
    /terrainBundlesPrimed\.has\(bare\.href\) \|\| terrainPrimeCoolingDown\(bare\.href\)[\s\S]*terrainBundlesPrimed\.add\(bare\.href\)/,
    "terrain priming must be keyed by the bare bundle URL");
  assert.match(source,
    /caches\.open\(CACHE\)[\s\S]*cache\.match\(bare\.href\)[\s\S]*cached\?\.ok && cached\.status === 200/,
    "a fresh worker process must reuse a persisted full bundle from this build's cache");
  assert.match(source,
    /function deferTerrainBundleRetry[\s\S]*Date\.now\(\) \+ TERRAIN_PRIME_RETRY_COOLDOWN_MS[\s\S]*terrainBundlesPrimed\.delete\(url\)/,
    "a failed background fill must allow a later retry without restarting on every Range request");
  assert.match(source,
    /availableStorageBytes\(\)[\s\S]*TERRAIN_CACHE_RESERVE_BYTES[\s\S]*content-length/,
    "terrain caching must honor a known storage budget and the response's declared size");
  assert.match(source,
    /if \(TERRAIN_BUNDLE\.test\(url\.pathname\)\) \{[\s\S]*event\.waitUntil\(primeTerrainBundle\(request\.url\)\)[\s\S]*event\.respondWith/,
    "the fetch event must stay alive until its full-bundle offline cache write settles");
  assert.doesNotMatch(source, /let terrainBundlePrimed = false/);
});

test("failed terrain primes suppress repeated whole-page downloads until cooldown expiry", async () => {
  let clock = 1_000_000;
  const harness = await workerHarness({
    now: () => clock,
    fetchResponse: {
      ok: false,
      status: 503,
      type: "basic",
      clone() { throw new Error("a failed response must not be cached"); },
    },
  });
  const firstUrl = "https://guns-only.vercel.app/content/packs/theatre/page.terrain?range=first";

  await harness.primeTerrainBundle(firstUrl);
  await harness.primeTerrainBundle(`${firstUrl}&range=second`);
  assert.equal(harness.networkRequests.length, 1,
    "adjacent Range requests must share the failed whole-page attempt's cooldown");
  assert.deepEqual(harness.puts, []);

  clock += (5 * 60 * 1000) - 1;
  await harness.primeTerrainBundle(firstUrl);
  assert.equal(harness.networkRequests.length, 1,
    "the cooldown must remain active until its exact boundary");

  clock += 1;
  await harness.primeTerrainBundle(firstUrl);
  assert.equal(harness.networkRequests.length, 2,
    "the same worker must retry once the deterministic cooldown expires");
});

test("Cache Storage write rejection receives the same terrain retry cooldown", async () => {
  let clock = 1_500_000;
  let writeAttempts = 0;
  const harness = await workerHarness({
    now: () => clock,
    put: async () => {
      writeAttempts += 1;
      throw new Error("expected quota-style Cache Storage rejection");
    },
  });
  const url = "https://guns-only.vercel.app/content/packs/theatre/write-failure.terrain";

  await harness.primeTerrainBundle(url);
  await harness.primeTerrainBundle(`${url}?range=next`);
  assert.equal(harness.networkRequests.length, 1);
  assert.equal(writeAttempts, 1,
    "a rejected write must not induce another whole-page transfer on the next Range request");

  clock += 5 * 60 * 1000;
  await harness.primeTerrainBundle(url);
  assert.equal(harness.networkRequests.length, 2);
  assert.equal(writeAttempts, 2);
});

test("known-low storage quota fails closed before a terrain whole-page fetch", async () => {
  let clock = 2_000_000;
  let estimateCalls = 0;
  const harness = await workerHarness({
    now: () => clock,
    storageEstimate: async () => {
      estimateCalls += 1;
      return {
        quota: 64 * 1024 * 1024,
        usage: 40 * 1024 * 1024,
      };
    },
  });
  const url = "https://guns-only.vercel.app/content/packs/theatre/low-quota.terrain";

  await harness.primeTerrainBundle(url);
  await harness.primeTerrainBundle(`${url}?range=next`);
  assert.equal(estimateCalls, 1,
    "the quota rejection itself must be cooled down for adjacent Range requests");
  assert.equal(harness.networkRequests.length, 0,
    "known headroom below the reserve must not start a doomed whole-page transfer");
  assert.deepEqual(harness.puts, []);

  clock += 5 * 60 * 1000;
  await harness.primeTerrainBundle(url);
  assert.equal(estimateCalls, 2, "quota must be reconsidered after cooldown expiry");
});

test("declared terrain page size is rejected when it would consume reserved quota", async () => {
  const MiB = 1024 * 1024;
  let estimateCalls = 0;
  const harness = await workerHarness({
    storageEstimate: async () => {
      estimateCalls += 1;
      return { quota: 200 * MiB, usage: 50 * MiB };
    },
    fetchResponse: {
      ok: true,
      status: 200,
      type: "basic",
      headers: { get: (name) => name === "content-length" ? String(130 * MiB) : null },
      clone() { return { ...this, cloned: true }; },
    },
  });

  await harness.primeTerrainBundle(
    "https://guns-only.vercel.app/content/packs/theatre/oversize.terrain",
  );
  assert.equal(estimateCalls, 2,
    "capacity must be checked before transfer and again against the declared response size");
  assert.equal(harness.networkRequests.length, 1);
  assert.deepEqual(harness.puts, [],
    "a page that would breach the reserve must never be passed to Cache Storage");
});

test("browsers without a usable StorageManager estimate retain terrain caching", async () => {
  const absent = await workerHarness();
  await absent.primeTerrainBundle(
    "https://guns-only.vercel.app/content/packs/theatre/compatible.terrain",
  );
  assert.equal(absent.networkRequests.length, 1);
  assert.equal(absent.puts.length, 1,
    "quota preflight must not remove offline caching from browsers without estimate support");

  const rejected = await workerHarness({
    storageEstimate: async () => { throw new Error("expected unavailable estimate"); },
  });
  await rejected.primeTerrainBundle(
    "https://guns-only.vercel.app/content/packs/theatre/private-mode.terrain",
  );
  assert.equal(rejected.networkRequests.length, 1);
  assert.equal(rejected.puts.length, 1,
    "a browser that rejects the advisory estimate must retain the Cache API fallback");
});

test("a fresh worker reuses a persisted full terrain bundle without a network fetch", async () => {
  const matched = [];
  const persistedFullResponse = { ok: true, status: 200, type: "basic" };
  const harness = await workerHarness({
    match: async (request) => {
      matched.push(String(request));
      return persistedFullResponse;
    },
  });

  await harness.primeTerrainBundle(
    "https://guns-only.vercel.app/content/packs/theatre/page.terrain?range=first",
  );
  assert.deepEqual(matched, [
    "https://guns-only.vercel.app/content/packs/theatre/page.terrain",
  ], "the persisted lookup must use the full bundle's bare cache key");
  assert.equal(harness.networkRequests.length, 0,
    "a service-worker restart must not redownload an already-cached whole terrain page");
  assert.deepEqual(harness.puts, []);
});

test("successful runtime cache writes extend the fetch-event lifetime", async () => {
  let finishWrite;
  let putStarted = false;
  const harness = await workerHarness({
    put: async () => {
      putStarted = true;
      await new Promise((resolve) => { finishWrite = resolve; });
    },
  });
  const event = harness.dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://guns-only.vercel.app/render/flight.js?v=test",
  });
  assert.equal(event.lifetimeCount, 1,
    "cache-first misses must register their write with waitUntil synchronously");
  await event.response;
  assert.equal(putStarted, true);
  let lifetimeSettled = false;
  event.lifetime.then(() => { lifetimeSettled = true; });
  await Promise.resolve();
  assert.equal(lifetimeSettled, false, "event lifetime must include the pending Cache API write");
  finishWrite();
  await event.lifetime;
  assert.equal(lifetimeSettled, true);
});

test("live telemetry endpoints bypass caching without excluding telemetry modules", async () => {
  const harness = await workerHarness();
  const endpoint = harness.dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://guns-only.vercel.app/telemetry/session",
  });
  assert.equal(endpoint.response, undefined);
  assert.equal(endpoint.lifetimeCount, 0);

  const module = harness.dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://guns-only.vercel.app/render/telemetry/ai_frame_pressure.js?v=test",
  });
  assert.ok(module.response, "a telemetry presentation module must use the offline cache path");
  await module.response;
  await module.lifetime;
  assert.equal(harness.puts.length, 1);
});

test("navigation caching is lifecycle-safe and rejects non-OK responses", async () => {
  let finishWrite;
  const successful = await workerHarness({
    put: async () => new Promise((resolve) => { finishWrite = resolve; }),
  });
  const successfulEvent = successful.dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: "https://guns-only.vercel.app/",
  });
  assert.equal(successfulEvent.lifetimeCount, 1,
    "navigation cache writes must register with waitUntil synchronously");
  await successfulEvent.response;
  let lifetimeSettled = false;
  successfulEvent.lifetime.then(() => { lifetimeSettled = true; });
  await Promise.resolve();
  assert.equal(lifetimeSettled, false);
  finishWrite();
  await successfulEvent.lifetime;
  assert.equal(lifetimeSettled, true);

  const unavailable = await workerHarness({
    fetchResponse: {
      ok: false,
      status: 503,
      type: "basic",
      clone() { throw new Error("a non-OK navigation must never be cloned for caching"); },
    },
  });
  const unavailableEvent = unavailable.dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: "https://guns-only.vercel.app/",
  });
  const response = await unavailableEvent.response;
  await unavailableEvent.lifetime;
  assert.equal(response.status, 503);
  assert.deepEqual(unavailable.puts, []);
});

test("finished first boot explicitly primes resources loaded before service-worker control", async () => {
  const worker = await readFile(workerUrl, "utf8");
  const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
  assert.match(worker, /const MAX_RUNTIME_PRIME_URLS = 768/);
  assert.match(worker, /const MAX_RUNTIME_PRIME_CONCURRENCY = 4/);
  assert.match(worker,
    /self\.addEventListener\("message"[\s\S]*event\.data\?\.type !== "prime-runtime"[\s\S]*primeRuntimeUrls\(event\.data\.urls\)/);
  assert.match(worker,
    /cache\.match\(url\)[\s\S]*existing\?\.ok && existing\.status === 200 && existing\.type === "basic"/,
    "runtime priming must consult this build's cache before starting a network request");
  assert.match(worker,
    /Math\.min\(MAX_RUNTIME_PRIME_CONCURRENCY, urls\.length\)[\s\S]*Promise\.all/,
    "runtime priming must use an explicitly bounded worker pool");
  assert.match(worker,
    /url\.origin !== self\.location\.origin[\s\S]*NEVER_CACHE\.some/);
  assert.match(app,
    /performance\.getEntriesByType\?\.\("resource"\)[\s\S]*type: "prime-runtime"/);
  assert.match(app,
    /recorder\.context\("offline_runtime"[\s\S]*state: result\.failed === 0 \? "ready" : "partial"/);
});

test("runtime priming reuses healthy same-build cache hits without fetching", async () => {
  const matched = [];
  const healthy = { ok: true, status: 200, type: "basic" };
  const harness = await workerHarness({
    match: async (request) => {
      matched.push(String(request));
      return healthy;
    },
  });
  const event = harness.dispatchMessage({
    type: "prime-runtime",
    urls: [
      "https://guns-only.vercel.app/render/flight.js?v=251",
      "https://guns-only.vercel.app/index.html",
      "https://guns-only.vercel.app/render/flight.js?v=251",
      "https://guns-only.vercel.app/telemetry/session",
      "https://elsewhere.example/foreign.js",
    ],
  });

  assert.equal(event.lifetimeCount, 1,
    "runtime priming must keep the message event alive through cache inspection");
  await event.lifetime;
  assert.deepEqual(matched, [
    "https://guns-only.vercel.app/render/flight.js?v=251",
    "https://guns-only.vercel.app/index.html",
  ]);
  assert.equal(harness.networkRequests.length, 0);
  assert.deepEqual(harness.puts, []);
  assert.deepEqual(event.messages, [{
    requested: 2,
    cached: 0,
    reused: 2,
    failed: 0,
    build: "251",
  }]);
});

test("runtime priming treats a Cache Storage read error as a repairable network miss", async () => {
  const harness = await workerHarness({
    match: async () => { throw new Error("expected cache read failure"); },
  });

  const result = await harness.primeRuntimeUrls([
    "https://guns-only.vercel.app/render/repair-cache.js?v=251",
  ]);

  assert.equal(harness.networkRequests.length, 1,
    "cache-read failure must preserve the prior network retry behavior");
  assert.equal(harness.puts.length, 1);
  assert.deepEqual({ ...result }, {
    requested: 1,
    cached: 1,
    reused: 0,
    failed: 0,
    build: "251",
  });
});

test("runtime priming caps concurrency and completes after individual errors", async () => {
  let active = 0;
  let maximumActive = 0;
  let releaseFetches;
  const fetchGate = new Promise((resolve) => { releaseFetches = resolve; });
  const successfulResponse = {
    ok: true,
    status: 200,
    type: "basic",
    clone() { return { ...this, cloned: true }; },
  };
  const harness = await workerHarness({
    fetchImpl: async (url) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await fetchGate;
      active -= 1;
      if (String(url).endsWith("/failure.js")) throw new Error("expected fetch failure");
      return successfulResponse;
    },
  });
  const urls = Array.from({ length: 11 }, (_, index) =>
    `https://guns-only.vercel.app/render/runtime-${index}.js?v=251`);
  urls.push("https://guns-only.vercel.app/render/failure.js");
  const event = harness.dispatchMessage({ type: "prime-runtime", urls });

  for (let turn = 0; turn < 20 && harness.networkRequests.length < 4; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(harness.networkRequests.length, 4,
    "only the bounded worker pool may reach the blocked network stage");
  assert.equal(maximumActive, 4);
  assert.deepEqual(event.messages, [], "completion must wait for every queued URL");

  releaseFetches();
  await event.lifetime;
  assert.equal(maximumActive, 4, "later queue work must not exceed the same cap");
  assert.equal(harness.networkRequests.length, 12);
  assert.deepEqual(event.messages, [{
    requested: 12,
    cached: 11,
    reused: 0,
    failed: 1,
    build: "251",
  }], "one rejected fetch must be counted without aborting queue completion");
});
