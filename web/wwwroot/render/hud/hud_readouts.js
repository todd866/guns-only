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
  return `${prefix} ${minutes === "--" ? "--" : `${minutes}M`}`;
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
  const indicatedKts = Math.max(0,
    finiteNumber(state.indicated_airspeed_kts)
      ?? finiteNumber(state.speed_kts)
      ?? 0);
  const trueKts = finiteNumber(state.true_airspeed_kts);
  const groundKts = finiteNumber(state.ground_speed_kts)
    ?? finiteNumber(state.groundspeed_kts);
  const cornerKias = finiteNumber(state.corner_speed_kias);
  const verticalSpeedFpm = finiteNumber(state.vertical_speed_fpm);

  return {
    indicatedKts,
    trueKts,
    groundKts,
    cornerKias,
    verticalSpeedFpm,
    primaryText: String(Math.round(indicatedKts)),
    unitText: "A/S KIAS",
    groundText: `G/S ${groundKts === null ? "---" : Math.round(Math.max(0, groundKts))}`,
    verticalText: verticalSpeedText(verticalSpeedFpm),
  };
}

export function stallAwareness(state = {}) {
  const base = finiteNumber(state.stall_speed_kias);
  const accelerated = finiteNumber(state.accelerated_stall_speed_kias)
    ?? finiteNumber(state.load_adjusted_stall_speed_kias);
  if (base === null || base <= 0 || accelerated === null || accelerated <= 0) return null;

  const boundaryKias = Math.max(base, accelerated);
  return {
    baseKias: base,
    boundaryKias,
    // No arbitrary amber buffer: the rendered boundary is the current physical CLmax limit.
    amberTopKias: null,
    unit: "KIAS",
  };
}

export function speedTapeMarkers(state = {}) {
  if (state.carrier === true && state.mode !== "FREE") return [];
  const cornerKias = finiteNumber(state.corner_speed_kias);
  if (cornerKias === null || cornerKias <= 0) return [];
  return [{ value: cornerKias, label: "COR", unit: "KIAS" }];
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
  const fuelLb = Math.max(0, finiteNumber(state.fuel_lb) ?? 0);
  const capacityLb = Math.max(0,
    finiteNumber(state.fuel_capacity_lb) ?? DEFAULT_FUEL_CAPACITY_LB);
  const bingoThresholdLb = Math.max(0,
    finiteNumber(state.fuel_bingo_lb) ?? DEFAULT_BINGO_FUEL_LB);
  const consumesFuel = state.fuel_consumes !== false;
  const bingo = consumesFuel
    && (state.fuel_bingo === true || fuelLb <= bingoThresholdLb);
  // The cockpit contract is pounds per minute throughout. `fuel_burn_lb_min` remains a temporary
  // bridge fallback while older recordings are still useful, but an hourly-rate value is never
  // accepted or synthesized here.
  const flowLbPerMinute = Math.max(0,
    finiteNumber(state.fuel_flow_lb_min)
      ?? finiteNumber(state.fuel_burn_lb_min)
      ?? 0);
  const flowText = consumesFuel ? `FF ${Math.round(flowLbPerMinute)}` : "UNPOWERED";
  const decisionText = consumesFuel
    ? decisionMinutes(bingo ? "END" : "BGO", bingo
      ? state.fuel_endurance_minutes
      : state.fuel_minutes_to_bingo)
    : "END --";

  return {
    fuelLb,
    capacityLb,
    bingoThresholdLb,
    consumesFuel,
    bingo,
    critical: consumesFuel && fuelLb <= bingoThresholdLb * 0.5,
    flowLbPerMinute,
    flowText,
    flowUnitText: consumesFuel ? "LB/MIN" : "",
    decisionText,
    padlockText: consumesFuel
      ? `${Math.round(fuelLb)}LB · ${flowText} LB/MIN · ${decisionText}`
      : `${Math.round(fuelLb)}LB · UNPOWERED`,
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
