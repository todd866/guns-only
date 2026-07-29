import * as THREE from "../../vendor/three.module.js";
import {
  addSemanticSocket,
  annotateProceduralFallback,
  createFinGeometry,
  createLoftGeometry,
  createPlanformGeometry,
  makeMaterial,
} from "./scene_builders.js?v=193";

function parseColor(value, fallback = 0x808080) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return Number.parseInt(trimmed, 16);
    if (/^#[0-9a-fA-F]+$/.test(trimmed)) return Number.parseInt(trimmed.slice(1), 16);
  }
  return fallback;
}

function requireGeometry(def) {
  const id = def?.id ?? "(missing-id)";
  if (!Array.isArray(def?.wing?.planform) || def.wing.planform.length < 3) {
    throw new Error(`Airframe ${id}: required wing.planform missing`);
  }
  if (!Array.isArray(def?.fuselage?.stations) || def.fuselage.stations.length < 2) {
    throw new Error(`Airframe ${id}: required fuselage.stations missing`);
  }
}

function paletteMaterials(def) {
  const p = def.palette ?? {};
  const upper = makeMaterial(parseColor(p.upper, 0x596b73), 0.50, 0.07, 0x010304,
    { grain: 0.10, grainScale: 2.4, panels: 0.03, panelScale: 0.72 });
  const lower = makeMaterial(parseColor(p.lower, 0x26343a), 0.67, 0.045, 0x000101,
    { grain: 0.08, grainScale: 2.8 });
  const hot = makeMaterial(parseColor(p.hot, 0x765244), 0.42, 0.16, 0x080201,
    { grain: 0.05, grainScale: 3.1 });
  const sensor = makeMaterial(parseColor(p.sensor, 0x11191d), 0.74, 0.035, 0x000101,
    { grain: 0.03, grainScale: 4.0 });
  const accent = makeMaterial(parseColor(p.accent, 0xb85e32), 0.58, 0.04, 0x070201,
    { grain: 0.06, grainScale: 2.0 });
  return { upper, lower, hot, sensor, accent };
}

function rapierPartNames(def) {
  if (def.id === "rapier.public-data-surrogate.v1") {
    return {
      group: "RAPIER_HIGH_ALTITUDE_INTERCEPTOR_SURROGATE",
      wing: "RAPIER_7P35M_PLANFORM",
      body: "RAPIER_13M_SENSOR_FUSELAGE",
      spine: "RAPIER_OPAQUE_ESCAPE_POD_SPINE",
      intake: "RAPIER_SINGLE_BLENDED_INTAKE",
      tunnel: "RAPIER_TURBO_RAMJET_TUNNEL",
      exhaust: "RAPIER_SINGLE_EXHAUST",
    };
  }
  const base = (def.displayName || def.id || "AIRFRAME").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return {
    group: base,
    wing: `${base}_WING`,
    body: `${base}_FUSELAGE`,
    spine: `${base}_SPINE`,
    intake: `${base}_INTAKE`,
    tunnel: `${base}_PROPULSION_TUNNEL`,
    exhaust: `${base}_EXHAUST`,
  };
}

/**
 * Build a Three.js airframe mesh from a guns-only Airframe Definition.
 * Missing required geometry throws — never falls back to another vehicle mesh.
 */
