function token(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function hasOpponentKill(state) {
  return Array.isArray(state?.recent_events) && state.recent_events.some((event) =>
    token(event?.type) === "DESTROYED"
      && token(event?.source) === "OPPONENT"
      && token(event?.target) === "PLAYER");
}

function carrierLossPresentation(state) {
  if (hasOpponentKill(state)) {
    return {
      brief: "Bandit gunfire destroyed the aircraft.",
      correction: "Break the gun solution earlier.",
    };
  }

  switch (token(state?.player_impact_surface)) {
    case "FLIGHT_DECK":
      return {
        brief: "Flight deck impact.",
        correction: "Correct the first approach deviation.",
      };
    case "CARRIER_STRUCTURE":
      return {
        brief: "Carrier structure impact.",
        correction: "Recheck approach geometry.",
      };
    case "WATER":
      return {
        brief: "Water impact.",
        correction: "Fix energy and flight path before recommitting.",
      };
    case "GROUND":
      return {
        brief: "Terrain impact.",
        correction: "Restore terrain clearance before re-engaging.",
      };
    case "SIMULATION_BOUNDARY":
      return {
        brief: "Outcome unresolved.",
        correction: "Review the final flight path.",
      };
    default:
      return state?.carrier === true
        ? {
          brief: "Aircraft not recovered aboard.",
          correction: "Review the first approach deviation.",
        }
        : {
          brief: "Aircraft lost.",
          correction: "Review the first controllable deviation.",
        };
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
  const returnReason = token(snapshot.rtb_reason) || "NONE";
  const automatic = snapshot.rtb_automatic === true
    || returnReason === "BINGO_FUEL";
  const reliefKills = Math.max(0,
    Math.trunc(finiteNumber(snapshot.relief_kills) ?? 0));
  const phaseIndex = HANDOFF_PHASE_BY_ORDINAL.indexOf(phase);
  const occurred = requested || active || playerRtbActive || phaseIndex >= 2;
  const available = (snapshot.rtb_available === true || phase === "AVAILABLE")
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
  if (returnReason === "BINGO_FUEL" && playerRtbActive)
    status = "BINGO · KNOCK IT OFF · RTB";
  else if (returnReason === "PILOT_KNOCK_IT_OFF" && playerRtbActive
      && phase === "UNAVAILABLE")
    status = "KNOCK IT OFF · RTB";
  else if (available && phase !== "AVAILABLE")
    status = "CALL IT A DAY · RTB AVAILABLE";

  return Object.freeze({
    phase,
    requested,
    active,
    playerRtbActive,
    reliefKills,
    occurred,
    available,
    returnReason,
    automatic,
    status,
  });
}

function formatG(value) {
  return Math.abs(value).toFixed(1);
}

function withFact(result, fact) {
  return {
    ...result,
    facts: [...(Array.isArray(result.facts) ? result.facts : []), fact],
  };
}

function withGToleranceLesson(result, state) {
  const gLocCount = Math.max(0, Math.trunc(finiteNumber(state?.pilot_g_loc_count) ?? 0));
  if (gLocCount === 0) {
    return result;
  }

  const peakPositiveG = finiteNumber(state?.pilot_peak_positive_g);
  const peakNegativeG = finiteNumber(state?.pilot_peak_negative_g);
  const pushPullPenaltyG = finiteNumber(state?.pilot_push_pull_penalty_g);
  const parts = [`G-LOC ×${gLocCount}`];
  if (peakPositiveG !== null)
    parts.push(`peak +${formatG(Math.max(0, peakPositiveG))} G`);
  if (pushPullPenaltyG !== null && pushPullPenaltyG > 0.5) {
    parts.push(`push-pull ${formatG(pushPullPenaltyG)} G${
      peakNegativeG !== null && peakNegativeG < 0
        ? ` after −${formatG(peakNegativeG)} G`
        : ""
    }`);
  }

  return {
    ...withFact(result, parts.join(" · ")),
    safetyCorrection: "Ease G onset and unload earlier.",
  };
}

function withAutoGcasLesson(result, state) {
  const activations = Math.max(0,
    Math.trunc(finiteNumber(state?.auto_gcas_activation_count) ?? 0));
  if (activations === 0) return result;

  const overrides = Math.max(0,
    Math.trunc(finiteNumber(state?.auto_gcas_override_count) ?? 0));
  const fact = [`Auto-GCAS ×${activations}`];
  if (overrides > 0) fact.push(`overrides ${overrides}`);
  return {
    ...withFact(result, fact.join(" · ")),
    safetyCorrection: "Discontinue after an Auto-GCAS fly-up.",
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
  const exposure = ["Airframe review"];
  if (overStructuralSeconds > 0) {
    exposure.push(`structural +${overStructuralSeconds.toFixed(1)} s`);
    if (maximumG !== null) exposure.push(`peak ${maximumG.toFixed(1)} G`);
  }
  if (overDynamicPressureSeconds > 0) {
    exposure.push(`q +${overDynamicPressureSeconds.toFixed(1)} s`);
  }
  exposure.push("damage/cost not inferred");

  return {
    ...withFact(result, exposure.join(" · ")),
    safetyCorrection: "Hold the aircraft for maintenance review.",
    serviceLifeReviewRequired: true,
  };
}

function withSortieLessons(result, state) {
  return withServiceLifeReview(
    withAutoGcasLesson(withGToleranceLesson(result, state), state),
    state,
  );
}

/**
 * Keep the visual-merge debrief to measured facts and the highest-priority correction. The
 * snapshot remains the full evidence record; this projection is only the scan-first result card.
 */
export function visualMergeDebriefPresentation(state = {}) {
  if (state?.visual_merge_evaluation !== true) return null;
  const number = (key, fallback = 0) => finiteNumber(state?.[key]) ?? fallback;
  const score = Math.max(0, Math.min(100, Math.round(number("visual_merge_score"))));
  const dwell = Math.max(0, number("rear_quarter_dwell_s"));
  const hits = Math.max(0, Math.round(number("evaluated_projectile_hits")));
  const minimumEnergy = Math.max(0, number("minimum_energy_kias"));
  const minimumPass = Math.max(0, number("minimum_merge_range_m"));
  const peakClosure = Math.max(0, number("peak_closure_kts"));
  const headOnPresses = Math.max(0, Math.round(number("head_on_trigger_violations")));
  const highAspectPresses = Math.max(0, Math.round(number("high_aspect_trigger_violations")));
  const overshoots = Math.max(0, Math.round(number("overshoot_count")));

  const facts = [
    `Score ${score}/100`,
    `Rear ${dwell.toFixed(1)} s`,
    `Hits ${hits}`,
  ];
  if (minimumPass > 0) facts.push(`Merge ${Math.round(minimumPass)} m`);
  if (minimumEnergy > 0) facts.push(`Min ${Math.round(minimumEnergy)} KIAS`);
  if (peakClosure > 0) facts.push(`Closure ${Math.round(peakClosure)} KT`);
  if (overshoots > 0) facts.push(`Overshoots ${overshoots}`);

  let correction;
  if (headOnPresses > 0) {
    correction = "Hold fire through the first pass.";
  } else if (highAspectPresses > 0) {
    correction = "Wait for rear-quarter geometry.";
  } else if (minimumPass > 0 && minimumPass < 150) {
    correction = "Open first-pass spacing to 150 m.";
  } else if (minimumEnergy > 0 && minimumEnergy < 300) {
    correction = "Keep 300 KIAS through the first turn.";
  } else if (overshoots > 0 || peakClosure > 250) {
    correction = "Settle closure below 250 KT.";
  } else if (dwell < 5) {
    correction = "Hold the rear quarter for 5.0 s.";
  } else if (hits < 2) {
    correction = "Turn the stable solution into two hits.";
  } else {
    correction = "Repeat the stable rear-quarter pass.";
  }

  return Object.freeze({
    facts: Object.freeze(facts),
    evidence: facts.join(" · "),
    correction,
  });
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

export const TOP_GUN_MISSION_ID = "mission.top-gun.acm.f14a-vs-mig28.v1";
const TOP_GUN_MISSION_TOKEN = token(TOP_GUN_MISSION_ID);

function isCarrierQualification(state) {
  const mission = token(state?.mission_definition_id);
  return state?.carrier === true
    && [
      "MISSION.CARRIER-QUALIFICATION.V1",
      "MISSION.KOREA.PANTHER-SORTIE.V1",
      TOP_GUN_MISSION_TOKEN,
    ].includes(mission);
}

function carrierQualificationCoreCopy(state) {
  const recovery = token(state?.recovery);
  const barrier = state?.barrier_engagement === true
    || recovery.replaceAll("_", "").replaceAll(" ", "") === "BARRIERENGAGEMENT";
  const trapped = recovery === "TRAP" || token(state?.arrest_phase) === "STOPPED";
  const bolter = state?.bolter === true || recovery === "BOLTER";
  const wire = Math.max(0, Math.round(Number(state?.wire) || 0));
  const grade = readableToken(state?.touchdown_grade, "UNASSESSED");
  const deviations = readableToken(state?.touchdown_deviations, "No recorded deviations");
  const correction = readableToken(
    state?.touchdown_primary_correction,
    "Review the approach",
  );

  if (barrier) {
    return {
      kicker: "Carrier qualification debrief",
      title: "Barrier · Missed wires",
      brief: `${grade}. The raised barrier retained the aircraft aboard after the arresting wires were missed; no wire was caught. Recorded deviations: ${deviations}. Primary correction: ${correction}.`,
    };
  }
  if (trapped) {
    return {
      kicker: "Carrier qualification debrief",
      title: wire > 0 ? `Trapped · Wire ${wire}` : "Trapped",
      brief: `${grade}. Recorded deviations: ${deviations}. Primary correction: ${correction}.`,
    };
  }
  if (bolter) {
    return {
      kicker: "Carrier qualification debrief",
      title: "Bolter · No wire",
      brief: `${grade}. No arresting wire was caught. Recorded deviations: ${deviations}. Primary correction: ${correction}.`,
    };
  }
  if (token(state?.sortie_outcome) === "DEFEAT") {
    const loss = carrierLossPresentation(state);
    return {
      kicker: "Carrier qualification debrief",
      title: "Aircraft Lost",
      ...loss,
    };
  }
  return {
    kicker: "Carrier qualification debrief",
    title: "Recovery Incomplete",
    brief: `The aircraft was not recovered. Recorded deviations: ${deviations}. Primary correction: ${correction}.`,
  };
}

function carrierQualificationCopy(state) {
  return withSortieLessons(carrierQualificationCoreCopy(state), state);
}

function combatHandoffCoreCopy(state) {
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

  const facts = [
    `Kills ${playerKills}`,
    `Relief ${handoff.reliefKills} uncredited`,
  ];
  if (reserveTargetLb === null || reserveMarginLb === null) {
    facts.push("Reserve unavailable");
  } else {
    facts.push(`${recoveryFuelLb === null
      ? "Fuel unavailable"
      : `Fuel ${Math.round(recoveryFuelLb)} LB`} · reserve ${reserveMarginLb < 0 ? "−" : "+"}${
      Math.round(Math.abs(reserveMarginLb))
    } LB`);
  }

  return {
    kicker: "Guns-only handoff debrief",
    title: lost
      ? "Aircraft Lost After Handoff"
      : recovered ? "Handoff Complete · Home"
        : handoff.active ? "Fight Handed Off" : "Handoff Requested",
    brief: lost ? "Ownship lost after handoff." : "Combat passed to relief.",
    facts,
    correction: lost
      ? "Review the first controllable deviation."
      : reserveMarginLb !== null && reserveMarginLb < 0
        ? "Protect the fuel reserve earlier."
        : recovered
          ? "Repeat the clean handoff and recovery."
          : "Complete RTB and recovery.",
    handoff: true,
    handoffPhase: handoff.phase,
    playerKills,
    reliefKills: handoff.reliefKills,
    reserveTargetLb,
    reserveMarginLb,
  };
}

function combatHandoffCopy(state) {
  const result = combatHandoffCoreCopy(state);
  return result ? withSortieLessons(result, state) : null;
}

/**
 * Top Gun is both a continuing combat handoff and a physical carrier recovery. Neither axis may
 * erase the other: combat custody owns kill/reserve accounting, while the carrier assessment owns
 * wire, pass grade and the next correction.
 */
export function topGunCarrierDebriefCopy(state = {}) {
  if (state?.carrier !== true || token(state?.mission_definition_id) !== TOP_GUN_MISSION_TOKEN)
    return null;

  const carrier = carrierQualificationCoreCopy(state);
  const handoff = combatHandoffCoreCopy(state);
  if (!handoff) {
    return withSortieLessons({
      ...carrier,
      kicker: "Top Gun carrier debrief",
      carrierRecovery: true,
    }, state);
  }

  return withSortieLessons({
    ...handoff,
    kicker: "Top Gun combat + carrier debrief",
    title: carrier.title,
    brief: `${handoff.brief} Carrier recovery: ${carrier.title}. ${carrier.brief}`,
    carrierRecovery: true,
    carrierTitle: carrier.title,
    carrierBrief: carrier.brief,
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
 * Detailed incident analysis stays behind the optional Replay action.
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
    const roundsPerKill = finiteNumber(state.drone_raid_rounds_per_kill);
    const facts = [`Score ${score}/${maximum}`, `Kills ${kills}/${total}`, `Leakers ${leakers}`];
    if (ownshipLost) facts.push("Unresolved raiders score as leakers");
    if (kills > 0 && roundsPerKill !== null)
      facts.push(`${roundsPerKill.toFixed(1)} rounds/kill`);
    return withSortieLessons({
      kicker: "Air-defence debrief",
      title: ownshipLost ? "Ownship Lost" : zeroLeakers ? "Raid Defeated" : "Raid Penetrated",
      brief: ownshipLost
        ? "Ownship lost."
        : zeroLeakers
          ? "All raiders destroyed."
          : `${leakers} raider${leakers === 1 ? "" : "s"} penetrated.`,
      facts,
      correction: ownshipLost
        ? "Review the first controllable deviation."
        : zeroLeakers
          ? "Repeat the clean intercept."
          : "Engage the next leaker earlier.",
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
    const demerits = Math.max(0, Math.round(Number(state.maintenance_demerits) || 0));
    return withSortieLessons({
      kicker: "Maintenance test-flight debrief",
      title: recovered ? complete ? "Recovery Complete" : "Procedure Incomplete" : "Aircraft Lost",
      brief: recovered
        ? "Aircraft recovered aboard."
        : "Aircraft not recovered.",
      facts: [`Procedure ${score}/${maximum}`, `Demerits ${demerits}`],
      correction: recovered
        ? complete ? "Repeat the recovery profile." : "Complete the procedure before recovery."
        : "Review the first controllable deviation.",
    }, state);
  }

  const topGunCarrier = topGunCarrierDebriefCopy(state);
  if (topGunCarrier) return topGunCarrier;
  if (isCarrierQualification(state)) return carrierQualificationCopy(state);
  const handoff = combatHandoffCopy(state);
  if (handoff) return handoff;

  switch (token(state?.sortie_outcome)) {
    case "DISCONTINUED":
      return withSortieLessons({
        kicker: "Sortie complete",
        title: "Discontinued · Recovered",
        brief: "Aircraft recovered after knock-it-off.",
        correction: "Check landing fuel against reserve.",
      }, state);
    case "VICTORY":
      return withSortieLessons({
        kicker: "Sortie complete",
        title: "Victory",
        brief: "Bandit destroyed.",
        correction: "Repeat the winning pass.",
      }, state);
    case "DEFEAT": {
      const loss = carrierLossPresentation(state);
      return withSortieLessons({
        kicker: "Sortie complete",
        title: "Aircraft Lost",
        ...loss,
      }, state);
    }
    case "DRAW":
      return withSortieLessons({
        kicker: "Sortie complete",
        title: "Mutual Kill",
        brief: "Both aircraft lost.",
        correction: "Disengage before the exchange.",
      }, state);
    default:
      return withSortieLessons({
        kicker: "Sortie complete",
        title: "Fight Complete",
        brief: "Fight ended.",
        correction: "Review the final exchange.",
      }, state);
  }
}
