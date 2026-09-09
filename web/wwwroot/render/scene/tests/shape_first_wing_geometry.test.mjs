import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { createShapeFirstWingGeometry } from "../shape_first_wing_geometry.js";

const canonical = JSON.parse(readFileSync(new URL(
  "../../../../../airframes/rapier.v2.json", import.meta.url), "utf8")).geometry.wing;
const close = (actual, expected, message, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const pointKey = (x, y, z) => `${x},${y},${z}`;
const positionKey = (attribute, index) =>
  pointKey(attribute.getX(index), attribute.getY(index), attribute.getZ(index));

function inspectClosedSurface(geometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const index = geometry.index.array;
  assert.equal(normal.count, position.count);
  assert.equal(uv.count, position.count);
  assert.equal(index.length % 3, 0);
  const weldedVertices = new Set();
  const edges = new Map();
  let volume = 0;
  let projectedTopArea = 0;
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  const ab = new THREE.Vector3(); const ac = new THREE.Vector3(); const face = new THREE.Vector3();
  const vertexNormal = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    for (const value of [position.getX(vertex), position.getY(vertex), position.getZ(vertex),
      normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex), uv.getX(vertex), uv.getY(vertex)]) {
      assert.ok(Number.isFinite(value), "geometry must contain only finite values");
    }
    close(vertexNormal.fromBufferAttribute(normal, vertex).length(), 1, "unit smooth normal");
    assert.ok(uv.getX(vertex) >= 0 && uv.getX(vertex) <= 1);
    assert.ok(uv.getY(vertex) >= 0 && uv.getY(vertex) <= 1);
    weldedVertices.add(positionKey(position, vertex));
  }
  for (let offset = 0; offset < index.length; offset += 3) {
    const ids = [index[offset], index[offset + 1], index[offset + 2]];
    a.fromBufferAttribute(position, ids[0]);
    b.fromBufferAttribute(position, ids[1]);
    c.fromBufferAttribute(position, ids[2]);
    face.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    assert.ok(face.lengthSq() > 1e-14, "sharp tips must not leave zero-area triangles");
    const group = geometry.groups.find((item) => offset >= item.start && offset < item.start + item.count);
    assert.ok(group, "every triangle must have an explicit material group");
    if (group.materialIndex === 0) {
      assert.ok(face.y > 0, "upper faces must wind outward");
      projectedTopArea += face.y * 0.5;
    } else if (Math.abs(face.y) > 1e-12) {
      assert.ok(face.y < 0, "lower faces must wind outward");
    } else {
      assert.ok(face.x * a.x > 0, "blunt tip caps must face outboard");
    }
    for (const id of ids) {
      assert.ok(face.dot(vertexNormal.fromBufferAttribute(normal, id)) > 0,
        "smooth normals must remain on the outward side of every face");
    }
    const uvArea = (uv.getX(ids[1]) - uv.getX(ids[0])) * (uv.getY(ids[2]) - uv.getY(ids[0]))
      - (uv.getY(ids[1]) - uv.getY(ids[0])) * (uv.getX(ids[2]) - uv.getX(ids[0]));
    assert.ok(Math.abs(uvArea) > 1e-12, "tip caps and both surfaces need nondegenerate UVs");
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    for (let edge = 0; edge < 3; edge++) {
      const from = positionKey(position, ids[edge]);
      const to = positionKey(position, ids[(edge + 1) % 3]);
      const key = from < to ? `${from}|${to}` : `${to}|${from}`;
      const counts = edges.get(key) ?? { count: 0, orientation: 0 };
      counts.count++;
      counts.orientation += from < to ? 1 : -1;
      edges.set(key, counts);
    }
  }
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, "each welded edge must join exactly two faces: no holes or internal caps");
    assert.equal(edge.orientation, 0, "joined faces must traverse their edge in opposite directions");
  }
  assert.equal(weldedVertices.size - edges.size + index.length / 3, 2,
    "a closed genus-zero wing must have Euler characteristic 2");
  assert.ok(volume > 0, "closed surface must have positive outward-oriented volume");
  return { volume, projectedTopArea, triangles: index.length / 3 };
}

