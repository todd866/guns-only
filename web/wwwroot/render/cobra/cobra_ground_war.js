/**
 * Presentation-only ground-war markers for Cobra Canyon.
 * Consumes authoritative ground_war snapshot fields; never invents combat truth.
 */

import { isCampEmberGroundSite } from "./cobra_camp_ember_firebase.js?v=318";

export const COBRA_GROUND_WAR_PRESENTATION_SCHEMA =
  "guns-only.cobra-ground-war-presentation.v1";

export const COBRA_GROUND_WAR_COLORS = Object.freeze({
  friendly: 0x6f8f4e,
  // Hotter hostile so a mark reads as "shoot me" at 400–800 ft under monsoon haze.
  hostile: 0xe83c1a,
  wreck: 0x3a342c,
  siteNeutral: 0xc2b280,
  siteFriendly: 0x8fbf5a,
  siteHostile: 0xc45a45,
  smoke: 0xb8b0a0,
  tracerFriendly: 0xd4e89a,
  tracerHostile: 0xff8a5c,
  hostileEmissive: 0x5a1208,
  friendlyEmissive: 0x142010,
});

const FRIENDLY_COLOR = COBRA_GROUND_WAR_COLORS.friendly;
const HOSTILE_COLOR = COBRA_GROUND_WAR_COLORS.hostile;
const WRECK_COLOR = COBRA_GROUND_WAR_COLORS.wreck;
const SITE_NEUTRAL = COBRA_GROUND_WAR_COLORS.siteNeutral;
const SITE_FRIENDLY = COBRA_GROUND_WAR_COLORS.siteFriendly;
const SITE_HOSTILE = COBRA_GROUND_WAR_COLORS.siteHostile;
const SMOKE_COLOR = COBRA_GROUND_WAR_COLORS.smoke;
const TRACER_FRIENDLY = COBRA_GROUND_WAR_COLORS.tracerFriendly;
const TRACER_HOSTILE = COBRA_GROUND_WAR_COLORS.tracerHostile;

function roleScale(role) {
  if (role === "soft-vehicle") return { width: 7.2, height: 3.2, depth: 3.4 };
  if (role === "hard-point") return { width: 4.4, height: 5.5, depth: 4.4 };
  return { width: 3.2, height: 2.4, depth: 3.2 };
}

/** Presentation-only silhouettes — sim still owns combat truth. */
function roleGeometry(THREE, role) {
  if (role === "soft-vehicle") {
    // Wedge truck: cab + bed + tarp ridge — readable as soft skin from nap AGL.
    const group = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.6, 2.8), undefined);
    cab.position.set(0, 1.5, 2.0);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, 5.2), undefined);
    bed.position.set(0, 0.95, -1.4);
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.2, 3.6), undefined);
    tarp.position.set(0, 2.2, -1.6);
    group.add(cab, bed, tarp);
    group.userData.composite = true;
    group.userData.role = "soft-vehicle";
    return group;
  }
  if (role === "hard-point") {
    // Gun pit + barrel — distinct from infantry clumps at fight distance.
    const group = new THREE.Group();
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.4, 1.6, 8), undefined);
    pit.position.y = 0.8;
    const shield = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 0.4), undefined);
    shield.position.set(0, 2.0, 0.6);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 5.4), undefined);
    gun.position.set(0, 2.15, 2.0);
    group.add(pit, shield, gun);
    group.userData.composite = true;
    group.userData.role = "hard-point";
    return group;
  }
  // Infantry clump: three bodies + heads so they read as people, not crates.
  const group = new THREE.Group();
  for (const [x, z] of [[-1.2, 0.5], [0.15, -0.9], [1.1, 0.55]]) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.1, 0.85), undefined);
    body.position.set(x, 1.05, z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 6, 5), undefined);
    head.position.set(x, 2.35, z);
    group.add(body, head);
  }
  group.userData.composite = true;
  group.userData.role = "infantry";
  return group;
}

function applyUnitMaterial(root, mat) {
  // Walk children explicitly: test doubles and some composites may lack THREE.Object3D.traverse.
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.isMesh || (node.geometry && "material" in node)) {
      node.material = mat;
      // Build 307 replaced each old single-box unit with a small composite silhouette. Shadow
      // policy therefore belongs on the leaf meshes that actually submit geometry, not on the
      // root Group (whose castShadow flag has no renderer effect).
      node.castShadow = true;
      node.receiveShadow = true;
    }
    if (Array.isArray(node.children)) {
      for (let index = 0; index < node.children.length; index++) {
        stack.push(node.children[index]);
      }
    }
  }
}

