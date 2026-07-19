function token(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function hasOpponentKill(state) {
  return Array.isArray(state?.recent_events) && state.recent_events.some((event) =>
    token(event?.type) === "DESTROYED"
      && token(event?.source) === "OPPONENT"
      && token(event?.target) === "PLAYER");
}

function carrierLossBrief(state) {
  if (hasOpponentKill(state)) {
    return "The opponent's gun solution was decisive. The damaged aircraft then continued through physical impact and wreck settling.";
  }

  switch (token(state?.player_impact_surface)) {
    case "FLIGHT_DECK":
      return "The aircraft struck the flight deck. Review the recorded touchdown assessment and the first controllable deviation before the next pass.";
    case "CARRIER_STRUCTURE":
      return "The aircraft struck carrier structure. Review approach geometry and the first controllable deviation before the next pass.";
    case "WATER":
      return "The approach ended in the water. Review energy, flight path, and control state at the marked decision before the next pass.";
    case "SIMULATION_BOUNDARY":
      return "The numerical guard retained the last integrated state before physical rest. Treat the outcome as unresolved and review the final recorded trajectory.";
    default:
      return state?.carrier === true
        ? "The aircraft was not recovered aboard. Review the recorded physical outcome and the first controllable deviation before the next pass."
        : "The aircraft was lost. Review the recorded causal chain and first controllable deviation before the next sortie.";
  }
}

/**
 * Produce the concise result-card story from authoritative snapshot evidence.
 * Detailed replay analysis is appended separately when the recorded clip is available.
 */
export function sortieResultCopy(state) {
  if (state?.maintenance_scenario === true) {
    const score = Number.isFinite(Number(state.maintenance_score))
      ? Math.round(Number(state.maintenance_score))
      : 0;
    const maximum = Number.isFinite(Number(state.maintenance_max_score))
      ? Math.round(Number(state.maintenance_max_score))
      : 100;
    const recovered = state.maintenance_recovered === true;
    const complete = state.maintenance_procedure_complete === true;
    return {
      kicker: "Maintenance test-flight debrief",
      title: recovered ? complete ? "Recovery Complete" : "Procedure Incomplete" : "Aircraft Lost",
      brief: recovered
        ? `Aircraft recovered aboard. Evidence-based procedure score ${score}/${maximum}.`
        : `The aircraft was not recovered. Evidence-based procedure score ${score}/${maximum}.`,
    };
  }

  switch (token(state?.sortie_outcome)) {
    case "VICTORY":
      return {
        kicker: "Sortie complete",
        title: "Victory",
        brief: "The opponent's damaged flight, physical impact, and wreck settling were simulated before debrief.",
      };
    case "DEFEAT":
      return {
        kicker: "Sortie complete",
        title: "Aircraft Lost",
        brief: carrierLossBrief(state),
      };
    case "DRAW":
      return {
        kicker: "Sortie complete",
        title: "Mutual Kill",
        brief: "Both damaged aircraft were carried through their physical terminal trajectories before debrief.",
      };
    default:
      return {
        kicker: "Sortie complete",
        title: "Fight Complete",
        brief: "The deterministic sortie clock stopped only after the terminal physical state resolved.",
      };
  }
}
