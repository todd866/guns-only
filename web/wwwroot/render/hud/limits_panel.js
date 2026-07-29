/// Always-on Limits Panel presentation.
/// Spec: docs/superpowers/specs/2026-07-29-rapier-phase-hud-design.md
/// (Rapier nav rows) and docs/superpowers/specs/2026-07-27-hud-limits-panel-design.md (dogfight).

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function row(label, value, unit) {
  return Object.freeze({ label, value, unit });
}

/**
 * Consume the kernel's current-condition recovery projection without repairing missing or
 * outbound data in the browser. Signed closure is useful evidence in its own right: a negative
 * value means AWAY, near-zero means ABEAM, and neither state has a defensible ETA or fuel price.
 */
export function recoveryNavigationPresentation(state = {}) {
  // The render loop can run once before the first kernel snapshot exists. Optional chaining only
  // protects null on the property where it is used, so normalize the whole public boundary once.
  const snapshot = state && typeof state === "object" ? state : {};
  const recoveryPointKnown = snapshot.recovery_point_known === true;
  const rangeNm = finiteNumber(snapshot.rtb_range_nm);
  const bearingDeg = finiteNumber(snapshot.rtb_bearing_deg);
  const turnDeg = finiteNumber(snapshot.rtb_turn_deg);
  const closureKts = finiteNumber(snapshot.rtb_closure_kts);
  const etaMinutes = finiteNumber(snapshot.rtb_eta_min);
  const fuelToHomeLb = finiteNumber(snapshot.fuel_to_home_estimate_lb);
  const fuelOnArrivalLb = finiteNumber(snapshot.fuel_on_arrival_estimate_lb);
  const reserveTargetLb = finiteNumber(snapshot.fuel_reserve_target_lb);
  const reserveMarginLb = finiteNumber(snapshot.fuel_reserve_margin_lb);
  const groundKts = finiteNumber(snapshot.ground_speed_kts);
  const directFlowPph = finiteNumber(snapshot.fuel_flow_pph);
  const legacyFlowLbPerMinute = finiteNumber(snapshot.fuel_flow_lb_min)
    ?? finiteNumber(snapshot.fuel_burn_lb_min);
  const flowPph = directFlowPph
    ?? (legacyFlowLbPerMinute === null ? null : legacyFlowLbPerMinute * 60);
  const nmPerMin = groundKts === null ? null : Math.max(0, groundKts) / 60;
  const lbPerMin = flowPph === null ? null : Math.max(0, flowPph) / 60;
  const lbPerNm = lbPerMin !== null && nmPerMin !== null && nmPerMin > 0.01
    ? lbPerMin / nmPerMin : null;
  const reserveMinutes = reserveMarginLb !== null
      && lbPerMin !== null && lbPerMin > 0.01
    ? reserveMarginLb / lbPerMin : null;

  let travelState = "unavailable";
  if (recoveryPointKnown) {
    if (etaMinutes === 0 && rangeNm !== null && rangeNm < 0.01) travelState = "arrived";
    else if (closureKts === null) travelState = "unknown";
    else if (closureKts < -1) travelState = "outbound";
    else if (closureKts <= 1) travelState = "abeam";
    else travelState = "inbound";
  }

  return Object.freeze({
    recoveryPointKnown,
    rangeNm,
    bearingDeg,
    turnDeg,
    closureKts,
    etaMinutes,
    fuelToHomeLb,
    fuelOnArrivalLb,
    reserveTargetLb,
    reserveMarginLb,
    groundKts,
    flowPph,
    nmPerMin,
    lbPerMin,
    lbPerNm,
    reserveMinutes,
    travelState,
  });
}

function thermalAccent(state, base) {
  if (state.rapier_mission_available !== true) return base;
  const marginC = finiteNumber(state.rapier_cmc_margin_c)
    ?? finiteNumber(state.rapier_thermal_margin_c);
  const skinC = finiteNumber(state.rapier_stagnation_temp_c)
    ?? finiteNumber(state.rapier_skin_temp_c);
  const limitC = finiteNumber(state.rapier_cmc_capability_c);
  if (marginC === null) return base;
  if (marginC < 0) return "fault";
  if ((marginC < 100 || (skinC !== null && limitC !== null
        && limitC > 0 && skinC / limitC >= 0.9))
      && base === "normal") return "caution";
  return base;
}

