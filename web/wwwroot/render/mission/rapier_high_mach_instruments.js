/**
 * Renderer-independent Rapier glass contract. It turns one flight snapshot (plus an optional
 * prior pure history value) into at most four short rows and one phase cue. The module does not
 * know which target was dealt, which store is carried, or what a sortie costs.
 *
 * New runtime facts expected by this contract are deliberately narrow:
 *   simulation_time_s, rapier_drag_lbf, rapier_dynamic_pressure_limit_kpa,
 *   requested_alpha_deg, rapier_relight_dynamic_pressure_kpa, and the
 *   rapier_thermal_* binding-zone channels.
 * Everything else consumed below already exists in SnapshotProjection. When a fact is absent the
 * relevant value is omitted; no old placard or schedule number is invented in browser code.
 */
const KNOTS_TO_METRES_PER_SECOND = 0.5144444444;
const FEET_TO_METRES = 0.3048;
const STANDARD_GRAVITY_MPS2 = 9.80665;
const RAM_LIVE_SHARE = 0.04;
const HANDOVER_TURBINE_SHARE = 0.08;
const TREND_WINDOW_MIN_S = 0.75;
const TREND_WINDOW_MAX_S = 30.0;

export const RAPIER_HIGH_MACH_PHASE = Object.freeze({
  CLIMB: 2,
  ACCELERATE: 3,
  RAM_CLIMB: 4,
  ZOOM_PULL: 5,
  ZOOM_COAST: 6,
  REENTER_ALIGN: 7,
  DIP_RELIGHT: 8,
  INTERCEPT: 9,
  ATTACK: 10,
  ESCAPE: 11,
  RETURN_TO_BASE: 12,
});

const PHASE_LABEL = Object.freeze({
  2: "CLIMB",
  3: "ACCEL",
  4: "RAM CLIMB",
  5: "ZOOM",
  6: "COAST",
  7: "REENTRY",
  8: "RELIGHT",
  9: "INTERCEPT",
  10: "PASS",
  11: "EGRESS",
  12: "HOME",
});

const TBCC_LABEL = Object.freeze({
  off: "OFF",
  turbine: "TURB",
  locked: "RAM LOCKED",
  handover: "XFER",
  ram: "RAM",
  relight: "RELIGHT",
  unstart: "UNSTART",
});

