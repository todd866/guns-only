import * as THREE from "../../vendor/three.module.js";
import { createGuidancePath } from "../scene/guidance_path.js?v=351";

/** Nominal spacing between sky chevrons along the remaining procedure. */
export const OKANAGAN_CHEVRON_SPACING_M = 380;
/** First chevron sits ahead of the nose so the highway is flown through, not sat on. */
export const OKANAGAN_CHEVRON_LEAD_M = 160;
const OKANAGAN_CHEVRON_MAX = 24;
const OKANAGAN_CHEVRON_NEAR_M = 24;
const OKANAGAN_CHEVRON_FAR_M = 72;
const KTAS_PER_MPS = 1.9438444924406;

function finiteTriple(x, y, z) {
  return [x, y, z].every(Number.isFinite);
}

function clampActiveGate(route, activeGate) {
  if (!route.length) return 0;
  return Math.max(0, Math.min(route.length - 1, Math.trunc(Number(activeGate) || 0)));
}

function toChevron(sample, index, count) {
  const along = count <= 1 ? 0 : index / (count - 1);
  return {
    id: sample.id || `okanagan-chevron-${index}`,
    label: sample.label || "",
    east_m: sample.east_m,
    north_m: sample.north_m,
    up_m: sample.up_m,
    half_m: OKANAGAN_CHEVRON_NEAR_M
      + (OKANAGAN_CHEVRON_FAR_M - OKANAGAN_CHEVRON_NEAR_M) * Math.sqrt(along),
    target_ktas: Number.isFinite(sample.target_ktas) ? sample.target_ktas : 110,
    active: index === 0,
    dirty: false,
    rtb: true,
  };
}

/**
 * Remaining procedure as a directional chevron chain: authored fixes stay on the polyline,
 * in-between samples fill the sky so the player can fly start-to-finish of this phase.
 */
export function okanaganHighwayChevrons(route = [], activeGate = 0, position = null) {
  const remaining = route.slice(clampActiveGate(route, activeGate))
    .filter((gate) => finiteTriple(gate?.position?.x, gate?.position?.y, gate?.position?.z));
  if (!remaining.length) return [];

  const waypoints = [];
  const ownEast = Number(position?.x);
  const ownUp = Number(position?.y);
  const ownNorth = Number.isFinite(Number(position?.z)) ? -Number(position.z) : Number.NaN;
  const hasOwnship = finiteTriple(ownEast, ownUp, ownNorth);
  if (hasOwnship) {
    waypoints.push({
      east_m: ownEast,
      north_m: ownNorth,
      up_m: ownUp,
      ownship: true,
    });
  }
  for (const gate of remaining) {
    waypoints.push({
      east_m: Number(gate.position.x),
      north_m: -Number(gate.position.z),
      up_m: Number(gate.position.y),
      id: String(gate.id ?? ""),
      label: String(gate.label ?? ""),
      target_ktas: Number(gate.target_speed_mps) * KTAS_PER_MPS,
    });
  }
  if (waypoints.length === 1) return [toChevron(waypoints[0], 0, 1)];

  const legs = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const length = Math.hypot(b.east_m - a.east_m, b.north_m - a.north_m);
    legs.push({ a, b, length });
    total += length;
  }
  const lead = hasOwnship ? Math.min(OKANAGAN_CHEVRON_LEAD_M, Math.max(0, total * 0.18)) : 0;
  const drawn = Math.max(0, total - lead);
  const maxInterior = OKANAGAN_CHEVRON_MAX - 1;
  const spacing = Math.max(OKANAGAN_CHEVRON_SPACING_M, drawn / Math.max(1, maxInterior));
  const samples = [];

  const pushSample = (east, north, up, meta = {}) => {
    const last = samples.at(-1);
    if (last && Math.hypot(east - last.east_m, north - last.north_m) < 40) {
      last.id = meta.id || last.id;
      last.label = meta.label || last.label;
      if (Number.isFinite(meta.target_ktas)) last.target_ktas = meta.target_ktas;
      last.east_m = east;
      last.north_m = north;
      last.up_m = up;
      return;
    }
    samples.push({
      east_m: east,
      north_m: north,
      up_m: up,
      id: meta.id || `okanagan-chevron-${samples.length}`,
      label: meta.label || "",
      target_ktas: meta.target_ktas,
    });
  };

  let traveled = 0;
  let nextEmit = lead;
  for (const { a, b, length } of legs) {
    if (!(length > 1)) {
      traveled += length;
      continue;
    }
    const dx = b.east_m - a.east_m;
    const dy = b.up_m - a.up_m;
    const dz = b.north_m - a.north_m;
    const end = traveled + length;
    while (nextEmit <= end + 1e-6 && samples.length < maxInterior) {
      const t = Math.max(0, Math.min(1, (nextEmit - traveled) / length));
      const meta = t > 0.92 || a.ownship ? b : a;
      pushSample(a.east_m + dx * t, a.north_m + dz * t, a.up_m + dy * t, meta);
      nextEmit += spacing;
    }
    traveled = end;
  }

  const last = waypoints.at(-1);
  pushSample(last.east_m, last.north_m, last.up_m, last);
  return samples.slice(0, OKANAGAN_CHEVRON_MAX)
    .map((sample, index, all) => toChevron(sample, index, all.length));
}

/** Fire Boss adapter for the one shared Guns Only highway-in-the-sky renderer. */
export function createOkanaganHighway(scene) {
  const guidance = createGuidancePath(THREE, {
    maxGates: OKANAGAN_CHEVRON_MAX,
    maxVisualHalfM: 92,
    gateColor: 0xf2d9a0,
    activeColor: 0xfff1d6,
    gateOpacity: 0.22,
    activeOpacity: 0.38,
    rtbVisualHalfM: OKANAGAN_CHEVRON_NEAR_M,
    rtbFarVisualHalfM: OKANAGAN_CHEVRON_FAR_M,
  });
  guidance.object3d.name = "Fire Boss shared guidance path";
  scene.add(guidance.object3d);
  function update(route = [], activeGate = 0, position = null) {
    const upcoming = okanaganHighwayChevrons(route, activeGate, position);
    return guidance.update({
      approach_guidance_active: upcoming.length > 0,
      approach_join_guidance_active: false,
      approach_gates: upcoming,
      approach_gate_count: upcoming.length,
      guidance_continuity_key: okanaganGuidanceContinuityKey(route),
      px: Number(position?.x),
      py: Number(position?.y),
      pz: -Number(position?.z),
    });
  }

  return {
    group: guidance.object3d,
    update,
    dispose: () => guidance.dispose(),
  };
}

/** Gate advancement must not reset a route's visual continuity. Only route identity belongs here. */
export function okanaganGuidanceContinuityKey(route = []) {
  return `okanagan:${route.map((gate) => String(gate?.id ?? "")).join("|")}`;
}