function unitPaint(unit) {
  if (!unit.alive) {
    return { color: WRECK_COLOR, emissive: 0x000000 };
  }
  if (unit.faction === "friendly") {
    return {
      color: FRIENDLY_COLOR,
      emissive: COBRA_GROUND_WAR_COLORS.friendlyEmissive,
    };
  }
  return {
    color: HOSTILE_COLOR,
    emissive: COBRA_GROUND_WAR_COLORS.hostileEmissive,
  };
}

function siteControlColor(localControl) {
  if (localControl > 0.25) return SITE_FRIENDLY;
  if (localControl < -0.25) return SITE_HOSTILE;
  return SITE_NEUTRAL;
}

/**
 * @param {typeof import("../../vendor/three.module.js")} THREE
 * @returns {{
 *   group: import("../../vendor/three.module.js").Group,
 *   sync(groundWar: object|null): void,
 *   dispose(): void,
 * }}
 */
export function createCobraGroundWarPresentation(THREE) {
  const group = new THREE.Group();
  group.name = "COBRA_GROUND_WAR_PRESENTATION";
  group.userData.schema = COBRA_GROUND_WAR_PRESENTATION_SCHEMA;

  const unitRoot = new THREE.Group();
  unitRoot.name = "COBRA_GROUND_WAR_UNITS";
  const siteRoot = new THREE.Group();
  siteRoot.name = "COBRA_GROUND_WAR_SITES";
  const effectRoot = new THREE.Group();
  effectRoot.name = "COBRA_GROUND_WAR_EFFECTS";
  group.add(unitRoot, siteRoot, effectRoot);

  /** @type {Map<string, { mesh: import("../../vendor/three.module.js").Mesh, mat: import("../../vendor/three.module.js").MeshStandardMaterial }>} */
  const unitMeshes = new Map();
  /** @type {Map<string, { mesh: import("../../vendor/three.module.js").Mesh, mat: import("../../vendor/three.module.js").MeshStandardMaterial, flag: import("../../vendor/three.module.js").Mesh }>} */
  const siteMeshes = new Map();
  /** @type {import("../../vendor/three.module.js").Object3D[]} */
  const transientEffects = [];

  const selection = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 11, 0.7, 24),
    new THREE.MeshStandardMaterial({
      color: 0xffd76a,
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
      opacity: 0.7,
    }),
  );
  selection.name = "COBRA_GROUND_WAR_SELECTION";
  selection.visible = false;
  effectRoot.add(selection);

  function ensureUnit(unit) {
    let entry = unitMeshes.get(unit.id);
    if (entry) return entry;
    const paint = unitPaint(unit);
    const mat = new THREE.MeshStandardMaterial({
      color: paint.color,
      emissive: paint.emissive,
      roughness: 0.86,
      metalness: 0.08,
    });
    const mesh = roleGeometry(THREE, unit.role);
    applyUnitMaterial(mesh, mat);
    mesh.name = `GROUND_UNIT_${unit.id}`;
    unitRoot.add(mesh);
    entry = { mesh, mat };
    unitMeshes.set(unit.id, entry);
    return entry;
  }

  function ensureSite(site) {
    // Camp Ember owns the BF:V firebase mesh — never paint the translucent control disc there.
    if (isCampEmberGroundSite(site)) return null;
    let entry = siteMeshes.get(site.id);
    if (entry) return entry;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(18, 18, 1.2, 16),
      new THREE.MeshStandardMaterial({
        color: siteControlColor(site.local_control),
        roughness: 0.92,
        metalness: 0.04,
        transparent: true,
        opacity: 0.55,
      }),
    );
    pad.name = `GROUND_SITE_${site.id}`;
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 14, 1.2),
      new THREE.MeshStandardMaterial({
        color: siteControlColor(site.local_control),
        roughness: 0.7,
        metalness: 0.12,
      }),
    );
    flag.position.y = 8;
    pad.add(flag);
    siteRoot.add(pad);
    entry = { mesh: pad, mat: pad.material, flag };
    siteMeshes.set(site.id, entry);
    return entry;
  }

  function spawnEffect(event) {
    if (transientEffects.length > 40) {
      const oldest = transientEffects.shift();
      effectRoot.remove(oldest);
      oldest.geometry?.dispose?.();
      oldest.material?.dispose?.();
    }
    const isTracer = event.kind === "small-arms" || event.kind === "gun-hit";
    const isSmoke = event.kind === "unit-destroyed" || event.kind === "gun-kill";
    if (!isTracer && !isSmoke) return;

    if (isTracer) {
      const geometry = new THREE.BufferGeometry();
      const up = (event.y_m ?? 0) + 2;
      const positions = new Float32Array([
        event.x_m, up, -(event.z_m ?? 0),
        event.x_m, up + 18, -(event.z_m ?? 0),
      ]);
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: event.faction === "friendly" ? TRACER_FRIENDLY : TRACER_HOSTILE,
        transparent: true,
        opacity: 0.85,
      });
      const line = new THREE.Line(geometry, material);
      line.userData.expiresAt = performance.now() + 280;
      effectRoot.add(line);
      transientEffects.push(line);
      return;
    }

    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(9.5, 12, 10),
      new THREE.MeshStandardMaterial({
        color: SMOKE_COLOR,
        transparent: true,
        opacity: 0.62,
        roughness: 1,
        metalness: 0,
      }),
    );
    smoke.position.set(event.x_m, (event.y_m ?? 0) + 8, -(event.z_m ?? 0));
    smoke.userData.expiresAt = performance.now() + 4_800;
    effectRoot.add(smoke);
    transientEffects.push(smoke);

    // Hot flash so a gun-kill reads at nap AGL before the smoke blooms.
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xff7a2a,
        emissive: 0xff4a10,
        emissiveIntensity: 1.4,
        transparent: true,
        opacity: 0.9,
        roughness: 0.4,
        metalness: 0.1,
      }),
    );
    flash.position.set(event.x_m, (event.y_m ?? 0) + 3.5, -(event.z_m ?? 0));
    flash.userData.expiresAt = performance.now() + 420;
    effectRoot.add(flash);
    transientEffects.push(flash);
  }

  function sync(groundWar, selectedTargetId = null) {
    const now = performance.now();
    for (let index = transientEffects.length - 1; index >= 0; index -= 1) {
      const effect = transientEffects[index];
      if (now < effect.userData.expiresAt) {
        if (effect.material?.opacity != null) {
          effect.material.opacity *= 0.985;
          effect.position.y += 0.04;
        }
        continue;
      }
      effectRoot.remove(effect);
      effect.geometry?.dispose?.();
      effect.material?.dispose?.();
      transientEffects.splice(index, 1);
    }

    if (!groundWar) return;

    const seenUnits = new Set();
    for (const unit of groundWar.units ?? []) {
      seenUnits.add(unit.id);
      const entry = ensureUnit(unit);
      entry.mesh.position.set(unit.x_m, unit.y_m + 0.2, -unit.z_m);
      entry.mesh.visible = true;
      const paint = unitPaint(unit);
      entry.mat.color.setHex(paint.color);
      if (typeof entry.mat.emissive?.setHex === "function") {
        entry.mat.emissive.setHex(paint.emissive);
      } else {
        entry.mat.emissive = paint.emissive;
      }
      entry.mat.opacity = unit.alive ? 1 : 0.55;
      entry.mat.transparent = !unit.alive;
      const healthScale = unit.alive
        ? 0.65 + 0.35 * (unit.health / Math.max(1, unit.max_health))
        : 0.55;
      entry.mesh.scale.setScalar(healthScale);
    }
    for (const [id, entry] of unitMeshes) {
      if (seenUnits.has(id)) continue;
      entry.mesh.visible = false;
    }

    const selected = selectedTargetId
      ? (groundWar.units ?? []).find((unit) => unit.id === selectedTargetId && unit.alive)
      : null;
    if (selected) {
      selection.visible = true;
      selection.position.set(selected.x_m, selected.y_m + 0.5, -selected.z_m);
      selection.material.opacity = 0.5 + 0.25 * Math.sin(now / 170);
    } else {
      selection.visible = false;
    }

    for (const site of groundWar.sites ?? []) {
      const entry = ensureSite(site);
      if (!entry) continue;
      entry.mesh.position.set(site.x_m, site.y_m + 0.6, -site.z_m);
      const color = siteControlColor(site.local_control);
      entry.mat.color.setHex(color);
      entry.flag.material.color.setHex(color);
    }

    for (const event of groundWar.events ?? [])
      spawnEffect(event);
  }

  function disposeObject(object) {
    if (!object) return;
    if (Array.isArray(object.children)) {
      for (const child of [...object.children]) disposeObject(child);
    }
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) {
      for (const material of object.material) material?.dispose?.();
    } else {
      object.material?.dispose?.();
    }
  }

  function dispose() {
    for (const entry of unitMeshes.values()) {
      unitRoot.remove(entry.mesh);
      disposeObject(entry.mesh);
      entry.mat.dispose();
    }
    unitMeshes.clear();
    for (const entry of siteMeshes.values()) {
      siteRoot.remove(entry.mesh);
      disposeObject(entry.mesh);
      entry.mat.dispose();
    }
    siteMeshes.clear();
    for (const effect of transientEffects) {
      effectRoot.remove(effect);
      disposeObject(effect);
    }
    transientEffects.length = 0;
    effectRoot.remove(selection);
    selection.geometry?.dispose?.();
    selection.material?.dispose?.();
    group.removeFromParent();
  }

  return { group, sync, dispose };
}