const EMPTY_RATES = Object.freeze({
  machPerS: null,
  dynamicPressureKpaPerS: null,
  specificEnergyMPerS: null,
  skinCPerS: null,
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function phaseFromState(state) {
  return Math.max(0, Math.floor(finiteNumber(state?.rapier_mission_phase) ?? 0));
}

function eligible(state) {
  if (state?.rapier_mission_available !== true || state.rapier_pattern_only === true) {
    return false;
  }
  const phase = phaseFromState(state);
  return phase >= RAPIER_HIGH_MACH_PHASE.CLIMB
    && phase <= RAPIER_HIGH_MACH_PHASE.RETURN_TO_BASE;
}

function freezeRow(id, text, level = "normal") {
  if (!text) return null;
  return Object.freeze({ id, text, level });
}

function trend(rate, deadband) {
  if (rate === null) return Object.freeze({ direction: "unknown", glyph: "" });
  if (rate > deadband) return Object.freeze({ direction: "rising", glyph: "↑" });
  if (rate < -deadband) return Object.freeze({ direction: "falling", glyph: "↓" });
  return Object.freeze({ direction: "steady", glyph: "→" });
}

function signed(value, digits = 0) {
  if (value === null) return "";
  const magnitude = Math.abs(value).toFixed(digits);
  return `${value < 0 ? "−" : "+"}${magnitude}`;
}

function compactSigned(value, unit = "") {
  if (value === null) return "";
  const magnitude = Math.abs(value);
  const suffix = unit ? ` ${unit}` : "";
  if (magnitude >= 1000) {
    const digits = magnitude >= 10_000 ? 0 : 1;
    return `${value < 0 ? "−" : "+"}${(magnitude / 1000).toFixed(digits)}K${suffix}`;
  }
  return `${value < 0 ? "−" : "+"}${Math.round(magnitude)}${suffix}`;
}

function severity(...levels) {
  if (levels.includes("danger")) return "danger";
  if (levels.includes("caution")) return "caution";
  return "normal";
}

function thermalChannels(state) {
  const skinC = finiteNumber(state?.rapier_skin_temp_c);
  const recoveryC = finiteNumber(state?.rapier_recovery_temp_c);
  const effectiveC = finiteNumber(state?.rapier_thermal_effective_temp_c) ?? recoveryC;
  const stagnationC = skinC === null
    ? null
    : finiteNumber(state?.rapier_stagnation_temp_c);
  const capabilityC = finiteNumber(state?.rapier_thermal_capability_c)
    ?? finiteNumber(state?.rapier_cmc_capability_c);
  const marginC = finiteNumber(state?.rapier_thermal_margin_c)
    ?? (capabilityC !== null && stagnationC !== null
      ? capabilityC - (skinC ?? stagnationC)
      : finiteNumber(state?.rapier_cmc_margin_c));
  const zone = typeof state?.rapier_thermal_zone === "string"
    ? state.rapier_thermal_zone : "";
  return Object.freeze({
    skinC, recoveryC, effectiveC, stagnationC, capabilityC, marginC, zone,
  });
}

function homeReserve(state) {
  const currentFuelLb = finiteNumber(state?.fuel_lb);
  const arrivalFuelLb = finiteNumber(state?.fuel_on_arrival_estimate_lb);
  const fuelToHomeLb = finiteNumber(state?.fuel_to_home_estimate_lb);
  const reserveTargetLb = finiteNumber(state?.fuel_reserve_target_lb);
  const publishedMarginLb = finiteNumber(state?.fuel_reserve_margin_lb);
  const marginLb = publishedMarginLb
    ?? (arrivalFuelLb !== null && reserveTargetLb !== null
      ? arrivalFuelLb - reserveTargetLb
      : currentFuelLb !== null && fuelToHomeLb !== null && reserveTargetLb !== null
        ? currentFuelLb - fuelToHomeLb - reserveTargetLb
        : null);
  return Object.freeze({
    currentFuelLb,
    arrivalFuelLb,
    fuelToHomeLb,
    reserveTargetLb,
    marginLb,
  });
}

/**
 * Capture one immutable instrumentation sample. `sampleTimeS` must be simulation time, not wall
 * time: a browser animation clock would report false-low rates while the sortie is compressed.
 */
export function rapierHighMachSample(state = {}, sampleTimeS = undefined) {
  const atS = finiteNumber(sampleTimeS) ?? finiteNumber(state.simulation_time_s);
  const altitudeFt = finiteNumber(state.alt_ft);
  const trueAirspeedKts = finiteNumber(state.true_airspeed_kts);
  const altitudeM = altitudeFt === null ? null : altitudeFt * FEET_TO_METRES;
  const trueAirspeedMps = trueAirspeedKts === null
    ? null
    : trueAirspeedKts * KNOTS_TO_METRES_PER_SECOND;
  const specificEnergyM = altitudeM === null || trueAirspeedMps === null
    ? null
    : altitudeM + trueAirspeedMps * trueAirspeedMps / (2 * STANDARD_GRAVITY_MPS2);
  const thermal = thermalChannels(state);
  return Object.freeze({
    atS,
    phase: phaseFromState(state),
    mach: finiteNumber(state.mach),
    dynamicPressureKpa: finiteNumber(state.dynamic_pressure_kpa),
    altitudeM,
    trueAirspeedMps,
    specificEnergyM,
    skinC: thermal.skinC,
  });
}

export function createRapierHighMachHistory() {
  return Object.freeze({ anchor: null, rates: EMPTY_RATES });
}

function rate(current, previous, dtS) {
  return current === null || previous === null ? null : (current - previous) / dtS;
}

function ratesBetween(current, previous, dtS) {
  return Object.freeze({
    machPerS: rate(current.mach, previous.mach, dtS),
    dynamicPressureKpaPerS: rate(
      current.dynamicPressureKpa,
      previous.dynamicPressureKpa,
      dtS,
    ),
    specificEnergyMPerS: rate(current.specificEnergyM, previous.specificEnergyM, dtS),
    skinCPerS: rate(current.skinC, previous.skinC, dtS),
  });
}

function flightPresentation(state, sample, rates) {
  const qLimitKpa = firstFinite(
    state.rapier_dynamic_pressure_limit_kpa,
    state.dynamic_pressure_limit_kpa,
  );
  const qMarginKpa = sample.dynamicPressureKpa !== null && qLimitKpa !== null
    ? qLimitKpa - sample.dynamicPressureKpa
    : null;
  const qLevel = qMarginKpa !== null && qMarginKpa < 0
    ? "danger"
    : qMarginKpa !== null && qMarginKpa <= Math.max(2, qLimitKpa * 0.1)
      ? "caution"
      : "normal";

  const turbineLbf = finiteNumber(state.rapier_turbine_thrust_lbf);
  const ramLbf = finiteNumber(state.rapier_ramjet_thrust_lbf);
  const streamTotalLbf = turbineLbf === null && ramLbf === null
    ? null
    : Math.max(0, turbineLbf ?? 0) + Math.max(0, ramLbf ?? 0);
  const thrustLbf = firstFinite(state.engine_net_thrust_lbf, streamTotalLbf);
  const dragLbf = finiteNumber(state.rapier_drag_lbf);
  const excessThrustLbf = finiteNumber(state.rapier_excess_thrust_lbf)
    ?? (thrustLbf !== null && dragLbf !== null ? thrustLbf - dragLbf : null);

  const machTrend = trend(rates.machPerS, 0.002);
  const qTrend = trend(rates.dynamicPressureKpaPerS, 0.2);
  const energyTrend = trend(rates.specificEnergyMPerS, 1.0);
  const machText = sample.mach === null ? "" : `M${sample.mach.toFixed(2)}${machTrend.glyph}`;
  const qText = sample.dynamicPressureKpa === null
    ? ""
    : `Q${Math.round(sample.dynamicPressureKpa)}`
      + `${qLimitKpa === null ? "" : `/${Math.round(qLimitKpa)}`}${qTrend.glyph}`;
  const causalText = excessThrustLbf !== null
    ? `T−D ${compactSigned(excessThrustLbf, "LBF")}`
    : rates.specificEnergyMPerS !== null
      ? `E ${signed(Math.round(rates.specificEnergyMPerS))} M/S`
      : "";
  const text = [machText, qText, causalText].filter(Boolean).join(" · ");

  return Object.freeze({
    mach: sample.mach,
    machRatePerS: rates.machPerS,
    machTrend: machTrend.direction,
    dynamicPressureKpa: sample.dynamicPressureKpa,
    dynamicPressureRateKpaPerS: rates.dynamicPressureKpaPerS,
    dynamicPressureTrend: qTrend.direction,
    dynamicPressureLimitKpa: qLimitKpa,
    dynamicPressureMarginKpa: qMarginKpa,
    thrustLbf,
    dragLbf,
    excessThrustLbf,
    specificEnergyM: sample.specificEnergyM,
    specificEnergyRateMPerS: rates.specificEnergyMPerS,
    energyTrend: energyTrend.direction,
    level: qLevel,
    row: freezeRow("flight", text, qLevel),
  });
}

function propulsionPresentation(state, sample) {
  const turbineLbf = Math.max(0, finiteNumber(state.rapier_turbine_thrust_lbf) ?? 0);
  const ramLbf = Math.max(0, finiteNumber(state.rapier_ramjet_thrust_lbf) ?? 0);
  const totalLbf = turbineLbf + ramLbf;
  const ramShare = totalLbf > 0 ? ramLbf / totalLbf : 0;
  const turbineShare = totalLbf > 0 ? turbineLbf / totalLbf : 0;
  const ramLive = ramShare >= RAM_LIVE_SHARE;
  const inletRecovery = finiteNumber(state.rapier_inlet_recovery);
  const inletUnstart = state.rapier_inlet_unstart === true;
  const inletDistorted = state.rapier_inlet_distorted === true;
  const ramLightMach = finiteNumber(state.rapier_ram_light_mach);
  const fullRamMach = finiteNumber(state.rapier_full_ram_mach);
  const turbineGoneMach = finiteNumber(state.rapier_turbine_gone_mach);

  let mode = "off";
  if (inletUnstart) mode = "unstart";
  else if (sample.phase === RAPIER_HIGH_MACH_PHASE.DIP_RELIGHT && !ramLive) mode = "relight";
  else if (ramLive && turbineShare >= HANDOVER_TURBINE_SHARE) mode = "handover";
  else if (ramLive) mode = "ram";
  else if (sample.mach !== null && ramLightMach !== null && sample.mach >= ramLightMach) {
    mode = "locked";
  } else if (totalLbf > 0) mode = "turbine";

  let transitionName = "";
  let transitionTargetMach = null;
  if (mode === "turbine") {
    transitionName = "RAM";
    transitionTargetMach = ramLightMach;
  } else if (mode === "handover") {
    transitionName = "FULL";
    transitionTargetMach = fullRamMach;
  } else if (mode === "ram" && turbineShare >= RAM_LIVE_SHARE) {
    transitionName = "TURB OUT";
    transitionTargetMach = turbineGoneMach;
  }
  const transitionMarginMach = sample.mach !== null && transitionTargetMach !== null
    ? transitionTargetMach - sample.mach
    : null;
  const transitionText = transitionMarginMach === null
    ? ""
    : transitionMarginMach > 0.005
      ? `${transitionName} +M${transitionMarginMach.toFixed(2)}`
      : `${transitionName} READY`;

  const label = TBCC_LABEL[mode];
  const level = mode === "unstart" ? "danger"
    : mode === "locked" || inletDistorted ? "caution" : "normal";
  const detail = transitionText
    || (mode === "locked" ? "CLIMB FOR RAM"
      : mode === "relight" ? "BUILD Q"
        : mode === "ram" && inletRecovery !== null
          ? `INLET ${Math.round(clamp(inletRecovery, 0, 1) * 100)}%`
          : ramLive ? `RAM ${Math.round(ramShare * 100)}%` : "");
  const text = totalLbf > 0 || mode !== "off"
    ? [`TBCC ${label}`, detail].filter(Boolean).join(" · ")
    : "";

  return Object.freeze({
    mode,
    turbineLbf,
    ramLbf,
    turbineShare,
    ramShare,
    inletRecovery,
    inletDistorted,
    inletUnstart,
    transitionName,
    transitionTargetMach,
    transitionMarginMach,
    level,
    row: freezeRow("propulsion", text, level),
  });
}

function thermalPresentation(state, rates) {
  const thermal = thermalChannels(state);
  const staticC = finiteNumber(state.static_temperature_c);
  const directSoak = finiteNumber(state.rapier_thermal_soak_fraction);
  const equilibriumSpanC = thermal.effectiveC !== null && staticC !== null
    ? thermal.effectiveC - staticC
    : null;
  const derivedSoak = equilibriumSpanC !== null && equilibriumSpanC > 5
    && thermal.skinC !== null && staticC !== null
    ? (thermal.skinC - staticC) / equilibriumSpanC
    : null;
  const soakFraction = directSoak !== null
    ? clamp(directSoak, 0, 1)
    : derivedSoak === null ? null : clamp(derivedSoak, 0, 1);
  const heatTrend = trend(rates.skinCPerS, 0.05);
  const level = thermal.marginC !== null && thermal.marginC < 0
    ? "danger"
    : thermal.marginC !== null && thermal.marginC < 40
      ? "caution"
      : "normal";
  const temperatureName = thermal.skinC !== null ? "SKIN" : "T0";
  const temperatureC = thermal.skinC ?? thermal.stagnationC;
  const rateText = rates.skinCPerS === null ? ""
    : heatTrend.direction === "steady" ? "→"
      : `${heatTrend.glyph}${Math.abs(rates.skinCPerS).toFixed(
        Math.abs(rates.skinCPerS) < 10 ? 1 : 0,
      )}/S`;
  const marginText = level === "normal" || thermal.marginC === null
    ? ""
    : `MRG ${signed(Math.round(thermal.marginC))}°C`;
  const text = temperatureC === null
    ? ""
    : [
      `${temperatureName} ${Math.round(temperatureC)}°C${rateText}`,
      soakFraction === null ? "" : `SOAK ${Math.round(soakFraction * 100)}%`,
      marginText,
    ].filter(Boolean).join(" · ");

  return Object.freeze({
    ...thermal,
    staticC,
    skinRateCPerS: rates.skinCPerS,
    skinTrend: heatTrend.direction,
    soakFraction,
    level,
    row: freezeRow("thermal", text, level),
  });
}

function fuelPresentation(state) {
  const fuel = homeReserve(state);
  const cautionBandLb = fuel.reserveTargetLb === null
    ? 250
    : Math.max(250, fuel.reserveTargetLb * 0.25);
  const level = fuel.marginLb !== null && fuel.marginLb < 0
    ? "danger"
    : fuel.marginLb !== null && fuel.marginLb < cautionBandLb
      ? "caution"
      : "normal";
  const text = fuel.marginLb === null
    ? ""
    : `HOME RES ${compactSigned(fuel.marginLb, "LB")}`;
  return Object.freeze({
    ...fuel,
    level,
    row: freezeRow("fuel", text, level),
  });
}

function phaseCue(state, sample, propulsion) {
  const verticalSpeedFpm = finiteNumber(state.vertical_speed_fpm);
  if (sample.phase === RAPIER_HIGH_MACH_PHASE.ZOOM_PULL) {
    const requestedAlphaDeg = finiteNumber(state.requested_alpha_deg);
    const detail = requestedAlphaDeg === null
      ? "IDLE/PREDICT"
      : `α${Math.round(requestedAlphaDeg)}° · IDLE/PREDICT`;
    return Object.freeze({ key: "zoom", text: `ZOOM · ${detail}`, level: "normal" });
  }
  if (sample.phase === RAPIER_HIGH_MACH_PHASE.ZOOM_COAST) {
    if (verticalSpeedFpm === null) {
      return Object.freeze({ key: "apex", text: "APEX", level: "normal" });
    }
    if (Math.abs(verticalSpeedFpm) <= 1200) {
      return Object.freeze({ key: "apex", text: "APEX NOW", level: "caution" });
    }
    const stateText = verticalSpeedFpm > 0 ? "CLIMB" : "PASSED";
    return Object.freeze({
      key: "apex",
      text: `APEX · ${stateText} ${compactSigned(verticalSpeedFpm, "FPM")}`,
      level: verticalSpeedFpm > 0 ? "normal" : "caution",
    });
  }
  if (sample.phase === RAPIER_HIGH_MACH_PHASE.REENTER_ALIGN) {
    const errorDeg = finiteNumber(state.rapier_nose_on_v_err_deg);
    const onVelocity = errorDeg !== null && errorDeg <= 8;
    return Object.freeze({
      key: "reentry",
      text: onVelocity ? "REENTRY · ON V"
        : errorDeg === null ? "REENTRY · ALIGN V"
          : `REENTRY · ALIGN V ${Math.round(errorDeg)}°`,
      level: onVelocity ? "normal" : "caution",
    });
  }
  if (sample.phase === RAPIER_HIGH_MACH_PHASE.DIP_RELIGHT) {
    const relightQKpa = finiteNumber(state.rapier_relight_dynamic_pressure_kpa);
    if (propulsion.inletUnstart) {
      return Object.freeze({ key: "relight", text: "RELIGHT · UNSTART", level: "danger" });
    }
    if (propulsion.ramShare >= RAM_LIVE_SHARE) {
      return Object.freeze({ key: "relight", text: "RELIGHT · RAM LIT", level: "normal" });
    }
    if (sample.dynamicPressureKpa !== null && relightQKpa !== null) {
      return Object.freeze({
        key: "relight",
        text: sample.dynamicPressureKpa >= relightQKpa
          ? "RELIGHT · RAM WAIT"
          : `RELIGHT · Q${sample.dynamicPressureKpa.toFixed(1)}→${relightQKpa.toFixed(1)}`,
        level: "caution",
      });
    }
    return Object.freeze({ key: "relight", text: "RELIGHT · BUILD Q", level: "caution" });
  }
  return null;
}

function presentationFromSample(state, sample, rates) {
  const flight = flightPresentation(state, sample, rates);
  const propulsion = propulsionPresentation(state, sample);
  const thermal = thermalPresentation(state, rates);
  const fuel = fuelPresentation(state);
  const cue = phaseCue(state, sample, propulsion);
  const rows = Object.freeze([
    flight.row,
    propulsion.row,
    thermal.row,
    fuel.row,
  ].filter(Boolean));
  return Object.freeze({
    visible: true,
    phase: sample.phase,
    phaseLabel: PHASE_LABEL[sample.phase] ?? "",
    level: severity(
      cue?.level,
      flight.level,
      propulsion.level,
      thermal.level,
      fuel.level,
    ),
    cue,
    rows,
    flight,
    propulsion,
    thermal,
    fuel,
  });
}

/** Stateless form for renderers that already own trend estimates. */
export function rapierHighMachPresentation(state = {}, rates = EMPTY_RATES) {
  if (!eligible(state)) return null;
  const sample = rapierHighMachSample(state);
  const safeRates = Object.freeze({
    machPerS: finiteNumber(rates?.machPerS),
    dynamicPressureKpaPerS: finiteNumber(rates?.dynamicPressureKpaPerS),
    specificEnergyMPerS: finiteNumber(rates?.specificEnergyMPerS),
    skinCPerS: finiteNumber(rates?.skinCPerS),
  });
  return presentationFromSample(state, sample, safeRates);
}

/**
 * Pure history reducer. Feed the returned `history` into the next call; no timers, globals or DOM
 * state are retained. Trends update over a >=0.75 s simulation-time baseline to reject the
 * integer-degree quantisation of current skin snapshots.
 */
export function advanceRapierHighMachInstruments(
  previousHistory,
  state = {},
  sampleTimeS = undefined,
) {
  if (!eligible(state)) {
    return Object.freeze({ history: createRapierHighMachHistory(), presentation: null });
  }
  const previous = previousHistory?.anchor !== undefined
    ? previousHistory
    : createRapierHighMachHistory();
  const sample = rapierHighMachSample(state, sampleTimeS);
  let anchor = previous.anchor ?? null;
  let rates = previous.rates ?? EMPTY_RATES;

  if (anchor === null || sample.atS === null || anchor.atS === null) {
    anchor = sample;
    rates = EMPTY_RATES;
  } else {
    const dtS = sample.atS - anchor.atS;
    if (dtS <= 0 || dtS > TREND_WINDOW_MAX_S) {
      anchor = sample;
      rates = EMPTY_RATES;
    } else if (dtS >= TREND_WINDOW_MIN_S) {
      rates = ratesBetween(sample, anchor, dtS);
      anchor = sample;
    }
  }

  const history = Object.freeze({ anchor, rates });
  return Object.freeze({
    history,
    presentation: presentationFromSample(state, sample, rates),
  });
}
