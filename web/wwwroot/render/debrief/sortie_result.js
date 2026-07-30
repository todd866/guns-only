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
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const HANDOFF_PHASE_BY_ORDINAL = Object.freeze([
  "UNAVAILABLE",
  "AVAILABLE",
  "REQUESTED",
  "DRAIN",
  "RELIEF_ENGAGED",
  "PLAYER_RTB",
  "RELIEF_COMPLETE",
  "RELIEF_LOST",
  "RECOVERED",
]);

function combatHandoffPhaseToken(value) {
  const numeric = finiteNumber(value);
  if (numeric !== null && Number.isInteger(numeric)
    && numeric >= 0 && numeric < HANDOFF_PHASE_BY_ORDINAL.length) {
    return HANDOFF_PHASE_BY_ORDINAL[numeric];
  }
  return token(value);
}

/**
 * One presentation contract for the pause action, navigation console, and debrief. Booleans remain
 * independent snapshot evidence; the phase supplies the human label but cannot erase a latched
 * requested/active/RTB flag if a partial hot frame arrives during a schema transition.
 */
export function combatHandoffPresentation(state = {}) {
  const snapshot = state && typeof state === "object" ? state : {};
  const phase = combatHandoffPhaseToken(snapshot.combat_handoff_phase);
  const requested = snapshot.combat_handoff_requested === true;
  const active = snapshot.combat_handoff_active === true;
  const playerRtbActive = snapshot.player_rtb_active === true;
  const reliefKills = Math.max(0,
    Math.trunc(finiteNumber(snapshot.relief_kills) ?? 0));
  const phaseIndex = HANDOFF_PHASE_BY_ORDINAL.indexOf(phase);
  const occurred = requested || active || playerRtbActive || phaseIndex >= 2;
  const available = phase === "AVAILABLE"
    && !requested && !active && !playerRtbActive;

  let status = "HANDOFF UNAVAILABLE";
  switch (phase) {
    case "AVAILABLE": status = "HANDOFF AVAILABLE"; break;
    case "REQUESTED": status = "HANDOFF REQUESTED"; break;
    case "DRAIN": status = "HANDOFF · ROUNDS DRAINING"; break;
    case "RELIEF_ENGAGED": status = "RELIEF ENGAGED"; break;
    case "PLAYER_RTB": status = "PLAYER RTB"; break;
    case "RELIEF_COMPLETE": status = "RELIEF COMPLETE"; break;
    case "RELIEF_LOST": status = "RELIEF LOST"; break;
    case "RECOVERED": status = "RECOVERED"; break;
    default:
      if (active) status = "RELIEF ENGAGED";
      else if (requested) status = "HANDOFF REQUESTED";
      break;
  }
  if (playerRtbActive && !status.includes("RTB"))
    status = `${status} · PLAYER RTB`;

  return Object.freeze({
    phase,
    requested,
    active,
    playerRtbActive,
    reliefKills,
    occurred,
    available,
    status,
  });
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

function withServiceLifeReview(result, state) {
  if (state?.service_life_record_available !== true
    || state?.service_life_exceedance_review_required !== true) return result;

  const overStructuralSeconds = Math.max(0,
    finiteNumber(state?.service_life_over_structural_limit_s) ?? 0);
  const overDynamicPressureSeconds = Math.max(0,
    finiteNumber(state?.service_life_over_dynamic_pressure_s) ?? 0);
  const maximumG = finiteNumber(state?.service_life_max_g);
  const exposure = [];
  if (overStructuralSeconds > 0) {
    exposure.push(`${overStructuralSeconds.toFixed(1)} s above the structural limit${
      maximumG === null ? "" : `, peak ${maximumG.toFixed(1)} G`
    }`);
  }
  if (overDynamicPressureSeconds > 0) {
    exposure.push(`${overDynamicPressureSeconds.toFixed(1)} s above the q placard`);
  }
  const evidence = exposure.length > 0
    ? exposure.join("; ")
    : "a propulsion or thermal exceedance";

  return {
    ...result,
    brief: `${result.brief} Airframe exposure: ${evidence}. Maintenance assessment pending; no damage or repair cost has been inferred.`,
    serviceLifeReviewRequired: true,
  };
}

function withSortieLessons(result, state) {
  return withServiceLifeReview(
    withAutoGcasLesson(withGToleranceLesson(result, state), state),
    state,
  );
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

function combatHandoffCopy(state) {
  const handoff = combatHandoffPresentation(state);
  if (!handoff.occurred) return null;

  const playerKills = Math.max(0,
    Math.trunc(finiteNumber(state?.kill_count) ?? 0));
  const reserveTargetLb = finiteNumber(state?.fuel_reserve_target_lb);
  const reserveMarginLb = finiteNumber(state?.fuel_reserve_margin_lb);
  const recoveryFuelLb = finiteNumber(state?.fuel_lb)
    ?? finiteNumber(state?.fuel_on_arrival_estimate_lb);
  const lost = token(state?.sortie_outcome) === "DEFEAT";
  const recovered = handoff.phase === "RECOVERED";

  const fuelCopy = reserveTargetLb === null || reserveMarginLb === null
    ? "Recovery reserve result was unavailable."
    : `${recoveryFuelLb === null ? "Recovery fuel unavailable" : `Recovery fuel ${Math.round(recoveryFuelLb)} LB`} against ${Math.round(reserveTargetLb)} LB protected reserve; ${
      reserveMarginLb < 0
        ? `short by ${Math.round(-reserveMarginLb)} LB`
        : `${Math.round(reserveMarginLb)} LB above reserve`
    }.`;

  return withSortieLessons({
    kicker: "Guns-only handoff debrief",
    title: lost
      ? "Aircraft Lost After Handoff"
      : recovered ? "Handoff Complete · Home"
        : handoff.active ? "Fight Handed Off" : "Handoff Requested",
    brief: `Your credited kills: ${playerKills}. Relief kills: ${handoff.reliefKills} (tracked separately and not credited to you). ${fuelCopy}`,
    handoff: true,
    handoffPhase: handoff.phase,
    playerKills,
    reliefKills: handoff.reliefKills,
    reserveTargetLb,
    reserveMarginLb,
  }, state);
}

function casevacAssessmentLine(state) {
  const items = [
    ["Safe", state?.casevac_assessment_safe],
    ["Controlled", state?.casevac_assessment_controlled],
    ["Masked", state?.casevac_assessment_masked],
    ["Timely", state?.casevac_assessment_timely],
  ].map(([label, value]) => `${label}: ${readableToken(value, "not assessed")}`);
  return items.join(" · ");
}

function casevacResultCopy(state) {
  const disposition = token(state?.casevac_disposition);
  const correction = typeof state?.casevac_primary_correction === "string"
    && state.casevac_primary_correction.trim()
    ? state.casevac_primary_correction.trim()
    : "No primary correction was recorded.";
  const assessment = casevacAssessmentLine(state);
  const shared = `${assessment}. ${correction}`;

  switch (disposition) {
    case "TRANSFERREDONTIME":
    case "TRANSFERRED_ON_TIME":
      return {
        kicker: "Medevac debrief",
        title: "Handoff Complete",
        brief: `Capsule custody transferred at the receiver within the requested coordination window. ${shared}`,
      };
    case "TRANSFERREDAFTERREQUESTEDTIME":
    case "TRANSFERRED_AFTER_REQUESTED_TIME":
      return {
        kicker: "Medevac debrief",
        title: "Handoff After Requested Time",
        brief: `Capsule custody transferred at the receiver after the requested coordination window. ${shared}`,
      };
    case "CONTROLLEDABORT":
    case "CONTROLLED_ABORT":
      return {
        kicker: "Medevac debrief",
        title: "Controlled Abort",
        brief: `The aircraft reached the authored safe-exit volume and the mission closed without a handoff. ${shared}`,
      };
    case "AIRCRAFTLOSTEMPTY":
    case "AIRCRAFT_LOST_EMPTY":
      return {
        kicker: "Medevac debrief",
        title: "Aircraft Lost",
        brief: `The aircraft became unflyable before capsule custody transferred aboard. ${shared}`,
      };
    case "AIRCRAFTLOSTOCCUPIED":
    case "AIRCRAFT_LOST_OCCUPIED":
      return {
        kicker: "Medevac debrief",
        title: "Aircraft Lost With Capsule Aboard",
        brief: `The aircraft became unflyable while capsule custody remained aboard. ${shared}`,
      };
    default:
      return {
        kicker: "Medevac debrief",
        title: "Mission Incomplete",
        brief: `No terminal handoff, controlled abort, or aircraft-loss disposition was recorded. ${shared}`,
      };
  }
}

/**
 * Produce the concise result-card story from authoritative snapshot evidence.
 * Detailed replay analysis is appended separately when the recorded clip is available.
 */
export function sortieResultCopy(state) {
  if (state?.casevac_mission === true) return casevacResultCopy(state);

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
  const handoff = combatHandoffCopy(state);
  if (handoff) return handoff;

  switch (token(state?.sortie_outcome)) {
    case "DISCONTINUED":
      return withSortieLessons({
        kicker: "Sortie complete",
        title: "Discontinued · Recovered",
        brief: "The aircraft was recovered after the fight was discontinued. Review the landing fuel against the protected reserve before the next sortie.",
      }, state);
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
