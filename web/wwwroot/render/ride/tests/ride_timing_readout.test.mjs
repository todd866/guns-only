import assert from "node:assert/strict";
import test from "node:test";

import { BLANK_LAP_TIME, rideTimingReadout } from "../ride_timing_readout.js";

test("lap times read as minutes and hundredths", () => {
  const readout = rideTimingReadout({ lapSeconds: 83.456 });
  assert.equal(readout.lap, "1:23.45");
  assert.equal(rideTimingReadout({ lapSeconds: 9.2 }).lap, "0:09.20");
  assert.equal(rideTimingReadout({ lapSeconds: 605.09 }).lap, "10:05.09");
});

test("an absent best or last shows dashes rather than a fake zero", () => {
  const readout = rideTimingReadout({ lapSeconds: 12.0 });
  assert.equal(readout.best, BLANK_LAP_TIME);
  assert.equal(readout.last, BLANK_LAP_TIME);
  assert.equal(readout.delta, null);
});

test("the delta carries its sign, its text and which side of the best it is", () => {
  const ahead = rideTimingReadout({
    lapSeconds: 40, bestLapSeconds: 83.4, deltaSeconds: -1.234,
  });
  assert.equal(ahead.delta.text, "-1.23");
  assert.equal(ahead.delta.ahead, true);

  const behind = rideTimingReadout({
    lapSeconds: 40, bestLapSeconds: 83.4, deltaSeconds: 0.5,
  });
  assert.equal(behind.delta.text, "+0.50");
  assert.equal(behind.delta.ahead, false);
});

test("a spoilt lap is marked so a dirty time is never read as a record", () => {
  assert.equal(rideTimingReadout({ lapSeconds: 10, lapValid: false }).invalid, true);
  assert.equal(rideTimingReadout({ lapSeconds: 10, lapValid: true }).invalid, false);
  assert.equal(rideTimingReadout({ lapSeconds: 10 }).invalid, false);
});

test("a zero best is absent, not a record: the bridge marshals C# null as 0", () => {
  const readout = rideTimingReadout({
    lapSeconds: 19.87, bestLapSeconds: 0, deltaSeconds: 0,
  });

  assert.equal(readout.best, BLANK_LAP_TIME);
  assert.equal(readout.delta, null, "no best means nothing to be ahead of");
});

test("nonsense inputs degrade to dashes instead of throwing", () => {
  const readout = rideTimingReadout({
    lapSeconds: Number.NaN, bestLapSeconds: Infinity, deltaSeconds: Number.NaN,
  });
  assert.equal(readout.lap, BLANK_LAP_TIME);
  assert.equal(readout.best, BLANK_LAP_TIME);
  assert.equal(readout.delta, null);
  assert.equal(rideTimingReadout(undefined).lap, BLANK_LAP_TIME);
});
