/**
 * Ember Run path: map sim path_gates onto the shared soft-gate guidance_path draw.
 *
 * VISUAL HALF ≠ KERNEL HALF. Authored gates are 90–155 m tolerance volumes. Drawing that as a
 * plane scale paints a translucent diamond across the gorge (owner 2026-08-08). Keep a soft cue
 * the pilot can fly through; never a landmark-sized UFO.
 */

/** Soft-cue visual radius (m). Kernel half_m stays large for scoring; pixels stay a fly-through haze. */
export const EMBER_GATE_VISUAL_HALF_M = 24;

/** Match CobraMissionActProgress.DepartPadRadiusM — hide pad-centred volumes while skids are home. */
export const EMBER_DEPART_PAD_RADIUS_M = 120;

function horizontalDistanceM(eastA, northA, eastB, northB) {
  const de = Number(eastA) - Number(eastB);
  const dn = Number(northA) - Number(northB);
  if (![de, dn].every(Number.isFinite)) return Infinity;
  return Math.hypot(de, dn);
}

function padCentreFromAuthority(authorityState) {
  const fob = authorityState?.ground_war?.fob;
  const eastM = Number(fob?.x_m);
  const northM = Number(fob?.z_m);
  if (!Number.isFinite(eastM) || !Number.isFinite(northM)) return null;
  return { eastM, northM };
}

function ownshipOnDepartPad(authorityState, pad) {
  if (!pad) return false;
  const vehicle = authorityState?.vehicle;
  const eastM = Number(vehicle?.x_m);
  const northM = Number(vehicle?.z_m);
  if (!Number.isFinite(eastM) || !Number.isFinite(northM)) return false;
  return horizontalDistanceM(eastM, northM, pad.eastM, pad.northM) <= EMBER_DEPART_PAD_RADIUS_M;
}

export function emberPathGuidanceState(authorityState) {
  const gates = Array.isArray(authorityState?.path_gates) ? authorityState.path_gates : [];
  if (!gates.length) {
    return {
      approach_guidance_active: false,
      approach_gates: [],
      approach_gate_count: 0,
    };
  }
  const pad = padCentreFromAuthority(authorityState);
  const suppressPadVolumes = ownshipOnDepartPad(authorityState, pad);
  const mapped = gates.map((gate, index) => ({
    id: `ember-gate-${index}`,
    east_m: Number(gate.east_m),
    up_m: Number(gate.up_m),
    north_m: Number(gate.north_m),
    // Visual half only — guidance_path also clamps via maxVisualHalfM.
    half_m: EMBER_GATE_VISUAL_HALF_M,
    active: gate.active === true,
  })).filter((gate) => Number.isFinite(gate.east_m)
    && Number.isFinite(gate.up_m)
    && Number.isFinite(gate.north_m))
    .filter((gate) => {
      if (!suppressPadVolumes || !pad) return true;
      return horizontalDistanceM(gate.east_m, gate.north_m, pad.eastM, pad.northM)
        > EMBER_DEPART_PAD_RADIUS_M;
    });

  const activeIndex = mapped.findIndex((gate) => gate.active);
  // Keep one spent gate for trail context, drop the rest so the gorge does not fill with haze.
  const windowed = mapped
    .map((gate, index) => {
      if (activeIndex < 0) return gate;
      if (index < activeIndex - 1) return null;
      if (gate.active) {
        return { ...gate, half_m: EMBER_GATE_VISUAL_HALF_M * 1.15 };
      }
      if (index < activeIndex) {
        return { ...gate, half_m: EMBER_GATE_VISUAL_HALF_M * 0.55 };
      }
      return { ...gate, half_m: EMBER_GATE_VISUAL_HALF_M * 0.72 };
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
        detail: "Lift off — soft glow volumes ahead mark the nap-of-earth path down the gorge",
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
