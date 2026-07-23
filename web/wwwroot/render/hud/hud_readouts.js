const DEFAULT_FUEL_CAPACITY_LB = 2826;
const DEFAULT_BINGO_FUEL_LB = 800;

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundedMinutes(value) {
  const minutes = finiteNumber(value);
  return minutes === null ? "--" : String(Math.max(0, Math.round(minutes)));
}

function decisionMinutes(prefix, value) {
  const minutes = roundedMinutes(value);
  return `${prefix} ${minutes} MIN`;
}

export function verticalSpeedText(value) {
  const measuredFpm = finiteNumber(value);
  if (measuredFpm === null) return "V/S --- FPM";
  const roundedFpm = Math.abs(measuredFpm) < 25
    ? 0
    : Math.sign(measuredFpm) * Math.round(Math.abs(measuredFpm) / 50) * 50;
  const magnitude = Math.abs(roundedFpm);
  const compactMagnitude = magnitude >= 100_000
    ? `${Math.round(magnitude / 1000)}K`
    : magnitude >= 10_000
      ? `${(magnitude / 1000).toFixed(1).replace(/\.0$/, "")}K`
      : String(magnitude);
  const sign = roundedFpm > 0 ? "+" : roundedFpm < 0 ? "-" : "";
  return `V/S ${sign}${compactMagnitude} FPM`;
}

export function airdataReadout(state = {}) {
  const calibratedKts = finiteNumber(state.calibrated_airspeed_kts);
  const measuredIndicatedKts = calibratedKts
    ?? finiteNumber(state.indicated_airspeed_kts)
    ?? finiteNumber(state.speed_kts);
  const indicatedKts = measuredIndicatedKts === null
    ? null : Math.max(0, measuredIndicatedKts);
  const speedUnit = calibratedKts === null ? "KIAS" : "KCAS";
  const trueKts = finiteNumber(state.true_airspeed_kts);
  const groundKts = finiteNumber(state.ground_speed_kts)
    ?? finiteNumber(state.groundspeed_kts);
  const cornerKts = finiteNumber(state.corner_speed_kcas)
    ?? finiteNumber(state.corner_speed_kias);
  const mach = finiteNumber(state.mach);
  const verticalSpeedFpm = finiteNumber(state.vertical_speed_fpm);

  return {
    indicatedKts,
    speedUnit,
    trueKts,
    groundKts,
    cornerKts,
    mach,
    verticalSpeedFpm,
    primaryText: indicatedKts === null ? "---" : String(Math.round(indicatedKts)),
    unitText: `A/S ${speedUnit}`,
    machText: mach === null ? null : `M ${Math.max(0, mach).toFixed(2).replace(/^0/, "")}`,
    groundText: `G/S ${groundKts === null ? "---" : Math.round(Math.max(0, groundKts))} KT`,
    verticalText: verticalSpeedText(verticalSpeedFpm),
  };
}

export function stallAwareness(state = {}) {
  const calibrated = finiteNumber(state.stall_speed_kcas) !== null;
  const base = finiteNumber(state.stall_speed_kcas)
    ?? finiteNumber(state.stall_speed_kias);
  const accelerated = calibrated
    ? finiteNumber(state.accelerated_stall_speed_kcas)
    : finiteNumber(state.accelerated_stall_speed_kias)
      ?? finiteNumber(state.load_adjusted_stall_speed_kias);
  if (base === null || base <= 0 || accelerated === null || accelerated <= 0) return null;

  const boundaryKts = Math.max(base, accelerated);
  return {
    baseKts: base,
    boundaryKts,
    // No arbitrary amber buffer: the rendered boundary is the current physical CLmax limit.
    amberTopKts: null,
    unit: calibrated ? "KCAS" : "KIAS",
  };
}

