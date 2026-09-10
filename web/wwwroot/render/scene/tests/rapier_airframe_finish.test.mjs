import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import definition from "../../../airframes/rapier_v2.embedded.js";
import { adaptShapeFirstAirframeDefinition } from "../shape_first_airframe_adapter.js";
import { createLoftGeometry } from "../airframe_primitives.js";
import {
  createRapierMaterials, createRapierInlet, createRapierExhaust,
} from "../rapier_airframe_finish.js";

const adapted = () => adaptShapeFirstAirframeDefinition(definition);

function checkCavity(mouth, outerRadius, expectedDepth) {
  const [wall, back] = mouth.children;
  const p = wall.geometry.attributes.position;
  const n = wall.geometry.attributes.normal;
  const index = wall.geometry.index;
  let nearest = -Infinity;
  let farthest = Infinity;
  for (let i = 0; i < p.count; i++) {
    assert.ok(Number.isFinite(n.getX(i) + n.getY(i) + n.getZ(i)));
    assert.ok(p.getX(i) * n.getX(i) + p.getY(i) * n.getY(i) < 0,
      "the wall must face the cavity, not the unseen solid exterior");
    assert.ok(Math.hypot(p.getX(i), p.getY(i)) < outerRadius);
    nearest = Math.max(nearest, p.getZ(i));
    farthest = Math.min(farthest, p.getZ(i));
  }
  assert.ok(Math.abs(nearest) < 1e-7);
  assert.ok(Math.abs(farthest + expectedDepth) < 1e-7);
  assert.equal(back.position.z, -expectedDepth);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const geometric = new THREE.Vector3(), authored = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
    a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); c.fromBufferAttribute(p, ic);
    geometric.crossVectors(b.sub(a), c.sub(a));
    authored.fromBufferAttribute(n, ia);
    assert.ok(geometric.dot(authored) > 0, "cavity winding must agree with its inward normals");
  }
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0, 0, -1));
  back.updateMatrixWorld(true);
  assert.ok(ray.intersectObject(back).length > 0, "the recessed backplate must close the opening");
}

test("inlet keeps the authored ellipse and incidence with a visible recessed interior", () => {
  const def = adapted();
  const inlet = createRapierInlet(def, createRapierMaterials(def), "INLET");
  assert.deepEqual(inlet.position.toArray(), definition.geometry.inlet.centerM);
  assert.equal(inlet.rotation.x, definition.geometry.inlet.designFlowIncidenceDeg * Math.PI / 180);
  assert.equal(inlet.scale.y, definition.geometry.inlet.radiusYM / definition.geometry.inlet.radiusXM);
  assert.equal(inlet.geometry.parameters.outerRadius, definition.geometry.inlet.radiusXM);
  checkCavity(inlet, definition.geometry.inlet.radiusXM, definition.geometry.inlet.lipDepthM * 2);
});

