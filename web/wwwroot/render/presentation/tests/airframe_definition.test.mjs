import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as THREE from "../../../vendor/three.module.js";
import { createAirframeFromDefinition } from "../../scene/airframe_from_definition.js";
import { createRapier } from "../../scene/scene_builders.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../airframes");

test("rapier.v1.json publishes closed geometry and identity", () => {
  const def = JSON.parse(readFileSync(join(root, "rapier.v1.json"), "utf8"));
  assert.equal(def.schema, "guns-only.airframe-definition.v1");
  assert.equal(def.id, "rapier.public-data-surrogate.v1");
  assert.equal(def.presentationId, "presentation.vehicle.rapier.public-data-surrogate.v1");
  assert.equal(def.flightModelBinding, "FlightModel.RapierPublicDataSurrogate");
  assert.equal(def.frameConvention, "threejs-createRapier-v1");
  assert.equal(def.dimensionsM.length, 13);
  assert.equal(def.dimensionsM.span, 7.35);
  assert.equal(def.wing.areaM2, 18);
  assert.equal(def.wing.aspectRatio, 3);
  assert.equal(def.massKg.fuelFree, 5150);
  assert.equal(def.massKg.fuelCapacity, 4500);
  assert.equal(def.massKg.gross, 9650);
  assert.equal(def.propulsion.ramCaptureAreaM2, 1.2);
  assert.equal(def.thermal.skinTemperatureLimitK, 1473.15);
  assert.equal(def.wing.planform.length, 12);
  assert.equal(def.fuselage.stations.length, 7);
  assert.ok(def.sockets.cockpitCamera);
  assert.ok(def.sockets.muzzleLeft);
  assert.ok(def.sockets.muzzleRight);
  assert.equal(def.sockets.droneBay.length, 4);
  assert.equal(def.sockets.droneBay[0].epistemic, "provisional");
});

test("rapier.v1.json tags Mach-4 dash as fiction and wet T/W as provisional", () => {
  const def = JSON.parse(readFileSync(join(root, "rapier.v1.json"), "utf8"));
  assert.equal(def.performanceClaims.designDashMach.epistemic, "fiction");
  assert.equal(def.performanceClaims.wetThrustWeightGross.epistemic, "provisional");
  assert.equal(def.propulsion.epistemic, "provisional");
});

test("definition-built Rapier matches silhouette contract", () => {
  const def = JSON.parse(readFileSync(join(root, "rapier.v1.json"), "utf8"));
  const rapier = createAirframeFromDefinition(def);
  const size = new THREE.Box3().setFromObject(rapier).getSize(new THREE.Vector3());
  assert.equal(rapier.name, "RAPIER_HIGH_ALTITUDE_INTERCEPTOR_SURROGATE");
  assert.ok(Math.abs(size.z - 13) < 0.02);
  assert.deepEqual(rapier.userData.dimensionsM, { length: 13, span: 7.35 });
  assert.equal(rapier.userData.airframeId, "rapier.public-data-surrogate.v1");
  assert.ok(rapier.getObjectByName("RAPIER_OPAQUE_ESCAPE_POD_SPINE"));
  assert.equal(rapier.userData.sockets.cockpitCamera.name, "SOCKET_CAMERA_COCKPIT");
  assert.equal(rapier.children.some((c) => /canopy/i.test(c.name)), false);
});

test("createRapier thin loader matches definition-built silhouette", () => {
  const viaLoader = createRapier();
  const viaDef = createAirframeFromDefinition(
    JSON.parse(readFileSync(join(root, "rapier.v1.json"), "utf8")),
  );
  assert.equal(viaLoader.name, viaDef.name);
  assert.deepEqual(viaLoader.userData.dimensionsM, viaDef.userData.dimensionsM);
  assert.equal(viaLoader.userData.airframeId, "rapier.public-data-surrogate.v1");
  assert.equal(viaLoader.userData.definitionRevision, "1.0.0");
});

test("createAirframeFromDefinition refuses incomplete geometry", () => {
  assert.throws(
    () => createAirframeFromDefinition({ schema: "guns-only.airframe-definition.v1", id: "x" }),
    /planform|fuselage|required/i,
  );
});
