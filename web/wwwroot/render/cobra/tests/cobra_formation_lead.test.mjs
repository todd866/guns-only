import assert from "node:assert/strict";
import test from "node:test";

import {
  COBRA_FORMATION_SPACING_M,
  cobraFormationLeadPose,
  cobraFormationRadio,
} from "../cobra_formation_lead.js";

function authority(act = "depart") {
  return {
    mission_act: act,
    ground_war: { fob: { x_m: 0, y_m: 100, z_m: 0 } },
    path_gates: [
      { east_m: 0, up_m: 140, north_m: 140, active: true },
      { east_m: 90, up_m: 150, north_m: 280, active: false },
      { east_m: 260, up_m: 155, north_m: 360, active: false },
    ],
  };
}

test("Ember Lead occupies the exact gate polyline one formation interval ahead", () => {
  const pose = cobraFormationLeadPose(authority(), { x_m: 0, y_m: 102, z_m: 0 });
  assert.ok(pose);
  assert.equal(pose.callsign, "EMBER 1");
  assert.ok(pose.z_m >= 139 && pose.z_m <= 281);
  assert.ok(pose.x_m >= 0 && pose.x_m < 91);
  assert.ok(pose.y_m >= 140);
  assert.ok(Number.isFinite(pose.yaw_rad));
  assert.equal(COBRA_FORMATION_SPACING_M, 150);
});

test("Ember Lead advances through the dogleg as Dash 2 follows", () => {
  const early = cobraFormationLeadPose(authority(), { x_m: 0, y_m: 140, z_m: 100 });
  const later = cobraFormationLeadPose(authority(), { x_m: 70, y_m: 148, z_m: 250 });
  assert.ok(later.x_m > early.x_m);
  assert.ok(later.z_m > early.z_m);
});

test("formation calls explain the turn and the DShK dogleg", () => {
  const takeoff = cobraFormationRadio(authority(), { x_m: 0, z_m: 0 });
  const turn = cobraFormationRadio(authority(), { x_m: 0, z_m: 150 });
  const dogleg = cobraFormationRadio(authority(), { x_m: 0, z_m: 340 });
  assert.match(takeoff.text, /follow me/i);
  assert.match(turn.text, /turning/i);
  assert.match(dogleg.text, /DShK.*dogleg/i);
  assert.equal(cobraFormationRadio(authority("rtb"), { x_m: 0, z_m: 0 }), null);
});