/**
 * On-arrival minutes until the next physical fuel state: MIN → EMER → DRY.
 * Joker/Bingo stay out of this cell (radio/warning callouts when crossed).
 */
export function arrivalFuelStatePresentation({
  fuelOnArrivalLb,
  lbPerMin,
  minimumLb,
  emergencyLb,
} = {}) {
  if (fuelOnArrivalLb === null || lbPerMin === null || lbPerMin <= 0.01) {
    return null;
  }
  const minLb = finiteNumber(minimumLb);
  const emerLb = finiteNumber(emergencyLb) ?? 0;

  if (minLb !== null && fuelOnArrivalLb > minLb) {
    return Object.freeze({
      label: "ARR MIN",
      minutes: (fuelOnArrivalLb - minLb) / lbPerMin,
      nextState: "min",
    });
  }
  if (fuelOnArrivalLb > emerLb) {
    return Object.freeze({
      label: "ARR EMER",
      minutes: (fuelOnArrivalLb - emerLb) / lbPerMin,
      nextState: "emer",
    });
  }
  return Object.freeze({
    label: "ARR DRY",
    minutes: fuelOnArrivalLb / lbPerMin,
    nextState: "dry",
  });
}

function formatSignedMinutes(minutes) {
  if (minutes === null || !Number.isFinite(minutes)) return "--";
  if (minutes < 0) return String(Math.round(minutes));
  return String(Math.max(0, Math.round(minutes)));
}

function resolveArrivalFuelLb(navigation, fuelLb) {
  if (navigation.fuelOnArrivalLb !== null) return navigation.fuelOnArrivalLb;
  if (navigation.fuelToHomeLb !== null && fuelLb !== null) {
    return fuelLb - navigation.fuelToHomeLb;
  }
  return null;
}

function navPresentation(state, fuelLb, flowPph, capacityLb, bingoThresholdLb) {
  const navigation = recoveryNavigationPresentation(state);
  const nmPerMin = navigation.nmPerMin;
  const lbPerMin = navigation.lbPerMin;
  const lbPerNm = navigation.lbPerNm;
  const arrivalLb = resolveArrivalFuelLb(navigation, fuelLb);
  const arrival = arrivalFuelStatePresentation({
    fuelOnArrivalLb: arrivalLb,
    lbPerMin,
    minimumLb: finiteNumber(state.fuel_minimum_lb) ?? bingoThresholdLb,
    emergencyLb: finiteNumber(state.fuel_emergency_lb),
  });

  let accent = "normal";
  if (arrival) {
    if (arrival.nextState === "dry" || arrival.minutes < 0) accent = "fault";
    else if (arrival.nextState === "emer" || arrival.minutes < 5) accent = "caution";
  } else if (navigation.reserveMarginLb !== null && navigation.reserveMarginLb < 0) {
    accent = "fault";
  }
  accent = thermalAccent(state, accent);

  return Object.freeze({
    profile: "nav",
    rows: Object.freeze([
      row("FUEL", String(Math.round(fuelLb)), "LB"),
      row("NM/MIN", nmPerMin !== null && nmPerMin > 0.01 ? nmPerMin.toFixed(1) : "--", ""),
      row("LB/MIN", lbPerMin !== null ? String(Math.round(lbPerMin)) : "--", ""),
      row("LB/NM", lbPerNm !== null ? lbPerNm.toFixed(2) : "--", ""),
      row(
        arrival?.label ?? "ARR",
        arrival ? formatSignedMinutes(arrival.minutes) : "--",
        "MIN",
      ),
    ]),
    accent,
    heroIndex: 4,
    fuelRatio: capacityLb > 0 ? Math.min(1, Math.max(0, fuelLb / capacityLb)) : 0,
    bingoRatio: capacityLb > 0
      ? Math.min(1, Math.max(0, bingoThresholdLb / capacityLb)) : 0,
    reserveMin: arrival?.minutes ?? null,
    reserveMarginLb: navigation.reserveMarginLb,
    etaMinutes: navigation.etaMinutes,
    fuelRequiredLb: navigation.fuelToHomeLb,
    fuelOnArrivalLb: arrivalLb,
    arrivalNextState: arrival?.nextState ?? null,
  });
}

