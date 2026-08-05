import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AH1G_NOMINAL_ROTOR_RPM,
  cobraRotorcraftHudModel,
  formatCobraRotorcraftStrip,
} from "../cobra_rotorcraft_hud.js";

function modelFixture(overrides = {}) {
  const base = {
    vehicle: {
      ground_speed_mps: 4.1,
      true_airspeed_mps: 4.9,
      vertical_speed_mps: -1.2,
      collective: 0.58,
      rotorcraft: {
        regime: "Normal",
        main_rotor_rpm: 324,
        transmission_limit_fraction: 0.72,
        governor_saturated: false,
        vortex_ring_severity: 0,
        retreating_blade_stall_severity: 0,
        mast_bump_risk: 0,
        main_rotor_clearance_m: 22,
      },
    },
    route_guidance: { current_clearance_m: 24.5 },
    gunner: {
      selected_target_id: "unit.hostile.recoilless.2",
      state: "tracking",
      reason: "ConsentReleased",
      fire_authorized: false,
    },
    ground_war: {
      ammo_remaining: 410, ammo_capacity: 750,
      ammo_bingo: false, ammo_dry: false,
      over_fob: false, fob_range_m: 1_840,
      debrief: { hostile_kills: 1 },
    },
  };
  return {
    ...base,
    ...overrides,
    vehicle: overrides.vehicle === undefined ? base.vehicle : overrides.vehicle,
  };
}

test("rotorcraft strip publishes Nr, torque, collective, speeds, AGL, VSI, and regime", () => {
  const line = formatCobraRotorcraftStrip({
    true_airspeed_mps: 51.44,
    ground_speed_mps: 46.3,
    vertical_speed_mps: 2.54,
    rotorcraft: {
      main_rotor_rpm: 324,
      transmission_torque_nm: 12_400,
      collective_root_pitch_rad: 0.14,
      regime: "EffectiveTranslationalLift",
      governor_saturated: false,
      vortex_ring_severity: 0,
      retreating_blade_stall_severity: 0,
      mast_bump_risk: 0,
      main_rotor_clearance_m: 18,
    },
  }, { current_clearance_m: 42 });

  assert.match(line, /NR324/);
  assert.match(line, /Q12K/);
  assert.match(line, /COL8\.0°/);
  assert.match(line, /TAS100/);
  assert.match(line, /GS90/);
  assert.match(line, /AGL42M/);
  assert.match(line, /VSI\+500/);
  assert.match(line, /ETL/);
});

test("adverse regimes raise explicit caution tokens", () => {
  const line = formatCobraRotorcraftStrip({
    true_airspeed_mps: 5,
    ground_speed_mps: 4,
    vertical_speed_mps: -8,
    rotorcraft: {
      main_rotor_rpm: 280,
      transmission_torque_nm: 18_000,
      collective_root_pitch_rad: 0.2,
      regime: "VortexRingState",
      governor_saturated: true,
      vortex_ring_severity: 0.55,
      retreating_blade_stall_severity: 0.05,
      mast_bump_risk: 0.5,
      main_rotor_clearance_m: 12,
    },
  });

  assert.match(line, /VRS/);
  assert.match(line, /GOV/);
  assert.match(line, /MAST/);
});

test("rotorcraft HUD model reads NR and torque as percentages of authoritative limits", () => {
  const model = cobraRotorcraftHudModel(modelFixture());
  assert.equal(AH1G_NOMINAL_ROTOR_RPM, 324);
  assert.equal(Math.round(model.rotor.nrPct), 100);
  assert.equal(model.rotor.nrLevel, "normal");
  assert.equal(Math.round(model.rotor.torquePct), 72);
  assert.equal(model.rotor.torqueLevel, "normal");
  assert.equal(model.rotor.regime, "NRM");

  const drooped = modelFixture();
  drooped.vehicle.rotorcraft.main_rotor_rpm = 285; // 88% — rotor droop
  drooped.vehicle.rotorcraft.transmission_limit_fraction = 1.04;
  const droopedModel = cobraRotorcraftHudModel(drooped);
  assert.equal(droopedModel.rotor.nrLevel, "warning");
  assert.equal(droopedModel.rotor.torqueLevel, "warning");
  assert.ok(droopedModel.warnings.some((w) => w.text === "LOW ROTOR" && w.level === "warning"));
});