export function speedTapeMarkers(state = {}) {
  if (state.carrier === true && state.mode !== "FREE") return [];
  const cornerKcas = finiteNumber(state.corner_speed_kcas);
  const cornerKts = cornerKcas ?? finiteNumber(state.corner_speed_kias);
  if (cornerKts === null || cornerKts <= 0) return [];
  const marker = { value: cornerKts, label: "COR", unit: cornerKcas === null ? "KIAS" : "KCAS" };
  // Corner is a band, not a point: the kernel's >=95%-of-peak turn-rate CAS range. Band geometry
  // attaches only when both edges arrive finite, positive, and ordered, so a legacy or degenerate
  // snapshot degrades to the point caret instead of a misdrawn strip.
  const bandMinKts = finiteNumber(state.corner_band_min_kias);
  const bandMaxKts = finiteNumber(state.corner_band_max_kias);
  if (bandMinKts !== null && bandMaxKts !== null && bandMinKts > 0 && bandMaxKts > bandMinKts) {
    marker.bandMinValue = bandMinKts;
    marker.bandMaxValue = bandMaxKts;
  }
  return [marker];
}

export function targetClosureReadout(value) {
  const closureKts = finiteNumber(value);
  if (closureKts === null) {
    return {
      closureKts: null,
      trend: "unknown",
      compactText: "CLOSURE --",
      text: "CLOSURE -- KT",
    };
  }

  const roundedKts = Math.round(Math.abs(closureKts));
  if (roundedKts === 0) {
    return {
      closureKts,
      trend: "steady",
      compactText: "RANGE STEADY",
      text: "RANGE STEADY",
    };
  }

  // Positive closure means range is decreasing; negative closure means it is increasing. Spell
  // the decision out instead of making the pilot decode the former unexplained `C+42` notation.
  const trend = closureKts > 0 ? "closing" : "opening";
  const label = trend.toUpperCase();
  return {
    closureKts,
    trend,
    compactText: `${roundedKts}KT ${label}`,
    text: `${roundedKts} KT ${label}`,
  };
}

export function targetRangeReadout(value) {
  const metres = finiteNumber(value);
  if (metres === null || metres < 0) {
    return {
      rangeNm: null,
      compactText: "---",
      text: "---",
    };
  }

  const rangeNm = metres / 1852;
  const decimals = rangeNm < 1 ? 2 : rangeNm < 10 ? 1 : 0;
  const valueText = rangeNm.toFixed(decimals);
  return {
    rangeNm,
    compactText: `${valueText}NM`,
    text: `${valueText} NM`,
  };
}

// Weapon availability is an authoritative visual-merge safety state, not generic coaching copy.
// SAFE and an outstanding release interlock remain visible; HOT is supplied only for the bounded
// transition window owned by the simulation and then this returns null so the HUD gets its space
// back. Terminal/debrief presentation never inherits a stale in-flight call.
export function visualMergeWeaponsCue(state = {}) {
  if (state.visual_merge_evaluation !== true
      || state.terminal_phase_active === true || state.finished === true) return null;
  if (state.weapons_inhibited === true) {
    return { text: "GUNS SAFE · FIRST PASS", level: "caution" };
  }
  if (state.player_trigger_interlocked === true) {
    return { text: "RELEASE TRIGGER TO ARM", level: "warning" };
  }
  if (state.weapons_hot_cue === true) {
    return { text: "GUNS HOT", level: "normal" };
  }
  return null;
}