test("canonical wing is closed, outward, sharp-tipped and inside its exact planform", () => {
  const geometry = createShapeFirstWingGeometry(canonical);
  try {
    const measured = inspectClosedSurface(geometry);
    assert.equal(measured.triangles, 224);
    const stations = canonical.halfStations;
    const span = stations.at(-1).xM;
    assert.equal(geometry.boundingBox.min.x, Math.fround(-span));
    assert.equal(geometry.boundingBox.max.x, Math.fround(span));
    assert.equal(geometry.boundingBox.min.z, Math.fround(Math.min(...stations.map((s) => s.leadingZM))));
    assert.equal(geometry.boundingBox.max.z, Math.fround(Math.max(...stations.map((s) => s.trailingZM))));
    const canonicalArea = stations.slice(1).reduce((area, station, index) => {
      const previous = stations[index];
      return area + (station.xM - previous.xM)
        * (station.trailingZM - station.leadingZM + previous.trailingZM - previous.leadingZM);
    }, 0);
    close(measured.projectedTopArea, canonicalArea, "full canonical planform area", 3e-6);
    const positions = geometry.getAttribute("position");
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const x = Math.abs(positions.getX(vertex)); const z = positions.getZ(vertex);
      const station = stations.find((s) => Math.fround(s.xM) === x);
      assert.ok(station, "visual sampling must not move authored span stations");
      assert.ok(z >= Math.fround(station.leadingZM) - 1e-6);
      assert.ok(z <= Math.fround(station.trailingZM) + 1e-6);
      if (x === Math.fround(span)) {
        assert.equal(positions.getY(vertex), Math.fround(canonical.installationYM));
        assert.equal(z, Math.fround(stations.at(-1).leadingZM));
      }
    }
    assert.deepEqual(geometry.groups.map((group) => group.materialIndex), [0, 1]);
  } finally { geometry.dispose(); }
});

test("each real chord keeps its authored thickness and installation height without widening edges", () => {
  const wing = { ...canonical, installationYM: 0.37 };
  const geometry = createShapeFirstWingGeometry(wing);
  try {
    const positions = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    for (const station of wing.halfStations.slice(0, -1)) {
      for (const side of [-1, 1]) {
        const x = Math.fround(side * station.xM);
        const ids = Array.from({ length: positions.count }, (_, i) => i).filter((i) => positions.getX(i) === x);
        const heights = ids.map((i) => positions.getY(i));
        assert.equal(Math.max(...heights), Math.fround(wing.installationYM + station.thicknessM * 0.5));
        assert.equal(Math.min(...heights), Math.fround(wing.installationYM - station.thicknessM * 0.5));
        for (const z of [station.leadingZM, station.trailingZM]) {
          const edge = ids.filter((i) => positions.getZ(i) === Math.fround(z));
          assert.equal(edge.length, 2, "top and bottom meet geometrically but keep separate edge normals");
          edge.forEach((i) => assert.equal(positions.getY(i), Math.fround(wing.installationYM)));
          assert.ok(edge.some((i) => normal.getY(i) > 0));
          assert.ok(edge.some((i) => normal.getY(i) < 0));
        }
      }
    }
    const maximumThickness = Math.max(...wing.halfStations.map((s) => s.thicknessM));
    assert.equal(geometry.boundingBox.min.y, Math.fround(wing.installationYM - maximumThickness * 0.5));
    assert.equal(geometry.boundingBox.max.y, Math.fround(wing.installationYM + maximumThickness * 0.5));
  } finally { geometry.dispose(); }
});

