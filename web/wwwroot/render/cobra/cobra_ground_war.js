/**
 * Presentation-only ground-war markers for Cobra Canyon.
 * Consumes authoritative ground_war snapshot fields; never invents combat truth.
 */

export const COBRA_GROUND_WAR_PRESENTATION_SCHEMA =
  "guns-only.cobra-ground-war-presentation.v1";

const FRIENDLY_COLOR = 0x6f8f4e;
// Hotter hostile so a mark reads as "shoot me" at 400–800 ft (owner Ember Run ask).
const HOSTILE_COLOR = 0xc44a32;
const WRECK_COLOR = 0x3a342c;
const SITE_NEUTRAL = 0xc2b280;
const SITE_FRIENDLY = 0x8fbf5a;
const SITE_HOSTILE = 0xc45a45;
const SMOKE_COLOR = 0xb8b0a0;
const TRACER_FRIENDLY = 0xd4e89a;
const TRACER_HOSTILE = 0xff8a5c;

function roleScale(role) {
  if (role === "soft-vehicle") return { width: 7.2, height: 3.2, depth: 3.4 };
  if (role === "hard-point") return { width: 4.4, height: 5.5, depth: 4.4 };
  return { width: 3.2, height: 2.4, depth: 3.2 };
}

/** Presentation-only silhouettes — sim still owns combat truth. */
function roleGeometry(THREE, role) {
  if (role === "soft-vehicle") {
    const group = new THREE.Group();
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 2.4, 2.6),
      undefined,
    );
    cab.position.set(0, 1.4, 1.6);
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1.6, 4.8),
      undefined,
    );
    bed.position.set(0, 1.0, -1.2);
    group.add(cab, bed);
    group.userData.composite = true;
    return group;
  }
  if (role === "hard-point") {
    const group = new THREE.Group();
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 1.4, 8), undefined);
    pit.position.y = 0.7;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.2), undefined);
    gun.position.set(0, 2.0, 1.2);
    group.add(pit, gun);
    group.userData.composite = true;
    return group;
  }
  // Infantry clump: three low boxes.
  const group = new THREE.Group();
  for (const [x, z] of [[-1.1, 0.4], [0.2, -0.8], [1.0, 0.6]]) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 0.9), undefined);
    body.position.set(x, 1.0, z);
    group.add(body);
  }
  group.userData.composite = true;
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
      node.castShadow = false;
      node.receiveShadow = false;
    }
    if (Array.isArray(node.children)) {
      for (let index = 0; index < node.children.length; index++) {
        stack.push(node.children[index]);
      }
    }
  }
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
    const mat = new THREE.MeshStandardMaterial({
      color: unit.alive
        ? (unit.faction === "friendly" ? FRIENDLY_COLOR : HOSTILE_COLOR)
        : WRECK_COLOR,
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
      new THREE.SphereGeometry(6.5, 10, 8),
      new THREE.MeshStandardMaterial({
        color: SMOKE_COLOR,
        transparent: true,
        opacity: 0.42,
        roughness: 1,
        metalness: 0,
      }),
    );
    smoke.position.set(event.x_m, (event.y_m ?? 0) + 8, -(event.z_m ?? 0));
    smoke.userData.expiresAt = performance.now() + 2_800;
    effectRoot.add(smoke);
    transientEffects.push(smoke);
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
      entry.mat.color.setHex(
        unit.alive
          ? (unit.faction === "friendly" ? FRIENDLY_COLOR : HOSTILE_COLOR)
          : WRECK_COLOR,
      );
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
