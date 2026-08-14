/**
 * Presentation-only ground-war markers for Cobra Canyon.
 * Consumes authoritative ground_war and battle_damage snapshot fields; never invents combat truth.
 */

import { isCampEmberGroundSite } from "./cobra_camp_ember_firebase.js?v=329";

export const COBRA_GROUND_WAR_PRESENTATION_SCHEMA =
  "guns-only.cobra-ground-war-presentation.v1";

// A selected hostile is normally acquired around the 950 m gunnery seam. At that range a marker
// sitting on the soil vanishes behind 1–4 m understory even though the target is valid and the
// crew has it cued. Keep the terrain contact honest with an OPEN ring, then lift a compact mark
// above the vegetation. Depth testing stays on: this is identification, not x-ray vision through
// a ridge. The profile is exported because these dimensions are a readability contract, not
// incidental mesh construction.
export const COBRA_TARGET_DESIGNATION_PROFILE = Object.freeze({
  groundOffsetM: 0.45,
  ringInnerRadiusM: 8.2,
  ringOuterRadiusM: 10.8,
  beaconHeightM: 16,
  beaconRadiusM: 2.4,
});

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
  threatTracer: 0xffb15a,
  threatFlash: 0xffd08a,
  threatImpact: 0xff8a3d,
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
const DESIGNATION_COLOR = 0xffd76a;

