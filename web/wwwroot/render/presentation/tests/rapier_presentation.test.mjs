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
    .setFromObject(rapier.getObjectByName("RAPIER_WING"))
    .getSize(new THREE.Vector3());

  assert.equal(rapier.name, "RAPIER");
  assert.ok(Math.abs(wingSize.x - 7.35) < 0.12,
    `bevelled visual span ${wingSize.x.toFixed(3)} m must remain within 12 cm of the 7.35 m contract`);
  assert.ok(size.x < 7.5,
    "canted fins and detail must remain inside the bounded flight-model silhouette");
  assert.ok(Math.abs(size.z - 13) < 0.02,
    `visual length ${size.z.toFixed(3)} m must match the 13 m flight-model contract`);
  assert.deepEqual(rapier.userData.dimensionsM, { length: 13, span: 7.35 });
  assert.equal(rapier.userData.airframeId, "rapier.shape-first-engineering.v2");
  assert.ok(rapier.getObjectByName("RAPIER_FUSELAGE"));
  assert.ok(rapier.getObjectByName("RAPIER_PROPULSION_TUNNEL"));
  assert.ok(rapier.getObjectByName("RAPIER_INTAKE"));
  assert.ok(rapier.getObjectByName("RAPIER_EXHAUST"));
  assert.equal(rapier.children.some((child) => /canopy|spine|drone/i.test(child.name)), false);
  assert.equal(rapier.userData.sockets.cockpitCamera.name, "SOCKET_CAMERA_COCKPIT");
  assert.equal(rapier.userData.sockets.muzzleLeft.name, "SOCKET_MUZZLE_LEFT");
  assert.equal(rapier.userData.sockets.muzzleRight.name, "SOCKET_MUZZLE_RIGHT");
  assert.deepEqual(rapier.userData.sockets.muzzleLeft.position,
    rapier.userData.sockets.muzzleRight.position,
    "v2 has one offset gun aperture, not two cheek guns");
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
  const arcRadiusM = 120 * 120 / (3.0 * 9.80665);        // CatapultLaunchModel.RampNormalG
  const rampAngleRad = 12 * Math.PI / 180;               // Beats: CatapultRampAngleRad
  const rampRiseM = arcRadiusM * (1 - Math.cos(rampAngleRad));
  const rampHorizontalM = arcRadiusM * Math.sin(rampAngleRad);
  assert.ok(Math.abs(strip.userData.sockets.bowReference.position.y
      - (0.15 + 0.85 + 4 + rampRiseM)) < 1e-6,
  "launch handoff must include rail head, authored aircraft support reference, and airborne gap");
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
  const ribLamps = strip.getObjectByName("LAUNCH_GALLERY_RIB_LAMPS");
  const ribs = strip.getObjectByName("LAUNCH_GALLERY_RIBS");
  const edgeLamps = strip.getObjectByName("RAPIER_STRIP_EDGE_LAMPS");
  const centreArcRail = strip.getObjectByName("LAUNCH_ARC_CENTRE_RAIL");
  const sideArcRails = strip.getObjectByName("LAUNCH_ARC_SIDE_RAILS");
  // Derived, not hardcoded: the gallery roofs the FLAT run, so its length is the stroke minus the
  // ramp arc. Shortening the launcher lengthens the gallery, and a literal here just breaks.
  const flatLengthM = 520 - rampAngleRad * arcRadiusM;
  assert.ok(Math.abs(flatLengthM - 417.487) < 0.002);
  assert.ok(Math.abs(strip.userData.launchArcLengthM - 102.513) < 0.002);
  assert.ok(Math.abs(strip.userData.launchRampRiseM - 10.6960) < 0.001);
  assert.equal(strip.userData.launchRailHeadHeightM, 0.15);
  assert.equal(strip.userData.aircraftSupportReferenceHeightM, 0.85);
  const expectedRibs = Math.floor((flatLengthM - 10) / 10) + 1;
  assert.ok(ribs?.isInstancedMesh);
  assert.equal(ribs.count, expectedRibs);
  assert.ok(ribLamps?.isInstancedMesh);
  assert.equal(ribLamps.count, expectedRibs);
  assert.ok(edgeLamps?.isInstancedMesh);
  assert.equal(edgeLamps.count, 36);
  assert.ok(centreArcRail?.isInstancedMesh);
  assert.equal(centreArcRail.count, 12);
  assert.ok(sideArcRails?.isInstancedMesh);
  assert.equal(sideArcRails.count, 24);
  assert.ok(strip.getObjectByName("LAUNCH_GALLERY_VAULT"), "arched vault must present");
  assert.ok(strip.getObjectByName("LAUNCH_PORTAL"), "portal headwall must present");
  assert.ok(strip.getObjectByName("LAUNCH_FX"), "catshot FX group must present");
  assert.ok(strip.userData.launchFx?.update, "strip must expose launchFx.update");
  const vicinity = strip.getObjectByName("STRIP_VICINITY");
  assert.ok(vicinity, "installation vicinity kit must present");
  assert.equal(vicinity.userData.ambientRole, "vicinity");
  assert.ok(vicinity.getObjectByName("STRIP_ACCESS_TRACK"), "gravel access track must present");
  assert.ok(vicinity.children.some((child) => child.name === "STRIP_REVETMENT"),
    "blast revetments must present");
  assert.ok(vicinity.children.some((child) => child.name === "STRIP_SPOIL_PILE"),
    "spoil piles must present");
  assert.ok(vicinity.getObjectByName("STRIP_SOFT_BERM"), "soft berm landscape must present");
  const lastRailMatrix = new THREE.Matrix4();
  centreArcRail.getMatrixAt(centreArcRail.count - 1, lastRailMatrix);
  const halfChord = centreArcRail.geometry.parameters.depth / 2;
  const forwardEnd = new THREE.Vector3(0, 0, -halfChord).applyMatrix4(lastRailMatrix);
  const aftEnd = new THREE.Vector3(0, 0, halfChord).applyMatrix4(lastRailMatrix);
  assert.ok(forwardEnd.y > aftEnd.y,
    "the -Z launch end of every ski-jump chord must rise, never spear downward/back into camera");
});
