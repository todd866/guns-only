/**
 * Camp Ember BF:V-density firebase — presentation only.
 *
 * One merged vertex-colored mesh so the canyon draw-call budget stays intact.
 * Replaces the old same-color AABB stack + green ground-war control disc.
 */

import { sampleCobraCanyonTerrain } from "./cobra_canyon_plan.js?v=328";

export const CAMP_EMBER_LANDMARK_ID = "landmark.cobra-canyon.camp-ember.v1";
export const CAMP_EMBER_FIREBASE_SCHEMA = "guns-only.cobra-camp-ember-firebase.v1";
// The authored part list has its clear gate along local +Z. River Gorge launches due east, so
// rotate that gate onto render +X instead of pointing the helicopter into the east berm/tents.
export const CAMP_EMBER_DEPARTURE_YAW_RAD = Math.PI / 2;

/**
 * No elevated presentation geometry may enter this local-pad volume. It contains the authority
 * spawn, both skid stations, the rear-seat eye, the main-rotor disc's near field and 26 m of the
 * eastbound departure. Thin PSP/laterite surfaces at or below `minimumY` are deliberately allowed.
 */
/**
 * How far the DRAWN basin is recessed beneath the simulated apron under Camp Ember, and by the
 * same token how far this mesh is anchored below simulated ground.
 *
 * The owner's long-running Camp Ember "flicker" was never performance — production telemetry
 * measured a locked 60 fps there. It is depth precision. The apron flattens terrain to EXACTLY
 * the camp elevation and this mesh anchored at that same height, so local Y = 0 WAS the drawn
 * ground to the last float bit, and every pad, road and burn scar was authored within 30 mm of
 * it. The cockpit depth quantum is ~5 mm at 100 m; the camp is 105 m across and the pilot sits
 * inside it, so which surface wins flips as the eye moves.
 *
 * polygonOffset cannot solve it: all ~200 parts merge into ONE mesh with one material, so the
 * bias moves the whole camp against the terrain and can never separate the camp's own layers
 * from each other. The geometry has to move, and for it to move up without the pad standing
 * proud of the valley, the drawn ground has to come down.
 *
 * PRESENTATION ONLY — the kernel's contact height is untouched.
 */
export const CAMP_EMBER_DRAWN_RECESS_M = 0.3;

export const CAMP_EMBER_SPAWN_SAFETY_VOLUME = Object.freeze({
  minimumX: -8,
  maximumX: 8,
  minimumY: 0.325,
  maximumY: 5.5,
  minimumZ: -10,
  maximumZ: 26,
});

/** PSP plate / laterite / sandbag / olive / steel — never control-green. */
export const CAMP_EMBER_COLORS = Object.freeze({
  psp: [0.39, 0.41, 0.38],
  pspLight: [0.50, 0.51, 0.46],
  pspRust: [0.47, 0.34, 0.25],
  laterite: [0.49, 0.30, 0.18],
  lateriteDark: [0.39, 0.23, 0.14],
  sandbag: [0.58, 0.50, 0.33],
  sandbagShade: [0.46, 0.40, 0.27],
  tent: [0.25, 0.30, 0.20],
  canvas: [0.39, 0.40, 0.27],
  timber: [0.31, 0.23, 0.14],
  steel: [0.45, 0.46, 0.42],
  rust: [0.42, 0.24, 0.14],
  fuel: [0.28, 0.29, 0.20],
  crate: [0.43, 0.35, 0.22],
});

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function campEmberAnchor(plan) {
  const landmark = (plan?.landmarks ?? []).find((entry) => entry?.id === CAMP_EMBER_LANDMARK_ID);
  const point = landmark?.positionLocalM;
  if (!Array.isArray(point) || point.length < 3) return null;
  const eastM = finite(point[0], NaN);
  const northM = finite(point[2], NaN);
  if (!Number.isFinite(eastM) || !Number.isFinite(northM)) return null;
  const groundY = sampleCobraCanyonTerrain(plan, eastM, northM);
  return { eastM, northM, groundY, landmark };
}

/**
 * Authored prop list in local pad frame: +x east, +z south (render z = -north).
 * The clear gate is authored along +z and rotated onto the eastbound launch heading at build.
 */
