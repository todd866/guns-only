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
    case "GROUND":
      return "The aircraft struck terrain. Review terrain clearance, energy, and the first controllable flight-path deviation before the next sortie.";
    case "SIMULATION_BOUNDARY":
      return "The numerical guard retained the last integrated state before physical rest. Treat the outcome as unresolved and review the final recorded trajectory.";
    default:
      return state?.carrier === true
        ? "The aircraft was not recovered aboard. Review the recorded physical outcome and the first controllable deviation before the next pass."
        : "The aircraft was lost. Review the recorded causal chain and first controllable deviation before the next sortie.";
  }
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatG(value) {
  return Math.abs(value).toFixed(1);
}

function withGToleranceLesson(result, state) {
  const gLocCount = Math.max(0, Math.trunc(finiteNumber(state?.pilot_g_loc_count) ?? 0));
  if (gLocCount === 0) {
    return result;
  }

  const peakPositiveG = finiteNumber(state?.pilot_peak_positive_g);
  const peakNegativeG = finiteNumber(state?.pilot_peak_negative_g);
  const pushPullPenaltyG = finiteNumber(state?.pilot_push_pull_penalty_g);
  const peakCopy = peakPositiveG === null
    ? "sortie peak +G unavailable"
    : `sortie peak +${formatG(Math.max(0, peakPositiveG))} G`;
  const pushPullCopy = pushPullPenaltyG !== null && pushPullPenaltyG > 0.5
    ? `; modeled push-pull penalty ${formatG(pushPullPenaltyG)} G${peakNegativeG !== null && peakNegativeG < 0
      ? ` after a −${formatG(peakNegativeG)} G push`
      : ""}`
    : "";
  const episodeCopy = `${gLocCount} ${gLocCount === 1 ? "episode" : "episodes"}`;

  return {
    ...result,
    brief: `${result.brief} Pilot G-LOC: ${episodeCopy} (${peakCopy}${pushPullCopy}); review unload timing, G-onset rate, and cumulative exposure.`,
  };
}

function withAutoGcasLesson(result, state) {
  const activations = Math.max(0,
    Math.trunc(finiteNumber(state?.auto_gcas_activation_count) ?? 0));
  if (activations === 0) return result;

  const overrides = Math.max(0,
    Math.trunc(finiteNumber(state?.auto_gcas_override_count) ?? 0));
  const activationCopy = `${activations} ${activations === 1 ? "fly-up" : "fly-ups"}`;
  const overrideCopy = overrides > 0
    ? `; ${overrides} pilot ${overrides === 1 ? "paddle override" : "paddle overrides"}`
    : "";
  return {
    ...result,
    brief: `${result.brief} Auto-GCAS: ${activationCopy}${overrideCopy}. Treat a valid or uncertain fly-up as a discontinue/RTB event; review terrain prediction, recovery G, system status, and control state before another sortie.`,
  };
}

function withSortieLessons(result, state) {
  return withAutoGcasLesson(withGToleranceLesson(result, state), state);
}

function readableToken(value, fallback = "Not recorded") {
  const normalized = token(value);
  if (!normalized) return fallback;
  return normalized
    .replaceAll("UNSAFESINKRATE", "UNSAFE SINK RATE")
    .replaceAll("HARDSINKRATE", "HARD SINK RATE")
    .replaceAll("LOWSINKRATE", "LOW SINK RATE")
    .replaceAll("ADAPTIVEDIFFICULTY", "ADAPTIVE DIFFICULTY")
    .replaceAll("_", " ")
    .replaceAll("|", " · ");
}

function isCarrierQualification(state) {
  return state?.carrier === true
    && token(state?.mission_definition_id) === "MISSION.CARRIER-QUALIFICATION.V1";
}

