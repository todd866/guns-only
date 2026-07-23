import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mobileRollCommand,
  shouldTransmitAnalogRoll,
  smoothTilt,
  StableTiltCalibration,
  TiltSensorWatchdog,
} from "../mobile_tilt_input.js";

test("phone roll has a real neutral zone and progressive authority", () => {
  // Build 73 softened defaults after the first phone sortie: deadzone 5 deg, full scale 38 deg,
  // exponent 2.0. Small tilts must produce genuinely small commands.
  assert.equal(mobileRollCommand(0), 0);
  assert.equal(mobileRollCommand(5), 0);
  assert.equal(mobileRollCommand(-5), 0);
  assert.ok(mobileRollCommand(10) > 0.015 && mobileRollCommand(10) < 0.03);
  assert.ok(mobileRollCommand(20) > 0.18 && mobileRollCommand(20) < 0.23);
  assert.ok(mobileRollCommand(30) > 0.5 && mobileRollCommand(30) < 0.65);
  assert.equal(mobileRollCommand(38), 1);
  assert.equal(mobileRollCommand(45), 1);
  assert.equal(mobileRollCommand(-38), -1);
});

test("phone roll curve is odd, monotonic, and rejects invalid sensor data", () => {
  // Angles start above the 5-degree deadzone: inside it both sides are exactly zero and
  // strict equality distinguishes -0.
  for (const angle of [6, 8, 12, 18, 24, 30]) {
    assert.equal(mobileRollCommand(-angle), -mobileRollCommand(angle));
  }
  assert.equal(mobileRollCommand(undefined), 0);
  assert.equal(mobileRollCommand(Number.NaN), 0);
});

test("bridge suppression never swallows the transition to exact neutral", () => {
  // Sub-noise deltas stay suppressed so sensor jitter cannot spam the WASM bridge...
  assert.equal(shouldTransmitAnalogRoll(0.00121, 0), false);
  assert.equal(shouldTransmitAnalogRoll(0.5015, 0.5), false);
  assert.equal(shouldTransmitAnalogRoll(0.504, 0.5), true);
  // ...but the return to EXACTLY zero always transmits while a nonzero command is latched.
  // A 4.5-degree tilt sends about 0.00121; entering the 4-degree neutral zone then yields 0,
  // which the old deadband suppressed — the simulation kept RollControl = 0.00121 forever and
  // the G-LOC interlock (|roll| <= 1e-9) never released.
  assert.equal(shouldTransmitAnalogRoll(0, 0.00121), true);
  assert.equal(shouldTransmitAnalogRoll(0, -0.00121), true);
  assert.equal(shouldTransmitAnalogRoll(0, 0.5), true);
  // Zero-to-zero stays quiet, and invalid values never cross the bridge.
  assert.equal(shouldTransmitAnalogRoll(0, 0), false);
  assert.equal(shouldTransmitAnalogRoll(Number.NaN, 0.5), false);
});

