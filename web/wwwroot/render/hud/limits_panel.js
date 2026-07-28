/// Always-on Limits Panel presentation.
/// Spec: docs/superpowers/specs/2026-07-27-hud-limits-panel-design.md
///
/// Four slots. Profile switches between nav teaching numbers (destination = strip) and dogfight
/// fuel thresholds. Patient profile is a typed future socket — not invented here.

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function row(label, value, unit) {
  return Object.freeze({ label, value, unit });
}

function recoveryPointKnown(state) {
  if (state?.rtb_steer === true
      && finiteNumber(state.rtb_range_nm) !== null
      && finiteNumber(state.rtb_bearing_deg) !== null) {
    return true;
  }
  // Rapier / Circuits publish strip geometry even before formal RTB steer.
  if (state?.rapier_mission_available === true
      && finiteNumber(state.rtb_range_nm) !== null
      && finiteNumber(state.rtb_bearing_deg) !== null) {
    return true;
  }
  return false;
}

function closingKtsTowardHome(state) {
  // Published home-closure wins when present. Harness / teaching snapshots pin weak progress
  // toward the strip without fighting the FPV↔α geometry contract (which overwrites vx/vz from
  // TAS along the flight path).
  const published = finiteNumber(state.rtb_closure_kts);
  if (published !== null) {
    const trueAirspeedKts = Math.max(1, finiteNumber(state.true_airspeed_kts) ?? 1);
    return published > 1 ? published : trueAirspeedKts;
  }
  const bearingDeg = finiteNumber(state.rtb_bearing_deg) ?? 0;
  const bearingRad = bearingDeg * Math.PI / 180;
  const eastMps = Number(state.vx) || 0;
  const northMps = Number(state.vz) || 0;
  const closureKts = (eastMps * Math.sin(bearingRad) + northMps * Math.cos(bearingRad))
    * 1.94384;
  const trueAirspeedKts = Math.max(1, finiteNumber(state.true_airspeed_kts) ?? 1);
  // Below a knot of closure the arc is not making progress home; fall back to TAS so the readout
  // degrades rather than dividing by zero / inventing negative time.
  return closureKts > 1 ? closureKts : trueAirspeedKts;
}

function thermalAccent(state, base) {
  const marginC = finiteNumber(state.rapier_thermal_margin_c);
  const skinC = finiteNumber(state.rapier_skin_temp_c)
    ?? finiteNumber(state.rapier_stagnation_temp_c);
  const limitC = finiteNumber(state.rapier_thermal_limit_c);
  if (marginC === null) return base;
  if (marginC < 0) return "fault";
  if ((marginC < 100 || (skinC !== null && limitC !== null
        && limitC > 0 && skinC / limitC >= 0.9))
      && base === "normal") return "caution";
  return base;
}

function navPresentation(state, fuelLb, flowPph, capacityLb, bingoThresholdLb) {
  const rangeNm = finiteNumber(state.rtb_range_nm);
  const groundKts = Math.max(0, finiteNumber(state.ground_speed_kts) ?? 0);
  const nmPerMin = groundKts / 60;
  const lbPerMin = flowPph / 60;
  const lbPerNm = nmPerMin > 0.01 ? lbPerMin / nmPerMin : null;

  const closing = closingKtsTowardHome(state);
  const etaMinutes = rangeNm !== null && closing > 0
    ? Math.max(0, rangeNm / closing * 60) : null;
  const fuelRequiredLb = etaMinutes !== null && flowPph > 0
    ? flowPph * (etaMinutes / 60) : null;
  const reserveLb = fuelRequiredLb !== null ? fuelLb - fuelRequiredLb : null;
  const reserveMin = reserveLb !== null && lbPerMin > 0.01
    ? reserveLb / lbPerMin : null;

  let accent = "normal";
  if (reserveMin !== null && etaMinutes !== null) {
    if (reserveMin < 0) accent = "fault";
    else if (reserveMin < 0.10 * etaMinutes) accent = "caution";
  }
  accent = thermalAccent(state, accent);

  const reserveValue = reserveMin === null
    ? "--"
    : (reserveMin < 0
      ? String(Math.round(reserveMin))
      : String(Math.max(0, Math.round(reserveMin))));

  return Object.freeze({
    profile: "nav",
    rows: Object.freeze([
      row("NM/MIN", nmPerMin > 0.01 ? nmPerMin.toFixed(1) : "--", ""),
      row("LB/MIN", Number.isFinite(lbPerMin) ? String(Math.round(lbPerMin)) : "--", ""),
      row("LB/NM", lbPerNm !== null ? lbPerNm.toFixed(2) : "--", ""),
      row("RESERVE", reserveValue, "MIN"),
    ]),
    accent,
    heroIndex: 3,
    fuelRatio: capacityLb > 0 ? Math.min(1, Math.max(0, fuelLb / capacityLb)) : 0,
    bingoRatio: capacityLb > 0
      ? Math.min(1, Math.max(0, bingoThresholdLb / capacityLb)) : 0,
    reserveMin,
    etaMinutes,
    fuelRequiredLb,
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
  const fuelLb = finiteNumber(state.fuel_lb);
  if (fuelLb === null) return null;
  const capacityLb = Math.max(0, finiteNumber(state.fuel_capacity_lb) ?? 2826);
  const bingoThresholdLb = Math.max(0, finiteNumber(state.fuel_bingo_lb) ?? 800);
  const directFlowPph = finiteNumber(state.fuel_flow_pph);
  const legacyFlowLbPerMinute = finiteNumber(state.fuel_flow_lb_min)
    ?? finiteNumber(state.fuel_burn_lb_min);
  const flowPph = directFlowPph
    ?? (legacyFlowLbPerMinute === null ? 0 : legacyFlowLbPerMinute * 60);
  const measuredFlow = Math.max(0, flowPph);

  if (recoveryPointKnown(state)) {
    return navPresentation(state, Math.max(0, fuelLb), measuredFlow, capacityLb,
      bingoThresholdLb);
  }
  if (state.fuel_consumes === false) return null;
  return fuelPresentation(state, Math.max(0, fuelLb), measuredFlow, capacityLb,
    bingoThresholdLb);
}
