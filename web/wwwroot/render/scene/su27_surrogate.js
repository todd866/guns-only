import * as THREE from "../../vendor/three.module.js";
import {
  addSemanticSocket,
  annotateProceduralFallback,
  createFinGeometry,
  createPlanformGeometry,
  makeMaterial,
} from "./airframe_primitives.js?v=__RELEASE_BUILD__";

// Su-27S-family exterior silhouette for the F-22 visual merge. Code-authored from published
// overall dimensions only (length 21.935 m, span 14.698 m over the wingtip rails); no external
// mesh, drawing or texture enters it. It is a presentation surrogate: gun hits, aim and contact
// geometry stay the simulation's, and nothing here feeds back into them.
export const SU27_PRESENTATION_ID = "presentation.vehicle.su27s.public-data-surrogate.v1";
export const SU27_LENGTH_M = 21.935;
export const SU27_SPAN_M = 14.698;
// Keep the near body + canopy through gun range, including an approach from the far LOD.
// Switch out at 1,800 m and back in below 1,584 m with the existing 12% hysteresis.
export const SU27_FAR_LOD_DISTANCE_M = 1800;
export const SU27_LOD_HYSTERESIS = 0.12;

// Station s is metres aft of the radome tip; the model origin sits at s = 11.2 (near the mid-wing
// reference point). Aircraft local -Z is forward, +Y up, +X right, as for every other airframe.
const ORIGIN_STATION_M = 11.2;
const z = (station) => station - ORIGIN_STATION_M;
const HALF_SPAN_M = SU27_SPAN_M / 2;

// Two-tone blue-grey in the darker Flanker scheme. Measured in the real game camera, the light
// Su-27 factory grey sat within ~60 luminance levels of the hazy sky and pale terrain at 1.5 km;
// this keeps the airframe a dark mid-tone against both while the lighter radome, dark intakes and
// nozzles still carry aspect.
const COLOR = Object.freeze({
  upper: new THREE.Color(0x4a5b6a),
  lower: new THREE.Color(0x667886),
  radome: new THREE.Color(0x9aa4a9),
  dielectric: new THREE.Color(0x2b343b),
  intake: new THREE.Color(0x07090a),
  nozzle: new THREE.Color(0x3d3833),
  nozzleInner: new THREE.Color(0x100d0b),
  fin: new THREE.Color(0x435466),
  canopyFar: new THREE.Color(0x14212a),
});

function superellipseOffset(theta, exponent) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const power = 2 / exponent;
  return [
    Math.sign(c) * Math.abs(c) ** power,
    Math.sign(s) * Math.abs(s) ** power,
  ];
}

// A loft whose cross-section can be elliptical (n=2) or squarer (n≈4), with optional per-station
// colours. The skin is smooth-shaded; end caps are flat. Returned non-indexed for merging.
function loft(stations, segments, { xOffset = 0, capStart = null, capEnd = null } = {}) {
  const rings = stations.map((station) => {
    const exponent = station.n ?? 2;
    const ring = [];
    for (let i = 0; i < segments; i++) {
      const theta = i / segments * Math.PI * 2;
      const [ox, oy] = superellipseOffset(theta, exponent);
      ring.push(new THREE.Vector3(
        xOffset + ox * station.rx,
        station.y + oy * station.ry,
        z(station.s),
      ));
    }
    return ring;
  });
  const positions = [];
  const colors = [];
  const indices = [];
  rings.forEach((ring, stationIndex) => {
    const station = stations[stationIndex];
    for (const vertex of ring) {
      const tone = station.color ?? (vertex.y >= station.y ? COLOR.upper : COLOR.lower);
      positions.push(vertex.x, vertex.y, vertex.z);
      colors.push(tone.r, tone.g, tone.b);
    }
  });
  for (let index = 0; index < rings.length - 1; index++) {
    const a = index * segments;
    const b = a + segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(a + i, a + next, b + i, a + next, b + next, b + i);
    }
  }
  const skin = new THREE.BufferGeometry();
  skin.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  skin.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  skin.setIndex(indices);
  skin.computeVertexNormals();
  const parts = [skin.toNonIndexed()];
  skin.dispose();

  const cap = (ring, station, color, facingForward) => {
    const capPositions = [];
    const capColors = [];
    const centre = new THREE.Vector3(xOffset, station.y, z(station.s));
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const order = facingForward ? [centre, ring[next], ring[i]] : [centre, ring[i], ring[next]];
      for (const vertex of order) {
        capPositions.push(vertex.x, vertex.y, vertex.z);
        capColors.push(color.r, color.g, color.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(capPositions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(capColors, 3));
    geometry.computeVertexNormals();
    parts.push(geometry);
  };
  if (capStart) cap(rings[0], stations[0], capStart, true);
  if (capEnd) cap(rings[rings.length - 1], stations[stations.length - 1], capEnd, false);
  return parts;
}

// Flat-coloured copy of an extruded primitive with its world placement baked in.
function painted(geometry, color, matrix = null, { underside = null } = {}) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (matrix) flat.applyMatrix4(matrix);
  flat.deleteAttribute("uv");
  flat.computeVertexNormals();
  const count = flat.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const normals = flat.attributes.normal;
  for (let i = 0; i < count; i++) {
    const tone = underside && normals.getY(i) < -0.2 ? underside : color;
    colors[i * 3] = tone.r;
    colors[i * 3 + 1] = tone.g;
    colors[i * 3 + 2] = tone.b;
  }
  flat.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  flat.clearGroups();
  return flat;
}

