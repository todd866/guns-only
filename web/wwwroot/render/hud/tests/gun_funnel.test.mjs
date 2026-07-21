import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { gunFunnelProfile, gunFunnelSamples } from "../gun_funnel.js";

test("gun funnel consumes authoritative weapon and target dimensions", () => {
  assert.deepEqual(gunFunnelProfile({
    gun_muzzle_velocity_mps: 1030,
    gun_max_flight_s: 2,
    target_wingspan_m: 14.7,
  }), {
    muzzleVelocityMps: 1030,
    maximumFlightSeconds: 2,
    targetWingspanM: 14.7,
  });
});

test("traditional funnel narrows with range and stays inside projectile lifetime", () => {
  const samples = gunFunnelSamples({
    muzzleVelocityMps: 870,
    maximumFlightSeconds: 1.75,
    targetWingspanM: 11.3,
    focalLengthPx: 640,
  });

  assert.equal(samples.length, 9);
  assert.ok(samples[0].halfWidthPx > samples.at(-1).halfWidthPx);
  assert.ok(samples[0].yPx < samples.at(-1).yPx);
  assert.ok(samples.at(-1).timeOfFlightSeconds <= 1.75);
});

test("larger targets produce a wider range funnel without changing its range scale", () => {
  const base = {
    muzzleVelocityMps: 900,
    maximumFlightSeconds: 1.8,
    focalLengthPx: 600,
  };
  const small = gunFunnelSamples({ ...base, targetWingspanM: 5.5 });
  const large = gunFunnelSamples({ ...base, targetWingspanM: 14.7 });

  assert.equal(small[4].rangeM, large[4].rangeM);
  assert.ok(large[4].halfWidthPx > small[4].halfWidthPx);
});

test("production wires funnel geometry to authoritative bridge fields", async () => {
  const [hudSource, bridgeSource] = await Promise.all([
    readFile(new URL("../../../hud.js", import.meta.url), "utf8"),
    readFile(new URL("../../../../WebBridge.cs", import.meta.url), "utf8"),
  ]);

  assert.match(hudSource, /this\.drawGunFunnel\(frame, anchor\)/);
  assert.match(hudSource, /gunFunnelSamples\(\{/);
  assert.match(bridgeSource, /gun_muzzle_velocity_mps/);
  assert.match(bridgeSource, /gun_max_flight_s/);
  assert.match(bridgeSource, /target_wingspan_m/);
});
