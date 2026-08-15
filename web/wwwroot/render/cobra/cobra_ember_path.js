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
      return emberRtbFlightCue({ ...options, remaining });
    case "complete":
      return {
        line: "SORTIE COMPLETE",
        detail: "Skids on Camp Ember — check the debrief",
      };
    default:
      return null;
  }
}

/**
 * A deliberately simple, gameplay-authored stabilized helicopter recovery card. It teaches one
 * decision at a time from the same authority range/speed/sink facts the pilot is flying. These
 * bands are operational coaching, not an AH-1G NATOPS claim.
 */
export function emberRtbFlightCue(options = {}) {
  const rangeM = Number(options.remainingM);
  const speedKts = Number(options.speedKts);
  const sinkFpm = Math.max(0, Number(options.sinkFpm) || 0);
  const visual = emberRtbVisualState({ remainingM: rangeM, speedKts, sinkFpm });
  const remaining = options.remaining ?? formatRemainingKm(rangeM);
  const linePrefix = remaining ? `RTB · ${remaining}` : "RTB · CAMP EMBER";

  if (!Number.isFinite(rangeM) || rangeM > 1_200) {
    return {
      line: `${linePrefix} · JOIN FINAL 300°`,
      detail: "45–60 KT · follow amber gates",
      visual,
    };
  }
  if (rangeM > 600) {
    if (Number.isFinite(speedKts) && speedKts > 60) {
      return {
        line: `SLOW · ${Math.round(speedKts)} KT ON FINAL`,
        detail: "35–50 KT",
        visual,
      };
    }
    return {
      line: `${linePrefix} · STABILIZE`,
      detail: "35–50 KT · ≤600 FPM",
      visual,
    };
  }
  if (rangeM > 180) {
    if (sinkFpm > 450) {
      return {
        line: `CHECK SINK · ${Math.round(sinkFpm)} FPM`,
        detail: "Raise collective smoothly",
        visual,
      };
    }
    return {
      line: `${linePrefix} · SHORT FINAL`,
      detail: "20–35 KT · ≤400 FPM · white H",
      visual,
    };
  }
  if (Number.isFinite(speedKts) && speedKts > 20) {
    return {
      line: `FLARE · SLOW FROM ${Math.round(speedKts)} KT`,
      detail: "Ease aft cyclic · add collective",
      visual,
    };
  }
  return {
    line: "HOVER TO THE WHITE H",
    detail: "Settle vertically · both skids, then collective down",
    visual,
  };
}

/**
 * Visual recovery language for the windscreen path. The funnel narrows as the ship approaches the
 * FATO; unsafe speed or sink turns the complete path coral and pulses it. Text can therefore stay
 * terse—the geometry shows where to be and the colour shows whether the approach is stable.
 */
const RTB_VISUAL = Object.freeze({
  join: Object.freeze({ phase: "join", halfWidthM: 18, alert: false, colorHex: 0xffad3d }),
  stabilize: Object.freeze({ phase: "stabilize", halfWidthM: 14, alert: false, colorHex: 0xffad3d }),
  stabilizeAlert: Object.freeze({ phase: "stabilize", halfWidthM: 14, alert: true, colorHex: 0xff613f }),
  shortFinal: Object.freeze({ phase: "short-final", halfWidthM: 10, alert: false, colorHex: 0xffc35a }),
  shortFinalAlert: Object.freeze({ phase: "short-final", halfWidthM: 10, alert: true, colorHex: 0xff613f }),
  flare: Object.freeze({ phase: "flare", halfWidthM: 7, alert: true, colorHex: 0xff613f }),
  hover: Object.freeze({ phase: "hover", halfWidthM: 7, alert: false, colorHex: 0xffd982 }),
});

export function emberRtbVisualState(options = {}) {
  const rangeM = Number(options.remainingM);
  const speedKts = Number(options.speedKts);
  const sinkFpm = Math.max(0, Number(options.sinkFpm) || 0);
  if (!Number.isFinite(rangeM) || rangeM > 1_200) {
    return RTB_VISUAL.join;
  }
  if (rangeM > 600) {
    const alert = Number.isFinite(speedKts) && speedKts > 60;
    return alert ? RTB_VISUAL.stabilizeAlert : RTB_VISUAL.stabilize;
  }
  if (rangeM > 180) {
    const alert = sinkFpm > 450;
    return alert ? RTB_VISUAL.shortFinalAlert : RTB_VISUAL.shortFinal;
  }
  const alert = Number.isFinite(speedKts) && speedKts > 20;
  return alert ? RTB_VISUAL.flare : RTB_VISUAL.hover;
}
