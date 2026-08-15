import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AH1G_NOMINAL_ROTOR_RPM,
  cobraRotorcraftHudModel,
  drawCobraRotorcraftHud,
  formatAviationAgl,
  formatAviationRange,
  formatCobraRotorcraftStrip,
} from "../cobra_rotorcraft_hud.js";

function recordingHudContext() {
  const textCalls = [];
  let fillStyle = "";
  return {
    textCalls,
    save() {},
    restore() {},
    setTransform() {},
    translate() {},
    rotate() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    strokeRect() {},
    fill() {},
    stroke() {},
    measureText(text) { return { width: String(text).length * 6 }; },
    fillText(text, x, y) { textCalls.push({ text, x, y, fillStyle }); },
    get fillStyle() { return fillStyle; },
    set fillStyle(value) { fillStyle = value; },
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    shadowBlur: 0,
  };
}

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

test("aviation range and AGL formatters use feet and nautical miles", () => {
  assert.equal(formatAviationAgl(22), 72);
  assert.equal(formatAviationRange(506), "1660 FT");
  assert.equal(formatAviationRange(1_840, { style: "nav" }), "1.0 NM");
  assert.equal(formatAviationRange(3_704), "2.0 NM");
});

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
  assert.match(line, /AGL59FT/);
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

  // 100% is the AH-1G transmission limit (Ah1gCobraDefinition: TransmissionLimitW =
  // 1100 shp), and a loaded Cobra hovers in the low nineties. A caution band that opens
  // at 85% is amber in the hover, every sortie, which teaches the pilot to ignore amber.
  // Caution means "about to spend the limit"; the limit itself is the warning.
  const hoverPower = modelFixture();
  hoverPower.vehicle.rotorcraft.transmission_limit_fraction = 0.93;
  assert.equal(cobraRotorcraftHudModel(hoverPower).rotor.torqueLevel, "normal");
  const nearLimit = modelFixture();
  nearLimit.vehicle.rotorcraft.transmission_limit_fraction = 0.98;
  assert.equal(cobraRotorcraftHudModel(nearLimit).rotor.torqueLevel, "caution");
});

test("hover emphasis engages below translational lift and grades the sink", () => {
  const hover = cobraRotorcraftHudModel(modelFixture());
  assert.equal(hover.hover.hoverEmphasis, true, "4 m/s GS is a hover");
  assert.equal(hover.hover.sinkLevel, "normal");
  assert.ok(Math.abs(hover.hover.aglM - 22) < 1e-9, "hub clearance is the RALT truth when known");

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
  assert.match(model.gunner.detail, /FOB 1\.0 NM/);

  const firing = modelFixture();
  firing.gunner.fire_authorized = true;
  const firingModel = cobraRotorcraftHudModel(firing);
  assert.equal(firingModel.gunner.line, "GUN FIRING");
  assert.equal(firingModel.gunner.level, "firing");

  // Tracking is not readiness. GREEN must mean "hold F and it shoots"; a turret that is
  // on the target but has no firing solution painted the same green, which told the pilot
  // the gun was good when the only thing that was good was the tracker.
  const noSolution = modelFixture();
  noSolution.gunner = { ...noSolution.gunner, reason: "NoBallisticSolution" };
  const noSolutionModel = cobraRotorcraftHudModel(noSolution);
  assert.equal(noSolutionModel.gunner.line, "GUN NO BALLISTIC SOLUTION");
  assert.equal(noSolutionModel.gunner.level, "normal");
  const slewing = modelFixture();
  slewing.gunner = { ...slewing.gunner, reason: "SightNotCoincident" };
  assert.equal(cobraRotorcraftHudModel(slewing).gunner.level, "normal");
  const safe = modelFixture();
  safe.gunner = { ...safe.gunner, reason: "WeaponsSafe" };
  assert.equal(cobraRotorcraftHudModel(safe).gunner.level, "caution");

  const dry = modelFixture();
  dry.ground_war = { ...dry.ground_war, ammo_dry: true, over_fob: true };
  const dryModel = cobraRotorcraftHudModel(dry);
  assert.equal(dryModel.gunner.line, "GUN DRY");
  assert.equal(dryModel.gunner.level, "warning");
  assert.match(dryModel.gunner.detail, /FOB PAD · REARM/);
});

