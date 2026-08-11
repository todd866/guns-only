/**
 * Camp Ember BF:V-density firebase — presentation only.
 *
 * One merged vertex-colored mesh so the canyon draw-call budget stays intact.
 * Replaces the old same-color AABB stack + green ground-war control disc.
 */

import { sampleCobraCanyonTerrain } from "./cobra_canyon_plan.js?v=310";

export const CAMP_EMBER_LANDMARK_ID = "landmark.cobra-canyon.camp-ember.v1";
export const CAMP_EMBER_FIREBASE_SCHEMA = "guns-only.cobra-camp-ember-firebase.v1";

/** PSP plate / laterite / sandbag / olive / steel — never control-green. */
export const CAMP_EMBER_COLORS = Object.freeze({
  psp: [0.42, 0.44, 0.40],
  laterite: [0.48, 0.34, 0.22],
  sandbag: [0.62, 0.55, 0.38],
  tent: [0.28, 0.34, 0.24],
  timber: [0.36, 0.28, 0.18],
  steel: [0.55, 0.56, 0.54],
  fuel: [0.32, 0.30, 0.22],
  crate: [0.40, 0.36, 0.26],
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
 * Keep the rear-seat forward eye (+z toward gorge join) relatively open.
 */
export function campEmberFirebaseParts() {
  const parts = [];
  const add = (family, color, x, z, y, w, h, d, yaw = 0) => {
    parts.push({
      family,
      color,
      x,
      y,
      z,
      widthM: w,
      heightM: h,
      depthM: d,
      yaw,
    });
  };

  // Dual PSP pads — ribbed by overlapping thin plates.
  add("psp", CAMP_EMBER_COLORS.psp, 0, 0, 0.12, 26, 0.28, 26, 0);
  add("psp", CAMP_EMBER_COLORS.psp, 0, 0, 0.18, 24, 0.12, 2.2, 0);
  add("psp", CAMP_EMBER_COLORS.psp, 0, 0, 0.18, 2.2, 0.12, 24, 0);
  add("psp", CAMP_EMBER_COLORS.psp, 0, -34, 0.12, 20, 0.26, 20, 0.15);
  add("psp", CAMP_EMBER_COLORS.psp, 0, -34, 0.18, 18, 0.1, 1.8, 0.15);
  add("laterite", CAMP_EMBER_COLORS.laterite, 0, -17, 0.08, 14, 0.16, 8, 0);

  // Sandbag berm ring — open toward gorge (+z / south approach stays lower).
  add("sandbag", CAMP_EMBER_COLORS.sandbag, -24, -8, 1.1, 3.2, 2.2, 42, 0);
  add("sandbag", CAMP_EMBER_COLORS.sandbag, 24, -10, 1.0, 3.2, 2.0, 38, 0);
  add("sandbag", CAMP_EMBER_COLORS.sandbag, -6, -48, 1.0, 36, 2.0, 3.4, 0);
  add("sandbag", CAMP_EMBER_COLORS.sandbag, -18, 18, 1.15, 22, 2.3, 3.6, 0.2);
  add("sandbag", CAMP_EMBER_COLORS.sandbag, 16, 16, 1.05, 18, 2.1, 3.4, -0.25);
  // Approach gap toward river join (positive z) — lower berm stubs only.
  add("sandbag", CAMP_EMBER_COLORS.sandbag, -20, 8, 0.7, 8, 1.4, 3.0, 0.4);
  add("sandbag", CAMP_EMBER_COLORS.sandbag, 18, 6, 0.7, 8, 1.4, 3.0, -0.35);

  // Revetted ammo / fuel cluster (west-north of main pad, off the nose).
  add("timber", CAMP_EMBER_COLORS.timber, -14, 20, 1.4, 12, 2.8, 7, 0.1);
  add("fuel", CAMP_EMBER_COLORS.fuel, 12, 20, 1.3, 5.5, 2.6, 5.5, 0);
  add("fuel", CAMP_EMBER_COLORS.fuel, 18, 18, 1.1, 4.2, 2.2, 4.2, 0.3);
  add("crate", CAMP_EMBER_COLORS.crate, -10, 16, 0.7, 2.4, 1.4, 2.4, 0.2);
  add("crate", CAMP_EMBER_COLORS.crate, -7, 17, 0.7, 2.2, 1.4, 2.2, -0.1);
  add("crate", CAMP_EMBER_COLORS.crate, 8, -20, 0.65, 2.0, 1.3, 2.0, 0.4);
  add("crate", CAMP_EMBER_COLORS.crate, 11, -18, 0.65, 2.0, 1.3, 2.0, -0.2);
  add("crate", CAMP_EMBER_COLORS.crate, -16, -22, 0.6, 1.8, 1.2, 1.8, 0.1);

  // GP tents / hooches along berms (olive).
  const tents = [
    [-20, -28, 0.15],
    [-16, -32, -0.2],
    [18, -26, 0.35],
    [14, -30, -0.15],
    [-22, 2, 0.5],
    [20, -2, -0.4],
  ];
  for (const [tx, tz, yaw] of tents) {
    add("tent", CAMP_EMBER_COLORS.tent, tx, tz, 1.5, 7.5, 3.0, 5.5, yaw);
    add("tent", CAMP_EMBER_COLORS.tent, tx, tz, 2.7, 6.2, 1.2, 4.4, yaw); // ridge
  }

  // Watchtower (offset west) + thin radio mast (north berm — not in the cold-open nose).
  add("timber", CAMP_EMBER_COLORS.timber, -28, -6, 4.5, 3.2, 9.0, 3.2, 0);
  add("timber", CAMP_EMBER_COLORS.timber, -28, -6, 9.2, 5.5, 1.2, 5.5, 0);
  add("steel", CAMP_EMBER_COLORS.steel, -28, -6, 11.0, 0.55, 3.5, 0.55, 0);
  add("steel", CAMP_EMBER_COLORS.steel, -8, 24, 8.5, 0.45, 17, 0.45, 0);
  add("steel", CAMP_EMBER_COLORS.steel, -8, 24, 17.2, 2.2, 0.35, 0.35, 0.6);

  // Sandbag fighting positions.
  add("sandbag", CAMP_EMBER_COLORS.sandbag, 10, -16, 0.9, 5.5, 1.8, 5.5, 0.3);
  add("sandbag", CAMP_EMBER_COLORS.sandbag, -12, -14, 0.85, 5.0, 1.7, 5.0, -0.2);

  return parts;
}

function boxGeometryWithColor(THREE, part) {
  let geometry = new THREE.BoxGeometry(1, 1, 1);
  if (typeof geometry.toNonIndexed === "function") {
    const nonIndexed = geometry.toNonIndexed();
    geometry.dispose?.();
    geometry = nonIndexed;
  }
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    colors[index * 3] = part.color[0];
    colors[index * 3 + 1] = part.color[1];
    colors[index * 3 + 2] = part.color[2];
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.translate(0, 0.5, 0); // base-anchored
  geometry.scale(part.widthM, part.heightM, part.depthM);
  if (part.yaw) geometry.rotateY(part.yaw);
  geometry.translate(part.x, part.y, part.z);
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
  const geometries = parts.map((part) => boxGeometryWithColor(THREE, part));
  const geometry = mergeGeometries(THREE, geometries);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.06,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "CAMP_EMBER_FIREBASE";
  mesh.position.set(anchor.eastM, anchor.groundY, -anchor.northM);
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
