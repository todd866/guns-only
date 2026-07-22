import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  gunFunnelProfile,
  gunFunnelEnvelope,
  gunFunnelSamples,
  gunFunnelUsable,
} from "../gun_funnel.js";

const near = (actual, expected, tol = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} !~= ${expected}`);

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

test("effective envelope is derived from real ballistics, not magic fractions", () => {
  // far = min(900, velocity * min(maxFlightSeconds, 0.9))
  const slow = gunFunnelEnvelope({ muzzleVelocityMps: 870, maximumFlightSeconds: 1.75 });
  near(slow.farRangeM, 870 * 0.9); // 783 m — flight time capped at the effective 0.9 s
  near(slow.nearRangeM, 150); // real minimum tracking/convergence floor

  // A faster gun reaches farther, up to the effective ceiling.
  const fast = gunFunnelEnvelope({ muzzleVelocityMps: 1030, maximumFlightSeconds: 2 });
  assert.ok(fast.farRangeM > slow.farRangeM);
  near(fast.farRangeM, 900); // clamped to the effective ceiling

  // A short-lived round shortens the effective envelope (flight time now binds, not the cap).
  const shortLived = gunFunnelEnvelope({ muzzleVelocityMps: 870, maximumFlightSeconds: 0.5 });
  near(shortLived.farRangeM, 870 * 0.5); // 435 m

  // The old clamped band (~220 near, ~1180 far) is gone.
  assert.notEqual(slow.nearRangeM, 220);
  assert.ok(slow.farRangeM < 1180);
  assert.ok(slow.nearRangeM < slow.farRangeM);
});

test("rails narrow with range and expose a real range scale, no fake vertical axis", () => {
  const focalLengthPx = 640;
  const wingspan = 11.3;
  const samples = gunFunnelSamples({
    muzzleVelocityMps: 870,
    maximumFlightSeconds: 1.75,
    targetWingspanM: wingspan,
    focalLengthPx,
  });
  const env = gunFunnelEnvelope({ muzzleVelocityMps: 870, maximumFlightSeconds: 1.75 });

  assert.equal(samples.length, 9);
  // Near rung sits at the near edge, far rung at the effective far edge.
  near(samples[0].rangeM, env.nearRangeM);
  near(samples.at(-1).rangeM, env.farRangeM);
  // fraction runs 0 (near) -> 1 (far).
  near(samples[0].fraction, 0);
  near(samples.at(-1).fraction, 1);
  // Funnel converges: wide near, narrow far.
  assert.ok(samples[0].halfWidthPx > samples.at(-1).halfWidthPx);
  // Rail half-width is the correct projected apparent half-span at that range.
  for (const s of samples) {
    near(s.halfWidthPx, Math.max(2.5, focalLengthPx * (wingspan * 0.5) / s.rangeM));
  }
  // The dead/fake fields are gone.
  assert.ok(!("yPx" in samples[0]));
  assert.ok(!("timeOfFlightSeconds" in samples[0]));
});

test("larger targets produce a wider funnel without changing its range scale", () => {
  const base = {
    muzzleVelocityMps: 900,
    maximumFlightSeconds: 1.8,
    focalLengthPx: 600,
  };
  const small = gunFunnelSamples({ ...base, targetWingspanM: 5.5 });
  const large = gunFunnelSamples({ ...base, targetWingspanM: 14.7 });

  assert.equal(small[4].rangeM, large[4].rangeM); // range scale is wingspan-independent
  assert.ok(large[4].halfWidthPx > small[4].halfWidthPx);
});

test("funnel is usable only with a live target, a valid solution, and range in the envelope", () => {
  const env = gunFunnelEnvelope({ muzzleVelocityMps: 870, maximumFlightSeconds: 1.75 });
  const usable = {
    bandit_alive: true,
    lead_valid: true,
    target_wingspan_m: 11.3,
    range_m: 400,
  };
  assert.equal(gunFunnelUsable(usable, env), true);

  assert.equal(gunFunnelUsable({ ...usable, bandit_alive: false }, env), false);
  assert.equal(gunFunnelUsable({ ...usable, lead_valid: false }, env), false);
  assert.equal(gunFunnelUsable({ ...usable, target_wingspan_m: 0 }, env), false);
  assert.equal(gunFunnelUsable({ ...usable, range_m: env.farRangeM + 50 }, env), false); // too far
  assert.equal(gunFunnelUsable({ ...usable, range_m: env.nearRangeM - 50 }, env), false); // too close
});

test("production wires the funnel to authoritative bridge fields and gates on the solution", async () => {
  const [hudSource, bridgeSource] = await Promise.all([
    readFile(new URL("../../../hud.js", import.meta.url), "utf8"),
    Promise.all([
      readFile(new URL("../../../../WebBridge.cs", import.meta.url), "utf8"),
      readFile(new URL("../../../../SnapshotProjection.cs", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n")),
  ]);

  assert.match(hudSource, /this\.drawGunFunnel\(frame, anchor\)/);
  assert.match(hudSource, /gunFunnelSamples\(\{/);
  assert.match(hudSource, /gunFunnelUsable\(/); // visibility gate is wired in
  // The rails must be drawn from the FIXED wingspan scale, not the measured apparent span —
  // sizing them from what the target currently looks like makes the fit tautological.
  assert.match(hudSource, /\.halfWidthPx/);
  assert.match(bridgeSource, /gun_muzzle_velocity_mps/);
  assert.match(bridgeSource, /gun_max_flight_s/);
  assert.match(bridgeSource, /target_wingspan_m/);
});