function roleScale(role) {
  if (role === "soft-vehicle") return { width: 7.2, height: 3.2, depth: 3.4 };
  if (role === "hard-point") return { width: 4.4, height: 5.5, depth: 4.4 };
  if (role === "dshk-site") return { width: 4.8, height: 3.6, depth: 6.2 };
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
  if (role === "dshk-site") {
    // Low AA tripod + shield + long elevated barrel. Its high, thin silhouette reads as a gun
    // from the cockpit and remains visually distinct from the broad fortified ground pit.
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 0.55, 8), undefined);
    base.position.y = 0.28;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.7, 1.5), undefined);
    receiver.position.set(0, 1.65, 0.35);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.45, 0.26), undefined);
    shield.position.set(0, 1.75, 0.95);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 5.8), undefined);
    barrel.position.set(0, 2.05, 3.15);
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.8, 0.24), undefined);
    leftLeg.position.set(-0.9, 0.9, -0.45);
    leftLeg.rotation.z = -0.42;
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.8, 0.24), undefined);
    rightLeg.position.set(0.9, 0.9, -0.45);
    rightLeg.rotation.z = 0.42;
    group.add(base, receiver, shield, barrel, leftLeg, rightLeg);
    group.userData.composite = true;
    group.userData.role = "dshk-site";
    return group;
  }
  // Infantry clump. The previous silhouette was a 0.85 m square, 2.1 m tall box under a 0.76 m
  // sphere — a fridge wearing a beach ball, which is what "blocks with sphere-heads" was
  // describing. Soldiers are NARROW and roughly 1.8 m: the cues that survive to a helicopter at
  // nap-of-the-earth height are the upright proportion, the shoulder line, the helmet dome and
  // a weapon breaking the vertical. Build those and drop the mass.
  const group = new THREE.Group();
  const figures = [
    { x: -1.15, z: 0.45, yaw: 0.35 },
    { x: 0.15, z: -0.85, yaw: -0.9 },
    { x: 1.05, z: 0.6, yaw: 2.1 },
  ];
  for (const { x, z, yaw } of figures) {
    // Yaw is applied to each part's OFFSET rather than via a per-figure pivot: the sim-side
    // test doubles supply meshes with a position and nothing else, so leaning on Object3D
    // rotation or scale here would make this module untestable off a real Three.js.
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const place = (mesh, ox, y, oz) => {
      mesh.position.set(x + ox * cos - oz * sin, y, z + ox * sin + oz * cos);
      group.add(mesh);
    };

    // Legs: two thin uprights, not one block. The gap between them is most of what says
    // "person" at distance.
    for (const legX of [-0.13, 0.13]) {
      place(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.85, 0.19), undefined), legX, 0.43, 0);
    }

    // Torso: shoulders wider than deep, which is the proportion a single box never had.
    place(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.27), undefined), 0, 1.16, 0);

    // Webbing/pack, offset behind the torso — breaks the flat slab and gives the figure a
    // facing, which is what makes a yaw spread visible at all.
    place(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.16), undefined), 0, 1.2, -0.2);

    // Helmet at a HUMAN scale: 0.26 m across, not the old 0.76 m beach ball, and seated on the
    // shoulders with no neck gap.
    place(new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), undefined), 0, 1.55, 0);

    // Slung rifle: a horizontal bar across the vertical figure is the single most legible
    // "armed" cue from nap-of-the-earth height, and it costs twelve triangles.
    place(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.92), undefined), 0.2, 1.09, 0.1);
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
 *   sync(groundWar: object|null, selectedTargetId?: string|null, battleDamage?: object|null): void,
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
  /** @type {Map<string, "fired"|"impacted-miss"|"impacted-hit">} */
  const observedThreatBursts = new Map();
  let highestThreatBurstSequence = null;

  // Ground contact + leader + lifted diamond. The old marker was an 11 m filled cylinder: in
  // oblique flight it read as a gold terrain plate, yet its whole silhouette disappeared under
  // foliage. This three-part designation preserves spatial contact without painting over the
  // landscape and puts only the small airborne mark above grass height.
  const selection = new THREE.Group();
  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(
      COBRA_TARGET_DESIGNATION_PROFILE.ringInnerRadiusM,
      COBRA_TARGET_DESIGNATION_PROFILE.ringOuterRadiusM,
      32,
    ),
    new THREE.MeshBasicMaterial({
      color: DESIGNATION_COLOR,
      transparent: true,
      opacity: 0.56,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  selectionRing.name = "COBRA_TARGET_GROUND_RING";
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.04;

  const selectionStemGeometry = new THREE.BufferGeometry();
  selectionStemGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
    0, 1.0, 0,
    0, COBRA_TARGET_DESIGNATION_PROFILE.beaconHeightM - 2.2, 0,
  ]), 3));
  const selectionStem = new THREE.Line(
    selectionStemGeometry,
    new THREE.LineBasicMaterial({
      color: DESIGNATION_COLOR,
      transparent: true,
      opacity: 0.62,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  selectionStem.name = "COBRA_TARGET_BEACON_STEM";

  const selectionBeacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(COBRA_TARGET_DESIGNATION_PROFILE.beaconRadiusM, 0),
    new THREE.MeshBasicMaterial({
      color: DESIGNATION_COLOR,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  selectionBeacon.name = "COBRA_TARGET_BEACON";
  selectionBeacon.position.y = COBRA_TARGET_DESIGNATION_PROFILE.beaconHeightM;

  selection.name = "COBRA_GROUND_WAR_SELECTION";
  selection.userData.beaconHeightM = COBRA_TARGET_DESIGNATION_PROFILE.beaconHeightM;
  selection.visible = false;
  selection.add(selectionRing, selectionStem, selectionBeacon);
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

  function addTransientEffect(effect, lifetimeMs) {
    while (transientEffects.length >= 40) {
      const oldest = transientEffects.shift();
      effectRoot.remove(oldest);
      oldest.geometry?.dispose?.();
      oldest.material?.dispose?.();
    }
    effect.userData.expiresAt = performance.now() + lifetimeMs;
    effect.userData.cobraThreatEffect = true;
    effectRoot.add(effect);
    transientEffects.push(effect);
  }

  function threatPoint(burst, prefix, fallbackPrefix = null) {
    const read = (axis) => Number(burst?.[`${prefix}_${axis}_m`]);
    let x = read("x");
    let y = read("y");
    let z = read("z");
    if ((!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) && fallbackPrefix) {
      const fallback = (axis) => Number(burst?.[`${fallbackPrefix}_${axis}_m`]);
      x = fallback("x");
      y = fallback("y");
      z = fallback("z");
    }
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z: -z };
  }

  function spawnThreatBurst(burst) {
    const source = threatPoint(burst, "source");
    const aim = threatPoint(burst, "impact", "target");
    if (!source || !aim) return;

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 8, 6),
      new THREE.MeshBasicMaterial({
        color: COBRA_GROUND_WAR_COLORS.threatFlash,
        transparent: true,
        opacity: 0.96,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    flash.name = `COBRA_THREAT_MUZZLE_FLASH_${burst.sequence}`;
    flash.position.set(source.x, source.y, source.z);
    addTransientEffect(flash, 150);

    // A broken line reads as a short burst rather than a laser. Both endpoints come from the
    // authority event: presentation never extrapolates a shooter or predicts where the Cobra
    // will be when the burst arrives.
    const dashCount = 11;
    const positions = new Float32Array(dashCount * 2 * 3);
    for (let index = 0; index < dashCount; index += 1) {
      const startT = index / dashCount;
      const endT = index === dashCount - 1
        ? 1
        : Math.min(1, startT + 0.42 / dashCount);
      for (const [offset, t] of [[0, startT], [3, endT]]) {
        positions[index * 6 + offset] = source.x + (aim.x - source.x) * t;
        positions[index * 6 + offset + 1] = source.y + (aim.y - source.y) * t;
        positions[index * 6 + offset + 2] = source.z + (aim.z - source.z) * t;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: COBRA_GROUND_WAR_COLORS.threatTracer,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const tracer = new (THREE.LineSegments ?? THREE.Line)(geometry, material);
    tracer.name = `COBRA_THREAT_TRACER_${burst.sequence}`;
    tracer.userData.source = source;
    tracer.userData.aim = aim;
    addTransientEffect(tracer, 360);
  }

  function spawnThreatImpact(burst) {
    const impact = threatPoint(burst, "impact", "target");
    if (!impact) return;
    const rayOffsets = [
      [-3.4, 1.1, -1.2], [2.8, 1.8, 1.5], [-1.4, 3.2, 1.0],
      [1.2, 2.6, -2.4], [3.2, 0.9, -0.4], [-2.2, 2.0, 2.5],
    ];
    const positions = new Float32Array(rayOffsets.length * 2 * 3);
    for (let index = 0; index < rayOffsets.length; index += 1) {
      const [dx, dy, dz] = rayOffsets[index];
      positions.set([
        impact.x, impact.y, impact.z,
        impact.x + dx, impact.y + dy, impact.z + dz,
      ], index * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: COBRA_GROUND_WAR_COLORS.threatImpact,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sparks = new (THREE.LineSegments ?? THREE.Line)(geometry, material);
    sparks.name = `COBRA_THREAT_HIT_SPARKS_${burst.sequence}`;
    addTransientEffect(sparks, 240);
  }

  function resetThreatEventMemory() {
    observedThreatBursts.clear();
    highestThreatBurstSequence = null;
    for (let index = transientEffects.length - 1; index >= 0; index -= 1) {
      const effect = transientEffects[index];
      if (!effect.userData.cobraThreatEffect) continue;
      effectRoot.remove(effect);
      effect.geometry?.dispose?.();
      effect.material?.dispose?.();
      transientEffects.splice(index, 1);
    }
  }

  function syncThreatBursts(battleDamage) {
    if (!battleDamage) {
      resetThreatEventMemory();
      return;
    }
    const bursts = Array.isArray(battleDamage.recent_bursts)
      ? battleDamage.recent_bursts
      : [];
    if (bursts.length === 0) {
      resetThreatEventMemory();
      return;
    }

    const sequences = bursts
      .map((burst) => Number(burst?.sequence))
      .filter(Number.isFinite);
    const incomingHighest = sequences.length ? Math.max(...sequences) : null;
    if (highestThreatBurstSequence != null
        && incomingHighest != null
        && incomingHighest < highestThreatBurstSequence) {
      resetThreatEventMemory();
    }

    const present = new Set();
    for (const burst of bursts) {
      const numericSequence = Number(burst?.sequence);
      if (!Number.isFinite(numericSequence)) continue;
      const sequence = String(numericSequence);
      present.add(sequence);
      const impacted = burst.has_impacted === true;
      const state = impacted
        ? (burst.will_hit === true ? "impacted-hit" : "impacted-miss")
        : "fired";
      const previousState = observedThreatBursts.get(sequence);
      if (previousState == null && state === "fired") {
        spawnThreatBurst(burst);
      } else if (previousState === "fired" && state === "impacted-hit") {
        // will_hit is authoritative only once has_impacted arrives. Never foreshadow it from a
        // pending burst and never spark for a miss.
        spawnThreatImpact(burst);
      }
      observedThreatBursts.set(sequence, state);
    }
    for (const sequence of observedThreatBursts.keys()) {
      if (!present.has(sequence)) observedThreatBursts.delete(sequence);
    }
    if (incomingHighest != null) {
      highestThreatBurstSequence = Math.max(
        highestThreatBurstSequence ?? incomingHighest,
        incomingHighest,
      );
    }
  }

  function sync(groundWar, selectedTargetId = null, battleDamage = null) {
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

    syncThreatBursts(battleDamage);
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
      selection.position.set(
        selected.x_m,
        selected.y_m + COBRA_TARGET_DESIGNATION_PROFILE.groundOffsetM,
        -selected.z_m,
      );
      const designationPulse = 0.5 + 0.5 * Math.sin(now / 170);
      selectionRing.material.opacity = 0.38 + 0.2 * designationPulse;
      selectionRing.scale.setScalar(0.96 + 0.08 * designationPulse);
      selectionStem.material.opacity = 0.45 + 0.28 * designationPulse;
      selectionBeacon.material.opacity = 0.78 + 0.18 * designationPulse;
      selectionBeacon.scale.setScalar(0.9 + 0.18 * designationPulse);
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
    observedThreatBursts.clear();
    highestThreatBurstSequence = null;
    effectRoot.remove(selection);
    disposeObject(selection);
    group.removeFromParent();
  }

  return { group, sync, dispose };
}