export function fuelReadout(state = {}) {
  const measuredFuelLb = finiteNumber(state.fuel_lb);
  const fuelLb = measuredFuelLb === null ? null : Math.max(0, measuredFuelLb);
  const capacityLb = Math.max(0,
    finiteNumber(state.fuel_capacity_lb) ?? DEFAULT_FUEL_CAPACITY_LB);
  const bingoThresholdLb = Math.max(0,
    finiteNumber(state.fuel_bingo_lb) ?? DEFAULT_BINGO_FUEL_LB);
  const jokerThresholdLb = finiteNumber(state.fuel_joker_lb);
  const minimumFuelThresholdLb = finiteNumber(state.fuel_minimum_lb);
  const emergencyFuelThresholdLb = finiteNumber(state.fuel_emergency_lb);
  const consumesFuel = state.fuel_consumes !== false;
  const bingo = consumesFuel
    && (state.fuel_bingo === true
      || (fuelLb !== null && fuelLb <= bingoThresholdLb));
  const joker = consumesFuel && (state.fuel_joker === true
    || (fuelLb !== null && jokerThresholdLb !== null && fuelLb <= jokerThresholdLb));
  const minimumFuel = consumesFuel && (state.fuel_minimum === true
    || (fuelLb !== null && minimumFuelThresholdLb !== null
      && fuelLb <= minimumFuelThresholdLb));
  const emergencyFuel = consumesFuel && (state.fuel_emergency === true
    || (fuelLb !== null && emergencyFuelThresholdLb !== null
      && fuelLb <= emergencyFuelThresholdLb));
  // USAF airborne-display convention is mass flow per hour. Older snapshots carried a per-minute
  // engineering rate, so convert it at this presentation boundary rather than changing physics.
  const directFlowPph = finiteNumber(state.fuel_flow_pph);
  const legacyFlowLbPerMinute = finiteNumber(state.fuel_flow_lb_min)
    ?? finiteNumber(state.fuel_burn_lb_min);
  const measuredFlowPph = directFlowPph
    ?? (legacyFlowLbPerMinute === null ? null : legacyFlowLbPerMinute * 60);
  const flowPoundsPerHour = measuredFlowPph === null
    ? null : Math.max(0, measuredFlowPph);
  const flowText = consumesFuel
    ? `FF ${flowPoundsPerHour === null ? "---" : Math.round(flowPoundsPerHour)} PPH`
    : "UNPOWERED";
  const decisionText = consumesFuel
    ? bingo
      ? decisionMinutes("END", state.fuel_endurance_minutes)
      : jokerThresholdLb !== null && !joker
        ? decisionMinutes("JOKER", state.fuel_minutes_to_joker)
        : decisionMinutes("BINGO", state.fuel_minutes_to_bingo)
    : "END -- MIN";
  const statusText = emergencyFuel ? "EMER FUEL"
    : minimumFuel ? "MIN FUEL"
      : bingo ? "BINGO"
        : joker ? "JOKER" : null;
  const decisionDisplayText = statusText
    ? `${statusText} · ${decisionText}` : decisionText;
  const explicitCriticalThreshold = minimumFuelThresholdLb !== null
    || emergencyFuelThresholdLb !== null;
  const legacyCritical = !explicitCriticalThreshold && fuelLb !== null
    && fuelLb <= bingoThresholdLb * 0.5;
  const quantityText = `F ${fuelLb === null ? "---" : Math.round(fuelLb)} LB`;

  return {
    fuelLb,
    capacityLb,
    bingoThresholdLb,
    jokerThresholdLb,
    minimumFuelThresholdLb,
    emergencyFuelThresholdLb,
    consumesFuel,
    joker,
    bingo,
    minimumFuel,
    emergencyFuel,
    critical: consumesFuel && (emergencyFuel || legacyCritical),
    statusText,
    flowPoundsPerHour,
    flowText,
    flowUnitText: consumesFuel ? "PPH" : "",
    quantityText,
    decisionText,
    decisionDisplayText,
    padlockText: consumesFuel
      ? `${fuelLb === null ? "---" : Math.round(fuelLb)} LB · ${flowText} · ${decisionDisplayText}`
      : `${fuelLb === null ? "---" : Math.round(fuelLb)} LB · UNPOWERED`,
  };
}

function normalizedEnum(value, accepted, fallback) {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim().toUpperCase();
  return accepted.includes(candidate) ? candidate : fallback;
}

function gearLeg(positionValue, indicationValue, primaryBusPowered) {
  const position = finiteNumber(positionValue);
  const indication = typeof indicationValue === "string"
    ? indicationValue.trim().toUpperCase()
    : "";
  if (indication.includes("DOWN") || indication === "DN" || indication.includes("LOCKED DOWN")) {
    return { text: "DN", state: "down", position };
  }
  if (indication.includes("UP") && !indication.includes("UNSAFE")) {
    return { text: "UP", state: "up", position };
  }
  // The F-86 indicator is electrically powered: with the primary bus off, STRIPED says only that
  // the cockpit indication is unavailable. Keep the separately projected physical position for
  // analysis, but do not turn loss of indication power into a fictitious transit/unsafe state.
  if (primaryBusPowered === false && indication.includes("STRIP")) {
    return { text: "STRIPE", state: "unknown", position };
  }
  if (indication.includes("TRANSIT") || indication.includes("UNSAFE") || indication.includes("STRIP")) {
    return { text: "TR", state: "transit", position };
  }
  if (position === null) return { text: "--", state: "unknown", position: null };
  if (position >= 0.98) return { text: "DN", state: "down", position };
  if (position <= 0.02) return { text: "UP", state: "up", position };
  return { text: "TR", state: "transit", position };
}