export function campEmberFirebaseParts() {
  const parts = [];
  const add = (id, family, shape, color, x, z, centreY, w, h, d, yaw = 0, surface = false) => {
    parts.push({
      id,
      family,
      shape,
      color,
      x,
      centreY,
      z,
      widthM: w,
      heightM: h,
      depthM: d,
      yaw,
      surface,
    });
  };

  // A laterite skirt and individually ribbed PSP strips make two coherent landing surfaces. All
  // metal tops stay at or below +0.013 m: visible over the terrain without becoming a collision-
  // sized slab through the authority skids.
  add("laterite-main", "laterite", "box", CAMP_EMBER_COLORS.laterite, 0, 0,
    0.220, 30, 0.02, 30, 0, true);
  add("psp-main-bed", "psp", "box", CAMP_EMBER_COLORS.psp, 0, 0,
    0.265, 26, 0.02, 26, 0, true);
  for (let index = -5; index <= 5; index++) {
    const color = index % 3 === 0
      ? CAMP_EMBER_COLORS.pspRust
      : index % 2 === 0 ? CAMP_EMBER_COLORS.pspLight : CAMP_EMBER_COLORS.psp;
    add(`psp-main-rib-${index + 5}`, "psp", "box", color, index * 2.08, 0,
      0.314, 1.72, 0.012, 24, 0, true);
  }
  const secondaryYaw = 0.15;
  add("laterite-secondary", "laterite", "box", CAMP_EMBER_COLORS.lateriteDark,
    0, -34, 0.220, 23, 0.02, 23, secondaryYaw, true);
  add("psp-secondary-bed", "psp", "box", CAMP_EMBER_COLORS.psp,
    0, -34, 0.265, 20, 0.02, 20, secondaryYaw, true);
  for (let index = -4; index <= 4; index++) {
    const acrossM = index * 2.05;
    add(`psp-secondary-rib-${index + 4}`, "psp", "box",
      index % 2 === 0 ? CAMP_EMBER_COLORS.pspLight : CAMP_EMBER_COLORS.pspRust,
      Math.cos(secondaryYaw) * acrossM,
      -34 + Math.sin(secondaryYaw) * acrossM,
      0.314, 1.68, 0.012, 18, secondaryYaw, true);
  }
  add("laterite-connector-a", "laterite", "box", CAMP_EMBER_COLORS.laterite,
    0, -17, 0.221, 9, 0.018, 8, 0, true);
  add("laterite-connector-b", "laterite", "box", CAMP_EMBER_COLORS.lateriteDark,
    0, -25, 0.221, 8, 0.018, 8, 0, true);

  // Low modular revetments. Short trapezoidal runs read as stacked sandbags instead of the old
  // 38–42 m monolithic boxes, and leave the entire +Z departure mouth open.
  let revetmentIndex = 0;
  for (const x of [-18, 18]) {
    for (const z of [-10, -2, 6, 14]) {
      add(`revetment-main-${revetmentIndex++}`, "sandbag", "revetment",
        revetmentIndex % 2 ? CAMP_EMBER_COLORS.sandbag : CAMP_EMBER_COLORS.sandbagShade,
        x, z, 0.55, 2.8, 1.1, 6.4, 0);
    }
  }
  for (const x of [-15, 15]) {
    for (const z of [-39, -31]) {
      add(`revetment-secondary-${revetmentIndex++}`, "sandbag", "revetment",
        CAMP_EMBER_COLORS.sandbagShade, x, z, 0.55, 2.7, 1.1, 6.2, secondaryYaw);
    }
  }
  for (const x of [-8, 0, 8]) {
    add(`revetment-rear-${revetmentIndex++}`, "sandbag", "revetment",
      CAMP_EMBER_COLORS.sandbag, x, -47, 0.5, 6.5, 1, 2.6, 0);
  }

  // GP tents and hooches live beyond the rotor/spawn volume. A pitched procedural prism replaces
  // the previous overlapping body/ridge boxes, which read as oversized green blocks.
  const tents = [
    [-25, -25, 0.12, CAMP_EMBER_COLORS.tent],
    [-25, -35, -0.08, CAMP_EMBER_COLORS.canvas],
    [25, -25, -0.18, CAMP_EMBER_COLORS.tent],
    [25, -35, 0.10, CAMP_EMBER_COLORS.canvas],
    [-24, 7, 0.35, CAMP_EMBER_COLORS.canvas],
    [24, 8, -0.30, CAMP_EMBER_COLORS.tent],
  ];
  tents.forEach(([x, z, yaw, color], index) => {
    add(`tent-${index}`, "tent", "tent", color, x, z, 1.5, 7.2, 3, 5.4, yaw);
  });
  for (const [index, x] of [-28, 28].entries()) {
    add(`hooch-${index}`, "hooch", "tent", CAMP_EMBER_COLORS.canvas,
      x, 18, 1.65, 7.4, 3.3, 6, x < 0 ? 0.18 : -0.18);
  }

  // Separate revetted ammo and fuel points. Crates and drums are individually authored with real
  // gaps; the old west crate was guaranteed to penetrate the 12 x 7 m timber block.
  add("ammo-revetment-west", "sandbag", "revetment", CAMP_EMBER_COLORS.sandbagShade,
    -25, 18.5, 0.6, 2.4, 1.2, 9, 0);
  add("ammo-revetment-north", "sandbag", "revetment", CAMP_EMBER_COLORS.sandbag,
    -20, 23.2, 0.6, 12, 1.2, 2.4, 0);
  const ammoCrates = [
    [-21.5, 17, 0.08], [-18.5, 17, -0.06],
    [-21.5, 20, -0.05], [-18.5, 20, 0.09],
  ];
  ammoCrates.forEach(([x, z, yaw], index) => {
    add(`ammo-crate-${index}`, "crate", "box", CAMP_EMBER_COLORS.crate,
      x, z, 0.65, 1.6, 1.3, 1.6, yaw);
  });
  add("fuel-revetment-east", "sandbag", "revetment", CAMP_EMBER_COLORS.sandbagShade,
    25, 19.5, 0.6, 2.4, 1.2, 10, 0);
  add("fuel-revetment-north", "sandbag", "revetment", CAMP_EMBER_COLORS.sandbag,
    20, 24.7, 0.6, 12, 1.2, 2.4, 0);
  const drums = [
    [18, 18, CAMP_EMBER_COLORS.fuel], [20.2, 18, CAMP_EMBER_COLORS.rust],
    [18, 20.2, CAMP_EMBER_COLORS.rust], [20.2, 20.2, CAMP_EMBER_COLORS.fuel],
    [18, 22.4, CAMP_EMBER_COLORS.fuel], [20.2, 22.4, CAMP_EMBER_COLORS.rust],
  ];
  drums.forEach(([x, z, color], index) => {
    add(`fuel-drum-${index}`, "fuel", "cylinder", color, x, z, 0.62, 0.92, 1.24, 0.92, 0);
  });
  [[13, -18, 0.12], [16, -18, -0.08], [-13, -20, 0.05]].forEach(
    ([x, z, yaw], index) => add(`supply-crate-${index}`, "crate", "box",
      CAMP_EMBER_COLORS.crate, x, z, 0.6, 1.5, 1.2, 1.5, yaw),
  );

  // A legged timber watchtower and a slender rust/steel mast provide vertical identity without
  // putting a giant post in the pilot's cold-open sightline.
  const towerX = -30;
  const towerZ = -6;
  [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]].forEach(
    ([dx, dz], index) => add(`tower-leg-${index}`, "timber", "box", CAMP_EMBER_COLORS.timber,
      towerX + dx, towerZ + dz, 3, 0.34, 6, 0.34, 0),
  );
  add("tower-platform", "timber", "box", CAMP_EMBER_COLORS.timber,
    towerX, towerZ, 6.15, 4.2, 0.3, 4.2, 0);
  add("tower-roof", "hooch", "tent", CAMP_EMBER_COLORS.canvas,
    towerX, towerZ, 7.25, 4.8, 1.9, 4.8, 0);
  add("radio-mast", "steel", "cylinder", CAMP_EMBER_COLORS.steel,
    30, -32, 7.5, 0.38, 15, 0.38, 0);
  add("radio-crossbar", "steel", "box", CAMP_EMBER_COLORS.rust,
    30, -32, 15.05, 2.5, 0.22, 0.22, 0.45);

  // ---- The FSB read (docs/art-direction/vietnam-fob-battlefield-reference.md) ----
  // Local frame: +x = north, +z = east (the group rotates by the departure yaw).
  const addFan = (id, family, color, x, z, centreY, outline) => {
    parts.push({
      id, family, shape: "fan", color, x, z, centreY,
      widthM: 1, heightM: 0.01, depthM: 1, yaw: 0, surface: true, outline,
    });
  };

  // The scar is the base (Granite): an irregular laterite fan under everything, kept
  // inside the 58 m flat contact apron so presentation never floats over the blend ring.
  const scarOutline = [
    [52, 4], [44, 22], [30, 40], [10, 50], [-12, 52], [-30, 43],
    [-45, 27], [-53, 8], [-50, -12], [-40, -30], [-24, -44], [-4, -52],
    [18, -49], [36, -37], [48, -18],
  ];
  // Brighter than the deep laterite so the scar survives the aerial haze — the scar IS
  // the base from the air (Granite), not an accent.
  addFan("scar-apron", "laterite", [0.55, 0.36, 0.22], 0, 0, 0.050, scarOutline);

  // Berm ring with the eastbound departure mouth left open (Sedgwick).
  let bermIndex = 0;
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2;
    const x = 41 * Math.cos(angle);
    const z = 41 * Math.sin(angle);
    if (z > 30 && Math.abs(x) < 14) continue; // departure mouth
    add(`berm-${bermIndex++}`, "sandbag", "revetment",
      i % 2 ? CAMP_EMBER_COLORS.sandbagShade : CAMP_EMBER_COLORS.lateriteDark,
      x, z, 0.6, 3.2, 1.2, 11.5, -angle);
  }

  // Inner ring road + track spaghetti: worn laterite surfaces, never elevated.
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + 0.13;
    add(`ring-road-${i}`, "laterite", "box", CAMP_EMBER_COLORS.laterite,
      33 * Math.cos(angle), 33 * Math.sin(angle), 0.134, 4.2, 0.012, 17.5, -angle, true);
  }
  // The four radial "tracks" are GONE. They were 24-38 m bright-laterite rectangles running
  // outward from the camp and stopping dead in open ground — from the cockpit, a hard-edged
  // orange stripe leading nowhere, which is what the owner kept reporting as "that random red
  // line". A track has to connect two places to read as a track; these connected the camp to
  // nothing, so they read as a rendering artifact rather than terrain.
  //
  // The 12 ring-road segments above stay: they close a loop inside the camp, so they read as
  // road. If radial tracks return they must run to something — the river ford, the treeline
  // gap, the bridge approach — and taper rather than end square.

  // Two rosette positions: pit disc + radiating sandbag lobes (the aerial signature).
  const rosettes = [[-38, 8], [36, 14]];
  rosettes.forEach(([rx, rz], rosetteIndex) => {
    const pitOutline = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      pitOutline.push([4.6 * Math.cos(angle), 4.6 * Math.sin(angle)]);
    }
    addFan(`rosette-${rosetteIndex}-pit`, "laterite", CAMP_EMBER_COLORS.lateriteDark,
      rx, rz, 0.095, pitOutline);
    for (let lobe = 0; lobe < 6; lobe++) {
      const angle = (lobe / 6) * Math.PI * 2 + rosetteIndex * 0.4;
      add(`rosette-${rosetteIndex}-lobe-${lobe}`, "sandbag", "revetment",
        lobe % 2 ? CAMP_EMBER_COLORS.sandbag : CAMP_EMBER_COLORS.sandbagShade,
        rx + 5.6 * Math.cos(angle), rz + 5.6 * Math.sin(angle),
        0.5, 2.2, 1.0, 4.4, -angle + Math.PI / 2);
    }
  });

  // Burn scars (Granite's black blobs).
  const burnOutline = (radiusM) => {
    const outline = [];
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const wobble = 1 + 0.35 * Math.sin(angle * 3 + radiusM);
      outline.push([radiusM * wobble * Math.cos(angle), radiusM * wobble * Math.sin(angle)]);
    }
    return outline;
  };
  addFan("burn-0", "burn", [0.09, 0.08, 0.07], 42, -18, 0.095, burnOutline(5.5));
  addFan("burn-1", "burn", [0.11, 0.10, 0.08], -16, 43, 0.095, burnOutline(4.5));

  // Bunker mounds on the berm's inner face: sandbag sides, glinting PSP roofs (A Shau).
  const bunkers = [[26, -24, 0.3], [-27, -16, -0.2], [15, -39, 0.1]];
  bunkers.forEach(([bx, bz, byaw], bunkerIndex) => {
    add(`bunker-${bunkerIndex}`, "bunker", "box", CAMP_EMBER_COLORS.sandbagShade,
      bx, bz, 0.7, 4.6, 1.4, 3.6, byaw);
    add(`bunker-${bunkerIndex}-roof`, "bunker", "box", CAMP_EMBER_COLORS.pspLight,
      bx, bz, 1.5, 5.2, 0.18, 4.2, byaw);
  });

  // Defoliated fringe accents: bare gray-brown poles where the jungle used to be.
  const deadTrees = [[50, -6], [46, 20], [-49, -12], [-44, 26], [8, -50], [-30, -40]];
  deadTrees.forEach(([tx, tz], treeIndex) => {
    add(`deadtree-${treeIndex}`, "deadtree", "cylinder", [0.30, 0.27, 0.22],
      tx, tz, 3.4, 0.4, 6.8, 0.4, 0);
  });

  // Bird revetments at the sim spare stations (CobraAirframePool: north ±30, east +6).
  // Open toward +z (east) so the spares taxi out the departure mouth. The station id part
  // is the parking surface itself; walls carry sub-ids.
  for (const [stationIndex, stationX] of [30, -30].entries()) {
    add(`bird-revetment-${stationIndex}`, "laterite", "box", CAMP_EMBER_COLORS.laterite,
      stationX, 6, 0.178, 11, 0.014, 12, 0, true);
    add(`bird-revetment-${stationIndex}-back`, "sandbag", "revetment",
      CAMP_EMBER_COLORS.sandbagShade, stationX, -0.8, 0.65, 9.5, 1.3, 2.4, Math.PI / 2);
    add(`bird-revetment-${stationIndex}-north`, "sandbag", "revetment",
      CAMP_EMBER_COLORS.sandbag, stationX + 5.2, 6, 0.65, 2.4, 1.3, 11, 0);
    add(`bird-revetment-${stationIndex}-south`, "sandbag", "revetment",
      CAMP_EMBER_COLORS.sandbag, stationX - 5.2, 6, 0.65, 2.4, 1.3, 11, 0);
  }

  return parts;
}

