import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { createDrawnTerrainSampler, createOkanaganWorld, geographicToWorld } from "../okanagan_world.js";
import { animateOkanaganWater, createOkanaganAirportDetails, createOkanaganNearForest,
  okanaganNearForestCandidates, OKANAGAN_NEAR_FOREST_TIERS } from "../okanagan_orientation_scenery.js";

function positions(field) {
  const mesh = field.group.getObjectByName("nearby-conifer-crowns"), matrix = new THREE.Matrix4();
  const result = new Map();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    result.set(`${matrix.elements[12]}:${matrix.elements[14]}`, [...matrix.elements]);
  }
  return result;
}

function disposeGroup(group) {
  group.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
}

test("near trees persist in fixed world locations, rebuild only at cell boundaries and evict old cells", () => {
  const field = createOkanaganNearForest({ quality: "mobile", sampleHeight: (x, z) => 500 + x * .03 + z * .02,
    accepts: x => x >= 0, density: () => 1 });
  field.update(new THREE.Vector3(500, 700, 500));
  const first = positions(field), before = field.diagnostics();
  assert.ok(first.size > 100 && first.size <= before.capacity);
  field.update(new THREE.Vector3(505, 700, 505));
  assert.deepEqual(field.diagnostics(), before, "within-cell movement must not resample or rebuild scenery");
  field.update(new THREE.Vector3(900, 700, 500));
  const second = positions(field);
  let shared = 0;
  for (const [key, matrix] of first) if (second.has(key)) { assert.deepEqual(second.get(key), matrix); shared++; }
  assert.ok(shared > 100, "a neighboring cell must retain the same actual tree transforms");
  for (const matrix of second.values()) {
    assert.ok(matrix[12] >= 0, "honor operational/geographic exclusions before allocating trees");
    assert.ok(Math.abs(matrix[13] - (500 + matrix[12] * .03 + matrix[14] * .02)) < 0.001);
  }
  for (let i = 1; i < 20; i++) field.update(new THREE.Vector3(i * 2500, 700, i * 1200));
  const final = field.diagnostics();
  assert.equal(final.residentCells, 25);
  assert.ok(final.trees <= final.capacity);
  assert.equal(final.drawCalls, 2);
  disposeGroup(field.group);
});

test("quality tiers add stable candidates without moving the existing vegetation", () => {
  const mobile = okanaganNearForestCandidates(-12, 9, OKANAGAN_NEAR_FOREST_TIERS.mobile.treesPerCell);
  const desktop = okanaganNearForestCandidates(-12, 9, OKANAGAN_NEAR_FOREST_TIERS.desktop.treesPerCell);
  assert.deepEqual(desktop.slice(0, mobile.length), mobile);
  assert.ok(mobile.every(p => p.x > -12 * 360 && p.x < -11 * 360 && p.z > 9 * 360 && p.z < 10 * 360));
});

test("unplantable surfaces produce no trees and reflected roots keep their geographic placement", () => {
  const field = createOkanaganNearForest({ quality: "mobile", sampleHeight: () => 342, accepts: () => false, density: () => 1 });
  const parent = new THREE.Group(); parent.scale.z = -1; parent.add(field.group);
  field.update(new THREE.Vector3(200, 800, 400));
  assert.equal(field.diagnostics().trees, 0);
  assert.ok(field.diagnostics().residentCells <= 25);
  field.update({ x: NaN, z: 0 });
  assert.equal(field.diagnostics().trees, 0);
  disposeGroup(field.group);
});

test("visual tree height follows the drawn triangle, independently raycast, rather than bilinear terrain", () => {
  const data = { rows: 2, columns: 2, bounds: { west: -119.50, east: -119.49, south: 49.88, north: 49.89 } };
  const a = geographicToWorld(49.88, -119.50, 500), b = geographicToWorld(49.88, -119.49, 500);
  const c = geographicToWorld(49.89, -119.50, 500), d = geographicToWorld(49.89, -119.49, 700);
  const geometry = new THREE.BufferGeometry().setFromPoints([a, c, b, b, c, d]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld();
  const physicalSample = (x, z) => 500 + 200 * x / b.x * z / c.z;
  const drawn = createDrawnTerrainSampler(data, physicalSample);
  for (const [u, v] of [[.25, .25], [.7, .2], [.75, .75], [.4, .9]]) {
    const x = b.x * u, z = c.z * v;
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0];
    assert.ok(hit);
    assert.ok(Math.abs(drawn(x, z) - hit.point.y) < 0.001);
  }
  assert.equal(drawn(b.x * .25, c.z * .25), 500);
  assert.notEqual(physicalSample(b.x * .25, c.z * .25), 500);
  disposeGroup(mesh);
});

