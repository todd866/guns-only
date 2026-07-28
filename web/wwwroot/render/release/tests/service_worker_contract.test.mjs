import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerUrl = new URL("../../../service-worker.js", import.meta.url);

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
