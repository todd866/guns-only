import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkDesktopReceipt, createGunWindowTracker } from "./first-merge-desktop-acceptance.mjs";

function passingReceipt() {
  return {
    pilot: "human", launch: { autoAim: true, lesson: "O1" },
    contactS: 0.2, firstWindowS: 0.2, coarseWindowS: 2,
    coarseWindows: [{ startS: 0.2, endS: 2.2 }],
    firstHitS: 3, killS: 4, d1S: 7, errors: [],
  };
}

test("four disconnected half-second windows do not count as two seconds", () => {
  const r = { ...passingReceipt(), firstWindowS: 0, coarseWindowS: 2, firstHitS: 10,
    coarseWindows: [0, 2, 4, 6].map((startS) => ({ startS, endS: startS + 0.5 })) };
  assert.throws(() => checkDesktopReceipt(r), /gun window/);
});

test("a hit before the first short window does not waive the window", () => {
  const r = { ...passingReceipt(), firstHitS: 0.1, coarseWindowS: 0.5,
    coarseWindows: [{ startS: 0.2, endS: 0.7 }] };
  assert.throws(() => checkDesktopReceipt(r), /gun window/);
});

test("a hit between short windows does not complete either interval", () => {
  const r = { ...passingReceipt(), firstWindowS: 0, firstHitS: 0.75, coarseWindowS: 1,
    coarseWindows: [{ startS: 0, endS: 0.5 }, { startS: 1, endS: 1.5 }] };
  assert.throws(() => checkDesktopReceipt(r), /gun window/);
});

test("a continuous window after the deadline does not qualify", () => {
  const r = { ...passingReceipt(), firstWindowS: 31, firstHitS: 32,
    coarseWindows: [{ startS: 31, endS: 33 }] };
  assert.throws(() => checkDesktopReceipt(r), /gun window/);
});

test("a hit inside one continuous short window qualifies", () => {
  const r = { ...passingReceipt(), firstHitS: 0.6, coarseWindowS: 0.5,
    coarseWindows: [{ startS: 0.2, endS: 0.7 }] };
  assert.doesNotThrow(() => checkDesktopReceipt(r));
});

test("tracker resets on cone exit and missing cues instead of accumulating fragments", () => {
  const tracker = createGunWindowTracker();
  for (const startS of [0, 2, 4, 6]) {
    tracker.sample(startS, true);
    tracker.sample(startS + 0.25, true);
    tracker.sample(startS + 0.5, true);
    tracker.sample(startS + 0.6, startS === 2 ? null : false);
  }
  const result = tracker.result();
  assert.equal(result.coarseWindowS, 0.5);
  assert.equal(result.coarseWindows.length, 4);
  assert.throws(() => checkDesktopReceipt({ ...passingReceipt(), ...result, firstHitS: 10 }), /gun window/);
});

test("tracker accepts a later continuous two-second interval", () => {
  const tracker = createGunWindowTracker();
  for (const [t, coarse] of [[0, true], [0.25, true], [0.5, true], [1, false]]) {
    tracker.sample(t, coarse);
  }
  for (let t = 2; t <= 4; t += 0.25) tracker.sample(t, true);
  assert.equal(tracker.result().coarseWindowS, 2);
  assert.doesNotThrow(() => checkDesktopReceipt({ ...passingReceipt(), ...tracker.result(), firstHitS: 5 }));
});

test("two in-cone samples separated by an observation gap are not a sustained window", () => {
  const tracker = createGunWindowTracker();
  tracker.sample(0, true);
  tracker.sample(10, true);
  assert.equal(tracker.result().coarseWindowS, 0);
  assert.throws(() => checkDesktopReceipt({ ...passingReceipt(), ...tracker.result() }), /gun window/);
});

test("tracker gives no credit for unsampled time beyond the deadline", () => {
  const tracker = createGunWindowTracker();
  tracker.sample(29, true);
  tracker.sample(29.25, true);
  tracker.sample(29.5, true);
  tracker.sample(31, true);
  assert.deepEqual(tracker.result(), {
    coarseWindowS: 0.5, coarseWindows: [{ startS: 29, endS: 29.5 }],
  });
});

for (const [name, windows, hit, passes] of [
  ["exactly two seconds at the deadline", [{ startS: 28, endS: 30 }], 31, true],
  ["short by one millisecond", [{ startS: 28, endS: 29.999 }], 31, false],
  ["hit at the last in-cone sample", [{ startS: 1, endS: 1.5 }], 1.5, true],
  ["hit at the first sample without a preceding window", [{ startS: 1, endS: 1 }], 1, false],
  ["hit just after the interval", [{ startS: 1, endS: 1.5 }], 1.501, false],
  ["no windows", [], 1, false],
]) {
  test(name, () => {
    const check = () => checkDesktopReceipt({ ...passingReceipt(), coarseWindows: windows, firstHitS: hit });
    if (passes) assert.doesNotThrow(check);
    else assert.throws(check, /gun window/);
  });
}

test("an integrated receipt passes", () => {
  assert.doesNotThrow(() => checkDesktopReceipt(passingReceipt()));
});

test("missing gimbal telemetry fails an otherwise passing receipt", () => {
  const r = passingReceipt();
  delete r.launch.autoAim;
  assert.throws(() => checkDesktopReceipt(r), /gimbal telemetry/);
});

test("absent gimbal telemetry cannot turn the browser gate into TODO or skip", () => {
  const source = readFileSync(new URL("./first-merge-desktop-receipt.test.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:todo|skip)\s*\(/);
  assert.match(source, /checkDesktopReceipt\(r\)/);
});

for (const [name, change, message] of [
  ["lost contact", { contactS: null }, /target bracket/],
  ["late contact", { contactS: 21 }, /target bracket/],
  ["no hit", { firstHitS: null }, /physical hit/],
  ["late hit", { firstHitS: 46 }, /physical hit/],
  ["missing D1", { d1S: null }, /hand-over/],
  ["page errors", { errors: ["TypeError: broken HUD"] }, /TypeError/],
]) {
  test(`${name} fails the integrated gate`, () => {
    assert.throws(() => checkDesktopReceipt({ ...passingReceipt(), ...change }), message);
  });
}
