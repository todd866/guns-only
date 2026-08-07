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

  const activeIndex = mapped.findIndex((gate) => gate.active);
  // Keep one spent gate for trail context, drop the rest so the gorge does not fill with haze.
  const windowed = mapped
    .map((gate, index) => {
      if (activeIndex < 0) return gate;
      if (index < activeIndex - 1) return null;
      const half = gate.half_m;
      if (gate.active) {
        return { ...gate, half_m: half * 1.18 };
      }
      if (index < activeIndex) {
        return { ...gate, half_m: half * 0.55 };
      }
      // Upcoming gates stay readable but quieter than the next cue.
      return { ...gate, half_m: half * 0.78 };
    })
    .filter(Boolean);

  return {
    approach_guidance_active: windowed.length > 0,
    approach_gates: windowed,
    approach_gate_count: windowed.length,
  };
}

function formatRemainingKm(remainingM) {
  const metres = Number(remainingM);
  if (!Number.isFinite(metres) || metres < 0) return null;
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function emberActObjectiveOverlay(act, options = {}) {
  const remaining = formatRemainingKm(options.remainingM);
  switch (String(act || "").toLowerCase()) {
    case "depart":
      return {
        line: "DEPART CAMP EMBER · FOLLOW THE PATH",
        detail: "Lift off — the brighter gate is the next soft cue down the gorge",
      };
    case "ingress":
      return {
        line: remaining
          ? `INGRESS · ${remaining} TO THE BRIDGE`
          : "INGRESS · FOLLOW THE GORGE TO THE BRIDGE",
        detail: "Stay on the soft path — Iron Bell Bridge is the fight",
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
        line: remaining
          ? `RTB · ${remaining} TO CAMP EMBER`
          : "RTB · CAMP EMBER PAD",
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
