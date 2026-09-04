/**
 * Presentation-only ground-war markers for Cobra Canyon.
 * Consumes authoritative ground_war and battle_damage snapshot fields; never invents combat truth.
 */

import { isCampEmberGroundSite } from "./cobra_camp_ember_firebase.js?v=352";
import { mergeGeometries } from "../../vendor/three/addons/utils/BufferGeometryUtils.js";

export const COBRA_GROUND_WAR_PRESENTATION_SCHEMA =
  "guns-only.cobra-ground-war-presentation.v1";

// A selected hostile is acquired at an authored forward objective. At tactical range a marker
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

// These are presentation budgets, not force-strength or weapons constants. They keep the
// battlefield legible at helicopter distance without letting a retained authority window grow
// an unbounded number of drawables.
export const COBRA_BATTLEFIELD_PRESENTATION_PROFILE = Object.freeze({
  maxTransientEffects: 96,
  maxGroundTransientEffects: 72,
  maxGroundTransientEffectsPerSite: 24,
  maxThreatTransientEffects: 24,
  maxFactionCueMeshesPerUnit: 2,
  maxContestedSiteMeshes: 8,
  maxContestedSiteMarkers: 4,
  maxPersistentWrecks: 12,
  maxWreckMeshes: 3,
  wreckCombustionLifetimeMs: 12_000,
  // A rifle tracer is a moving burst, not a dotted ruler spanning the whole engagement. Three
  // irregular hot streaks leave the exact muzzle as one compact packet and cross most of the
  // authority segment. Cockpit proof found the old packet first resolved as only a six-pixel
  // glint around 900 m, so dash length has a presentation floor while the complete authority
  // rail remains empty. The motion, not a static full-length laser, explains who is firing where.
  groundTracerDashCount: 3,
  groundTracerNominalDashLengthM: 16,
  groundTracerMinDashFraction: 0.024,
  groundTracerMaxDashFraction: 0.10,
  // DShK fire can cross several kilometres. Drawing evenly-spaced dashes over that complete
  // authority segment made one burst look like a permanent orange road in the sky. Keep the
  // authoritative source/aim vector, but put only this compact packet on it and move the packet.
  threatTracerDashCount: 4,
  tracerVerticesPerDash: 12,
  groundTracerLifetimeMs: 1_800,
  threatTracerLifetimeMs: 1_100,
  groundTracerGlowWidthM: 2.2,
  groundTracerCoreWidthM: 0.68,
  groundTracerGlowOpacity: 0.86,
  groundTracerTailScale: 0.22,
  groundTracerTravelFraction: 0.82,
  threatTracerGlowWidthM: 0.92,
  threatTracerNominalDashLengthM: 14,
  threatTracerNominalGapM: 9,
  threatTracerMaxPacketFraction: 0.22,
  threatTracerTravelFraction: 0.96,
  groundMuzzleFlashRadiusM: 1.45,
  groundMuzzleFlashWidthScale: 0.76,
  groundMuzzleFlashLengthScale: 4.4,
  groundMuzzleFlashLifetimeMs: 900,
  groundMuzzleSmokeLifetimeMs: 1_700,
  transientHotFraction: 0.54,
  contestedRingMinRadiusM: 20,
  contestedRingMaxRadiusM: 42,
});

export const COBRA_GROUND_WAR_COLORS = Object.freeze({
  // Physical bodies stay in theatre materials; faction recognition belongs to the lifted cues.
  // Whole-body green vanished into jungle and whole-body red looked like plastic game pieces.
  friendly: 0x817854,
  hostile: 0x67513f,
  wreck: 0x3a342c,
  siteNeutral: 0xc2b280,
  siteFriendly: 0x8fbf5a,
  siteHostile: 0xc45a45,
  smoke: 0xb8b0a0,
  tracerFriendly: 0xcfff78,
  tracerHostile: 0xff6330,
  threatTracer: 0xffb15a,
  threatFlash: 0xffd08a,
  threatImpact: 0xff8a3d,
  contestedRing: 0xffa33a,
  contestedSmoke: 0x574f45,
  contestedFire: 0xff5a16,
  friendlyCue: 0xa9ed72,
  hostileCue: 0xff4c28,
  insertionSmoke: 0x6f8f4e,
  muzzleSmoke: 0xc2b49d,
  hostileEmissive: 0x160a05,
  friendlyEmissive: 0x111208,
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
  if (role === "hard-point") return { width: 8.0, height: 4.2, depth: 8.0 };
  if (role === "dshk-site") return { width: 4.8, height: 3.6, depth: 6.2 };
  return { width: 6.4, height: 2.4, depth: 4.8 };
}

/** Collapse one semantic unit silhouette to one physical draw submission. */
function mergeRoleParts(THREE, group) {
  // Lightweight test doubles intentionally omit matrix/geometry transforms. They retain the
  // semantic parts for off-renderer unit tests; production Three.js takes the merged path below,
  // which is covered by a real-Three draw-submission regression.
  if (!THREE?.Matrix4 || typeof group?.updateMatrixWorld !== "function"
    || !(group.children ?? []).every((child) => typeof child.geometry?.clone === "function"
      && typeof child.geometry?.applyMatrix4 === "function"
      && typeof child.updateMatrix === "function")) return group;
  const parts = [];
  for (const child of group.children) {
    child.updateMatrix();
    const geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrix);
    parts.push(geometry);
  }
  const merged = mergeGeometries(parts, false);
  for (const geometry of parts) geometry.dispose();
  if (!merged) return group;
  merged.name = `COBRA_GROUND_UNIT_${String(group.userData.role).toUpperCase()}_GEOMETRY`;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, undefined);
  mesh.userData.composite = true;
  mesh.userData.role = group.userData.role;
  mesh.userData.presentationPartCount = group.children.length;
  // These source geometries never entered a scene or resource owner. Release them after the
  // merged buffer has copied their transformed attributes.
  for (const child of group.children) child.geometry.dispose();
  return mesh;
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
    return mergeRoleParts(THREE, group);
  }
  if (role === "hard-point") {
    // Gun pit + barrel — distinct from infantry clumps at fight distance.
    const group = new THREE.Group();
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 4.2, 1.5, 10), undefined);
    pit.position.y = 0.8;
    const shield = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.5, 0.45), undefined);
    shield.position.set(0, 2.05, 0.8);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 7.2), undefined);
    gun.position.set(0, 2.25, 2.8);
    // Low side revetments and ammunition boxes broaden the exact hard-point silhouette without
    // turning the gun itself into a giant prop.
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.15, 1.4), undefined);
    leftWall.position.set(-3.5, 0.62, -0.25);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.15, 1.4), undefined);
    rightWall.position.set(3.5, 0.62, -0.25);
    const crateA = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.9, 1.0), undefined);
    crateA.position.set(-2.4, 0.55, -2.6);
    const crateB = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 1.35), undefined);
    crateB.position.set(2.6, 0.48, -2.4);
    group.add(pit, shield, gun, leftWall, rightWall, crateA, crateB);
    group.userData.composite = true;
    group.userData.role = "hard-point";
    return mergeRoleParts(THREE, group);
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
    return mergeRoleParts(THREE, group);
  }
  // Infantry clump. The previous silhouette was a 0.85 m square, 2.1 m tall box under a 0.76 m
  // sphere — a fridge wearing a beach ball, which is what "blocks with sphere-heads" was
  // describing. Soldiers are NARROW and roughly 1.8 m: the cues that survive to a helicopter at
  // nap-of-the-earth height are the upright proportion, the shoulder line, the helmet dome and
  // a weapon breaking the vertical. Build those and drop the mass.
  const group = new THREE.Group();
  const figures = [
    { x: -2.35, z: 0.65, yaw: 0.35 },
    { x: -1.15, z: -0.95, yaw: -0.9 },
    { x: 0.05, z: 0.85, yaw: 2.1 },
    { x: 1.35, z: -0.55, yaw: 1.25 },
    { x: 2.45, z: 0.55, yaw: -2.35 },
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
  return mergeRoleParts(THREE, group);
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

function createFactionCue(THREE, unit) {
  const cue = new THREE.Group();
  cue.name = `COBRA_UNIT_FACTION_CUE_${unit.id}`;
  cue.userData.authorityUnitId = unit.id;
  cue.userData.authorityFaction = unit.faction;
  cue.userData.presentationOnly = true;
  // The cue is terrain-occluded and contains no text. Shape as well as colour carries faction.
  // A purely ground-hugging cue disappeared into plantation rows at the exact distance where the
  // literal 2 m silhouettes fall below a pixel, so each formation now owns a compact LIFTED mark:
  // a rally ring plus compact green lozenge for friendlies, and a broken triangular ground frame
  // plus compact red lozenge for hostiles. The old 5 m floating X and 4.4 m spear dominated the
  // literal troops and made every still look like a debug visualizer. These stay world objects
  // (never x-ray HUD), and every pixel remains tied to an exact snapshot unit.
  const material = new THREE.MeshBasicMaterial({
    color: unit.faction === "friendly"
      ? COBRA_GROUND_WAR_COLORS.friendlyCue
      : COBRA_GROUND_WAR_COLORS.hostileCue,
    transparent: true,
    opacity: unit.faction === "friendly" ? 0.32 : 0.38,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const size = roleScale(unit.role);
  const radius = Math.max(5.8, Math.max(size.width, size.depth) * 1.25);
  if (unit.faction === "friendly") {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.85, radius, 24),
      material,
    );
    ring.name = `COBRA_FRIENDLY_FORMATION_RING_${unit.id}`;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    cue.add(ring);
    const lozenge = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.95, 0),
      material,
    );
    lozenge.name = `COBRA_FRIENDLY_FORMATION_LOZENGE_${unit.id}`;
    lozenge.position.y = 3.4;
    cue.add(lozenge);
  } else {
    const triangleRadius = radius * 0.92;
    const trianglePositions = [];
    for (let edge = 0; edge < 3; edge += 1) {
      const angleA = -Math.PI / 2 + edge * Math.PI * 2 / 3;
      const angleB = -Math.PI / 2 + (edge + 1) * Math.PI * 2 / 3;
      const inner = triangleRadius - 0.7;
      const outerA = [Math.cos(angleA) * triangleRadius, 0.08, Math.sin(angleA) * triangleRadius];
      const outerB = [Math.cos(angleB) * triangleRadius, 0.08, Math.sin(angleB) * triangleRadius];
      const innerA = [Math.cos(angleA) * inner, 0.08, Math.sin(angleA) * inner];
      const innerB = [Math.cos(angleB) * inner, 0.08, Math.sin(angleB) * inner];
      trianglePositions.push(
        ...outerA, ...outerB, ...innerB,
        ...outerA, ...innerB, ...innerA,
      );
    }
    const triangleGeometry = new THREE.BufferGeometry();
    triangleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(trianglePositions), 3),
    );
    const frame = new THREE.Mesh(triangleGeometry, material);
    frame.name = `COBRA_HOSTILE_FORMATION_FRAME_${unit.id}`;
    cue.add(frame);
    const lozenge = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), material);
    lozenge.name = `COBRA_HOSTILE_FORMATION_LOZENGE_${unit.id}`;
    lozenge.position.y = 3.2;
    cue.add(lozenge);
  }
  // Existing shadow policy tests inspect the composite's direct children. The cue itself is a
  // grouping node and submits no shadowing geometry, but it keeps the same explicit policy flag.
  cue.castShadow = true;
  cue.receiveShadow = true;
  return cue;
}

