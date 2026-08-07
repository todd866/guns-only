/**
 * Ember Run path: map sim path_gates onto the shared soft-gate guidance_path draw.
 */

export function emberPathGuidanceState(authorityState) {
  const gates = Array.isArray(authorityState?.path_gates) ? authorityState.path_gates : [];
  if (!gates.length) {
    return {
      approach_guidance_active: false,
      approach_gates: [],
      approach_gate_count: 0,
    };
  }
  const mapped = gates.map((gate, index) => ({
    id: `ember-gate-${index}`,
    east_m: Number(gate.east_m),
    up_m: Number(gate.up_m),
    north_m: Number(gate.north_m),
    half_m: Math.max(40, Number(gate.half_m) || 90),
    active: gate.active === true,
  })).filter((gate) => Number.isFinite(gate.east_m)
    && Number.isFinite(gate.up_m)
    && Number.isFinite(gate.north_m));

  return {
    approach_guidance_active: mapped.length > 0,
    approach_gates: mapped,
    approach_gate_count: mapped.length,
  };
}

export function emberActObjectiveOverlay(act) {
  switch (String(act || "").toLowerCase()) {
    case "depart":
      return {
        line: "DEPART CAMP EMBER · FOLLOW THE PATH",
        detail: "Lift off and fly the soft gates down the river gorge",
      };
    case "ingress":
      return {
        line: "INGRESS · FOLLOW THE GORGE TO THE BRIDGE",
        detail: "Stay on the path — Iron Bell Bridge is the fight",
      };
    case "engage":
      return {
        line: "ENGAGE · TIP CONTROL FRIENDLY",
        detail: "Tab a hostile, hold F when GUN ON TARGET",
      };
    case "hold":
      return {
        line: "HOLD THE BRIDGE · KEEP PRESSURE",
        detail: "Friendly control is holding — do not let hostiles claw it back",
      };
    case "rtb":
      return {
        line: "RTB · CAMP EMBER PAD",
        detail: "Follow the path home and put the skids on the pad",
      };
    case "complete":
      return {
        line: "SORTIE COMPLETE",
        detail: "Skids on Camp Ember — check the debrief",
      };
    default:
      return null;
  }
}