test("production analog roll wires the zero-transition-safe suppression", async () => {
  const source = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
  assert.match(source, /if \(shouldTransmitAnalogRoll\(command, lastAnalogRollCommand\)\) \{/,
    "setAnalogRollCommand must gate the bridge through shouldTransmitAnalogRoll");
  assert.doesNotMatch(source, /Math\.abs\(command - lastAnalogRollCommand\) >= 0\.002/,
    "the raw deadband that suppressed the final zero transition must not return");
});

function sample(roll, pitch = 42, angle = 0) {
  return { roll, pitch, angle };
}

test("tilt calibration waits for a stable time window and rejects isolated noise", () => {
  const calibration = new StableTiltCalibration();
  assert.equal(calibration.add(sample(10.0), 0), null);
  assert.equal(calibration.add(sample(10.2), 75), null);
  assert.equal(calibration.add(sample(22.0, 18), 150), null,
    "one large sensor event must not define neutral");
  assert.equal(calibration.add(sample(9.9), 225), null);
  assert.equal(calibration.add(sample(10.1), 300), null);
  const centre = calibration.add(sample(10.0), 375);
  assert.ok(centre);
  assert.ok(Math.abs(centre.roll - 10.05) < 0.051);
  assert.ok(Math.abs(centre.pitch - 42) < 0.001);
});

test("tilt calibration stays pending while the phone is moving", () => {
  const calibration = new StableTiltCalibration();
  for (let index = 0; index <= 8; index += 1) {
    assert.equal(calibration.add(sample(index * 0.75), index * 50), null);
  }
});

test("tilt calibration resets across screen rotation and handles angular wrap", () => {
  const calibration = new StableTiltCalibration();
  for (let index = 0; index < 4; index += 1) {
    calibration.add(sample(12, 40, 0), index * 75);
  }
  assert.equal(calibration.add(sample(179.8, 45, 90), 300), null);
  for (let index = 1; index <= 4; index += 1) {
    const roll = index % 2 === 0 ? -179.8 : 179.8;
    const result = calibration.add(sample(roll, 45, 90), 300 + index * 75);
    if (index < 4) assert.equal(result, null);
    else assert.ok(Math.abs(Math.abs(result.roll) - 180) < 0.3);
  }
});

test("time-based tilt filtering feels the same at different sensor rates", () => {
  const responseAfter = (hz, seconds = 0.5) => {
    let value = 0;
    for (let index = 0; index < hz * seconds; index += 1) {
      value = smoothTilt(value, 20, 1 / hz);
    }
    return value;
  };
  const at20Hz = responseAfter(20);
  assert.ok(Math.abs(at20Hz - responseAfter(60)) < 1e-9);
  assert.ok(Math.abs(at20Hz - responseAfter(120)) < 1e-9);
  assert.equal(smoothTilt(7, null, 1 / 60), 7);
});

class FakeTimers {
  constructor() {
    this.now = 0;
    this.sequence = 0;
    this.pending = new Map();
  }

  set = (callback, delayMs) => {
    const id = ++this.sequence;
    this.pending.set(id, { callback, at: this.now + delayMs });
    return id;
  };

  clear = (id) => this.pending.delete(id);

  advance(milliseconds) {
    const finish = this.now + milliseconds;
    while (true) {
      const next = [...this.pending.entries()]
        .filter(([, timer]) => timer.at <= finish)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      this.pending.delete(id);
      this.now = timer.at;
      timer.callback();
    }
    this.now = finish;
  }
}

test("tilt watchdog neutralizes stale input and falls back only if recovery fails", () => {
  const timers = new FakeTimers();
  const events = [];
  const watchdog = new TiltSensorWatchdog({
    onStale: () => events.push("stale"),
    onFallback: () => events.push("fallback"),
    setTimer: timers.set,
    clearTimer: timers.clear,
  });

  watchdog.sample();
  timers.advance(449);
  assert.deepEqual(events, []);
  timers.advance(1);
  assert.deepEqual(events, ["stale"]);
  timers.advance(2500);
  watchdog.sample();
  watchdog.recovered();
  timers.advance(500);
  assert.deepEqual(events, ["stale", "stale"],
    "only a completed stable recovery cancels the old fallback and rearms liveness");
  watchdog.stop();
  timers.advance(4000);
  assert.deepEqual(events, ["stale", "stale"]);

  watchdog.sample();
  timers.advance(3450);
  assert.deepEqual(events, ["stale", "stale", "stale", "fallback"]);
});

test("sparse sensor samples cannot postpone the absolute recovery deadline", () => {
  const timers = new FakeTimers();
  const events = [];
  const watchdog = new TiltSensorWatchdog({
    onStale: () => events.push(`stale@${timers.now}`),
    onFallback: () => events.push(`fallback@${timers.now}`),
    setTimer: timers.set,
    clearTimer: timers.clear,
  });

  watchdog.sample();
  for (let index = 0; index < 5; index += 1) {
    timers.advance(600);
    watchdog.sample();
  }
  timers.advance(449);
  assert.equal(events.some((event) => event.startsWith("fallback")), false);
  timers.advance(1);
  assert.equal(events.find((event) => event.startsWith("fallback")), "fallback@3450");
});

test("production mobile input wires stable calibration, time-based filtering, and fail-neutral", async () => {
  const source = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
  assert.match(source, /const tiltCalibration = new StableTiltCalibration\(\)/);
  assert.match(source, /const tiltWatchdog = new TiltSensorWatchdog/);
  assert.match(source, /tiltWatchdog\.sample\(\)/);
  assert.match(source, /tiltWatchdog\.beginRecovery\(\)/);
  assert.match(source, /tiltWatchdog\.recovered\(\)/);
  assert.match(source, /const centre = tiltCalibration\.add\(sample, timestampMs\)/);
  assert.match(source, /filteredRoll = smoothTilt\(filteredRoll, roll, deltaSeconds\)/);
  assert.match(source, /if \(suspended \|\| frozen \|\| document\.hidden/);
  assert.match(source, /handleOrientationStale[\s\S]*?awaitFreshCentre\("TILT SIGNAL LOST/);
  assert.match(source, /window\.addEventListener\("blur", \(\) => \{[\s\S]*?releaseTiltAxes\(\)/);
  const resetBody = source.match(/resetMobileInput = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  assert.doesNotMatch(resetBody, /tiltWatchdog\.stop\(\)/,
    "ordinary pause input clearing must leave the liveness watchdog armed");
  assert.match(source, /if \(pauseReasons\.size > 0\) \{[\s\S]*?releaseTiltAxes\(\)/,
    "paused overlays must keep monitoring without restoring actuator input");
});