test("inlet cuff joins the installed lip and rendered tunnel with finite outward faces", () => {
  const def = adapted();
  const materials = createRapierMaterials(def);
  const inlet = createRapierInlet(def, materials, "INLET");
  // Use the renderer's actual faceted tunnel, not just its analytic ellipse.
  const tunnel = createLoftGeometry(def.propulsionTunnel.stations, 32);
  try {
    inlet.updateMatrixWorld(true);
    const cuff = inlet.getObjectByName("INLET_TUNNEL_JOIN");
    assert.ok(cuff, "the recessed inlet must also connect to the body exterior");
    const { position: p, normal: n } = cuff.geometry.attributes;
    const indices = cuff.geometry.index;
    assert.equal(p.count % 2, 0);
    assert.ok(indices.count / 3 <= 96, "the short join must retain a small triangle budget");
    const ringSize = p.count / 2;
    const world = Array.from({ length: p.count }, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(cuff.matrixWorld));
    const front = world.slice(0, ringSize), rear = world.slice(ringSize);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(cuff.matrixWorld);
    for (let i = 0; i < p.count; i++) {
      assert.ok(world[i].toArray().every(Number.isFinite));
      const normal = new THREE.Vector3().fromBufferAttribute(n, i);
      assert.ok(normal.toArray().every(Number.isFinite));
      assert.ok(Math.abs(normal.length() - 1) < 1e-6);
    }

    const lip = inlet.geometry.attributes.position;
    const outerLip = Array.from({ length: lip.count }, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(lip, i))
      .filter(point => Math.abs(Math.hypot(point.x, point.y) - def.intake.outerR) < 1e-6)
      .map(point => point.applyMatrix4(inlet.matrixWorld));
    const nearestDistance = (point, points) => Math.min(...points.map(other => point.distanceTo(other)));
    for (const point of front) assert.ok(nearestDistance(point, outerLip) < 1e-6,
      "every front vertex must coincide with the transformed outer lip");
    for (const point of outerLip) assert.ok(nearestDistance(point, front) < 1e-6,
      "the cuff must follow the whole lip polygon without skipping a segment");

    const tp = tunnel.attributes.position, ti = tunnel.index;
    const triangles = Array.from({ length: ti.count / 3 }, (_, i) => new THREE.Triangle(
      ...[0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(tp, ti.getX(i * 3 + offset)))));
    const distanceToTunnel = point => Math.min(...triangles.map(triangle =>
      triangle.closestPointToPoint(point, new THREE.Vector3()).distanceTo(point)));
    const [start, end] = def.propulsionTunnel.stations;
    for (const point of rear) {
      assert.ok(point.z > start.z && point.z < end.z,
        "the rear join must sit inside the existing first tunnel segment");
      assert.ok(Math.abs(point.z - rear[0].z) < 1e-6);
      assert.ok(distanceToTunnel(point) < 1e-6,
        "rear vertices must touch the actual loft triangles, including their angular sampling");
    }
    // Unequal radius taper gives the loft nonplanar quads. Bound the residual
    // between shared vertices without claiming the two meshes are welded.
    for (let i = 0; i < rear.length - 1; i++) {
      assert.ok(distanceToTunnel(rear[i].clone().lerp(rear[i + 1], 0.5)) < 0.002,
        "the faceted rear-edge discrepancy must stay below two millimetres");
    }

    const centres = [front, rear].map(ring => ring.slice(0, -1)
      .reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(ring.length - 1));
    for (let i = 0; i < indices.count; i += 3) {
      const ids = [0, 1, 2].map(offset => indices.getX(i + offset));
      const vertices = ids.map(id => world[id]);
      const triangle = new THREE.Triangle(...vertices);
      assert.ok(triangle.getArea() > 1e-8, "the cuff must have no collapsed triangles");
      const faceNormal = triangle.getNormal(new THREE.Vector3());
      const centreFraction = ids.filter(id => id >= ringSize).length / 3;
      const centreline = centres[0].clone().lerp(centres[1], centreFraction);
      const outward = triangle.getMidpoint(new THREE.Vector3()).sub(centreline).normalize();
      assert.ok(faceNormal.dot(outward) > 0.5, "cuff winding must face away from the duct interior");
      for (const id of ids) {
        const normal = new THREE.Vector3().fromBufferAttribute(n, id).applyNormalMatrix(normalMatrix);
        assert.ok(faceNormal.dot(normal) > 0.9,
          "transformed smooth normals must agree with each outward face");
      }
    }
    const bounds = new THREE.Box3().setFromPoints(world);
    assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
    assert.ok(Math.abs(bounds.min.x + def.intake.outerR) < 1e-6);
    assert.ok(Math.abs(bounds.max.x - def.intake.outerR) < 1e-6);
    const inletYRadius = definition.geometry.inlet.radiusYM * Math.cos(def.intake.rotX);
    assert.ok(Math.abs(bounds.min.y - (def.intake.position[1] - inletYRadius)) < 1e-6);
    assert.ok(Math.abs(bounds.max.y - (def.intake.position[1] + inletYRadius)) < 1e-6);
    const inletZRadius = definition.geometry.inlet.radiusYM * Math.sin(def.intake.rotX);
    assert.ok(Math.abs(bounds.min.z - (def.intake.position[2] - inletZRadius)) < 1e-6);
    assert.ok(Math.abs(bounds.max.z - rear[0].z) < 1e-6);
  } finally {
    const ownedMaterials = new Set(Object.values(materials));
    inlet.traverse(object => {
      object.geometry?.dispose();
      if (object.material) ownedMaterials.add(object.material);
    });
    for (const material of ownedMaterials) material.dispose();
    tunnel.dispose();
  }
});

test("exhaust lip and cavity remain within the canonical nozzle envelope", () => {
  const def = adapted();
  const exhaust = createRapierExhaust(def, createRapierMaterials(def), "EXHAUST");
  assert.deepEqual(exhaust.position.toArray(), definition.geometry.exhaust.centerM);
  assert.equal(exhaust.geometry.parameters.outerRadius, definition.geometry.exhaust.radiusM);
  checkCavity(exhaust, definition.geometry.exhaust.radiusM, definition.geometry.exhaust.fairingLengthM / 2);
});

test("separate aircraft instances own their finish resources and retain the finish shader", () => {
  const def = adapted();
  const first = createRapierMaterials(def), second = createRapierMaterials(def);
  for (const key of Object.keys(first)) assert.notEqual(first[key], second[key]);
  const shader = {
    uniforms: {}, vertexShader: "varying vec3 vViewPosition;\n#include <begin_vertex>",
    fragmentShader: "varying vec3 vViewPosition;\nvec4 diffuseColor = vec4( diffuse, opacity );\n#include <color_fragment>\n#include <roughnessmap_fragment>",
  };
  first.body.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uFinishGrain, "the inherited grain shader must survive the body material clone");
  assert.equal(shader.uniforms.uRapierNoseEnd.value, definition.geometry.bodies[0].stations[1].zM);
  assert.ok(shader.vertexShader.includes("vFinishPosition = position"));
  assert.ok(shader.fragmentShader.includes("uRapierNoseColor"));
  assert.notEqual(first.body.customProgramCacheKey(), first.upper.customProgramCacheKey());
});
