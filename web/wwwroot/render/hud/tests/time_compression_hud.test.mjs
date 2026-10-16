import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { timeCompressionHudPresentation } from "../../telemetry/time_compression.js";

const hudUrl = new URL("../../../hud.js", import.meta.url);

test("HUD presentation exposes the active kernel factor and RTB autopilot state", () => {
  assert.deepEqual(timeCompressionHudPresentation({
    time_compression_available: true,
    time_compression_enabled: true,
    time_compression_factor: 8,
    rtb_autopilot_active: true,
  }), {
    text: "▸▸ 8× AP",
    level: "active",
    ariaLabel: "RTB time compression 8 times active, autopilot flying",
  });

  for (const factor of [4, 2]) {
    assert.equal(timeCompressionHudPresentation({
      time_compression_available: true,
      time_compression_factor: factor,
      rtb_autopilot_active: true,
    }).text, `▸▸ ${factor}× AP`);
  }

  // Host cost capping can reduce the scheduled factor to 1 while AP still owns the controls.
  assert.deepEqual(timeCompressionHudPresentation({
    time_compression_available: true,
    time_compression_factor: 1,
    rtb_autopilot_active: true,
  }), {
    text: "▸▸ 1× AP",
    level: "active",
    ariaLabel: "RTB time compression 1 times active, autopilot flying",
  });

  // Non-AP sorties retain ordinary compression's factor display without claiming AP.
  assert.deepEqual(timeCompressionHudPresentation({
    time_compression_available: true,
    time_compression_factor: 4,
    rtb_autopilot_active: false,
  }), {
    text: "▸▸ 4×",
    level: "active",
    ariaLabel: "RTB time compression 4 times active",
  });

  // No idle chrome: a non-AP factor-1 state renders nothing (owner direction 2026-07-29).
  assert.equal(timeCompressionHudPresentation({
    time_compression_available: true,
    time_compression_enabled: false,
    time_compression_factor: 1,
    rtb_autopilot_active: false,
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
