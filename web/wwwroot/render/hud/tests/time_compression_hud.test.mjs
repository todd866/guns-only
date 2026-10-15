import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { timeCompressionHudPresentation } from "../../telemetry/time_compression.js";

const hudUrl = new URL("../../../hud.js", import.meta.url);

test("HUD presentation exposes the active kernel factor as a compact instrument cell", () => {
  assert.deepEqual(timeCompressionHudPresentation({
    time_compression_available: true,
    time_compression_enabled: true,
    time_compression_factor: 8,
  }), {
    text: "▸▸ 8×",
    level: "active",
    ariaLabel: "RTB time compression 8 times active",
  });
  // No idle chrome: a disabled/idle state renders nothing (owner direction 2026-07-29).
  assert.equal(timeCompressionHudPresentation({
    time_compression_available: true,
    time_compression_enabled: false,
    time_compression_factor: 1,
  }), null);
  assert.equal(timeCompressionHudPresentation({
    time_compression_available: false,
    time_compression_factor: 8,
  }), null);
});

test("production HUD draws the time-compression chip from snapshot state", async () => {
  const source = await readFile(hudUrl, "utf8");

  assert.match(source,
    /import \{ timeCompressionHudPresentation \} from "\.\/render\/telemetry\/time_compression\.js";/);
  assert.match(source,
    /drawTimeCompression\(frame\) \{[\s\S]*?timeCompressionHudPresentation\(frame\.state\)/);
  assert.match(source, /this\.drawTimeCompression\(frame\);/);
  assert.match(source, /RTB COMPRESS/);
});
