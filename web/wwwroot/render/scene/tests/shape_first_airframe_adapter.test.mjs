import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../../../vendor/three.module.js";
import embeddedRapierV2 from "../../../airframes/rapier_v2.embedded.js";
import { createAirframeFromDefinition } from "../airframe_from_definition.js";
import {
  adaptShapeFirstAirframeDefinition,
  isShapeFirstAirframeDefinition,
} from "../shape_first_airframe_adapter.js";

const wwwroot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const sourcePath = join(wwwroot, "../../airframes/rapier.v2.json");

function sourceDefinition() {
  return JSON.parse(readFileSync(sourcePath, "utf8"));
}

function polygonArea(points) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    twiceArea += x1 * y2 - x2 * y1;
  }
  return Math.abs(twiceArea) * 0.5;
}

test("staged and synchronous Rapier v2 definitions stay identical to canonical source", () => {
  const source = sourceDefinition();
  const staged = JSON.parse(readFileSync(join(wwwroot, "airframes/rapier.v2.json"), "utf8"));
  assert.deepEqual(staged, source);
  assert.deepEqual(embeddedRapierV2, source);
});

test("Rapier v2 shape-first schema adapts without a second authored exterior", () => {
  const source = sourceDefinition();
  assert.equal(isShapeFirstAirframeDefinition(source), true);
  const adapted = adaptShapeFirstAirframeDefinition(source);

  assert.equal(adapted.id, "rapier.shape-first-engineering.v2");
  assert.equal(adapted.definitionRevision, undefined);
  assert.equal(adapted.escapePodSpine, undefined);
  assert.equal(adapted.sockets.droneBay, undefined);
  assert.equal(adapted.fuselage.stations.length, source.geometry.bodies[0].stations.length);
  assert.equal(adapted.propulsionTunnel.stations.length,
    source.geometry.bodies[1].stations.length);
  assert.ok(Math.abs(polygonArea(adapted.wing.planform) - 24.316845) < 1e-6);
  // The inclined visible inlet lip reaches below the lofted tunnel; canted-fin geometry owns the
  // upper bound. This matches the canonical engineering artifact rather than its old loft-only
  // 2.07 m height.
  assert.equal(adapted.dimensionsM.length, 13);
  assert.equal(adapted.dimensionsM.span, 7.35);
  assert.ok(Math.abs(adapted.dimensionsM.height - 2.228801) < 1e-6);
  assert.ok(Math.abs(adapted.intake.rotX - 7.5 * Math.PI / 180) < 1e-12);
  assert.equal(adapted.intake.outerR, 0.76);
  assert.ok(Math.abs(adapted.intake.scaleY - 0.65 / 0.76) < 1e-12);
  assert.equal(adapted.exhaust.radius, 0.45);
  for (const z of [-0.45, -0.15, 2.29, 4.73, 5.03]) {
    const section = adapted.propulsionTunnel.stations.find(
      (station) => Math.abs(station.z - z) < 1e-12);
    assert.ok(section, `missing visible package section at z=${z}`);
    assert.equal(section.rx, 0.75);
    assert.equal(section.ry, 0.75);
    assert.equal(section.y, -0.075);
  }
});

test("definition-built Rapier v2 preserves the canonical 13 m by 7.35 m silhouette", () => {
  const adapted = adaptShapeFirstAirframeDefinition(sourceDefinition());
  const rapier = createAirframeFromDefinition(adapted);
  const size = new THREE.Box3().setFromObject(rapier).getSize(new THREE.Vector3());

  assert.ok(Math.abs(size.x - 7.35) < 0.002, `rendered span ${size.x}`);
  assert.ok(Math.abs(size.z - 13) < 0.02, `rendered length ${size.z}`);
  assert.deepEqual(rapier.userData.dimensionsM, { length: 13, span: 7.35 });
  assert.equal(rapier.userData.airframeId, "rapier.shape-first-engineering.v2");
  assert.equal(rapier.userData.definitionRevision, "2.0.0");
  assert.equal(rapier.children.some((child) => /spine|canopy|drone/i.test(child.name)), false);
  assert.equal(rapier.userData.sockets.muzzleLeft.position.x, -0.26);
  assert.equal(rapier.userData.sockets.muzzleRight.position.x, -0.26);
});

test("shape-first adapter rejects a legacy or incomplete definition", () => {
  assert.throws(() => adaptShapeFirstAirframeDefinition({ schema: "legacy" }), /expected schema/i);
  assert.throws(
    () => adaptShapeFirstAirframeDefinition({
      schema: "guns-only.shape-first-airframe-definition.v1",
      geometry: {},
    }),
    /halfStations|bodies|required/i,
  );
});
