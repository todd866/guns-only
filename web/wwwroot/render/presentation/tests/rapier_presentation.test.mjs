import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createRapier,
  createRapierDispersedStrip,
} from "../../scene/scene_builders.js";

test("Rapier uses its own canopy-free 13 m by 7.35 m interceptor silhouette", () => {
  const rapier = createRapier();
  const size = new THREE.Box3().setFromObject(rapier).getSize(new THREE.Vector3());
  const wingSize = new THREE.Box3()
    .setFromObject(rapier.getObjectByName("RAPIER_7P35M_PLANFORM"))
    .getSize(new THREE.Vector3());

  assert.equal(rapier.name, "RAPIER_HIGH_ALTITUDE_INTERCEPTOR_SURROGATE");
  assert.ok(Math.abs(wingSize.x - 7.35) < 0.12,
    `bevelled visual span ${wingSize.x.toFixed(3)} m must remain within 12 cm of the 7.35 m contract`);
  assert.ok(size.x < 7.5,
    "canted fins and detail must remain inside the bounded flight-model silhouette");
  assert.ok(Math.abs(size.z - 13) < 0.02,
    `visual length ${size.z.toFixed(3)} m must match the 13 m flight-model contract`);
  assert.deepEqual(rapier.userData.dimensionsM, { length: 13, span: 7.35 });
  assert.ok(rapier.getObjectByName("RAPIER_13M_SENSOR_FUSELAGE"));
  assert.ok(rapier.getObjectByName("RAPIER_OPAQUE_ESCAPE_POD_SPINE"));
  assert.ok(rapier.getObjectByName("RAPIER_SINGLE_BLENDED_INTAKE"));
  assert.ok(rapier.getObjectByName("RAPIER_SINGLE_EXHAUST"));
  assert.equal(rapier.children.some((child) => /canopy/i.test(child.name)), false);
  assert.equal(rapier.userData.sockets.cockpitCamera.name, "SOCKET_CAMERA_COCKPIT");
  assert.equal(rapier.userData.sockets.muzzleLeft.name, "SOCKET_MUZZLE_LEFT");
  assert.equal(rapier.userData.sockets.muzzleRight.name, "SOCKET_MUZZLE_RIGHT");
});

test("Rapier dispersed strip is a fixed 520 m launch and arresting platform, not a ship", () => {
  const strip = createRapierDispersedStrip();
  const size = new THREE.Box3().setFromObject(strip).getSize(new THREE.Vector3());

  assert.equal(strip.name, "RAPIER_FIXED_DISPERSED_ARRESTING_STRIP");
  assert.equal(strip.userData.platformKind, "FIXED_ARRESTING_STRIP");
  assert.equal(strip.userData.launchStrokeM, 520);
  assert.ok(size.x >= 72 && size.z >= 1_200,
    "the fixed platform must retain its full shoulder width and operating length");
  assert.equal(strip.userData.hull, undefined);
  assert.equal(strip.userData.wakes, undefined);
  assert.equal(strip.userData.sockets.deckOrigin.name, "SOCKET_DECK_ORIGIN");
  assert.equal(strip.userData.sockets.recoveryThreshold.name, "SOCKET_RECOVERY_THRESHOLD");
  assert.equal(strip.userData.sockets.bowReference.name, "SOCKET_LAUNCH_END");
  // The launcher is a ski jump, so the handoff is at the TOP of the ramp rather than at deck
  // level. Both numbers below are derived the same way CatapultLaunchModel derives them, so this
  // fails if the renderer and the kernel ever stop agreeing about the shape of the rail — which is
  // a silent visual float, not a crash.
  const arcRadiusM = 150 * 150 / (3.0 * 9.80665);        // CatapultLaunchModel.RampNormalG
  const rampAngleRad = 12 * Math.PI / 180;               // Beats: CatapultRampAngleRad
  const rampRiseM = arcRadiusM * (1 - Math.cos(rampAngleRad));
  const rampHorizontalM = arcRadiusM * Math.sin(rampAngleRad);
  assert.ok(Math.abs(strip.userData.sockets.bowReference.position.y - (4 + rampRiseM)) < 1e-6,
    "launch handoff must sit AirborneHeightM above the ramp top");
  assert.ok(
    Math.abs(strip.userData.sockets.bowReference.position.z
      - (-20 - (520 - rampAngleRad * arcRadiusM) - rampHorizontalM)) < 1e-6,
    "launch handoff must sit at the horizontal end of the arc, not at a flat 520 m",
  );

  const recovery = strip.userData.fixedStripRecoveryPresentation;
  assert.ok(recovery, "the strip must expose its own wires to the live caught-wire presentation");
  assert.deepEqual(
    recovery.wires.map((wire) => wire.name),
    ["ARRESTING_WIRE_1", "ARRESTING_WIRE_2", "ARRESTING_WIRE_3", "ARRESTING_WIRE_4"],
  );
  assert.deepEqual(
    recovery.wires.map((wire) => Number(wire.position.z.toFixed(1))),
    [250.4, 245.2, 240.0, 234.8],
    "rendered wire positions must match the physics convention with wire three at -20% deck length",
  );
  for (let index = 1; index < recovery.wires.length; index++) {
    assert.ok(Math.abs(recovery.wires[index - 1].position.z
      - recovery.wires[index].position.z - 5.2) < 1e-9,
    "adjacent Rapier arresting wires must remain 5.2 m apart");
    assert.notEqual(recovery.wires[index - 1].material, recovery.wires[index].material,
      "each embedded wire needs an independent material for live trap highlighting");
  }
  assert.equal(strip.getObjectByName("CarrierRecoveryOverlay"), undefined,
    "the fixed strip must not embed a second carrier-scaled recovery overlay");
});