export function systemsReadout(state = {}) {
  const hasEngine = state.has_engine !== false && state.fuel_consumes !== false;
  const hasElectricalSystem = state.has_electrical_system !== false;
  const hasUtilityHydraulics = state.has_utility_hydraulics !== false;
  const hasRetractableGear = state.has_retractable_gear !== false;
  const hasFlaps = state.has_flaps !== false;
  const primaryBusPowered = typeof state.primary_bus_powered === "boolean"
    ? state.primary_bus_powered
    : null;
  const gearHandle = normalizedEnum(state.gear_handle, ["UP", "DOWN"], "--");
  const gear = {
    nose: gearLeg(state.gear_nose, state.gear_nose_indication, primaryBusPowered),
    left: gearLeg(state.gear_left, state.gear_left_indication, primaryBusPowered),
    right: gearLeg(state.gear_right, state.gear_right_indication, primaryBusPowered),
  };
  const gearAvailable = hasRetractableGear && (gearHandle !== "--"
    || Object.values(gear).some((leg) => leg.state !== "unknown")
    || typeof state.gear_unsafe === "boolean"
    || typeof state.gear_warning_horn === "boolean"
    || typeof state.gear_limit_exceeded === "boolean");
  const gearUnsafe = state.gear_unsafe === true
    || Object.values(gear).some((leg) => leg.state === "transit");

  const flapLever = normalizedEnum(state.flap_lever, ["UP", "HOLD", "DOWN"], "--");
  const flapLeftDeg = finiteNumber(state.flap_left_deg);
  const flapRightDeg = finiteNumber(state.flap_right_deg);
  const flapAvailable = hasFlaps && (flapLever !== "--" || flapLeftDeg !== null
    || flapRightDeg !== null || typeof state.flap_split === "boolean"
    || typeof state.flap_limit_exceeded === "boolean");
  const flapSplit = state.flap_split === true
    || (flapLeftDeg !== null && flapRightDeg !== null && Math.abs(flapLeftDeg - flapRightDeg) > 2);
  const flapPositionText = flapLeftDeg === null && flapRightDeg === null
    ? "--"
    : flapLeftDeg !== null && flapRightDeg !== null
      ? `${Math.round(flapLeftDeg)}°/${Math.round(flapRightDeg)}°`
      : `${Math.round(flapLeftDeg ?? flapRightDeg)}°`;
  const mode = normalizedEnum(state.mode,
    ["FREE", "APPROACH", "WAVE-OFF", "BOLTER", "CATAPULT", "ARRESTED", "STOPPED", "TERMINAL"],
    "--");
  const configurationTarget = normalizedEnum(state.configuration_target,
    ["COMBAT", "RECOVERY"], "--");
  const configurationAutomatic = state.configuration_automatic === true;
  const configurationTransition = state.configuration_transition === true;
  const automaticGear = configurationAutomatic && state.configuration_gear_auto !== false;
  const automaticFlaps = configurationAutomatic && state.configuration_flap_auto !== false;
  // Cleanup is a phase-specific decision, not a generic objection to landing configuration.
  // Discrete handle/indication states avoid relevance flicker while the physical legs travel.
  const cleanupMode = configurationTarget === "COMBAT"
    || (configurationTarget === "--"
      && (mode === "FREE" || mode === "WAVE-OFF" || mode === "BOLTER"));
  const gearNeedsCleanup = hasRetractableGear && (gearHandle === "DOWN"
    || Object.values(gear).some((leg) => leg.state === "down" || leg.state === "transit"));
  // Flap angles are authoritative actuator positions rounded by the bridge, not noisy graphics
  // estimates. The quarter-degree deadband is the systems model's existing deployed threshold.
  const flapNeedsCleanup = hasFlaps && (flapLever === "DOWN"
    || Math.max(flapLeftDeg ?? 0, flapRightDeg ?? 0) > 0.25);
  const manualConfigurationOutstanding = configurationAutomatic
    && ((gearNeedsCleanup && !automaticGear) || (flapNeedsCleanup && !automaticFlaps));
  const configurationActionable = cleanupMode && (gearNeedsCleanup || flapNeedsCleanup)
    && (!configurationAutomatic || manualConfigurationOutstanding);

  const utilityHydraulicPressurePsi = finiteNumber(state.utility_hydraulic_pressure_psi);
  const utilityHydraulicNominalPsi = finiteNumber(state.utility_hydraulic_nominal_psi);
  const hydraulicFraction = utilityHydraulicPressurePsi !== null
    && utilityHydraulicNominalPsi !== null
    && utilityHydraulicNominalPsi > 0
    ? utilityHydraulicPressurePsi / utilityHydraulicNominalPsi
    : null;
  const engineRpmPct = finiteNumber(state.engine_rpm_pct);
  const engineRunning = typeof state.engine_running === "boolean" ? state.engine_running : null;
  const engineAvailable = hasEngine && (engineRpmPct !== null || engineRunning !== null);
  const electricalAvailable = hasElectricalSystem && primaryBusPowered !== null;
  const hydraulicAvailable = hasUtilityHydraulics && utilityHydraulicPressurePsi !== null;

  const warnings = [];
  if (engineAvailable && engineRunning === false) {
    warnings.push({ text: "ENGINE FLAMEOUT", level: "warning" });
  }
  if (gearAvailable && state.gear_warning_horn === true) {
    warnings.push({ text: "GEAR WARNING", level: "warning" });
  }
  if (gearAvailable && state.gear_limit_exceeded === true) {
    warnings.push({ text: "GEAR OVERSPEED", level: "warning" });
  } else if (gearAvailable && gearUnsafe
      && !(configurationTransition && automaticGear)) {
    warnings.push({ text: "GEAR UNSAFE", level: "caution" });
  }
  if (flapAvailable && state.flap_limit_exceeded === true) {
    warnings.push({ text: "FLAP OVERSPEED", level: "warning" });
  }
  if (flapAvailable && flapSplit) warnings.push({ text: "FLAP SPLIT", level: "warning" });
  if (electricalAvailable && primaryBusPowered === false) {
    warnings.push({ text: "PRIMARY BUS", level: "caution" });
  }
  if (hydraulicAvailable && hydraulicFraction !== null && hydraulicFraction <= 0.10) {
    warnings.push({ text: "UTILITY HYD LOW", level: "warning" });
  } else if (hydraulicAvailable && hydraulicFraction !== null && hydraulicFraction < 0.90) {
    warnings.push({ text: "UTILITY HYD DEGRADED", level: "caution" });
  }
  if (configurationActionable && gearNeedsCleanup
      && !warnings.some((warning) => warning.text.startsWith("GEAR "))) {
    warnings.push({ text: "CLEAN UP GEAR", level: "caution" });
  }
  if (configurationActionable && flapNeedsCleanup
      && !warnings.some((warning) => warning.text.startsWith("FLAP "))) {
    warnings.push({ text: "CLEAN UP FLAPS", level: "caution" });
  }

  const transitionActive = (gearAvailable && gearUnsafe)
    || (flapAvailable && flapLever !== "--" && flapLever !== "HOLD");
  // The landing scan remains present in the groove. After a wave-off/bolter it earns its space
  // only until the configuration is clean or while a real transition/failure remains.
  const recoveryRelevant = state.carrier === true
    && (configurationTarget === "RECOVERY" || mode === "APPROACH");
  const relevant = state.maintenance_scenario === true || warnings.length > 0
    || transitionActive || configurationTransition || recoveryRelevant
    || configurationActionable;

  return {
    available: gearAvailable || flapAvailable || engineAvailable || electricalAvailable || hydraulicAvailable,
    relevant,
    gearAvailable,
    gearHandle,
    gear,
    gearUnsafe,
    gearWarningHorn: state.gear_warning_horn === true,
    gearLimitExceeded: state.gear_limit_exceeded === true,
    flapAvailable,
    flapLever,
    flapLeftDeg,
    flapRightDeg,
    flapPositionText,
    flapSplit,
    flapLimitExceeded: state.flap_limit_exceeded === true,
    configurationActionable,
    configurationTarget,
    configurationAutomatic,
    configurationTransition,
    automaticGear,
    automaticFlaps,
    gearNeedsCleanup,
    flapNeedsCleanup,
    primaryBusPowered,
    utilityHydraulicPressurePsi,
    utilityHydraulicNominalPsi,
    engineAvailable,
    engineRpmPct,
    engineRunning,
    warnings,
  };
}
