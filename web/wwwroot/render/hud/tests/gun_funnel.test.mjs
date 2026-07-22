import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  gunFunnelProfile,
  gunFunnelEnvelope,
  gunFunnelRail,
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

// A synthetic projected trajectory: a straight screen-space path from (500, 300) marching down
// and slightly right, ranges 50..1000 m — comfortably straddling the usable envelope.
function projectedPath() {
  return Array.from({ length: 11 }, (_, index) => ({
    x: 500 + index * 4,
    y: 300 + index * 30,
    rangeM: 50 + index * 95,
  }));
}

test("rail clips the projected trajectory to the envelope with exact interpolated endpoints", () => {
  const env = gunFunnelEnvelope({ muzzleVelocityMps: 870, maximumFlightSeconds: 1.75 });
  const rail = gunFunnelRail(projectedPath(), {
    targetWingspanM: 11.3,
    focalLengthPx: 640,
    nearRangeM: env.nearRangeM,
    farRangeM: env.farRangeM,
  });

  assert.ok(rail.length >= 2);
  // The rail spans exactly the usable envelope — interpolated endpoints, not dropped samples.
  near(rail[0].rangeM, env.nearRangeM);
  near(rail.at(-1).rangeM, env.farRangeM);
  // Interpolated endpoints sit ON the projected polyline (screen-space lerp between brackets).
  const path = projectedPath();
  const fNear = (env.nearRangeM - path[1].rangeM) / (path[2].rangeM - path[1].rangeM);
  near(rail[0].x, path[1].x + (path[2].x - path[1].x) * fNear, 1e-9);
  near(rail[0].y, path[1].y + (path[2].y - path[1].y) * fNear, 1e-9);
  // Every interior sample is an untouched projected trajectory point.
  for (const s of rail.slice(1, -1)) {
    assert.ok(path.some((p) => p.x === s.x && p.y === s.y && p.rangeM === s.rangeM));
  }
  // Ranges increase monotonically along the rail.
  for (let i = 1; i < rail.length; i++) assert.ok(rail[i].rangeM > rail[i - 1].rangeM);
});

test("rail half-width is the fixed wingspan scale and rails ride the path perpendicular", () => {
  const focalLengthPx = 640;
  const wingspan = 11.3;
  const rail = gunFunnelRail(projectedPath(), {
    targetWingspanM: wingspan,
    focalLengthPx,
    nearRangeM: 150,
    farRangeM: 783,
  });

  // Funnel converges: wide near, narrow far; half-width is the projected apparent half-span.
  assert.ok(rail[0].halfWidthPx > rail.at(-1).halfWidthPx);
  for (const s of rail) {
    near(s.halfWidthPx, Math.max(2.5, focalLengthPx * (wingspan * 0.5) / s.rangeM));
    // Unit perpendicular to the local projected path direction (path slope 4/30).
    near(Math.hypot(s.perpX, s.perpY), 1, 1e-9);
    const dot = s.perpX * 4 + s.perpY * 30;
    near(dot, 0, 1e-9);
  }
});

test("larger targets produce a wider funnel without changing its range scale", () => {
  const base = { focalLengthPx: 600, nearRangeM: 150, farRangeM: 783 };
  const small = gunFunnelRail(projectedPath(), { ...base, targetWingspanM: 5.5 });
  const large = gunFunnelRail(projectedPath(), { ...base, targetWingspanM: 14.7 });

  assert.equal(small[2].rangeM, large[2].rangeM); // range scale is wingspan-independent
  assert.ok(large[2].halfWidthPx > small[2].halfWidthPx);
});

test("rail degrades to nothing without a usable projected path", () => {
  const options = {
    targetWingspanM: 11.3, focalLengthPx: 640, nearRangeM: 150, farRangeM: 783,
  };
  assert.deepEqual(gunFunnelRail([], options), []);
  assert.deepEqual(gunFunnelRail([{ x: 1, y: 1, rangeM: 400 }], options), []);
  // Points entirely outside the envelope yield no rail.
  assert.deepEqual(gunFunnelRail([
    { x: 0, y: 0, rangeM: 900 },
    { x: 0, y: 10, rangeM: 1200 },
  ], options), []);
  // Non-finite screen points are discarded rather than poisoning the rail.
  const rail = gunFunnelRail([
    { x: 0, y: 0, rangeM: 200 },
    { x: Number.NaN, y: 10, rangeM: 400 },
    { x: 0, y: 40, rangeM: 600 },
  ], options);
  assert.ok(rail.length >= 2);
  assert.ok(rail.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)));
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
  assert.match(hudSource, /gunFunnelRail\(/);
  assert.match(hudSource, /gunFunnelUsable\(/); // visibility gate is wired in
  // The rails must be drawn from the FIXED wingspan scale, not the measured apparent span —
  // sizing them from what the target currently looks like makes the fit tautological.
  assert.match(hudSource, /\.halfWidthPx/);
  // The funnel path comes from the kernel's ballistic trajectory, projected through the live
  // camera — not from a synthetic vertical ladder.
  assert.match(hudSource, /gun_trajectory/);
  assert.match(bridgeSource, /gun_trajectory/);
  assert.match(bridgeSource, /BallisticFunnelPoint/);
  assert.match(bridgeSource, /gun_muzzle_velocity_mps/);
  assert.match(bridgeSource, /gun_max_flight_s/);
  assert.match(bridgeSource, /target_wingspan_m/);
});
