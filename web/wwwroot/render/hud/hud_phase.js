/// Phase-aware HUD surface gates for Rapier Intercept.
/// Spec: docs/superpowers/specs/2026-07-29-rapier-phase-hud-design.md

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Collapse kernel RapierMissionPhase ints into presentation bands. */
export function rapierPhaseBand(phase) {
  const p = Math.floor(Number(phase) || 0);
  if (p >= 1 && p <= 4) return "ascent";
  if (p >= 5 && p <= 8) return "lob";
  if (p === 9) return "intercept";
  if (p === 10) return "attack";
  if (p === 11 || p === 12) return "egress";
  if (p === 13) return "recovery";
  if (p === 14) return "complete";
  return "other";
}

function thermalOver(state) {
  if (state?.rapier_mission_available !== true) return false;
  const marginC = finiteNumber(state.rapier_cmc_margin_c)
    ?? finiteNumber(state.rapier_thermal_margin_c);
  return marginC !== null && marginC < 0;
}

const CIRCUIT_LEG_FROM_CODE = Object.freeze({
  1: "DEPART",
  2: "INITIAL",
  3: "BREAK",
  4: "DOWNWIND",
  5: "BASE",
  6: "SHORT_FINAL",
  7: "WIRE_FINAL",
  8: "COMPLETE",
});

function circuitLeg(state) {
  if (typeof state?.rapier_circuit_leg === "string" && state.rapier_circuit_leg) {
    return state.rapier_circuit_leg.toUpperCase();
  }
  const code = Math.floor(Number(state?.rapier_circuit_leg_code) || 0);
  return CIRCUIT_LEG_FROM_CODE[code] ?? "";
}

/**
 * VERIFY owns configuration only while the aircraft disagrees with the current circuit leg.
 * Once the expected state is physically established, the normal systems card expires.
 */
export function circuitConfigurationMatches(state = {}) {
  const leg = circuitLeg(state);
  if (!leg || leg === "COMPLETE") return true;
  const gear = [
    finiteNumber(state.gear_nose),
    finiteNumber(state.gear_left),
    finiteNumber(state.gear_right),
  ];
  const elevons = [
    finiteNumber(state.flap_left_deg),
    finiteNumber(state.flap_right_deg),
  ];
  const gearDown = gear.every((position) => position !== null && position > 0.85);
  const gearUp = gear.every((position) => position !== null && position < 0.15);
  const elevonsDown = elevons.every((angle) => angle !== null && angle > 8);
  const elevonsUp = elevons.every((angle) => angle !== null && angle < 1);
  const landingLeg = leg === "DOWNWIND" || leg === "BASE"
    || leg === "SHORT_FINAL" || leg === "WIRE_FINAL";
  return landingLeg
    ? gearDown && elevonsDown
    : gearUp && elevonsUp;
}

function circuitFuelNeedsAttention(state) {
  if (state.fuel_emergency === true || state.fuel_minimum === true
    || state.fuel_bingo === true || state.fuel_joker === true) return true;
  const fuelLb = finiteNumber(state.fuel_lb);
  const bingoLb = finiteNumber(state.fuel_bingo_lb);
  return fuelLb !== null && bingoLb !== null && fuelLb <= bingoLb;
}

/**
 * Which always-on HUD surfaces may speak for this snapshot.
 * Non-Rapier missions leave Rapier-specific surfaces off and do not constrain carrier gear chrome.
 */
export function hudPhasePresentation(state = {}) {
  const snapshot = state && typeof state === "object" ? state : {};
  const rapier = snapshot.rapier_mission_available === true;
  const patternOnly = snapshot.rapier_pattern_only === true
    || (typeof snapshot.rapier_mission_cue === "string"
      && snapshot.rapier_mission_cue.startsWith("CIRCUITS"));
  const phase = Math.floor(Number(snapshot.rapier_mission_phase) || 0);
  const band = rapier ? rapierPhaseBand(phase) : "other";
  const over = thermalOver(snapshot);

  if (!rapier) {
    return Object.freeze({
      mission: "other",
      phaseBand: band,
      surfaces: Object.freeze({
        quietLine: false,
        centerFdCommands: false,
        contactGeometry: true,
        cycleTeach: false,
        systemsGear: true,
        limitsFuel: true,
      }),
    });
  }

  if (patternOnly) {
    const configurationMatches = circuitConfigurationMatches(snapshot);
    return Object.freeze({
      mission: "rapier_circuits",
      phaseBand: band,
      circuitLeg: circuitLeg(snapshot),
      surfaces: Object.freeze({
        quietLine: true,
        centerFdCommands: true,
        contactGeometry: true,
        cycleTeach: false,
        // VERIFY expires when the leg's physical configuration is established.
        systemsGear: !configurationMatches,
        // Pattern fuel is latent unless it becomes a real constraint.
        limitsFuel: circuitFuelNeedsAttention(snapshot),
      }),
    });
  }

  return Object.freeze({
    mission: "rapier_intercept",
    phaseBand: band,
    surfaces: Object.freeze({
      quietLine: true,
      // Intercept v1: no LEVEL NOW / ADD POWER essays. Nose-on-V stays on the quiet line.
      centerFdCommands: false,
      contactGeometry: true,
      cycleTeach: band === "ascent" || over,
      systemsGear: band === "recovery",
      limitsFuel: true,
    }),
  });
}