function finiteAuthorityNumber(value) {
  return value !== null && value !== undefined && value !== ""
    && Number.isFinite(Number(value));
}

function authorityPoint(record, prefix = "", yOffset = 0) {
  const field = (axis) => record?.[prefix ? `${prefix}_${axis}_m` : `${axis}_m`];
  if (![field("x"), field("y"), field("z")].every(finiteAuthorityNumber)) return null;
  return {
    x: Number(field("x")),
    y: Number(field("y")) + yOffset,
    z: -Number(field("z")),
  };
}

function createTracerRibbonGeometry(
  THREE,
  source,
  target,
  dashCount,
  widthM,
  dashLayout = null,
) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dz = target.z - source.z;
  const length = Math.hypot(dx, dy, dz);
  if (length <= 1e-6) return null;
  const direction = [dx / length, dy / length, dz / length];
  const horizontal = Math.hypot(direction[0], direction[2]);
  const side = horizontal > 1e-6
    ? [-direction[2] / horizontal, 0, direction[0] / horizontal]
    : [1, 0, 0];
  const up = [
    side[1] * direction[2] - side[2] * direction[1],
    side[2] * direction[0] - side[0] * direction[2],
    side[0] * direction[1] - side[1] * direction[0],
  ];
  const halfWidth = widthM * 0.5;
  const positions = new Float32Array(
    dashCount * COBRA_BATTLEFIELD_PRESENTATION_PROFILE.tracerVerticesPerDash * 3,
  );
  const pointAt = (t) => [
    source.x + dx * t,
    source.y + dy * t,
    source.z + dz * t,
  ];
  const offset = (point, axis, sign, widthScale = 1) => [
    point[0] + axis[0] * halfWidth * sign * widthScale,
    point[1] + axis[1] * halfWidth * sign * widthScale,
    point[2] + axis[2] * halfWidth * sign * widthScale,
  ];
  let cursor = 0;
  const write = (point) => {
    positions[cursor++] = point[0];
    positions[cursor++] = point[1];
    positions[cursor++] = point[2];
  };
  for (let dash = 0; dash < dashCount; dash += 1) {
    const startT = dashLayout?.[dash]?.start ?? dash / dashCount;
    const endT = dashLayout?.[dash]?.end ?? (dash === dashCount - 1
      ? 1
      : Math.min(1, startT + 0.48 / dashCount));
    const start = pointAt(startT);
    const end = pointAt(endT);
    for (const axis of [side, up]) {
      // Exact ground exchanges use a narrow tail and broader hot leading edge. The taper is the
      // visual difference between a projectile streak and a constant-width painted lane.
      const tailScale = COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerTailScale;
      const startMinus = offset(start, axis, -1, tailScale);
      const startPlus = offset(start, axis, 1, tailScale);
      const endMinus = offset(end, axis, -1);
      const endPlus = offset(end, axis, 1);
      for (const vertex of [
        startMinus, endMinus, endPlus,
        startMinus, endPlus, startPlus,
      ]) write(vertex);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Normalized geometry/motion of one exact ground exchange.
 *
 * Exported so tests and screenshot evidence can certify the same rendered packet instead of
 * grading the much longer source-to-target authority line that is deliberately not drawn.
 */
export function cobraGroundTracerBurstPlan(rangeM) {
  const profile = COBRA_BATTLEFIELD_PRESENTATION_PROFILE;
  const range = Math.max(1e-6, Number(rangeM) || 0);
  const dashLengthT = Math.min(
    profile.groundTracerMaxDashFraction,
    Math.max(
      profile.groundTracerMinDashFraction,
      profile.groundTracerNominalDashLengthM / range,
    ),
  );
  const firstStart = 0.006;
  const starts = [
    firstStart,
    firstStart + dashLengthT * 1.35,
    firstStart + dashLengthT * 2.75,
  ];
  const scales = [0.78, 1.06, 0.90];
  const dashLayout = starts.map((start, index) => Object.freeze({
    start,
    end: start + dashLengthT * scales[index],
  }));
  const packetEndT = dashLayout.at(-1).end;
  return Object.freeze({
    dashLayout: Object.freeze(dashLayout),
    dashLengthT,
    travelFraction: Math.min(
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerTravelFraction,
      Math.max(0, 0.99 - packetEndT),
    ),
  });
}

/**
 * Normalized geometry/motion for an authority-backed DShK burst.
 *
 * The sim owns the exact muzzle and aim point. Presentation keeps that complete vector as the
 * motion rail, but renders at most one compact four-round packet on it. At short range the packet
 * scales down to stay below 22% of the shot; at tactical range it tops out at 83 m instead of
 * striping kilometres of sky.
 */
export function cobraThreatTracerBurstPlan(rangeM) {
  const profile = COBRA_BATTLEFIELD_PRESENTATION_PROFILE;
  const range = Math.max(1e-6, Number(rangeM) || 0);
  const dashCount = profile.threatTracerDashCount;
  const nominalPacketLengthM = dashCount * profile.threatTracerNominalDashLengthM
    + (dashCount - 1) * profile.threatTracerNominalGapM;
  const packetLengthM = Math.min(
    nominalPacketLengthM,
    range * profile.threatTracerMaxPacketFraction,
  );
  const packetScale = packetLengthM / nominalPacketLengthM;
  const firstStartT = Math.min(0.01, 1.5 / range);
  let cursorM = firstStartT * range;
  const dashLayout = [];
  for (let index = 0; index < dashCount; index += 1) {
    const start = cursorM / range;
    cursorM += profile.threatTracerNominalDashLengthM * packetScale;
    const end = cursorM / range;
    dashLayout.push(Object.freeze({ start, end }));
    if (index < dashCount - 1)
      cursorM += profile.threatTracerNominalGapM * packetScale;
  }
  const packetStartT = dashLayout[0].start;
  const packetEndT = dashLayout.at(-1).end;
  return Object.freeze({
    dashLayout: Object.freeze(dashLayout),
    packetLengthM: (packetEndT - packetStartT) * range,
    travelFraction: Math.min(
      profile.threatTracerTravelFraction,
      Math.max(0, 0.985 - packetEndT),
    ),
  });
}

function createContestedSiteMarker(THREE, site) {
  const marker = new THREE.Group();
  marker.name = `COBRA_CONTESTED_SITE_${site.id}`;
  marker.userData.authoritySiteId = site.id;
  marker.userData.authorityField = "site.contested";
  marker.userData.presentationOnly = true;

  const captureRadius = finiteAuthorityNumber(site.capture_radius_m)
    ? Number(site.capture_radius_m)
    : COBRA_BATTLEFIELD_PRESENTATION_PROFILE.contestedRingMinRadiusM * 2;
  const ringRadius = Math.min(
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.contestedRingMaxRadiusM,
    Math.max(
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.contestedRingMinRadiusM,
      captureRadius * 0.24,
    ),
  );
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: COBRA_GROUND_WAR_COLORS.contestedRing,
    transparent: true,
    opacity: 0.20,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(ringRadius - 1.0, ringRadius, 40),
    ringMaterial,
  );
  ring.name = `COBRA_CONTESTED_RING_${site.id}`;
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.18;
  marker.add(ring);

  // `contested` proves opposing occupancy, not fire or destruction. Two opposing standards make
  // that exact fact unmistakable without pretending that anything at the site is burning.
  const standards = [];
  const standardMaterials = [];
  for (const [faction, side] of [["friendly", -1], ["hostile", 1]]) {
    const material = new THREE.MeshBasicMaterial({
      color: faction === "friendly"
        ? COBRA_GROUND_WAR_COLORS.friendlyCue
        : COBRA_GROUND_WAR_COLORS.hostileCue,
      transparent: true,
      opacity: 0.68,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    standardMaterials.push(material);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.34, 10, 0.34), material);
    pole.name = `COBRA_CONTESTED_STANDARD_${faction.toUpperCase()}_POLE_${site.id}`;
    pole.userData.authorityFaction = faction;
    pole.position.set(side * ringRadius * 0.42, 5.0, 0);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.4, 0.22), material);
    flag.name = `COBRA_CONTESTED_STANDARD_${faction.toUpperCase()}_FLAG_${site.id}`;
    flag.userData.authorityFaction = faction;
    flag.userData.standardSide = side;
    flag.position.set(side * ringRadius * 0.42 + side * 2.45, 8.6, 0);
    standards.push(pole, flag);
    marker.add(pole, flag);
  }

  marker.visible = false;
  return { marker, ring, ringMaterial, standards, standardMaterials };
}