function triangularPrismGeometry(THREE) {
  const positions = new Float32Array([
    // front / back
    -0.5, -0.5, -0.5, 0, 0.5, -0.5, 0.5, -0.5, -0.5,
    0.5, -0.5, 0.5, 0, 0.5, 0.5, -0.5, -0.5, 0.5,
    // floor
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5,
    -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    // left and right roof slopes
    -0.5, -0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, -0.5,
    -0.5, -0.5, 0.5, 0, 0.5, -0.5, -0.5, -0.5, -0.5,
    0.5, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5,
    0.5, -0.5, -0.5, 0, 0.5, 0.5, 0.5, -0.5, 0.5,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function revetmentGeometry(THREE) {
  const bottom = 0.5;
  const topX = 0.36;
  const topZ = 0.40;
  const vertices = [
    [-bottom, -0.5, -bottom], [bottom, -0.5, -bottom],
    [bottom, -0.5, bottom], [-bottom, -0.5, bottom],
    [-topX, 0.5, -topZ], [topX, 0.5, -topZ],
    [topX, 0.5, topZ], [-topX, 0.5, topZ],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ];
  const positions = new Float32Array(faces.flatMap((face) => face.flatMap((index) => vertices[index])));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function fanGeometry(THREE, outline) {
  // A flat, upward-facing triangle fan over an authored irregular outline, in metres.
  // Surface parts only: the caller keeps these at or below the terrain-seated plates.
  const positions = new Float32Array(outline.length * 9);
  for (let index = 0; index < outline.length; index++) {
    const [ax, az] = outline[index];
    const [bx, bz] = outline[(index + 1) % outline.length];
    positions.set([0, 0, 0, ax, 0, az, bx, 0, bz], index * 9);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function partGeometryWithColor(THREE, part) {
  let geometry;
  if (part.shape === "tent") geometry = triangularPrismGeometry(THREE);
  else if (part.shape === "revetment") geometry = revetmentGeometry(THREE);
  else if (part.shape === "cylinder") geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
  else if (part.shape === "fan") geometry = fanGeometry(THREE, part.outline);
  else geometry = new THREE.BoxGeometry(1, 1, 1);
  if (typeof geometry.toNonIndexed === "function") {
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose?.();
      geometry = nonIndexed;
    }
  }
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    colors[index * 3] = part.color[0];
    colors[index * 3 + 1] = part.color[1];
    colors[index * 3 + 2] = part.color[2];
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // Every authored vertical value is explicitly `centreY`. The old implicit `y` mixed centre and
  // base semantics, then a base-anchor translation floated props by half their height.
  geometry.scale(part.widthM, part.heightM, part.depthM);
  if (part.yaw) geometry.rotateY(part.yaw);
  geometry.translate(part.x, part.centreY, part.z);
  return geometry;
}

function mergeGeometries(THREE, geometries) {
  // Prefer upstream util when present; otherwise concatenate attributes.
  const util = THREE.BufferGeometryUtils?.mergeGeometries
    ?? globalThis.THREE?.BufferGeometryUtils?.mergeGeometries;
  if (typeof util === "function") {
    return util(geometries, false);
  }
  let total = 0;
  for (const geometry of geometries) total += geometry.getAttribute("position").count;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  let cursor = 0;
  for (const geometry of geometries) {
    const pos = geometry.getAttribute("position");
    const col = geometry.getAttribute("color");
    const nor = geometry.getAttribute("normal");
    for (let index = 0; index < pos.count; index++) {
      positions[(cursor + index) * 3] = pos.getX(index);
      positions[(cursor + index) * 3 + 1] = pos.getY(index);
      positions[(cursor + index) * 3 + 2] = pos.getZ(index);
      colors[(cursor + index) * 3] = col.getX(index);
      colors[(cursor + index) * 3 + 1] = col.getY(index);
      colors[(cursor + index) * 3 + 2] = col.getZ(index);
      if (nor) {
        normals[(cursor + index) * 3] = nor.getX(index);
        normals[(cursor + index) * 3 + 1] = nor.getY(index);
        normals[(cursor + index) * 3 + 2] = nor.getZ(index);
      }
    }
    cursor += pos.count;
    geometry.dispose?.();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return merged;
}

/**
 * @returns {{ group: object, mesh: object, partCount: number, families: string[], drawCalls: number, triangles: number, resources: object } | null}
 */
export function createCampEmberFirebase(THREE, plan) {
  const anchor = campEmberAnchor(plan);
  if (!anchor) return null;
  const parts = campEmberFirebaseParts();
  const geometries = parts.map((part) => partGeometryWithColor(THREE, part));
  let rangeStart = 0;
  const partVertexRanges = geometries.map((geometry, index) => {
    const count = geometry.getAttribute("position").count;
    const range = Object.freeze({
      id: parts[index].id,
      start: rangeStart,
      count,
    });
    rangeStart += count;
    return range;
  });
  const geometry = mergeGeometries(THREE, geometries);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.06,
    flatShading: true,
    // The terrain-seated plates live millimetres from the rendered basin; at a 32 km far
    // plane a real GPU's depth buffer cannot separate them and the whole pad shimmers
    // under a moving eye (owner: "super flickery"). The standard decal fix: bias the
    // merged firebase toward the camera in depth. SwiftShader-based probes mask this
    // artifact, so do not "prove" it fixed with a headless capture alone.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "CAMP_EMBER_FIREBASE";
  // Seat the camp on the RECESSED drawn ground, not the simulated apron. The stack above was
  // re-authored with real thickness so its surfaces stop sharing depth samples; if the anchor
  // stayed at simulated height that thickness would push the PSP plate 30 cm above where the
  // skids touch and the aircraft would look sunk into its own pad. Anchor down by the recess,
  // stack up by the recess: contact height is preserved exactly.
  mesh.position.set(
    anchor.eastM,
    anchor.groundY - CAMP_EMBER_DRAWN_RECESS_M,
    -anchor.northM,
  );
  mesh.rotation.y = CAMP_EMBER_DEPARTURE_YAW_RAD;
  // One merged draw with real vertical mass: Camp Ember should sit on the basin under the same
  // cast-shadow policy as the other landmark silhouettes.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const tag = Object.freeze({
    schema: CAMP_EMBER_FIREBASE_SCHEMA,
    role: "camp-ember-firebase",
    presentationOnly: true,
    authoritative: false,
    collisionSource: false,
    targetSource: false,
    targetable: false,
    landmarkId: CAMP_EMBER_LANDMARK_ID,
    partCount: parts.length,
  });
  mesh.userData.cobraCanyon = tag;

  const group = new THREE.Group();
  group.name = "CAMP_EMBER_FIREBASE_ROOT";
  group.userData.cobraCanyon = tag;
  group.castShadow = false;
  group.add(mesh);

  const positionCount = geometry.getAttribute("position").count;
  return {
    group,
    mesh,
    partCount: parts.length,
    partVertexRanges: Object.freeze(partVertexRanges),
    families: [...new Set(parts.map((part) => part.family))],
    drawCalls: 1,
    triangles: Math.floor(positionCount / 3),
    resources: {
      geometries: [geometry],
      materials: [material],
      meshes: [mesh],
    },
  };
}

export function isCampEmberGroundSite(site) {
  const landmarkId = String(site?.landmark_id ?? site?.landmarkId ?? "");
  const id = String(site?.id ?? "");
  return landmarkId.includes("camp-ember") || id.includes("camp-ember");
}