function mergeParts(parts) {
  let total = 0;
  for (const part of parts) total += part.attributes.position.count;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  let offset = 0;
  for (const part of parts) {
    positions.set(part.attributes.position.array, offset * 3);
    normals.set(part.attributes.normal.array, offset * 3);
    colors.set(part.attributes.color.array, offset * 3);
    offset += part.attributes.position.count;
    part.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

const translation = (x, y, zM) => new THREE.Matrix4().makeTranslation(x, y, zM);

// Mid-fuselage, spine and tail sting. The nose droops slightly below the cockpit line, the centre
// body is a wide flat lifting section, and the sting runs past the nozzles to the full length.
function fuselageStations() {
  return [
    { s: 0.0, rx: 0.03, ry: 0.03, y: -0.14, color: COLOR.radome },
    { s: 0.7, rx: 0.3, ry: 0.29, y: -0.1, color: COLOR.radome },
    { s: 1.8, rx: 0.5, ry: 0.48, y: 0.04, color: COLOR.radome },
    { s: 2.6, rx: 0.6, ry: 0.58, y: 0.08, color: COLOR.dielectric },
    { s: 2.75, rx: 0.61, ry: 0.59, y: 0.08 },
    { s: 4.0, rx: 0.72, ry: 0.7, y: 0.16 },
    { s: 5.6, rx: 0.8, ry: 0.78, y: 0.2 },
    { s: 7.2, rx: 0.92, ry: 0.78, y: 0.18 },
    { s: 9.2, rx: 1.06, ry: 0.7, y: 0.12, n: 2.4 },
    { s: 11.5, rx: 1.3, ry: 0.62, y: 0.1, n: 3.0 },
    { s: 14.0, rx: 1.42, ry: 0.56, y: 0.06, n: 3.2 },
    { s: 16.2, rx: 1.2, ry: 0.48, y: 0.02, n: 3.0 },
    { s: 18.0, rx: 0.66, ry: 0.4, y: 0.0 },
    { s: 19.4, rx: 0.44, ry: 0.36, y: 0.0 },
    { s: 21.3, rx: 0.32, ry: 0.27, y: 0.0 },
    { s: SU27_LENGTH_M, rx: 0.05, ry: 0.05, y: 0.0, color: COLOR.dielectric },
  ];
}

function spineStations() {
  return [
    { s: 7.2, rx: 0.34, ry: 0.3, y: 0.9 },
    { s: 8.4, rx: 0.5, ry: 0.36, y: 0.86 },
    { s: 11.5, rx: 0.58, ry: 0.34, y: 0.7 },
    { s: 14.5, rx: 0.46, ry: 0.26, y: 0.5 },
    { s: 17.0, rx: 0.2, ry: 0.12, y: 0.32 },
  ];
}

// Rectangular raked-in-plan intakes under the LERX, rounding into the engine bays and nozzles.
function nacelleStations() {
  return [
    { s: 7.0, rx: 0.54, ry: 0.62, y: -0.8, n: 4.5 },
    { s: 9.0, rx: 0.57, ry: 0.63, y: -0.76, n: 4.0 },
    { s: 12.5, rx: 0.6, ry: 0.6, y: -0.66, n: 3.4 },
    { s: 16.0, rx: 0.64, ry: 0.62, y: -0.42, n: 2.6 },
    { s: 18.4, rx: 0.62, ry: 0.6, y: -0.36, n: 2.1 },
    { s: 18.9, rx: 0.6, ry: 0.58, y: -0.35, color: COLOR.nozzle },
    { s: 19.9, rx: 0.56, ry: 0.54, y: -0.33, color: COLOR.nozzle },
  ];
}

function boomStations() {
  return [
    { s: 14.8, rx: 0.12, ry: 0.1, y: -0.12, n: 3 },
    { s: 16.0, rx: 0.3, ry: 0.2, y: -0.14, n: 3 },
    { s: 20.2, rx: 0.28, ry: 0.18, y: -0.14, n: 3 },
    { s: 20.9, rx: 0.08, ry: 0.06, y: -0.14, n: 3 },
  ];
}

// Planform points are [x, s]. One symmetric polygon carries LERX + wing, so the ogival strake
// blends into the 42-degree leading edge without a seam.
function wingPlanform() {
  const tipX = HALF_SPAN_M - 0.2;
  const rootLeadingEdge = 9.6;
  const tipLeadingEdge = rootLeadingEdge + (tipX - 2.0) * Math.tan(THREE.MathUtils.degToRad(42));
  const right = [
    [0.62, 5.3], [0.98, 6.5], [1.42, 8.0], [2.0, rootLeadingEdge],
    [tipX, tipLeadingEdge], [tipX, tipLeadingEdge + 1.55], [2.3, 16.5], [0.0, 16.5],
  ];
  const left = right.slice(0, -1).reverse().map(([x, s]) => [-x, s]);
  return [[0, 5.1], ...right, ...left].map(([x, s]) => [x, z(s)]);
}

function stabilatorPlanform(side) {
  const tipX = side * 4.94;
  const rootX = side * 1.95;
  const points = [[rootX, 17.6], [tipX, 20.35], [tipX, 21.25], [rootX, 20.9]];
  const ordered = side > 0 ? points : points.slice().reverse();
  return ordered.map(([x, s]) => [x, z(s)]);
}

function buildBody({ segments, farCanopy }) {
  const parts = [];
  parts.push(...loft(fuselageStations(), segments));
  parts.push(...loft(spineStations(), Math.max(8, segments - 6)));
  for (const side of [-1, 1]) {
    parts.push(...loft(nacelleStations(), Math.max(8, segments - 4), {
      xOffset: side * 1.38,
      capStart: COLOR.intake,
      capEnd: COLOR.nozzleInner,
    }));
    parts.push(...loft(boomStations(), 8, { xOffset: side * 2.3 }));
  }

  const wing = createPlanformGeometry(wingPlanform(), 0.2, 0.06);
  parts.push(painted(wing, COLOR.upper, translation(0, -0.08, 0), { underside: COLOR.lower }));
  wing.dispose();

  for (const side of [-1, 1]) {
    const stab = createPlanformGeometry(stabilatorPlanform(side), 0.12, 0.035);
    parts.push(painted(stab, COLOR.upper, translation(0, -0.16, 0), { underside: COLOR.lower }));
    stab.dispose();

    // Wingtip launch rail: the squared-off tip is a strong head-on and plan-view cue.
    const rail = new THREE.BoxGeometry(0.2, 0.16, 3.4);
    parts.push(painted(rail, COLOR.fin, translation(side * (HALF_SPAN_M - 0.1), -0.02, z(15.2))));
    rail.dispose();
  }

  // Twin vertical fins on the tail booms, outboard of the engines (points are [s, height]).
  const fin = createFinGeometry([
    [15.9, 0.0], [19.95, 0.0], [19.8, 3.25], [18.6, 3.25],
  ].map(([s, height]) => [z(s), height]), 0.14);
  const ventral = createFinGeometry([
    [15.7, 0.0], [17.6, 0.0], [17.45, -1.05], [16.9, -1.05],
  ].map(([s, height]) => [z(s), height]), 0.1);
  for (const side of [-1, 1]) {
    parts.push(painted(fin, COLOR.fin, translation(side * 2.3, 0.02, 0)));
    // Ventral fins sit under the booms and splay slightly outward.
    const ventralMatrix = translation(side * 2.05, -0.26, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(side * -0.26));
    parts.push(painted(ventral, COLOR.lower, ventralMatrix));
  }
  fin.dispose();
  ventral.dispose();

  if (farCanopy) {
    const canopy = new THREE.SphereGeometry(1, 8, 5);
    const matrix = translation(0, 0.98, z(6.0))
      .multiply(new THREE.Matrix4().makeScale(0.52, 0.5, 1.8));
    parts.push(painted(canopy, COLOR.canopyFar, matrix));
    canopy.dispose();
  }
  return mergeParts(parts);
}

function bodyMaterial() {
  // Reduce body albedo ~21% in linear light and temper sky reflections for a darker silhouette
  // against sky/haze. Both LODs share this finish so the swap introduces no colour step or pass.
  const material = makeMaterial(0xe6e6e6, 0.56, 0.06, 0x000000,
    { grain: 0.1, grainScale: 1.6, envMapIntensity: 0.65 });
  material.vertexColors = true;
  material.name = "SU27_BODY";
  return material;
}

function createNearLevel(material) {
  const group = new THREE.Group();
  group.name = "SU27_LOD0";
  const body = new THREE.Mesh(buildBody({ segments: 18, farCanopy: false }), material);
  body.name = "SU27_LOD0_BODY";
  group.add(body);
  const canopyMaterial = makeMaterial(0x0f2630, 0.09, 0.02, 0x02090d,
    { grain: 0, clearcoat: 1, clearcoatRoughness: 0.065, specularIntensity: 1, envMapIntensity: 1.35 });
  canopyMaterial.name = "SU27_CANOPY";
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), canopyMaterial);
  canopy.name = "SU27_LOD0_CANOPY";
  canopy.scale.set(0.52, 0.5, 1.8);
  canopy.position.set(0, 0.98, z(6.0));
  group.add(canopy);
  return group;
}

