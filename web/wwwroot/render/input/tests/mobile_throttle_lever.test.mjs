import assert from "node:assert/strict";
import test from "node:test";

import {
  THROTTLE_LEVER_PICKUP_SLOP_PX,
  dragThrottleLever,
  militaryStopFraction,
  pickUpThrottleLever,
  publishedThrottleLever,
  throttleLeverKnobOffset,
  throttleLeverReadout,
} from "../mobile_throttle_lever.js";

test("published lever normalises the physical value by the aircraft's lever stop", () => {
  // F-22 cruise snapshot: 0.16 physical of a 1.35 stop.
  assert.ok(Math.abs(publishedThrottleLever({ throttle: 0.16, max_thrust_fraction: 1.35 })
    - 0.16 / 1.35) < 1e-9);
  // The requested lever wins over the spooling engine value.
  assert.ok(Math.abs(publishedThrottleLever({
    requested_throttle: 1.35, throttle: 0.4, max_thrust_fraction: 1.35,
  }) - 1) < 1e-9);
  assert.equal(publishedThrottleLever({ throttle: 0.6 }), 0.6);
  assert.equal(publishedThrottleLever({}), null);
});

test("touching the lever picks up its current value: no power jump on contact", () => {
  const anchor = pickUpThrottleLever(300, 0.42);
  assert.deepEqual(dragThrottleLever(anchor, 300, 100), { lever: 0.42, moved: false });
  // Sub-slop jitter is still a tap.
  assert.deepEqual(dragThrottleLever(anchor, 300 - (THROTTLE_LEVER_PICKUP_SLOP_PX - 1), 100),
    { lever: 0.42, moved: false });
});

test("dragging moves the lever relative to the pickup point, up for more power", () => {
  const anchor = pickUpThrottleLever(300, 0.4);
  const up = dragThrottleLever(anchor, 280, 100);
  assert.equal(up.moved, true);
  assert.ok(Math.abs(up.lever - 0.6) < 1e-9);
  const down = dragThrottleLever(anchor, 330, 100);
  assert.ok(Math.abs(down.lever - 0.1) < 1e-9);
  // Clamped at both stops.
  assert.equal(dragThrottleLever(anchor, 0, 100).lever, 1);
  assert.equal(dragThrottleLever(anchor, 900, 100).lever, 0);
});

test("military stop and readout reflect reheat only on aircraft that have it", () => {
  assert.ok(Math.abs(militaryStopFraction(1.35) - 1 / 1.35) < 1e-9);
  assert.equal(militaryStopFraction(1), null);
  assert.equal(militaryStopFraction(undefined), null);
  const mil = 1 / 1.35;
  assert.equal(throttleLeverReadout(mil, 1.35).text, "MIL");
  assert.equal(throttleLeverReadout(1, 1.35).text, "AB");
  assert.equal(throttleLeverReadout(mil / 2, 1.35).text, "50");
  assert.match(throttleLeverReadout(mil / 2, 1.35).spoken, /50 percent of military/);
  assert.equal(throttleLeverReadout(0.3, 1).text, "30");
});

test("knob offset is proportional to the lever over the available travel", () => {
  assert.equal(throttleLeverKnobOffset(0, 60), 0);
  assert.equal(throttleLeverKnobOffset(0.5, 60), 30);
  assert.equal(throttleLeverKnobOffset(2, 60), 60);
});
