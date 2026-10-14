// Waze-style "next manoeuvre" readout for the conventional F-22 recovery (owner 2026-10-14:
// "give the user telemetry on how they're tracking … not too much stuff, but think how waze
// works"). One row: where to point now, how far to the next fix, what the fix is called, and
// the height to be at when you get there. Speed stays the existing one-word energy chip: the
// sim's pattern target is TAS while the tape is KIAS, and two different speed numbers on one
// HUD is exactly the confusion this replaces.
//
// Presentation only. The sim authors every gate, label, altitude and distance; this module
// chooses an arrow and formats.

import { resolveGuidanceGates } from "../nav/mesh_nav_presentation.js";
import { patternEnergyWord } from "./approach_energy.js";

const M_TO_FT = 3.280839895;
const M_PER_NM = 1852;
// Steer to the first gate at least this far ahead, so the arrow anticipates the next turn
// instead of pointing at a chevron the jet is already passing.
export const APPROACH_CUE_STEER_LOOKAHEAD_M = 1_500;
// Inside this altitude error the target height shows plain; outside it gains a climb/descend mark.
export const APPROACH_CUE_ALT_TOLERANCE_FT = 150;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function wrap180(deg) {
  return ((deg + 540) % 360) - 180;
}

/** Waze-style quantised turn: 0, ±45, ±90, ±135, or a U-turn (±180). */
export function quantiseTurnDeg(turnDeg) {
  const turn = finite(turnDeg);
  if (turn === null) return null;
  const magnitude = Math.abs(turn);
  const sign = turn < 0 ? -1 : 1;
  if (magnitude < 15) return 0;
  if (magnitude < 65) return 45 * sign;
  if (magnitude < 115) return 90 * sign;
  if (magnitude < 158) return 135 * sign;
  return 180 * sign;
}

/**
 * The authored gate the arrow steers to. Pattern fixes (BREAK, DOWNWIND, PERCH, ...) are mandatory:
 * the sim advances only when the jet passes inside the active fix's capture volume and heading
 * window, so the arrow always points at the active fix. Only the sliding ingress chevrons (the
 * PATTERN ENTRY corridor) get the look-ahead, which anticipates the corridor's turn instead of
 * pointing at a chevron the jet is already passing.
 */
export function approachSteerGate(gates, eastM, northM, { ingress = false } = {}) {
  if (!Array.isArray(gates) || !gates.length) return null;
  const start = Math.max(0, gates.findIndex((gate) => gate?.active === true));
  if (!ingress) return gates[start];
  for (let i = start; i < gates.length; i += 1) {
    const gate = gates[i];
    if (Math.hypot(gate.eastM - eastM, gate.northM - northM)
        >= APPROACH_CUE_STEER_LOOKAHEAD_M) return gate;
  }
  return gates[gates.length - 1];
}

function displayLabel(raw) {
  const label = String(raw ?? "").trim().toUpperCase().replaceAll("_", " ");
  // The sim names the ingress chevrons PATTERN ENTRY; they end on the INITIAL fix, which is
  // what a pilot calls it.
  if (label.startsWith("PATTERN ENTRY")) return "INITIAL";
  return label;
}

/** Distance text: one decimal in NM, leading-zero dropped below a mile ("0.6" reads as ".6"). */
export function formatCueDistanceNm(distanceM) {
  const metres = finite(distanceM);
  if (metres === null || metres < 0) return null;
  const nm = metres / M_PER_NM;
  if (nm >= 10) return `${Math.round(nm)}`;
  const text = nm.toFixed(1);
  return text.startsWith("0.") ? text.slice(1) : text;
}

export function approachNextCue(state, gates = resolveGuidanceGates(state)) {
  if (state?.conventional_rtb_pattern_active !== true
      || state?.approach_guidance_active !== true
      || state?.approach_valid !== true) return null;
  const rawLabel = String(state?.approach_next_label ?? "").trim().toUpperCase();
  const ingress = rawLabel.startsWith("PATTERN ENTRY");
  const label = displayLabel(state?.approach_next_label || state?.approach_pattern_leg);
  const distance = formatCueDistanceNm(state?.approach_track_required_m);
  if (!label || label === "NONE" || distance === null) return null;

  const eastM = finite(state?.px);
  const northM = finite(state?.pz);
  const headingDeg = finite(state?.heading_deg);
  let turnDeg = null;
  if (eastM !== null && northM !== null && headingDeg !== null) {
    const steer = approachSteerGate(gates, eastM, northM, { ingress });
    if (steer && Number.isFinite(steer.eastM) && Number.isFinite(steer.northM)) {
      const bearingDeg = Math.atan2(steer.eastM - eastM, steer.northM - northM) * 180 / Math.PI;
      turnDeg = wrap180(bearingDeg - headingDeg);
    }
  }

  const targetAltM = finite(state?.approach_next_alt_m);
  const altErrorM = finite(state?.approach_alt_error_m);
  const targetFt = targetAltM === null ? null : Math.round(targetAltM * M_TO_FT / 50) * 50;
  const altErrorFt = altErrorM === null ? null : altErrorM * M_TO_FT;
  // +1 = high (descend), -1 = low (climb), 0 = on height.
  const altMark = altErrorFt === null || Math.abs(altErrorFt) <= APPROACH_CUE_ALT_TOLERANCE_FT
    ? 0 : altErrorFt > 0 ? 1 : -1;

  return Object.freeze({
    label,
    distance,
    turnDeg,
    arrowDeg: quantiseTurnDeg(turnDeg),
    targetFt,
    altMark,
    energy: patternEnergyWord(state),
  });
}