function createFarLevel(material) {
  const body = new THREE.Mesh(buildBody({ segments: 10, farCanopy: true }), material);
  body.name = "SU27_LOD1_BODY";
  return body;
}

export function createSu27(context = {}) {
  const group = new THREE.Group();
  group.name = "SU27S_PUBLIC_DATA_SURROGATE";
  const material = bodyMaterial();
  const lod = new THREE.LOD();
  lod.name = "SU27_LOD";
  lod.addLevel(createNearLevel(material), 0, 0);
  lod.addLevel(createFarLevel(material), SU27_FAR_LOD_DISTANCE_M, SU27_LOD_HYSTERESIS);
  group.add(lod);

  group.userData.sockets = Object.freeze({
    cockpitCamera: addSemanticSocket(group, "SOCKET_CAMERA_COCKPIT", 0, 1.0, z(5.9)),
    // GSh-30-1 sits in the starboard wing-root strake.
    muzzleRight: addSemanticSocket(group, "SOCKET_MUZZLE_RIGHT", 1.05, 0.05, z(7.4)),
  });
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  annotateProceduralFallback(group, context);
  return group;
}

// Budget readback for tests and the handoff: triangles and draw calls per LOD level.
export function su27LevelBudgets(object) {
  const lod = object.getObjectByName("SU27_LOD");
  return lod.levels.map((level) => {
    let triangles = 0;
    let drawCalls = 0;
    level.object.traverse((child) => {
      if (!child.isMesh) return;
      const geometry = child.geometry;
      triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
      drawCalls += 1;
    });
    return { distance: level.distance, triangles, drawCalls };
  });
}