export function createAirframeFromDefinition(def, context = {}) {
  requireGeometry(def);
  const names = rapierPartNames(def);
  const mats = paletteMaterials(def);
  const group = new THREE.Group();
  group.name = names.group;

  const thickness = Number(def.wing.thickness) || 0.16;
  const bevel = Number(def.wing.bevel) || 0.044;
  const wing = new THREE.Mesh(
    createPlanformGeometry(def.wing.planform, thickness, bevel),
    [mats.upper, mats.lower],
  );
  wing.name = names.wing;
  wing.position.y = 0.02;
  group.add(wing);

  const body = new THREE.Mesh(createLoftGeometry(def.fuselage.stations, 12), mats.upper);
  body.name = names.body;
  group.add(body);

  if (Array.isArray(def.escapePodSpine?.stations) && def.escapePodSpine.stations.length >= 2) {
    const spine = new THREE.Mesh(
      createLoftGeometry(def.escapePodSpine.stations, 10),
      mats.sensor,
    );
    spine.name = names.spine;
    group.add(spine);
  }

  if (def.intake) {
    const innerR = Number(def.intake.innerR) || 0.29;
    const outerR = Number(def.intake.outerR) || 0.55;
    const intake = new THREE.Mesh(new THREE.RingGeometry(innerR, outerR, 14), mats.sensor);
    intake.name = names.intake;
    intake.scale.y = Number(def.intake.scaleY) || 1;
    const [ix, iy, iz] = def.intake.position || [0, 0, 0];
    intake.position.set(ix, iy, iz);
    intake.rotation.y = Math.PI;
    group.add(intake);
  }

  if (Array.isArray(def.propulsionTunnel?.stations) && def.propulsionTunnel.stations.length >= 2) {
    const tunnel = new THREE.Mesh(
      createLoftGeometry(def.propulsionTunnel.stations, 12),
      mats.lower,
    );
    tunnel.name = names.tunnel;
    group.add(tunnel);
  }

  if (def.exhaust) {
    const radius = Number(def.exhaust.radius) || 0.34;
    const tube = Number(def.exhaust.tube) || 0.07;
    const exhaust = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 7, 16), mats.hot);
    const [ex, ey, ez] = def.exhaust.position || [0, 0, 0];
    exhaust.position.set(ex, ey, ez);
    exhaust.name = names.exhaust;
    group.add(exhaust);
  }

  const finDefs = Array.isArray(def.fins) ? def.fins : [];
  for (const finDef of finDefs) {
    if (!Array.isArray(finDef.planform) || finDef.planform.length < 3) continue;
    const finGeometry = createFinGeometry(finDef.planform, Number(finDef.thickness) || 0.11);
    const sideX = Number(finDef.sideX) || 0.58;
    const finY = Number(finDef.y) || 0.24;
    const rotZ = Number(finDef.rotZ) || 0;
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(finGeometry, [mats.upper, mats.lower]);
      fin.position.set(side * sideX, finY, 0);
      fin.rotation.z = side * rotZ;
      group.add(fin);
    }
  }

  const accentDefs = Array.isArray(def.accents) ? def.accents : [];
  for (const accentDef of accentDefs) {
    const [sx, sy, sz] = accentDef.size || [0.18, 0.035, 1.55];
    const [ax, ay, az] = accentDef.position || [0, 0, 0];
    const rotY = Number(accentDef.rotY) || 0;
    for (const side of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats.accent);
      tip.position.set(side * Math.abs(ax), ay, az);
      tip.rotation.y = side * rotY;
      group.add(tip);
    }
  }

  const sockets = {};
  const socketDefs = def.sockets && typeof def.sockets === "object" ? def.sockets : {};
  const named = {
    cockpitCamera: "SOCKET_CAMERA_COCKPIT",
    muzzleLeft: "SOCKET_MUZZLE_LEFT",
    muzzleRight: "SOCKET_MUZZLE_RIGHT",
  };
  for (const [key, semantic] of Object.entries(named)) {
    const s = socketDefs[key];
    if (!s || typeof s !== "object") continue;
    sockets[key] = addSemanticSocket(
      group,
      semantic,
      Number(s.x) || 0,
      Number(s.y) || 0,
      Number(s.z) || 0,
    );
  }

  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = object.userData.noShadow !== true;
    object.receiveShadow = true;
  });

  const length = Number(def.dimensionsM?.length);
  const span = Number(def.dimensionsM?.span);
  group.userData.sockets = Object.freeze(sockets);
  group.userData.dimensionsM = Object.freeze({
    length: Number.isFinite(length) ? length : 0,
    span: Number.isFinite(span) ? span : 0,
  });
  group.userData.airframeId = def.id;
  group.userData.definitionRevision = def.revision ?? null;
  group.userData.epistemic = def.epistemic ?? null;
  annotateProceduralFallback(group, context);
  return group;
}
