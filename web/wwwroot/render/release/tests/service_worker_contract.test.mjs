import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const workerUrl = new URL("../../../service-worker.js", import.meta.url);

async function workerHarness({ fetchResponse, put } = {}) {
  const source = await readFile(workerUrl, "utf8");
  const listeners = new Map();
  const puts = [];
  const cache = {
    match: async () => null,
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
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  runInNewContext(source, {
    self,
    caches,
    fetch: async () => response,
    URL,
    Set,
    Promise,
  });
  return {
    puts,
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

test("offline terrain cache primes every theatre bundle independently and retries failures", async () => {
  const source = await readFile(workerUrl, "utf8");
  assert.match(source, /const terrainBundlesPrimed = new Set\(\)/);
  assert.match(source,
    /if \(terrainBundlesPrimed\.has\(bare\.href\)\) return Promise\.resolve\(\);[\s\S]*terrainBundlesPrimed\.add\(bare\.href\)/,
    "terrain priming must be keyed by the bare bundle URL");
  assert.match(source,
    /response\.ok && response\.status === 200[\s\S]*terrainBundlesPrimed\.delete\(bare\.href\)[\s\S]*catch[\s\S]*terrainBundlesPrimed\.delete\(bare\.href\)/,
    "a failed background fill must not permanently suppress a later online retry");
  assert.match(source,
    /if \(TERRAIN_BUNDLE\.test\(url\.pathname\)\) \{[\s\S]*event\.waitUntil\(primeTerrainBundle\(request\.url\)\)[\s\S]*event\.respondWith/,
    "the fetch event must stay alive until its full-bundle offline cache write settles");
  assert.doesNotMatch(source, /let terrainBundlePrimed = false/);
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
  assert.match(worker,
    /self\.addEventListener\("message"[\s\S]*event\.data\?\.type !== "prime-runtime"[\s\S]*primeRuntimeUrls\(event\.data\.urls\)/);
  assert.match(worker,
    /url\.origin !== self\.location\.origin[\s\S]*NEVER_CACHE\.some/);
  assert.match(app,
    /performance\.getEntriesByType\?\.\("resource"\)[\s\S]*type: "prime-runtime"/);
  assert.match(app,
    /recorder\.context\("offline_runtime"[\s\S]*state: result\.failed === 0 \? "ready" : "partial"/);
});
