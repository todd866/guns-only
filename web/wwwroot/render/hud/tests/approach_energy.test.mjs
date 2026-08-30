import test from "node:test";
import assert from "node:assert/strict";
import {
  approachEnergyCue,
  approachEnergyPanelY,
  approachPowerFallback,
  formatApproachEnergyLine,
} from "../approach_energy.js";
import { fighterHudLayout } from "../fighter_layout.js";
import { sortiePowerCommand } from "../sortie_power.js";

test("energy cue requires active valid guidance", () => {
  assert.equal(approachEnergyCue({}), null);
  assert.equal(approachEnergyCue({
    approach_guidance_active: true,
    approach_valid: false,
  }), null);
});

test("energy cue projects next-gate targets and errors", () => {
  const cue = approachEnergyCue({
    approach_guidance_active: true,
    approach_valid: true,
    approach_next_label: "STABILISE",
    approach_next_alt_m: 344,
    approach_next_tas_mps: 90,
    approach_alt_error_m: 40,
    approach_tas_error_mps: -8,
  });
  assert.equal(cue.label, "STABILISE");
  assert.equal(cue.targetAltM, 344);
  assert.equal(cue.altErrorM, 40);
  assert.equal(cue.tasErrorMps, -8);
});

test("conventional F-22 pattern keeps the prose-and-numbers panel hidden", () => {
  assert.equal(approachEnergyCue({
    approach_guidance_active: true,
    approach_valid: true,
    conventional_rtb_pattern_active: true,
    approach_next_alt_m: 365.8,
    approach_next_tas_mps: 110,
    approach_alt_error_m: 20,
    approach_tas_error_mps: 3,
  }), null);
});

test("power fallback yields to sortie schedule", () => {
  assert.equal(sortiePowerCommand({
    sortie_valid: true,
    sortie_power_01: 0.7,
    approach_guidance_active: true,
    approach_valid: true,
    approach_power_01: 0.2,
  }), 0.7);
  assert.equal(approachPowerFallback({
    sortie_valid: true,
    approach_guidance_active: true,
    approach_valid: true,
    approach_power_01: 0.2,
  }), null);
  assert.equal(sortiePowerCommand({
    approach_guidance_active: true,
    approach_valid: true,
    approach_power_01: 0.65,
  }), 0.65);
});

test("approach line uses aviation units consistently", () => {
  const line = formatApproachEnergyLine({
    label: "STABILISE",
    targetAltM: 344,
    targetTasMps: 90,
    altErrorM: 40,
    tasErrorMps: -8,
  });
  assert.match(line, /1129 FT/);
  assert.match(line, /175 KTAS/);
  assert.match(line, /HIGH 131 FT/);
  assert.match(line, /SLOW 16 KTAS/);
  assert.doesNotMatch(line, /\dm\b/);
});

test("approach panel occupies the warning-to-weapon lane without touching heading", () => {
  for (const viewport of [
    { width: 844, height: 390, touchMode: true },
    { width: 800, height: 400, touchMode: false },
  ]) {
    const layout = fighterHudLayout(viewport);
    const y = approachEnergyPanelY(layout, 28);
    assert.ok(Number.isFinite(y));
    assert.ok(y > layout.heading.bottom);
    assert.ok(y >= layout.warningY + 16);
    assert.ok(y + 28 <= layout.weaponCueY - 8);
  }
});

test("approach panel suppresses itself when no HUD lane can contain it", () => {
  const layout = fighterHudLayout({
    width: 568,
    height: 320,
    touchMode: true,
  });
  assert.equal(approachEnergyPanelY(layout, 28), null);
});