function createWreckEffects(THREE, unit) {
  const wreck = new THREE.Group();
  wreck.name = `COBRA_WRECK_EFFECTS_${unit.id}`;
  wreck.userData.authorityUnitId = unit.id;
  wreck.userData.authorityField = "observed unit-destroyed/gun-kill event";
  const smokeMaterial = new THREE.MeshStandardMaterial({
    color: COBRA_GROUND_WAR_COLORS.contestedSmoke,
    transparent: true,
    opacity: 0.48,
    depthTest: true,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
  });
  const smoke = [];
  for (const [index, plan] of [
    { y: 7.0, radius: 5.6, scale: [1, 1.5, 1] },
    { y: 14.5, radius: 7.2, scale: [1.25, 1.75, 1.25] },
  ].entries()) {
    const lobe = new THREE.Mesh(
      new THREE.SphereGeometry(plan.radius, 8, 6),
      smokeMaterial,
    );
    lobe.name = `COBRA_WRECK_SMOKE_${unit.id}_${index}`;
    lobe.position.set(index * 1.1, plan.y, -index * 0.7);
    lobe.scale.set?.(...plan.scale);
    if (typeof lobe.scale.set !== "function") {
      [lobe.scale.x, lobe.scale.y, lobe.scale.z] = plan.scale;
    }
    lobe.userData.baseY = plan.y;
    lobe.userData.phase = index * 2.1;
    smoke.push(lobe);
    wreck.add(lobe);
  }
  const fireMaterial = new THREE.MeshBasicMaterial({
    color: COBRA_GROUND_WAR_COLORS.contestedFire,
    transparent: true,
    opacity: 0.94,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const fire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 2.8, 5.5, 7),
    fireMaterial,
  );
  fire.name = `COBRA_WRECK_FIRE_${unit.id}`;
  fire.position.y = 2.7;
  wreck.add(fire);
  wreck.visible = false;
  return { wreck, smoke, smokeMaterial, fire, fireMaterial };
}

function siteControlColor(localControl) {
  if (localControl > 0.25) return SITE_FRIENDLY;
  if (localControl < -0.25) return SITE_HOSTILE;
  return SITE_NEUTRAL;
}

/**
 * @param {typeof import("../../vendor/three.module.js")} THREE
 * @param {{ nowMs?: () => number }} [options]
 * @returns {{
 *   group: import("../../vendor/three.module.js").Group,
 *   sync(groundWar: object|null, selectedTargetId?: string|null, battleDamage?: object|null): void,
 *   dispose(): void,
 * }}
 */
