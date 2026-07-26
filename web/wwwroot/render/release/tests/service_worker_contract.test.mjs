import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerUrl = new URL("../../../service-worker.js", import.meta.url);

test("offline terrain cache primes every theatre bundle independently and retries failures", async () => {
  const source = await readFile(workerUrl, "utf8");
  assert.match(source, /const terrainBundlesPrimed = new Set\(\)/);
  assert.match(source,
    /if \(terrainBundlesPrimed\.has\(bare\.href\)\) return;[\s\S]*terrainBundlesPrimed\.add\(bare\.href\)/,
    "terrain priming must be keyed by the bare bundle URL");
  assert.match(source,
    /response\.ok && response\.status === 200[\s\S]*terrainBundlesPrimed\.delete\(bare\.href\)[\s\S]*catch[\s\S]*terrainBundlesPrimed\.delete\(bare\.href\)/,
    "a failed background fill must not permanently suppress a later online retry");
  assert.doesNotMatch(source, /let terrainBundlePrimed = false/);
});
