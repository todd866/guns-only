import assert from "node:assert/strict";
import test from "node:test";

import {
  COBRA_FORMATION_SPACING_M,
  createCobraFormationRadioPresenter,
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

test("Ember Lead breaks away when the attack act replaces ingress", () => {
  const player = { x_m: 70, y_m: 148, z_m: 250 };
  assert.ok(cobraFormationLeadPose(authority("ingress"), player));
  assert.equal(cobraFormationLeadPose(authority("engage"), player), null);
  assert.equal(cobraFormationLeadPose(authority("hold"), player), null);
  assert.equal(cobraFormationLeadPose(authority("rtb"), player), null);
});

test("formation calls explain the turn and the DShK dogleg", () => {
  const takeoff = cobraFormationRadio(authority(), { x_m: 0, z_m: 0 });
  const turn = cobraFormationRadio(authority(), { x_m: 0, z_m: 150 });
  const dogleg = cobraFormationRadio(authority(), { x_m: 0, z_m: 340 });
  assert.equal(takeoff.text, "Dash 2, lift. Follow Lead.");
  assert.equal(turn.text, "Turning. Stay with me.");
  assert.equal(dogleg.text, "DShK ahead. Ridge masks us.");
  assert.equal(cobraFormationRadio(authority("ingress"), { x_m: 0, z_m: 0 }).text,
    "Iron Bell ahead. Stay low.");
  assert.equal(cobraFormationRadio(authority("engage"), { x_m: 0, z_m: 0 }).text,
    "Bridge fight. Lead breaking.");
  assert.equal(cobraFormationRadio(authority("rtb"), { x_m: 0, z_m: 0 }), null);
});

test("formation calls are one-shot transmissions, not permanent state banners", () => {
  const presenter = createCobraFormationRadioPresenter({ holdSeconds: 3 });
  const first = cobraFormationRadio(authority(), { x_m: 0, z_m: 0 });
  assert.equal(presenter.update(first, 10), first);
  assert.equal(presenter.update(first, 12.99), first);
  assert.equal(presenter.update(first, 13), null, "the same state expires");
  assert.equal(presenter.update(first, 20), null, "polling cannot resurrect a seen call");

  const turn = cobraFormationRadio(authority(), { x_m: 0, z_m: 150 });
  assert.equal(presenter.update(turn, 20), turn, "a new sequence transmits once");
  presenter.reset();
  assert.equal(presenter.update(first, 30), first, "a new sortie resets the radio slate");
});