test("the gunner's mark becomes a designation the pilot can find in the world", () => {
  // A crew line that says GUN ON TARGET while nothing is marked in the world leaves the
  // pilot flying someone else's solution. The designation carries the target's authority
  // position so the extras can bracket it through the real camera, plus slant range so an
  // out-of-frame target is still quantified.
  const fixture = modelFixture();
  fixture.vehicle.x_m = 0;
  fixture.vehicle.y_m = 120;
  fixture.vehicle.z_m = 0;
  fixture.ground_war.units = [
    { id: "unit.hostile.recoilless.2", faction: "hostile", role: "hard-point", alive: true, x_m: 300, y_m: 40, z_m: 400, home_site_id: "site.iron-bell" },
    { id: "unit.hostile.recoilless.9", faction: "hostile", alive: true, x_m: 10, y_m: 0, z_m: 10 },
  ];
  fixture.ground_war.sites = [{ id: "site.iron-bell", label: "Iron Bell" }];
  const model = cobraRotorcraftHudModel(fixture);
  assert.equal(model.designation.id, "unit.hostile.recoilless.2");
  assert.equal(model.designation.label, "FORTIFIED GUN PIT · IRON BELL");
  assert.equal(model.designation.level, "ready");
  assert.deepEqual(
    [model.designation.worldX, model.designation.worldY, model.designation.worldZ],
    [300, 40, 400],
  );
  // sqrt(300^2 + 80^2 + 400^2) = 506.36 → aviation feet on the crew line
  assert.equal(Math.round(model.designation.rangeM), 506);
  assert.equal(
    model.gunner.detail.includes(formatAviationRange(model.designation.rangeM)),
    true,
    model.gunner.detail,
  );
  assert.match(model.gunner.detail, /TGT FORTIFIED GUN PIT · IRON BELL/);

  const firing = cobraRotorcraftHudModel({
    ...fixture,
    gunner: { ...fixture.gunner, fire_authorized: true },
  });
  assert.equal(firing.designation.level, "firing");
});

test("tactical picture locks an objective and separates the garrison from AA threats", () => {
  const fixture = modelFixture();
  fixture.vehicle.x_m = 0;
  fixture.vehicle.y_m = 100;
  fixture.vehicle.z_m = 0;
  fixture.vehicle.yaw_rad = 0;
  fixture.ground_war.sites = [
    { id: "bridge", label: "Cau Song Ma", owner: "hostile", x_m: 0, y_m: 40, z_m: 2_000 },
    { id: "nearer", label: "Phu Rieng", owner: "hostile", x_m: 200, y_m: 40, z_m: 300 },
  ];
  fixture.ground_war.units = [
    { id: "bridge.garrison", faction: "hostile", role: "hard-point", alive: true,
      home_site_id: "bridge", x_m: 0, y_m: 40, z_m: 2_000 },
    { id: "observer.ridge", faction: "hostile", role: "dshk-site", alive: true,
      home_site_id: "bridge", x_m: 500, y_m: 120, z_m: 1_200 },
  ];
  fixture.gunner.selected_target_id = null;
  const model = cobraRotorcraftHudModel(fixture);
  assert.equal(model.tactical.objective.label, "CAU SONG MA");
  assert.equal(model.tactical.target.label, "GARRISON");
  assert.equal(model.tactical.threats.length, 1);
  assert.equal(model.tactical.threats[0].label, "AA");

  const ctx = recordingHudContext();
  drawCobraRotorcraftHud(ctx, model, {
    width: 1280,
    height: 720,
    projectWorldPoint: () => ({ x: 640, y: 320, inFrame: true }),
  });
  const texts = ctx.textCalls.map((call) => call.text);
  assert.ok(texts.some((text) => /◇ CAU SONG MA .*△ AA 1/.test(text)), texts.join(" | "));
  assert.ok(texts.some((text) => /GARRISON/.test(text)));
  assert.ok(texts.some((text) => /^AA · /.test(text)));
});

test("AA cues survive after the final objective flips while a gun is still alive", () => {
  const fixture = modelFixture();
  Object.assign(fixture.vehicle, { x_m: 0, y_m: 100, z_m: 0, yaw_rad: 0 });
  fixture.ground_war.sites = [
    { id: "bridge", label: "Cau Song Ma", owner: "friendly", x_m: 0, y_m: 40, z_m: 2_000 },
  ];
  fixture.ground_war.units = [
    { id: "observer.ridge", faction: "hostile", role: "dshk-site", alive: true,
      home_site_id: "bridge", x_m: 500, y_m: 120, z_m: 1_200 },
  ];
  const model = cobraRotorcraftHudModel(fixture);
  assert.equal(model.tactical.objective, null);
  assert.equal(model.tactical.target, null);
  assert.equal(model.tactical.threats.length, 1);
  assert.equal(model.tactical.threats[0].label, "AA");
});

