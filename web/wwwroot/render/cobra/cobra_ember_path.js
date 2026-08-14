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

export const EMBER_BRIDGE_LANDMARK_ID = "landmark.cobra-canyon.iron-bell-bridge.v1";

function horizontalDistanceM(eastA, northA, eastB, northB) {
  const de = Number(eastA) - Number(eastB);
  const dn = Number(northA) - Number(northB);
  if (![de, dn].every(Number.isFinite)) return Infinity;
  return Math.hypot(de, dn);
}

/**
 * Distance for the act order, from the same authority positions drawn on the tactical map.
 *
 * `route_guidance.remaining_m` is distance to the END of the selected canyon route. During
 * Ingress the order says "TO THE BRIDGE", which is an earlier point on that route; feeding the
 * route remainder to that sentence made the HUD claim 12.3 km while the map's bridge objective
 * was 544 m away in the owner's Build 327 flight. Resolve the named destination directly and
 * fail closed rather than relabelling route distance as bridge distance again.
 */
export function emberActRemainingM(authorityState, pose = null) {
  const act = String(authorityState?.mission_act ?? "").toLowerCase();
  if (act === "rtb" || act === "complete") {
    const fobRangeM = Number(authorityState?.ground_war?.fob_range_m);
    return Number.isFinite(fobRangeM) && fobRangeM >= 0 ? fobRangeM : null;
  }
  if (act !== "ingress") return null;

  const bridge = (authorityState?.ground_war?.sites ?? []).find((site) =>
    site?.landmark_id === EMBER_BRIDGE_LANDMARK_ID);
  const eastM = Number(pose?.x_m ?? authorityState?.vehicle?.x_m);
  const northM = Number(pose?.z_m ?? authorityState?.vehicle?.z_m);
  const bridgeEastM = Number(bridge?.x_m);
  const bridgeNorthM = Number(bridge?.z_m);
  if (![eastM, northM, bridgeEastM, bridgeNorthM].every(Number.isFinite)) return null;
  return Math.hypot(bridgeEastM - eastM, bridgeNorthM - northM);
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
        detail: "Stay on the soft path — the Jaw is the fight",
      };
    case "engage":
      return {
        line: "ENGAGE · BREAK HOSTILE POINTS",
        detail: "Kill each garrison, clear the point, then cover the friendly lift",
      };
    case "hold":
      return {
        line: "HOLD POINT MAJORITY",
        detail: "Keep more points than the enemy and their tickets bleed",
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
