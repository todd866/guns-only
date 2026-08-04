import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COARSE_CAS_KTS,
  COARSE_HOLD_RATE_PER_SECOND,
  COARSE_LEVER_FLOOR_ABOVE_TRIM,
  FINE_CAS_KTS,
  FINE_HOLD_RATE_PER_SECOND,
  FINE_LEVER_CEILING_ABOVE_TRIM,
  REFERENCE_APPROACH_TRIM_LEVER,
  fineBlend,
  relativeThrottleHoldRatePerSecond,
  relativeThrottleUiHoldRatePerSecond,
} from "../throttle_rate_schedule.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");

test("low CAS and low lever are fully fine", () => {
  assert.equal(fineBlend(140, 0.08), 1);
  assert.ok(Math.abs(relativeThrottleHoldRatePerSecond(140, 0.08) - FINE_HOLD_RATE_PER_SECOND) < 1e-12);
});

test("combat CAS or high lever stays coarse", () => {
  assert.equal(fineBlend(320, 0.08), 0);
  assert.equal(fineBlend(140, 0.50), 0);
  assert.equal(relativeThrottleHoldRatePerSecond(320, 0.08), COARSE_HOLD_RATE_PER_SECOND);
  assert.equal(relativeThrottleHoldRatePerSecond(140, 0.50), COARSE_HOLD_RATE_PER_SECOND);
});

test("UI rate divides by lever stop", () => {
  const physical = relativeThrottleHoldRatePerSecond(140, 0.08);
  const ui = relativeThrottleUiHoldRatePerSecond(140, 0.08, 1.35);
  assert.ok(Math.abs(ui - physical / 1.35) < 1e-12);
});

test("the fine band travels with the airframe's approach trim", () => {
  // Sabre finals: lever at its 0.28-0.38 approach trim must be fully fine when the trim
  // is supplied, while the trim-blind reference band is nearly inert there.
  assert.equal(fineBlend(140, 0.33, 0.33), 1);
  assert.ok(fineBlend(140, 0.33) < 0.1);
  assert.ok(Math.abs(
    relativeThrottleHoldRatePerSecond(140, 0.33, 0.33) - FINE_HOLD_RATE_PER_SECOND) < 1e-12);
});

test("unknown approach trim falls back to the reference band", () => {
  // The kernel publishes trim 0.0 off the approach; undefined/NaN mean the same here.
  for (const trim of [undefined, 0, Number.NaN]) {
    assert.equal(fineBlend(140, 0.275, trim), fineBlend(140, 0.275));
  }
  assert.equal(
    fineBlend(140, 0.275, REFERENCE_APPROACH_TRIM_LEVER), fineBlend(140, 0.275));
});

test("schedule constants match sim/ThrottleInputSchedule.cs", async () => {
  const csharp = await readFile(path.join(ROOT, "sim/ThrottleInputSchedule.cs"), "utf8");
  const csharpConst = (name) => {
    const match = csharp.match(
      new RegExp(`const double ${name} = ([0-9][0-9_.]*);`));
    assert.ok(match, `sim/ThrottleInputSchedule.cs must define literal const ${name}`);
    return Number(match[1].replaceAll("_", ""));
  };
  assert.equal(csharpConst("CoarseHoldRatePerSecond"), COARSE_HOLD_RATE_PER_SECOND);
  assert.equal(csharpConst("FineHoldRatePerSecond"), FINE_HOLD_RATE_PER_SECOND);
  assert.equal(csharpConst("FineCasKts"), FINE_CAS_KTS);
  assert.equal(csharpConst("CoarseCasKts"), COARSE_CAS_KTS);
  assert.equal(csharpConst("ReferenceApproachTrimLever"), REFERENCE_APPROACH_TRIM_LEVER);
  assert.equal(csharpConst("FineLeverCeilingAboveTrim"), FINE_LEVER_CEILING_ABOVE_TRIM);
  assert.equal(csharpConst("CoarseLeverFloorAboveTrim"), COARSE_LEVER_FLOOR_ABOVE_TRIM);
});