test("airport paint is above the existing asphalt and markings face upward", () => {
  const centre = new THREE.Vector3(100, 434.2, 500);
  const along = new THREE.Vector3(Math.sin(160 * Math.PI / 180), 0, Math.cos(160 * Math.PI / 180));
  const across = new THREE.Vector3(along.z, 0, -along.x);
  const surfaceY = centre.y + .57;
  const group = createOkanaganAirportDetails({ centre, along, across, runwayLength: 2713, surfaceY });
  const paint = group.getObjectByName("airport-white-details");
  assert.ok(paint.geometry.attributes.position.count > 100);
  for (let i = 0; i < paint.geometry.attributes.position.count; i++) {
    assert.ok(paint.geometry.attributes.position.getY(i) > centre.y + .4);
    assert.ok(paint.geometry.attributes.normal.getY(i) > .999);
  }
  assert.equal(group.children.length, 5, "paint and detail materials remain batched");
  disposeGroup(group);
});

test("water animation advances only shading and preserves its stable material program", () => {
  const material = new THREE.MeshStandardMaterial();
  const animation = animateOkanaganWater(material);
  const key = material.customProgramCacheKey();
  animation.update(18.5);
  assert.equal(animation.diagnostics().timeSeconds, 18.5);
  assert.equal(animation.diagnostics().vertexDisplacement, false);
  animation.update(NaN);
  assert.equal(animation.diagnostics().timeSeconds, 18.5);
  assert.equal(material.customProgramCacheKey(), key);
  material.dispose();
});

test("integrated airport original edge and threshold paint clear the asphalt top", () => {
  const data = { rows: 2, columns: 2, bounds: { west: -119.6, east: -119.2, south: 49.8, north: 50.1 }, elevationsM: [[433, 433], [433, 433]] };
  const world = { lake: { surfaceElevationM: 342, shoreline: [[-119.58,49.81],[-119.57,49.81],[-119.57,49.82],[-119.58,49.82],[-119.58,49.81]] },
    airfields: [{ elevationM: 433, runwayLengthM: 2713, runwayHeadingDeg: 160 }], communities: [], roads: [], agriculture: [] };
  const scene = new THREE.Scene(), rendered = createOkanaganWorld(scene, data, world, "mobile");
  const airport = rendered.group.getObjectByName("Kelowna International Runway 16/34");
  const asphalt = airport.children[0];
  const paint = airport.children.find(o => o.material?.isMeshBasicMaterial);
  const asphaltTop = asphalt.position.y + asphalt.geometry.parameters.height / 2;
  for (let i = 0; i < paint.geometry.attributes.position.count; i++)
    assert.ok(paint.geometry.attributes.position.getY(i) > asphaltTop, "paint cannot be embedded inside the runway box");
  const terminal = airport.children.find(o => o.geometry?.parameters?.height === 13);
  const roof = airport.getObjectByName("airport-roof-details");
  const roofY = terminal.position.y + terminal.geometry.parameters.height / 2;
  assert.ok(Math.abs(roof.geometry.attributes.position.getY(0) - roofY - .02) < .001,
    "roof detail must sit on the existing terminal instead of floating above it");
  let checkedCrowns = 0;
  for (const name of ["incident-timber-stand", "ponderosa-douglas-fir-stands"]) {
    rendered.group.getObjectByName(name).traverse(o => {
      if (!o.isInstancedMesh || !o.instanceColor || o.count === 0) return;
      const authored = new THREE.Color(); o.getColorAt(0, authored);
      const albedo = authored.clone().multiply(o.material.color);
      assert.ok(albedo.g >= authored.g * .95, "do not multiply authored foliage color by another dark green");
      checkedCrowns++;
    });
  }
  assert.ok(checkedCrowns >= 2);
  rendered.update(geographicToWorld(49.85,-119.55,800));
  assert.equal(rendered.diagnostics().water.animated, true);
  const disposed = new Map();
  rendered.group.traverse(o => {
    if (o.material && !disposed.has(o.material)) {
      disposed.set(o.material, 0); o.material.addEventListener("dispose", () => disposed.set(o.material, disposed.get(o.material) + 1));
    }
  });
  rendered.dispose();
  assert.ok([...disposed.values()].every(count => count === 1), "shared materials are disposed once by the world owner");
  assert.equal(scene.children.length, 0);
});
