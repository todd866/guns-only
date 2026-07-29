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
    // Circuits inherits sockets later; keep FD + config chrome for pattern school.
    return Object.freeze({
      mission: "rapier_circuits",
      phaseBand: band,
      surfaces: Object.freeze({
        quietLine: true,
        centerFdCommands: true,
        contactGeometry: true,
        cycleTeach: false,
        systemsGear: true,
        limitsFuel: true,
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