function fuelPresentation(state, fuelLb, flowPph, capacityLb, bingoThresholdLb) {
  const jokerThresholdLb = finiteNumber(state.fuel_joker_lb);
  const minutesToJoker = finiteNumber(state.fuel_minutes_to_joker);
  const minutesToBingo = finiteNumber(state.fuel_minutes_to_bingo);
  const endurance = finiteNumber(state.fuel_endurance_minutes);
  const bingo = state.fuel_bingo === true || fuelLb <= bingoThresholdLb;
  const joker = state.fuel_joker === true
    || (jokerThresholdLb !== null && fuelLb <= jokerThresholdLb);
  const emergency = state.fuel_emergency === true;
  const minimum = state.fuel_minimum === true;

  let accent = "normal";
  if (emergency || minimum || (bingo && fuelLb <= bingoThresholdLb * 0.5)) accent = "fault";
  else if (bingo || joker) accent = "caution";
  accent = thermalAccent(state, accent);

  const jokerMin = bingo
    ? (endurance !== null ? String(Math.max(0, Math.round(endurance))) : "--")
    : (minutesToJoker !== null ? String(Math.max(0, Math.round(minutesToJoker))) : "--");
  const bingoMin = bingo
    ? (endurance !== null ? String(Math.max(0, Math.round(endurance))) : "--")
    : (minutesToBingo !== null ? String(Math.max(0, Math.round(minutesToBingo))) : "--");

  return Object.freeze({
    profile: "fuel",
    rows: Object.freeze([
      row("FUEL", String(Math.round(fuelLb)), "LB"),
      row("FF", flowPph !== null ? String(Math.round(flowPph)) : "--", "PPH"),
      row("JOKER", jokerMin, "MIN"),
      row("BINGO", bingoMin, "MIN"),
    ]),
    accent,
    heroIndex: 3,
    fuelRatio: capacityLb > 0 ? Math.min(1, Math.max(0, fuelLb / capacityLb)) : 0,
    bingoRatio: capacityLb > 0
      ? Math.min(1, Math.max(0, bingoThresholdLb / capacityLb)) : 0,
  });
}

export function limitsPanelPresentation(state = {}) {
  const snapshot = state && typeof state === "object" ? state : {};
  const fuelLb = finiteNumber(snapshot.fuel_lb);
  if (fuelLb === null) return null;
  const capacityLb = Math.max(0, finiteNumber(snapshot.fuel_capacity_lb) ?? 2826);
  const bingoThresholdLb = Math.max(0, finiteNumber(snapshot.fuel_bingo_lb) ?? 800);
  const directFlowPph = finiteNumber(snapshot.fuel_flow_pph);
  const legacyFlowLbPerMinute = finiteNumber(snapshot.fuel_flow_lb_min)
    ?? finiteNumber(snapshot.fuel_burn_lb_min);
  const flowPph = directFlowPph
    ?? (legacyFlowLbPerMinute === null ? 0 : legacyFlowLbPerMinute * 60);
  const measuredFlow = Math.max(0, flowPph);

  if (snapshot.recovery_point_known === true) {
    return navPresentation(snapshot, Math.max(0, fuelLb), measuredFlow, capacityLb,
      bingoThresholdLb);
  }
  if (snapshot.fuel_consumes === false) return null;
  return fuelPresentation(snapshot, Math.max(0, fuelLb), measuredFlow, capacityLb,
    bingoThresholdLb);
}
