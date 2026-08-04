import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatCobraRotorcraftStrip } from "../cobra_rotorcraft_hud.js";

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

test("Hold the Bridge surfaces the rotorcraft strip from authoritative vehicle state", async () => {
  const [html, main, bridge] = await Promise.all([
    readFile(new URL("../../../cobra-lab/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8"),
    readFile(new URL("../../../../CobraWebBridge.cs", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="hud-rotor"/);
  assert.match(main, /formatCobraRotorcraftStrip/);
  assert.match(main, /hud-rotor/);
  assert.match(bridge, /main_rotor_rpm/);
  assert.match(bridge, /vortex_ring_severity/);
  assert.match(bridge, /governor_saturated/);
  assert.match(bridge, /true_airspeed_mps/);
});