test("hover emphasis engages below translational lift and grades the sink", () => {
  const hover = cobraRotorcraftHudModel(modelFixture());
  assert.equal(hover.hover.hoverEmphasis, true, "4 m/s GS is a hover");
  assert.equal(hover.hover.sinkLevel, "normal");
  assert.ok(Math.abs(hover.hover.aglM - 24.5) < 1e-9, "route guidance clearance is the AGL truth");

  const settling = modelFixture();
  settling.vehicle.vertical_speed_mps = -2.8; // -551 fpm: caution sink, not yet the low-AGL warning
  settling.vehicle.rotorcraft.vortex_ring_severity = 0.24;
  const settlingModel = cobraRotorcraftHudModel(settling);
  assert.equal(settlingModel.hover.sinkLevel, "caution");
  assert.ok(settlingModel.warnings.some((w) => w.text === "SETTLING WITH POWER"));

  const vrs = modelFixture();
  vrs.vehicle.vertical_speed_mps = -6;
  vrs.vehicle.rotorcraft.vortex_ring_severity = 0.55;
  const vrsModel = cobraRotorcraftHudModel(vrs);
  assert.equal(vrsModel.hover.sinkLevel, "warning");
  assert.ok(vrsModel.warnings.some((w) => w.text === "VORTEX RING" && w.level === "warning"));

  const cruise = modelFixture();
  cruise.vehicle.ground_speed_mps = 41;
  const cruiseModel = cobraRotorcraftHudModel(cruise);
  assert.equal(cruiseModel.hover.hoverEmphasis, false);
});

test("gunner line carries the crew truth with target, ammo and FOB context", () => {
  const model = cobraRotorcraftHudModel(modelFixture());
  assert.equal(model.gunner.line, "GUN ON TARGET — HOLD F");
  assert.equal(model.gunner.level, "ready");
  assert.match(model.gunner.detail, /TGT 2\b/);
  assert.match(model.gunner.detail, /AMMO 410/);
  assert.match(model.gunner.detail, /FOB 1\.8 KM/);

  const firing = modelFixture();
  firing.gunner.fire_authorized = true;
  const firingModel = cobraRotorcraftHudModel(firing);
  assert.equal(firingModel.gunner.line, "GUN FIRING");
  assert.equal(firingModel.gunner.level, "firing");

  const dry = modelFixture();
  dry.ground_war = { ...dry.ground_war, ammo_dry: true, over_fob: true };
  const dryModel = cobraRotorcraftHudModel(dry);
  assert.equal(dryModel.gunner.line, "GUN DRY");
  assert.equal(dryModel.gunner.level, "warning");
  assert.match(dryModel.gunner.detail, /FOB PAD · REARM/);
});

test("warnings stay ranked and capped so the lane cannot bar-code", () => {
  const chaos = modelFixture();
  chaos.vehicle.rotorcraft.main_rotor_rpm = 280;
  chaos.vehicle.rotorcraft.vortex_ring_severity = 0.6;
  chaos.vehicle.rotorcraft.mast_bump_risk = 0.6;
  chaos.vehicle.rotorcraft.governor_saturated = true;
  chaos.vehicle.rotorcraft.transmission_limit_fraction = 1.2;
  const model = cobraRotorcraftHudModel(chaos);
  assert.equal(model.warnings.length, 2);
  assert.ok(model.warnings.every((w) => w.level === "warning"));
});

test("model fails closed without vehicle truth", () => {
  assert.equal(cobraRotorcraftHudModel(null), null);
  assert.equal(cobraRotorcraftHudModel({ vehicle: null }), null);
});

test("Hold the Bridge mounts the production HUD with rotorcraft extras", async () => {
  const [html, main, bridge] = await Promise.all([
    readFile(new URL("../../../cobra-lab/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8"),
    readFile(new URL("../../../../CobraWebBridge.cs", import.meta.url), "utf8"),
  ]);

  // The play shell carries a dedicated HUD canvas over the scene; the old DOM text
  // strip (#hud-rotor et al.) is gone rather than lingering as a dead duplicate.
  assert.match(html, /id="hud-canvas"/);
  assert.doesNotMatch(html, /id="hud-rotor"/);
  // One engine: the REAL production HUD plus the cobra adapter, not a fork.
  assert.match(main, /from "\.\.\/hud\.js\?v=\d+"/);
  assert.match(main, /createHud/);
  assert.match(main, /cobraHudState/);
  assert.match(main, /cobraRotorcraftHudModel/);
  assert.match(main, /drawCobraRotorcraftHud/);
  assert.match(bridge, /main_rotor_rpm/);
  assert.match(bridge, /vortex_ring_severity/);
  assert.match(bridge, /governor_saturated/);
  assert.match(bridge, /true_airspeed_mps/);
});
