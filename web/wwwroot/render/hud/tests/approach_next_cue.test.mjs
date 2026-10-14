import test from "node:test";
import assert from "node:assert/strict";
import {
  approachNextCue,
  approachSteerGate,
  formatCueDistanceNm,
  quantiseTurnDeg,
} from "../approach_next_cue.js";

const gate = (eastM, northM, active = false) => ({ eastM, northM, active });

const base = Object.freeze({
  conventional_rtb_pattern_active: true,
  approach_guidance_active: true,
  approach_valid: true,
  approach_next_label: "PATTERN ENTRY",
  approach_track_required_m: 11_850,
  approach_next_alt_m: 457,
  approach_alt_error_m: 3_200,
  approach_energy_state_code: 3,
  approach_energy_target_ktas: 300,
  approach_energy_tolerance_ktas: 25,
  px: 0,
  pz: 0,
  heading_deg: 0,
});

test("turns quantise like a road-nav arrow", () => {
  assert.equal(quantiseTurnDeg(5), 0);
  assert.equal(quantiseTurnDeg(-40), -45);
  assert.equal(quantiseTurnDeg(80), 90);
  assert.equal(quantiseTurnDeg(-130), -135);
  assert.equal(quantiseTurnDeg(170), 180);
  assert.equal(quantiseTurnDeg(-175), -180);
  assert.equal(quantiseTurnDeg(Number.NaN), null);
});

test("the arrow steers past chevrons the jet is already on top of", () => {
  const gates = [gate(0, 300, true), gate(0, 900), gate(1_800, 900), gate(3_000, 900)];
  assert.deepEqual(approachSteerGate(gates, 0, 0), gates[2]);
  assert.deepEqual(approachSteerGate(gates.slice(0, 2), 0, 0), gates[1],
    "with nothing beyond the look-ahead, the last authored gate is the target");
});

test("distance reads as one decimal in NM, dropping the leading zero under a mile", () => {
  assert.equal(formatCueDistanceNm(11_850), "6.4");
  assert.equal(formatCueDistanceNm(1_700), ".9");
  assert.equal(formatCueDistanceNm(40_000), "22");
  assert.equal(formatCueDistanceNm(-1), null);
});

test("ingress row: right turn, INITIAL, high so descend, fast", () => {
  const cue = approachNextCue(base, [gate(100, 350, true), gate(2_000, 600), gate(3_200, 300)]);
  assert.equal(cue.label, "INITIAL", "PATTERN ENTRY chevrons end on the initial fix");
  assert.equal(cue.distance, "6.4");
  assert.equal(cue.arrowDeg, 90);
  assert.equal(cue.targetFt, 1_500);
  assert.equal(cue.altMark, 1, "3,200 m high must ask for a descent");
  assert.equal(cue.energy.word, "FAST");
});

test("on height inside tolerance shows no climb/descend mark", () => {
  const cue = approachNextCue({ ...base, approach_alt_error_m: 30 }, [gate(0, 3_000, true)]);
  assert.equal(cue.altMark, 0);
  assert.equal(cue.arrowDeg, 0);
  const low = approachNextCue({ ...base, approach_alt_error_m: -90 }, [gate(0, 3_000, true)]);
  assert.equal(low.altMark, -1, "300 ft low asks for a climb");
});

test("the row fails closed without conventional pattern authority", () => {
  assert.equal(approachNextCue({ ...base, approach_valid: false }, []), null);
  assert.equal(approachNextCue({ ...base, conventional_rtb_pattern_active: false }, []), null);
  assert.equal(approachNextCue({ ...base, approach_track_required_m: null }, []), null);
});

test("a missing ownship pose keeps the row but draws no turn", () => {
  const cue = approachNextCue({ ...base, px: null }, [gate(0, 3_000, true)]);
  assert.equal(cue.turnDeg, null);
  assert.equal(cue.arrowDeg, null);
});