test("mirroring includes smooth normals and triangle diagonals, not only the outline", () => {
  const geometry = createShapeFirstWingGeometry(canonical);
  try {
    const positions = geometry.getAttribute("position"); const normals = geometry.getAttribute("normal");
    const atPosition = new Map();
    for (let i = 0; i < positions.count; i++) {
      const key = positionKey(positions, i); const entries = atPosition.get(key) ?? [];
      entries.push([normals.getX(i), normals.getY(i), normals.getZ(i)]);
      atPosition.set(key, entries);
    }
    for (let i = 0; i < positions.count; i++) {
      const mirror = atPosition.get(pointKey(-positions.getX(i), positions.getY(i), positions.getZ(i)));
      assert.ok(mirror, "every vertex must have its exact mirror");
      assert.ok(mirror.some(([x, y, z]) => Math.hypot(x + normals.getX(i),
        y - normals.getY(i), z - normals.getZ(i)) < 1e-6), "surface normals must mirror too");
    }
    assert.ok(positions.count < geometry.index.count, "surface vertices must be shared for smooth shading");
  } finally { geometry.dispose(); }
});

test("blunt tips close cleanly and the maximum accepted station count stays below 500 triangles", () => {
  const wing = {
    installationYM: -0.23,
    halfStations: Array.from({ length: 8 }, (_, index) => ({
      xM: index, leadingZM: index * 0.1, trailingZM: 3 + index * 0.1,
      thicknessM: 0.2 - index * 0.01,
    })),
  };
  const geometry = createShapeFirstWingGeometry(wing);
  try {
    const result = inspectClosedSurface(geometry);
    assert.equal(result.triangles, 480);
  } finally { geometry.dispose(); }
});

test("a two-station pointed wing has finite normals and closes without degenerate tip fans", () => {
  const geometry = createShapeFirstWingGeometry({ installationYM: 0, halfStations: [
    { xM: 0, leadingZM: -1, trailingZM: 1, thicknessM: 0.1 },
    { xM: 2, leadingZM: 0.25, trailingZM: 0.25, thicknessM: 0.02 },
  ] });
  try { assert.equal(inspectClosedSurface(geometry).triangles, 32); }
  finally { geometry.dispose(); }
});

test("geometry is independently owned and never mutates the canonical station data", () => {
  const before = JSON.stringify(canonical);
  const wing = Object.freeze({ ...canonical,
    halfStations: Object.freeze(canonical.halfStations.map((s) => Object.freeze({ ...s }))) });
  const first = createShapeFirstWingGeometry(wing);
  const second = createShapeFirstWingGeometry(wing);
  try {
    assert.notStrictEqual(first.index.array.buffer, second.index.array.buffer);
    for (const name of ["position", "normal", "uv"]) {
      assert.notStrictEqual(first.attributes[name].array.buffer, second.attributes[name].array.buffer);
    }
    first.attributes.position.setX(0, 999);
    assert.notEqual(second.attributes.position.getX(0), 999);
    assert.equal(JSON.stringify(canonical), before);
  } finally { first.dispose(); second.dispose(); }
});

test("invalid stations fail explicitly instead of producing open or nonfinite geometry", () => {
  const valid = () => structuredClone(canonical);
  const invalid = [
    { ...valid(), installationYM: Infinity },
    { ...valid(), halfStations: [] },
    { ...valid(), halfStations: Array.from({ length: 9 }, (_, xM) => ({
      xM, leadingZM: 0, trailingZM: 1, thicknessM: 0.1,
    })) },
  ];
  for (const [index, key, value] of [
    [0, "xM", 0.1], [1, "xM", 0], [1, "leadingZM", NaN],
    [1, "trailingZM", -10], [1, "thicknessM", -0.1], [1, "thicknessM", 0],
  ]) {
    const wing = valid(); wing.halfStations[index][key] = value; invalid.push(wing);
  }
  const interiorPoint = valid();
  interiorPoint.halfStations[1].trailingZM = interiorPoint.halfStations[1].leadingZM;
  invalid.push(interiorPoint);
  for (const wing of invalid) assert.throws(() => createShapeFirstWingGeometry(wing), /Shape-first wing/);
});