export function createCobraGroundWarPresentation(THREE, { nowMs = () => performance.now() } = {}) {
  const group = new THREE.Group();
  group.name = "COBRA_GROUND_WAR_PRESENTATION";
  group.userData.schema = COBRA_GROUND_WAR_PRESENTATION_SCHEMA;

  const unitRoot = new THREE.Group();
  unitRoot.name = "COBRA_GROUND_WAR_UNITS";
  const siteRoot = new THREE.Group();
  siteRoot.name = "COBRA_GROUND_WAR_SITES";
  const contestedRoot = new THREE.Group();
  contestedRoot.name = "COBRA_GROUND_WAR_CONTESTED_SITES";
  const wreckRoot = new THREE.Group();
  wreckRoot.name = "COBRA_GROUND_WAR_WRECK_EFFECTS";
  const effectRoot = new THREE.Group();
  effectRoot.name = "COBRA_GROUND_WAR_EFFECTS";
  group.add(unitRoot, siteRoot, contestedRoot, wreckRoot, effectRoot);

  /** @type {Map<string, { mesh: import("../../vendor/three.module.js").Mesh, mat: import("../../vendor/three.module.js").MeshStandardMaterial, cue: import("../../vendor/three.module.js").Group }>} */
  const unitMeshes = new Map();
  /** One compiled physical silhouette per role; individual units still own paint and cues. */
  const roleGeometryCache = new Map();
  /** @type {Map<string, { mesh: import("../../vendor/three.module.js").Mesh, mat: import("../../vendor/three.module.js").MeshStandardMaterial, flag: import("../../vendor/three.module.js").Mesh }>} */
  const siteMeshes = new Map();
  /** @type {Map<string, ReturnType<typeof createContestedSiteMarker>>} */
  const contestedSiteMeshes = new Map();
  /** @type {Map<string, ReturnType<typeof createWreckEffects>>} */
  const wreckMeshes = new Map();
  /** @type {import("../../vendor/three.module.js").Object3D[]} */
  const transientEffects = [];
  /** @type {Map<string, "fired"|"impacted-miss"|"impacted-hit">} */
  const observedThreatBursts = new Map();
  let highestThreatBurstSequence = null;
  const observedGroundEvents = new Set();
  const observedDestroyedUnitAtMs = new Map();
  let highestGroundEventTick = null;
  let disposed = false;

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

  function createUnitRoleMesh(role) {
    const cached = roleGeometryCache.get(role);
    if (cached) {
      const mesh = new THREE.Mesh(cached.geometry, undefined);
      mesh.userData.composite = true;
      mesh.userData.role = role;
      mesh.userData.presentationPartCount = cached.presentationPartCount;
      return mesh;
    }
    const mesh = roleGeometry(THREE, role);
    // Lightweight test doubles retain semantic child meshes. Production Three.js returns one
    // merged body, which is safe to share because transforms live on each Mesh, not its geometry.
    if (mesh?.isMesh === true && mesh.geometry) {
      roleGeometryCache.set(role, {
        geometry: mesh.geometry,
        presentationPartCount: mesh.userData.presentationPartCount,
      });
    }
    return mesh;
  }

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
    const mesh = createUnitRoleMesh(unit.role);
    applyUnitMaterial(mesh, mat);
    mesh.name = `GROUND_UNIT_${unit.id}`;
    mesh.userData.authorityUnitId = unit.id;
    mesh.userData.faction = unit.faction;
    const cue = createFactionCue(THREE, unit);
    mesh.add(cue);
    unitRoot.add(mesh);
    entry = { mesh, mat, cue, role: unit.role };
    unitMeshes.set(unit.id, entry);
    return entry;
  }

  function ensureSite(site) {
    // Camp Ember owns the BF:V firebase mesh — never paint the translucent control disc there.
    if (isCampEmberGroundSite(site)) return null;
    let entry = siteMeshes.get(site.id);
    if (entry) return entry;
    const marker = new THREE.Group();
    marker.name = `GROUND_SITE_${site.id}`;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(10.8, 12.4, 32),
      new THREE.MeshBasicMaterial({
        color: siteControlColor(site.local_control),
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ring.name = `GROUND_SITE_CONTROL_RING_${site.id}`;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 6.2, 0.45),
      new THREE.MeshStandardMaterial({
        color: siteControlColor(site.local_control),
        roughness: 0.7,
        metalness: 0.12,
      }),
    );
    flag.position.y = 3.2;
    marker.add(ring, flag);
    siteRoot.add(marker);
    entry = { mesh: marker, mat: ring.material, flag };
    siteMeshes.set(site.id, entry);
    return entry;
  }

  function ensureContestedSite(site) {
    let entry = contestedSiteMeshes.get(site.id);
    if (entry) return entry;
    if (contestedSiteMeshes.size
      >= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxContestedSiteMarkers) return null;
    entry = createContestedSiteMarker(THREE, site);
    contestedRoot.add(entry.marker);
    contestedSiteMeshes.set(site.id, entry);
    return entry;
  }

  function removeContestedSite(id) {
    const entry = contestedSiteMeshes.get(id);
    if (!entry) return;
    entry.marker.visible = false;
    contestedRoot.remove(entry.marker);
    disposeObject(entry.marker);
    contestedSiteMeshes.delete(id);
  }

  function ensureWreck(unit) {
    let entry = wreckMeshes.get(unit.id);
    if (entry) return entry;
    entry = createWreckEffects(THREE, unit);
    wreckRoot.add(entry.wreck);
    wreckMeshes.set(unit.id, entry);
    return entry;
  }

  function removeTransientEffect(effect) {
    effectRoot.remove(effect);
    disposeObject(effect);
  }

  function addTransientEffect(effect, lifetimeMs, category = "ground") {
    const categoryFlag = category === "threat"
      ? "cobraThreatEffect"
      : "cobraGroundEventEffect";
    const categoryLimit = category === "threat"
      ? COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxThreatTransientEffects
      : COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxGroundTransientEffects;
    if (category === "ground" && typeof effect.userData.authoritySiteId === "string") {
      while (transientEffects.filter((candidate) =>
        candidate.userData.cobraGroundEventEffect === true
        && candidate.userData.authoritySiteId === effect.userData.authoritySiteId).length
        >= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxGroundTransientEffectsPerSite) {
        const siteIndex = transientEffects.findIndex((candidate) =>
          candidate.userData.cobraGroundEventEffect === true
          && candidate.userData.authoritySiteId === effect.userData.authoritySiteId);
        if (siteIndex < 0) break;
        removeTransientEffect(transientEffects[siteIndex]);
        transientEffects.splice(siteIndex, 1);
      }
    }
    while (transientEffects.filter((candidate) =>
      candidate.userData[categoryFlag] === true).length >= categoryLimit) {
      const categoryIndex = transientEffects.findIndex((candidate) =>
        candidate.userData[categoryFlag] === true);
      if (categoryIndex < 0) break;
      removeTransientEffect(transientEffects[categoryIndex]);
      transientEffects.splice(categoryIndex, 1);
    }
    while (transientEffects.length
      >= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxTransientEffects) {
      // Incoming-fire feedback is flight-critical. If the shared ceiling is reached, retire the
      // oldest ground tableau effect before discarding an exact threat burst.
      const groundIndex = transientEffects.findIndex((candidate) =>
        candidate.userData.cobraGroundEventEffect === true);
      const evictionIndex = groundIndex >= 0 ? groundIndex : 0;
      removeTransientEffect(transientEffects[evictionIndex]);
      transientEffects.splice(evictionIndex, 1);
    }
    const bornAt = nowMs();
    effect.userData.bornAt = bornAt;
    effect.userData.lifetimeMs = lifetimeMs;
    effect.userData.expiresAt = bornAt + lifetimeMs;
    effect.userData.cobraBaseY = effect.position?.y ?? 0;
    effect.userData.cobraThreatEffect = category === "threat";
    effect.userData.cobraGroundEventEffect = category === "ground";
    // Retain authored opacity so fading is elapsed-time based. Multiplying by 0.985 every sync
    // made effects disappear at different rates on 30/60/120 Hz displays and punished the exact
    // balanced tier used by the proof gate.
    const stack = [effect];
    while (stack.length) {
      const node = stack.pop();
      if (node?.material?.opacity != null) {
        node.userData ??= {};
        node.userData.cobraBaseOpacity = node.material.opacity;
      }
      for (const child of node?.children ?? []) stack.push(child);
    }
    effectRoot.add(effect);
    transientEffects.push(effect);
  }

  function spawnGroundMuzzle(event, source, target = null, shooterRole = "infantry") {
    const flash = new THREE.Mesh(
      new THREE.OctahedronGeometry(
        COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundMuzzleFlashRadiusM,
        0,
      ),
      new THREE.MeshBasicMaterial({
        color: event.faction === "friendly" ? TRACER_FRIENDLY : TRACER_HOSTILE,
        transparent: true,
        opacity: 0.82,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    flash.name = `COBRA_BATTLE_MUZZLE_FLASH_${event.tick ?? "event"}_${event.unit_id ?? "unit"}`;
    flash.position.set(source.x, source.y, source.z);
    flash.userData.authoritySiteId = event.site_id;
    flash.userData.authorityTick = Number(event.tick);
    flash.userData.authorityUnitId = event.unit_id;
    flash.userData.cobraGroundMuzzle = true;
    flash.userData.radiusM = COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundMuzzleFlashRadiusM;
    const flashScale = [
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundMuzzleFlashWidthScale,
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundMuzzleFlashWidthScale,
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundMuzzleFlashLengthScale,
    ];
    flash.scale.set?.(...flashScale);
    if (typeof flash.scale.set !== "function") {
      [flash.scale.x, flash.scale.y, flash.scale.z] = flashScale;
    }
    if (target) {
      const aimX = target.x - source.x;
      const aimY = target.y - source.y;
      const aimZ = target.z - source.z;
      const horizontalRangeM = Math.hypot(aimX, aimZ);
      flash.rotation.y = Math.atan2(aimX, aimZ);
      flash.rotation.x = -Math.atan2(aimY, horizontalRangeM);
      flash.userData.aimedAtAuthorityTarget = true;
    }

    addTransientEffect(
      flash,
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundMuzzleFlashLifetimeMs,
    );

    // A firing event also proves a powder discharge. Rifle powder is a brief horizontal puff,
    // not the 20 m beige chimney that previously outlived every tracer. Heavy positions get a
    // one low lobe, while sustained vertical smoke remains reserved for an authority-backed wreck.
    const heavyDischarge = shooterRole === "hard-point"
      || shooterRole === "dshk-site"
      || shooterRole === "soft-vehicle";
    const powder = new THREE.Group();
    powder.name = `COBRA_BATTLE_MUZZLE_POWDER_${event.tick ?? "event"}_${event.unit_id ?? "unit"}`;
    powder.position.set(source.x, source.y, source.z);
    powder.userData.authoritySiteId = event.site_id;
    powder.userData.authorityTick = Number(event.tick);
    powder.userData.authorityUnitId = event.unit_id;
    powder.userData.rises = true;
    powder.userData.cobraRiseM = heavyDischarge ? 1.2 : 1.4;
    const powderPlan = heavyDischarge
      ? [
        { radius: 2.0, x: 0.35, y: 1.0, z: 0.15, opacity: 0.14, scale: [1.65, 0.45, 1.10] },
      ]
      : [
        { radius: 1.45, x: 0.35, y: 0.9, z: 0.15, opacity: 0.17, scale: [1.55, 0.55, 1.05] },
      ];
    for (const [index, plan] of powderPlan.entries()) {
      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(plan.radius, 8, 6),
        new THREE.MeshBasicMaterial({
          color: COBRA_GROUND_WAR_COLORS.muzzleSmoke,
          transparent: true,
          opacity: plan.opacity,
          depthTest: true,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      smoke.name = `COBRA_BATTLE_MUZZLE_SMOKE_${event.tick ?? "event"}_${index}`;
      smoke.position.set(plan.x, plan.y, plan.z);
      smoke.scale.set?.(...plan.scale);
      if (typeof smoke.scale.set !== "function") {
        [smoke.scale.x, smoke.scale.y, smoke.scale.z] = plan.scale;
      }
      powder.add(smoke);
    }
    addTransientEffect(
      powder,
      heavyDischarge
        ? 1_100
        : 1_050,
    );
  }

  function spawnGroundTracer(event, source, target) {
    const dashCount = COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerDashCount;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dz = target.z - source.z;
    const rangeM = Math.hypot(dx, dy, dz);
    if (rangeM <= 1e-6) return;
    // The packet begins at the muzzle and travels across most of this exact authority segment.
    // The old packet appeared halfway between both sides and moved only 42 m, so it read as a
    // detached glowing road stripe rather than fire from a formation.
    const burst = cobraGroundTracerBurstPlan(rangeM);
    const { dashLayout, dashLengthT } = burst;
    const glowWidthM = COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerGlowWidthM;
    const geometry = createTracerRibbonGeometry(
      THREE,
      source,
      target,
      dashCount,
      glowWidthM,
      dashLayout,
    );
    if (!geometry) return;
    const material = new THREE.MeshBasicMaterial({
      color: event.faction === "friendly" ? TRACER_FRIENDLY : TRACER_HOSTILE,
      transparent: true,
      opacity: COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerGlowOpacity,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    const tracer = new THREE.Mesh(geometry, material);
    tracer.name = `COBRA_BATTLE_TRACER_${event.tick ?? "event"}_${event.unit_id ?? "unit"}`;
    tracer.userData.source = source;
    tracer.userData.target = target;
    tracer.userData.authoritySiteId = event.site_id;
    tracer.userData.authorityTick = Number(event.tick);
    tracer.userData.authorityUnitId = event.unit_id;
    tracer.userData.authorityFaction = event.faction ?? null;
    tracer.userData.ribbonWidthM = glowWidthM;
    tracer.userData.cobraGroundTracer = true;
    tracer.userData.dashLayout = dashLayout;
    const travelFraction = burst.travelFraction;
    tracer.userData.travel = {
      x: dx * travelFraction,
      y: dy * travelFraction,
      z: dz * travelFraction,
    };
    tracer.userData.burstLengthM = dashLengthT * rangeM;

    // Transparent wide sheath + hard bright core approximates bloom without a full post stack.
    // Both geometries use the same two authority endpoints and are owned by one bounded effect.
    const coreGeometry = createTracerRibbonGeometry(
      THREE,
      source,
      target,
      dashCount,
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerCoreWidthM,
      dashLayout,
    );
    if (coreGeometry) {
      const core = new THREE.Mesh(
        coreGeometry,
        new THREE.MeshBasicMaterial({
          color: event.faction === "friendly" ? 0xe3ffb0 : 0xffad78,
          transparent: true,
          opacity: 1,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      core.name = `COBRA_BATTLE_CORE_TRACER_${event.tick ?? "event"}_${event.unit_id ?? "unit"}`;
      core.userData.ribbonWidthM =
        COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerCoreWidthM;
      tracer.add(core);
    }
    addTransientEffect(
      tracer,
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerLifetimeMs,
    );
  }

  function spawnGroundImpact(event, impact) {
    const rayOffsets = [
      [-4.8, 1.2, -1.4], [4.2, 1.8, 1.7], [-2.2, 4.4, 1.2],
      [1.7, 3.7, -3.6], [4.8, 1.0, -0.6], [-3.4, 2.6, 3.5],
      [0.4, 5.2, 0.7], [-1.2, 1.4, -4.4],
    ];
    const positions = new Float32Array(rayOffsets.length * 6);
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
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sparks = new (THREE.LineSegments ?? THREE.Line)(geometry, material);
    sparks.name = `COBRA_GUN_HIT_SPARKS_${event.tick ?? "event"}_${event.unit_id ?? "unit"}`;
    addTransientEffect(sparks, 1_450);

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 8, 6),
      new THREE.MeshBasicMaterial({
        color: COBRA_GROUND_WAR_COLORS.threatFlash,
        transparent: true,
        opacity: 0.96,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    flash.name = `COBRA_GUN_HIT_FLASH_${event.tick ?? "event"}_${event.unit_id ?? "unit"}`;
    flash.position.set(impact.x, impact.y, impact.z);
    addTransientEffect(flash, 1_300);

    // `gun-hit` is exact impact truth, so this is allowed to disturb the soil where a mere
    // target coordinate is not. Two stretched lobes give the hit depth and persistence after the
    // hot spark dies, while remaining bounded and anchored to the authority point.
    const dust = new THREE.Group();
    dust.name = `COBRA_GUN_HIT_DUST_${event.tick ?? "event"}_${event.unit_id ?? "unit"}`;
    dust.position.set(impact.x, impact.y, impact.z);
    dust.userData.rises = true;
    dust.userData.cobraRiseM = 8;
    for (const [index, plan] of [
      { radius: 3.2, x: -1.5, y: 2.4, z: 0.8, scale: [1.25, 1.55, 1.25], opacity: 0.42 },
      { radius: 4.3, x: 1.6, y: 5.6, z: -1.1, scale: [1.05, 1.78, 1.05], opacity: 0.3 },
      { radius: 2.5, x: 4.1, y: 3.0, z: 1.7, scale: [1.35, 1.35, 1.35], opacity: 0.24 },
    ].entries()) {
      const lobe = new THREE.Mesh(
        new THREE.SphereGeometry(plan.radius, 8, 6),
        new THREE.MeshStandardMaterial({
          color: 0x746552,
          transparent: true,
          opacity: plan.opacity,
          depthTest: true,
          depthWrite: false,
          roughness: 1,
          metalness: 0,
        }),
      );
      lobe.name = `${dust.name}_${index}`;
      lobe.position.set(plan.x, plan.y, plan.z);
      lobe.scale.set?.(...plan.scale);
      if (typeof lobe.scale.set !== "function") {
        [lobe.scale.x, lobe.scale.y, lobe.scale.z] = plan.scale;
      }
      dust.add(lobe);
    }
    addTransientEffect(dust, 2_600);
  }

  function spawnSmokeEffect(event) {
    const insertion = event.kind === "air-mobile-insertion";
    const smokePoint = authorityPoint(event, "", 8);
    if (!smokePoint) return;
    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(insertion ? 9.5 : 13.5, 10, 8),
      new THREE.MeshStandardMaterial({
        color: insertion ? COBRA_GROUND_WAR_COLORS.insertionSmoke : SMOKE_COLOR,
        transparent: true,
        opacity: insertion ? 0.62 : 0.54,
        depthTest: true,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
      }),
    );
    smoke.name = insertion
      ? `COBRA_LIFT_INSERTION_SMOKE_${event.tick ?? "event"}`
      : `COBRA_BATTLE_SMOKE_${event.tick ?? "event"}`;
    smoke.position.set(smokePoint.x, smokePoint.y, smokePoint.z);
    smoke.userData.rises = true;
    smoke.userData.cobraRiseM = insertion ? 7 : 11;
    if (insertion) smoke.scale.setScalar?.(0.72);
    addTransientEffect(smoke, insertion ? 7_500 : 8_200);
    if (insertion) return;

    // Destroyed-unit truth owns this sustained hot core; a quiet site never receives one.
    const firePoint = authorityPoint(event, "", 3.8);
    const fire = new THREE.Mesh(
      new THREE.SphereGeometry(5.1, 8, 6),
      new THREE.MeshBasicMaterial({
        color: COBRA_GROUND_WAR_COLORS.contestedFire,
        transparent: true,
        opacity: 0.94,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    fire.name = `COBRA_BATTLE_FIRE_${event.tick ?? "event"}_${event.unit_id ?? "unit"}`;
    fire.position.set(firePoint.x, firePoint.y, firePoint.z);
    addTransientEffect(fire, 1_250);
  }

  function spawnEffect(event, shooterRole = "infantry") {
    if (event?.kind === "small-arms") {
      const source = authorityPoint(event, "", 1.25);
      if (!source) return;
      const target = authorityPoint(event, "target", 1.0);
      spawnGroundMuzzle(event, source, target, shooterRole);
      // A source-only event proves firing but does not authorize a made-up vertical endpoint.
      if (target) spawnGroundTracer(event, source, target);
      return;
    }
    if (event?.kind === "gun-hit") {
      const impact = authorityPoint(event, "", 1.0);
      if (impact) spawnGroundImpact(event, impact);
      return;
    }
    if (event?.kind === "unit-destroyed" || event?.kind === "gun-kill"
      || event?.kind === "air-mobile-insertion") {
      spawnSmokeEffect(event);
    }
  }

  function threatPoint(burst, prefix, fallbackPrefix = null) {
    const primary = authorityPoint(burst, prefix);
    if (primary) return primary;
    return fallbackPrefix ? authorityPoint(burst, fallbackPrefix) : null;
  }

  function spawnThreatBurst(burst) {
    const source = threatPoint(burst, "source");
    const aim = threatPoint(burst, "impact", "target");
    if (!source || !aim) return;

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 10, 8),
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
    addTransientEffect(flash, 1_450, "threat");

    // Both endpoints come from the authority event. The complete source-to-aim vector is a motion
    // rail, not visible geometry: only a short packet exists at any instant, then it travels toward
    // the authored aim instead of leaving a kilometre-long static ribbon across the valley.
    const dx = aim.x - source.x;
    const dy = aim.y - source.y;
    const dz = aim.z - source.z;
    const rangeM = Math.hypot(dx, dy, dz);
    if (rangeM <= 1e-6) return;
    const packet = cobraThreatTracerBurstPlan(rangeM);
    const dashCount = COBRA_BATTLEFIELD_PRESENTATION_PROFILE.threatTracerDashCount;
    const ribbonWidthM = COBRA_BATTLEFIELD_PRESENTATION_PROFILE.threatTracerGlowWidthM;
    const geometry = createTracerRibbonGeometry(
      THREE,
      source,
      aim,
      dashCount,
      ribbonWidthM,
      packet.dashLayout,
    );
    if (!geometry) return;
    const material = new THREE.MeshBasicMaterial({
      color: COBRA_GROUND_WAR_COLORS.threatTracer,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const tracer = new THREE.Mesh(geometry, material);
    tracer.name = `COBRA_THREAT_TRACER_${burst.sequence}`;
    tracer.userData.source = source;
    tracer.userData.aim = aim;
    tracer.userData.ribbonWidthM = ribbonWidthM;
    tracer.userData.cobraThreatTracer = true;
    tracer.userData.dashLayout = packet.dashLayout;
    tracer.userData.packetLengthM = packet.packetLengthM;
    tracer.userData.travel = {
      x: dx * packet.travelFraction,
      y: dy * packet.travelFraction,
      z: dz * packet.travelFraction,
    };
    addTransientEffect(
      tracer,
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.threatTracerLifetimeMs,
      "threat",
    );
  }

  function spawnThreatImpact(burst) {
    const impact = threatPoint(burst, "impact", "target");
    if (!impact) return;
    const rayOffsets = [
      [-5.2, 1.1, -1.7], [4.8, 2.1, 1.8], [-2.0, 5.2, 1.4],
      [1.8, 4.5, -4.0], [5.4, 1.2, -0.5], [-3.8, 3.2, 4.1],
      [0.5, 6.0, 0.8], [-1.5, 1.7, -5.0], [3.0, 4.2, 3.1],
      [-4.6, 2.5, -3.0], [1.1, 2.8, 5.2], [5.0, 3.0, -2.2],
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
    addTransientEffect(sparks, 1_450, "threat");

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(3.6, 10, 8),
      new THREE.MeshBasicMaterial({
        color: COBRA_GROUND_WAR_COLORS.threatFlash,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    flash.name = `COBRA_THREAT_HIT_FLASH_${burst.sequence}`;
    flash.position.set(impact.x, impact.y, impact.z);
    addTransientEffect(flash, 1_300, "threat");
  }

  function resetThreatEventMemory() {
    observedThreatBursts.clear();
    highestThreatBurstSequence = null;
    for (let index = transientEffects.length - 1; index >= 0; index -= 1) {
      const effect = transientEffects[index];
      if (!effect.userData.cobraThreatEffect) continue;
      removeTransientEffect(effect);
      transientEffects.splice(index, 1);
    }
  }

  function resetGroundEventMemory() {
    observedGroundEvents.clear();
    observedDestroyedUnitAtMs.clear();
    highestGroundEventTick = null;
    for (let index = transientEffects.length - 1; index >= 0; index -= 1) {
      const effect = transientEffects[index];
      if (!effect.userData.cobraGroundEventEffect) continue;
      removeTransientEffect(effect);
      transientEffects.splice(index, 1);
    }
  }

  function hideGroundSnapshot() {
    selection.visible = false;
    for (const entry of unitMeshes.values()) entry.mesh.visible = false;
    for (const entry of siteMeshes.values()) entry.mesh.visible = false;
    for (const id of [...contestedSiteMeshes.keys()]) removeContestedSite(id);
    for (const entry of wreckMeshes.values()) entry.wreck.visible = false;
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
      .filter((burst) => finiteAuthorityNumber(burst?.sequence))
      .map((burst) => Number(burst.sequence));
    const incomingHighest = sequences.length ? Math.max(...sequences) : null;
    if (highestThreatBurstSequence != null
        && incomingHighest != null
        && incomingHighest < highestThreatBurstSequence) {
      resetThreatEventMemory();
    }

    const present = new Set();
    for (const burst of bursts) {
      if (!finiteAuthorityNumber(burst?.sequence)) continue;
      const numericSequence = Number(burst?.sequence);
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
    if (disposed) return;
    const now = nowMs();
    for (let index = transientEffects.length - 1; index >= 0; index -= 1) {
      const effect = transientEffects[index];
      if (now < effect.userData.expiresAt) {
        const elapsedMs = Math.max(0, now - effect.userData.bornAt);
        const progress = Math.min(1, elapsedMs / Math.max(1, effect.userData.lifetimeMs));
        // Keep exact exchanges hot long enough to be perceived during a normal glance, then let
        // smoke and light roll off smoothly. This remains elapsed-time based at every refresh rate.
        const hotFraction = COBRA_BATTLEFIELD_PRESENTATION_PROFILE.transientHotFraction;
        const fade = progress < hotFraction
          ? 1
          : 1 - (progress - hotFraction) / (1 - hotFraction);
        const fadeStack = [effect];
        while (fadeStack.length) {
          const node = fadeStack.pop();
          if (node?.material?.opacity != null
            && Number.isFinite(node.userData?.cobraBaseOpacity)) {
            node.material.opacity = node.userData.cobraBaseOpacity * Math.max(0, fade);
          }
          for (const child of node?.children ?? []) fadeStack.push(child);
        }
        if ((effect.userData.cobraGroundTracer === true
          || effect.userData.cobraThreatTracer === true) && effect.userData.travel) {
          effect.position.set(
            effect.userData.travel.x * progress,
            effect.userData.travel.y * progress,
            effect.userData.travel.z * progress,
          );
        }
        if (effect.userData.rises === true) {
          effect.position.y = effect.userData.cobraBaseY
            + Number(effect.userData.cobraRiseM ?? 6) * progress;
        }
        continue;
      }
      removeTransientEffect(effect);
      transientEffects.splice(index, 1);
    }

    syncThreatBursts(battleDamage);
    if (!groundWar) {
      hideGroundSnapshot();
      resetGroundEventMemory();
      return;
    }

    const events = Array.isArray(groundWar.events) ? groundWar.events : [];
    const eventTicks = events
      .filter((event) => finiteAuthorityNumber(event?.tick))
      .map((event) => Number(event.tick));
    const incomingHighestTick = eventTicks.length ? Math.max(...eventTicks) : null;
    if (highestGroundEventTick != null && incomingHighestTick != null
      && incomingHighestTick < highestGroundEventTick) {
      resetGroundEventMemory();
    }
    for (const event of events) {
      if ((event?.kind === "unit-destroyed" || event?.kind === "gun-kill")
        && typeof event.unit_id === "string"
        && !observedDestroyedUnitAtMs.has(event.unit_id)) {
        observedDestroyedUnitAtMs.set(event.unit_id, now);
      }
    }
    const firingDirectionByUnit = new Map();
    for (const event of events) {
      if (event?.kind !== "small-arms" || typeof event.unit_id !== "string") continue;
      const source = authorityPoint(event);
      const target = authorityPoint(event, "target");
      if (source && target) firingDirectionByUnit.set(event.unit_id, { source, target });
    }

    const units = Array.isArray(groundWar.units) ? groundWar.units : [];
    const validUnits = units.filter((unit) => unit && typeof unit.id === "string"
      && (unit.faction === "friendly" || unit.faction === "hostile")
      && authorityPoint(unit));
    const seenUnits = new Set();
    for (const unit of validUnits) {
      seenUnits.add(unit.id);
      if (unit.alive === true) observedDestroyedUnitAtMs.delete(unit.id);
      const entry = ensureUnit(unit);
      const position = authorityPoint(unit, "", 0.2);
      entry.mesh.position.set(position.x, position.y, position.z);
      entry.mesh.visible = true;
      const paint = unitPaint(unit);
      entry.mat.color.setHex(paint.color);
      if (typeof entry.mat.emissive?.setHex === "function") {
        entry.mat.emissive.setHex(paint.emissive);
      } else {
        entry.mat.emissive = paint.emissive;
      }
      const alive = unit.alive === true;
      entry.mat.opacity = alive ? 1 : 0.55;
      entry.mat.transparent = !alive;
      entry.cue.visible = alive;
      // Health already has colour/opacity truth elsewhere; shrinking the whole formation makes
      // damaged units look toy-sized and destroys cockpit-range legibility.
      entry.mesh.scale.setScalar(1);
      const firing = firingDirectionByUnit.get(unit.id);
      if (firing) {
        const dx = firing.target.x - firing.source.x;
        const dz = firing.target.z - firing.source.z;
        entry.mesh.rotation.y = Math.atan2(dx, dz);
        entry.mesh.userData.facingAuthorityTarget = firing.target;
      } else {
        entry.mesh.rotation.y = 0;
        delete entry.mesh.userData.facingAuthorityTarget;
      }
    }
    for (const [id, entry] of unitMeshes) {
      if (seenUnits.has(id)) continue;
      observedDestroyedUnitAtMs.delete(id);
      entry.mesh.visible = false;
      unitRoot.remove(entry.mesh);
      // Shared role geometry lives until the whole presentation is disposed.
      disposeObject(entry.mesh, new Set(
        [...roleGeometryCache.values()].map((cached) => cached.geometry),
      ));
      unitMeshes.delete(id);
    }

    const seenWrecks = new Set();
    for (const unit of validUnits) {
      const destroyedAtMs = observedDestroyedUnitAtMs.get(unit.id);
      if (unit.alive === true
        || unit.role === "infantry"
        || !Number.isFinite(destroyedAtMs)
        || now - destroyedAtMs
          >= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.wreckCombustionLifetimeMs
        || seenWrecks.size >= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxPersistentWrecks) {
        continue;
      }
      const entry = ensureWreck(unit);
      const position = authorityPoint(unit, "", 0.2);
      entry.wreck.position.set(position.x, position.y, position.z);
      entry.wreck.visible = true;
      const pulse = 0.5 + 0.5 * Math.sin(now / 230);
      entry.fireMaterial.opacity = 0.78 + 0.18 * pulse;
      entry.smokeMaterial.opacity = 0.4 + 0.08 * pulse;
      for (const lobe of entry.smoke) {
        lobe.position.y = lobe.userData.baseY
          + 0.45 * Math.sin(now / 780 + lobe.userData.phase);
      }
      seenWrecks.add(unit.id);
    }
    for (const [id, entry] of wreckMeshes) {
      if (seenWrecks.has(id)) continue;
      entry.wreck.visible = false;
      wreckRoot.remove(entry.wreck);
      disposeObject(entry.wreck);
      wreckMeshes.delete(id);
    }

    const selected = selectedTargetId
      ? validUnits.find((unit) => unit.id === selectedTargetId && unit.alive === true)
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

    const seenSites = new Set();
    const seenContestedSites = new Set();
    const sites = Array.isArray(groundWar.sites) ? groundWar.sites : [];
    const currentContestedSiteIds = new Set(sites.filter((site) => site
      && typeof site.id === "string"
      && authorityPoint(site)
      && groundWar.combat_live === true
      && site.contested === true
      && !isCampEmberGroundSite(site)).map((site) => site.id));
    // Recycle the bounded marker slots before allocating this snapshot. Deleting only after the
    // loop lets old hidden IDs consume the cap and makes a later real fight marker disappear.
    for (const id of [...contestedSiteMeshes.keys()]) {
      if (!currentContestedSiteIds.has(id)) removeContestedSite(id);
    }
    for (const site of sites) {
      if (!site || typeof site.id !== "string" || !authorityPoint(site)) continue;
      seenSites.add(site.id);
      const entry = ensureSite(site);
      if (entry) {
        const position = authorityPoint(site, "", 0.6);
        entry.mesh.position.set(position.x, position.y, position.z);
        entry.mesh.visible = true;
        const color = siteControlColor(site.local_control);
        entry.mat.color.setHex(color);
        entry.flag.material.color.setHex(color);
      }

      const contested = groundWar.combat_live === true
        && site.contested === true
        && !isCampEmberGroundSite(site);
      const existingMarker = contestedSiteMeshes.get(site.id);
      if (!contested) {
        if (existingMarker) existingMarker.marker.visible = false;
        continue;
      }
      const contestedEntry = existingMarker ?? ensureContestedSite(site);
      if (!contestedEntry) continue;
      seenContestedSites.add(site.id);
      const position = authorityPoint(site, "", 0.25);
      contestedEntry.marker.position.set(position.x, position.y, position.z);
      contestedEntry.marker.visible = true;
      // Put the opposing standards on the exact living formations, not ±8 m around the site
      // centre. At Iron Bell that old synthetic cluster put both flags back over the river even
      // after the physical bridgeheads were fixed.
      for (const faction of ["friendly", "hostile"]) {
        const factionUnits = validUnits.filter((unit) => unit.alive === true
          && unit.home_site_id === site.id && unit.faction === faction);
        const anchorUnit = factionUnits.find((unit) => unit.role === "hard-point")
          ?? factionUnits[0]
          ?? null;
        const anchor = anchorUnit ? authorityPoint(anchorUnit) : null;
        const pole = contestedEntry.standards.find((standard) =>
          standard.userData.authorityFaction === faction
          && String(standard.name).includes("_POLE_"));
        const flag = contestedEntry.standards.find((standard) =>
          standard.userData.authorityFaction === faction
          && String(standard.name).includes("_FLAG_"));
        if (pole) pole.visible = anchor !== null;
        if (flag) flag.visible = anchor !== null;
        if (!anchor) continue;
        const localX = anchor.x - position.x;
        const localY = anchor.y - position.y;
        const localZ = anchor.z - position.z;
        const side = Number(flag?.userData.standardSide ?? (faction === "friendly" ? -1 : 1));
        pole?.position.set(localX, localY + 5.0, localZ);
        flag?.position.set(localX + side * 2.45, localY + 8.6, localZ);
      }
      const pulse = 0.5 + 0.5 * Math.sin(now / 210);
      contestedEntry.ringMaterial.opacity = 0.24 + 0.14 * pulse;
      for (const material of contestedEntry.standardMaterials) {
        material.opacity = 0.78 + 0.18 * pulse;
      }
    }
    for (const [id, entry] of siteMeshes) {
      if (!seenSites.has(id)) entry.mesh.visible = false;
    }
    for (const id of [...contestedSiteMeshes.keys()]) {
      if (!seenContestedSites.has(id)) removeContestedSite(id);
    }

    const roleByUnitId = new Map(validUnits.map((unit) => [unit.id, unit.role]));
    for (const event of events) {
      const key = `${event.tick ?? "?"}|${event.kind ?? "?"}|${event.unit_id ?? "?"}|${event.site_id ?? "?"}`;
      if (observedGroundEvents.has(key)) continue;
      observedGroundEvents.add(key);
      spawnEffect(event, roleByUnitId.get(event.unit_id) ?? "infantry");
    }
    if (incomingHighestTick != null) highestGroundEventTick = Math.max(
      highestGroundEventTick ?? incomingHighestTick,
      incomingHighestTick,
    );
    if (observedGroundEvents.size > 256) {
      const keep = [...observedGroundEvents].slice(-128);
      observedGroundEvents.clear();
      for (const key of keep) observedGroundEvents.add(key);
    }
  }

  function disposeObject(object, geometries = new Set(), materials = new Set()) {
    if (!object) return;
    if (Array.isArray(object.children)) {
      for (const child of [...object.children]) disposeObject(child, geometries, materials);
    }
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    if (Array.isArray(object.material)) {
      for (const material of object.material) {
        if (!material || materials.has(material)) continue;
        materials.add(material);
        material.dispose?.();
      }
    } else if (object.material && !materials.has(object.material)) {
      materials.add(object.material);
      object.material.dispose?.();
    }
  }

  /**
   * Exact, currently-rendered battle packet for screenshot acceptance.
   *
   * This reads transient meshes already owned by the production presentation. It does not spawn,
   * extend, brighten or reposition anything, and it returns the actual moving dash endpoints —
   * not the full authority line the renderer intentionally leaves empty.
   */
  function renderedBattleEvidence(siteId, authorityTick = null, authorityUnitId = null) {
    if (disposed || typeof siteId !== "string") return null;
    const requestedTick = Number(authorityTick);
    const hasRequestedTick = Number.isFinite(requestedTick);
    const requestedUnitId = typeof authorityUnitId === "string" && authorityUnitId.length > 0
      ? authorityUnitId
      : null;
    const now = nowMs();
    const matches = (effect) => effect?.visible !== false
      && effect.userData?.authoritySiteId === siteId
      && now < Number(effect.userData?.expiresAt)
      && (!hasRequestedTick || Number(effect.userData?.authorityTick) === requestedTick)
      && (!requestedUnitId || effect.userData?.authorityUnitId === requestedUnitId);
    let tracer = null;
    let flash = null;
    for (let index = transientEffects.length - 1; index >= 0; index -= 1) {
      const effect = transientEffects[index];
      if (!matches(effect)) continue;
      if (!tracer && effect.userData.cobraGroundTracer === true) tracer = effect;
      if (!flash && tracer && effect.userData.cobraGroundMuzzle === true
        && effect.userData.authorityUnitId === tracer.userData.authorityUnitId) flash = effect;
      if (tracer && flash
        && Number(tracer.userData.authorityTick) === Number(flash.userData.authorityTick)
        && tracer.userData.authorityUnitId === flash.userData.authorityUnitId) break;
    }
    if (!tracer || !flash
      || Number(tracer.userData.authorityTick) !== Number(flash.userData.authorityTick)
      || tracer.userData.authorityUnitId !== flash.userData.authorityUnitId) return null;
    const source = tracer.userData.source;
    const target = tracer.userData.target;
    const dashLayout = tracer.userData.dashLayout;
    if (!source || !target || !Array.isArray(dashLayout)) return null;
    const translation = tracer.position ?? { x: 0, y: 0, z: 0 };
    const pointAt = (t) => ({
      x_m: source.x + (target.x - source.x) * t + Number(translation.x || 0),
      y_m: source.y + (target.y - source.y) * t + Number(translation.y || 0),
      z_m: -(source.z + (target.z - source.z) * t + Number(translation.z || 0)),
    });
    return {
      siteId,
      tick: Number(tracer.userData.authorityTick),
      unitId: tracer.userData.authorityUnitId ?? null,
      faction: tracer.userData.authorityFaction ?? null,
      sourceFlash: {
        x_m: Number(flash.position.x),
        y_m: Number(flash.position.y),
        z_m: -Number(flash.position.z),
        radius_m: Number(flash.userData.radiusM),
        opacity: Number(flash.material?.opacity ?? 0),
      },
      tracer: {
        opacity: Number(tracer.material?.opacity ?? 0),
        ribbon_width_m: Number(tracer.userData.ribbonWidthM),
        segments: dashLayout.map((dash) => ({
          start: pointAt(dash.start),
          end: pointAt(dash.end),
        })),
      },
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    const materials = new Set();
    for (const entry of unitMeshes.values()) {
      unitRoot.remove(entry.mesh);
      disposeObject(entry.mesh, geometries, materials);
    }
    unitMeshes.clear();
    for (const cached of roleGeometryCache.values()) {
      if (geometries.has(cached.geometry)) continue;
      geometries.add(cached.geometry);
      cached.geometry.dispose?.();
    }
    roleGeometryCache.clear();
    for (const entry of siteMeshes.values()) {
      siteRoot.remove(entry.mesh);
      disposeObject(entry.mesh, geometries, materials);
    }
    siteMeshes.clear();
    for (const entry of contestedSiteMeshes.values()) {
      contestedRoot.remove(entry.marker);
      disposeObject(entry.marker, geometries, materials);
    }
    contestedSiteMeshes.clear();
    for (const entry of wreckMeshes.values()) {
      wreckRoot.remove(entry.wreck);
      disposeObject(entry.wreck, geometries, materials);
    }
    wreckMeshes.clear();
    for (const effect of transientEffects) {
      effectRoot.remove(effect);
      disposeObject(effect, geometries, materials);
    }
    transientEffects.length = 0;
    observedThreatBursts.clear();
    highestThreatBurstSequence = null;
    observedGroundEvents.clear();
    highestGroundEventTick = null;
    effectRoot.remove(selection);
    disposeObject(selection, geometries, materials);
    group.removeFromParent();
  }

  return { group, sync, renderedBattleEvidence, dispose };
}
