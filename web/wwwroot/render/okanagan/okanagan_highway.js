import * as THREE from "../../vendor/three.module.js";
import { createGuidancePath } from "../scene/guidance_path.js?v=350";

/** Fire Boss adapter for the one shared Guns Only highway-in-the-sky renderer. */
export function createOkanaganHighway(scene) {
  const guidance = createGuidancePath(THREE, {
    maxGates: 24,
    maxVisualHalfM: 92,
    gateColor: 0xf2d9a0,
    activeColor: 0xfff1d6,
    gateOpacity: 0.22,
    activeOpacity: 0.38,
    rtbVisualHalfM: 24,
    rtbFarVisualHalfM: 72,
  });
  guidance.object3d.name = "Fire Boss shared guidance path";
  scene.add(guidance.object3d);
  function update(route = [], activeGate = 0, position = null) {
    const active = route.length === 0 ? 0
      : Math.max(0, Math.min(route.length - 1, Math.trunc(Number(activeGate) || 0)));
    const upcoming = route.slice(active).map((gate, index) => ({
      id: String(gate.id ?? `okanagan-${active + index}`),
      label: String(gate.label ?? ""),
      east_m: Number(gate.position?.x),
      // Okanagan renders north as +Z; the shared scene renderer negates snapshot north.
      north_m: -Number(gate.position?.z),
      up_m: Number(gate.position?.y),
      half_m: Math.max(38, Math.min(92, Number(gate.radius_m) * 0.12 || 60)),
      target_ktas: Number(gate.target_speed_mps) * 1.9438444924406,
      active: index === 0,
      dirty: false,
    })).filter((gate) => [gate.east_m, gate.north_m, gate.up_m, gate.half_m].every(Number.isFinite));
    const continuityKey = okanaganGuidanceContinuityKey(route);
    return guidance.update({
      approach_guidance_active: upcoming.length > 0,
      approach_gates: upcoming,
      approach_gate_count: upcoming.length,
      guidance_continuity_key: continuityKey,
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