test("a dead, absent or unselected target designates nothing at all", () => {
  const dead = modelFixture();
  dead.ground_war.units = [
    { id: "unit.hostile.recoilless.2", faction: "hostile", alive: false, x_m: 1, y_m: 2, z_m: 3 },
  ];
  assert.equal(cobraRotorcraftHudModel(dead).designation, null);

  const absent = modelFixture();
  absent.ground_war.units = [];
  assert.equal(cobraRotorcraftHudModel(absent).designation, null);

  const unselected = modelFixture();
  unselected.gunner = { selected_target_id: null, state: "awaitingtarget", reason: "NoTarget" };
  assert.equal(cobraRotorcraftHudModel(unselected).designation, null);
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

test("battle damage warnings are persistent, honest, prioritized, and capped", () => {
  const damaged = modelFixture({
    battle_damage: {
      engine_damaged: true,
      scas_damaged: true,
      receiving_fire: true,
      threat_tracking: true,
      acquisition_progress: 1,
      tracking_observers: 4,
      seconds_to_next_impact: 0.1,
      recent_bursts: [{ will_hit: true }],
    },
  });
  assert.deepEqual(cobraRotorcraftHudModel(damaged).warnings, [
    { text: "ENGINE OUT", level: "warning" },
    { text: "SCAS OUT", level: "caution" },
  ]);

  damaged.battle_damage.engine_damaged = false;
  assert.deepEqual(cobraRotorcraftHudModel(damaged).warnings, [
    { text: "SCAS OUT", level: "caution" },
    { text: "GROUND FIRE", level: "caution" },
  ]);

  damaged.battle_damage.scas_damaged = false;
  damaged.battle_damage.receiving_fire = false;
  assert.deepEqual(
    cobraRotorcraftHudModel(damaged).warnings,
    [],
    "tracking, acquisition, observers, predicted hits and impact timing are not pilot warnings",
  );
});

test("critical rotor warnings retain the lane ahead of amber damage awareness", () => {
  const damaged = modelFixture({
    battle_damage: { engine_damaged: true, scas_damaged: true, receiving_fire: true },
  });
  damaged.vehicle.rotorcraft.main_rotor_rpm = 280;
  assert.deepEqual(cobraRotorcraftHudModel(damaged).warnings, [
    { text: "ENGINE OUT", level: "warning" },
    { text: "LOW ROTOR", level: "warning" },
  ]);
});

test("active ground fire names the source clock direction when burst truth is available", () => {
  const fixture = modelFixture({
    battle_damage: {
      active_observer_id: "observer.east",
      receiving_fire: true,
      recent_bursts: [{
        observer_id: "observer.east",
        source_x_m: 1_000,
        source_z_m: 0,
      }],
    },
  });
  fixture.vehicle.x_m = 0;
  fixture.vehicle.z_m = 0;
  fixture.vehicle.yaw_rad = 0; // north; east is three o'clock
  assert.deepEqual(cobraRotorcraftHudModel(fixture).warnings, [
    { text: "FIRE 3 O'CLOCK", level: "caution" },
  ]);
});

test("damage annunciations draw in their warning and caution colors", () => {
  const model = cobraRotorcraftHudModel(modelFixture({
    battle_damage: { engine_damaged: true, scas_damaged: true, receiving_fire: false },
  }));
  const ctx = recordingHudContext();
  drawCobraRotorcraftHud(ctx, model, { width: 1280, height: 720 });

  const engine = ctx.textCalls.find((call) => call.text === "ENGINE OUT");
  const scas = ctx.textCalls.find((call) => call.text === "SCAS OUT");
  assert.equal(engine?.fillStyle, "#ff465d");
  assert.equal(scas?.fillStyle, "#ffb020");
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
  // One engine: the REAL production HUD plus authority-backed Cobra instruments on the same
  // combiner, not a fork or a stale DOM strip.
  assert.match(main, /from "\.\.\/hud\.js\?v=\d+"/);
  assert.match(main, /createHud/);
  assert.match(main, /cobraHudState/);
  assert.match(main, /cobraRotorcraftHudModel/);
  assert.match(main, /drawCobraRotorcraftHud/);
  assert.ok(
    main.indexOf("hud.draw(") < main.indexOf("drawCobraRotorcraftHud("),
    "rotorcraft instruments must paint after the shared HUD commits its combiner surface",
  );
  assert.match(bridge, /main_rotor_rpm/);
  assert.match(bridge, /vortex_ring_severity/);
  assert.match(bridge, /governor_saturated/);
  assert.match(bridge, /true_airspeed_mps/);
});