function carrierQualificationCopy(state) {
  const recovery = token(state?.recovery);
  const trapped = recovery === "TRAP" || token(state?.arrest_phase) === "STOPPED";
  const bolter = state?.bolter === true || recovery === "BOLTER";
  const wire = Math.max(0, Math.round(Number(state?.wire) || 0));
  const grade = readableToken(state?.touchdown_grade, "UNASSESSED");
  const deviations = readableToken(state?.touchdown_deviations, "No recorded deviations");
  const correction = readableToken(
    state?.touchdown_primary_correction,
    "Review the approach",
  );

  if (trapped) {
    return withSortieLessons({
      kicker: "Carrier qualification debrief",
      title: wire > 0 ? `Trapped · Wire ${wire}` : "Trapped",
      brief: `${grade}. Recorded deviations: ${deviations}. Primary correction: ${correction}.`,
    }, state);
  }
  if (bolter) {
    return withSortieLessons({
      kicker: "Carrier qualification debrief",
      title: "Bolter · No wire",
      brief: `${grade}. No arresting wire was caught. Recorded deviations: ${deviations}. Primary correction: ${correction}.`,
    }, state);
  }
  if (token(state?.sortie_outcome) === "DEFEAT") {
    return withSortieLessons({
      kicker: "Carrier qualification debrief",
      title: "Aircraft Lost",
      brief: carrierLossBrief(state),
    }, state);
  }
  return withSortieLessons({
    kicker: "Carrier qualification debrief",
    title: "Recovery Incomplete",
    brief: `The aircraft was not recovered. Recorded deviations: ${deviations}. Primary correction: ${correction}.`,
  }, state);
}

/**
 * Produce the concise result-card story from authoritative snapshot evidence.
 * Detailed replay analysis is appended separately when the recorded clip is available.
 */
export function sortieResultCopy(state) {
  if (state?.drone_raid_evaluation === true) {
    const score = Number.isFinite(Number(state.drone_raid_score))
      ? Math.round(Number(state.drone_raid_score)) : 0;
    const maximum = Number.isFinite(Number(state.drone_raid_max_score))
      ? Math.round(Number(state.drone_raid_max_score)) : 100;
    const kills = Math.max(0, Math.round(Number(state.drone_raid_kills) || 0));
    const total = Math.max(1, Math.round(Number(state.drone_raid_targets_total) || 1));
    const leakers = Math.max(0, Math.round(Number(state.drone_raid_leakers) || 0));
    const ownshipLost = state.drone_raid_ownship_lost === true;
    const zeroLeakers = state.drone_raid_zero_leakers === true;
    return withSortieLessons({
      kicker: "Air-defence debrief",
      title: ownshipLost ? "Ownship Lost" : zeroLeakers ? "Raid Defeated" : "Raid Penetrated",
      brief: ownshipLost
        ? `Ownship was lost; every unresolved raider was scored as a penetration. ${kills}/${total} targets were neutralized before mission failure. Score ${score}/${maximum}.`
        : zeroLeakers
          ? `All ${total} staged raiders were neutralized by physical gunfire before the defended ring. Score ${score}/${maximum}.`
          : `${leakers} of ${total} staged raiders crossed the defended ring; ${kills} were neutralized by physical gunfire. Score ${score}/${maximum}.`,
    }, state);
  }

  if (state?.maintenance_scenario === true) {
    const score = Number.isFinite(Number(state.maintenance_score))
      ? Math.round(Number(state.maintenance_score))
      : 0;
    const maximum = Number.isFinite(Number(state.maintenance_max_score))
      ? Math.round(Number(state.maintenance_max_score))
      : 100;
    const recovered = state.maintenance_recovered === true;
    const complete = state.maintenance_procedure_complete === true;
    return withSortieLessons({
      kicker: "Maintenance test-flight debrief",
      title: recovered ? complete ? "Recovery Complete" : "Procedure Incomplete" : "Aircraft Lost",
      brief: recovered
        ? `Aircraft recovered aboard. Evidence-based procedure score ${score}/${maximum}.`
        : `The aircraft was not recovered. Evidence-based procedure score ${score}/${maximum}.`,
    }, state);
  }

  if (isCarrierQualification(state)) return carrierQualificationCopy(state);

  switch (token(state?.sortie_outcome)) {
    case "VICTORY":
      return withSortieLessons({
        kicker: "Sortie complete",
        title: "Victory",
        brief: "The opponent's damaged flight, physical impact, and wreck settling were simulated before debrief.",
      }, state);
    case "DEFEAT":
      return withSortieLessons({
        kicker: "Sortie complete",
        title: "Aircraft Lost",
        brief: carrierLossBrief(state),
      }, state);
    case "DRAW":
      return withSortieLessons({
        kicker: "Sortie complete",
        title: "Mutual Kill",
        brief: "Both damaged aircraft were carried through their physical terminal trajectories before debrief.",
      }, state);
    default:
      return withSortieLessons({
        kicker: "Sortie complete",
        title: "Fight Complete",
        brief: "The deterministic sortie clock stopped only after the terminal physical state resolved.",
      }, state);
  }
}
