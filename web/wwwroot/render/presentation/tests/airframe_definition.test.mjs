import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as THREE from "../../../vendor/three.module.js";
import { createAirframeFromDefinition } from "../../scene/airframe_from_definition.js";
import { createRapier } from "../../scene/scene_builders.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../airframes");

function rapierV2() {
  return JSON.parse(readFileSync(join(root, "rapier.v2.json"), "utf8"));
}

function gunDronePreview() {
  return JSON.parse(readFileSync(join(root, "rapier-gun-drone.v1.json"), "utf8"));
}

test("rapier.v2 publishes shape and operating requirements without duplicate answers", () => {
  const def = rapierV2();
  assert.equal(def.schema, "guns-only.shape-first-airframe-definition.v1");
  assert.equal(def.id, "rapier.shape-first-engineering.v2");
  assert.equal(def.revision, "2.0.0");
  assert.equal(def.authority.geometryIsCanonical, true);
  assert.equal(def.authority.runtimeBinding, "FlightModel.RapierPublicDataSurrogate");
  assert.equal(def.frameConvention,
    "right-handed metres: +x starboard, +y up, +z aft");
  assert.equal(def.geometry.wing.halfStations.at(-1).xM, 3.675);
  assert.equal(def.geometry.bodies[0].stations[0].zM, -6.5);
  assert.equal(def.geometry.bodies[0].stations.at(-1).zM, 6.5);
  assert.equal(def.geometry.inlet.designFlowIncidenceDeg, 7.5);
  assert.equal(def.geometry.externalInterfaces.canopy, "none");
  assert.equal(def.fixedRequirements.launch.mode, "catapult");
  assert.equal(def.fixedRequirements.recoverySite.runwayLengthM, 3048);
  assert.equal(def.fixedRequirements.recoverySite.arrestorStationM, 1524);
  assert.equal(def.fixedRequirements.baselineMission.attackCount, 1);
  assert.equal(def.fixedRequirements.baselineMission.droneCount, 0);
  assert.equal(Object.hasOwn(def, "dimensionsM"), false);
  assert.equal(Object.hasOwn(def, "massKg"), false);
});

test("v2 closes a bounded high-altitude dash rather than a magic Mach number", () => {
  const def = rapierV2();
  const dash = def.fixedRequirements.dash;
  const core = def.propulsionModel.turbineCore;
  assert.equal(dash.minimumMach, 4.05);
  assert.equal(dash.designMach, 4.2);
  assert.equal(dash.designAltitudeM, 24000);
  assert.equal(dash.maximumDynamicPressurePa, 55000);
  assert.ok(core.seaLevelStaticDryThrustN > 0);
  assert.ok(core.maximumAugmentedThrustRatio > 1
    && core.maximumAugmentedThrustRatio < 1.6);
  assert.ok(core.fadeCompleteMach > core.fadeStartMach);
  assert.equal(core.augmentationAppliesTo, "turbine-stream-only");
  assert.equal(def.geometry.inlet.kind, "single-ventral-ellipse");
  assert.equal(def.geometry.exhaust.kind, "single-fixed-circular-nozzle");
});

test("definition-built Rapier v2 matches its canopy-free known silhouette", () => {
  const rapier = createAirframeFromDefinition(rapierV2());
  const size = new THREE.Box3().setFromObject(rapier).getSize(new THREE.Vector3());
  assert.equal(rapier.name, "RAPIER");
  assert.ok(Math.abs(size.z - 13) < 0.02);
  assert.ok(Math.abs(size.x - 7.35) < 0.002);
  assert.deepEqual(rapier.userData.dimensionsM, { length: 13, span: 7.35 });
  assert.equal(rapier.userData.airframeId, "rapier.shape-first-engineering.v2");
  assert.equal(rapier.userData.definitionRevision, "2.0.0");
  assert.ok(rapier.getObjectByName("RAPIER_FUSELAGE"));
  assert.ok(rapier.getObjectByName("RAPIER_PROPULSION_TUNNEL"));
  assert.equal(rapier.children.some((child) => /canopy|spine|drone/i.test(child.name)), false);
  assert.equal(rapier.userData.sockets.cockpitCamera.name, "SOCKET_CAMERA_COCKPIT");
  assert.deepEqual(
    rapier.userData.sockets.muzzleLeft.position,
    rapier.userData.sockets.muzzleRight.position,
    "both compatibility muzzle channels must resolve to the one physical gun aperture",
  );
});

test("createRapier loads the same v2 definition rather than the retired v1 exterior", () => {
  const viaLoader = createRapier();
  const viaDefinition = createAirframeFromDefinition(rapierV2());
  assert.equal(viaLoader.name, viaDefinition.name);
  assert.deepEqual(viaLoader.userData.dimensionsM, viaDefinition.userData.dimensionsM);
  assert.equal(viaLoader.userData.airframeId, "rapier.shape-first-engineering.v2");
  assert.equal(viaLoader.userData.definitionRevision, "2.0.0");
});

test("createAirframeFromDefinition refuses incomplete geometry", () => {
  assert.throws(
    () => createAirframeFromDefinition({
      schema: "guns-only.shape-first-airframe-definition.v1",
      id: "x",
    }),
    /geometry|required/i,
  );
});

test("generic definition builder still renders the quarantined gun-drone preview", () => {
  const drone = createAirframeFromDefinition(gunDronePreview());
  const size = new THREE.Box3().setFromObject(drone).getSize(new THREE.Vector3());

  assert.equal(drone.userData.airframeId,
    "rapier-gun-drone.public-data-surrogate.v1");
  assert.ok(Math.abs(size.x - 5.5) < 0.1,
    "preview span should stay approximately 5.5 m including bevel geometry");
  assert.ok(size.z >= 3 && size.z <= 3.5);
});
