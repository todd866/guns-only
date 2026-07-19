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

export function airdataReadout(state = {}) {
  const indicatedKts = Math.max(0,
    finiteNumber(state.indicated_airspeed_kts)
      ?? finiteNumber(state.speed_kts)
      ?? 0);
  const trueKts = finiteNumber(state.true_airspeed_kts);
  const groundKts = finiteNumber(state.ground_speed_kts)
    ?? finiteNumber(state.groundspeed_kts);
  const cornerKias = finiteNumber(state.corner_speed_kias);

  return {
    indicatedKts,
    trueKts,
    groundKts,
    cornerKias,
    primaryText: String(Math.round(indicatedKts)),
    unitText: "A/S KIAS",
    groundText: `G/S ${groundKts === null ? "---" : Math.round(Math.max(0, groundKts))}`,
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
    // A compact maneuver-awareness margin, always expressed on the same KIAS tape.
    amberTopKias: boundaryKias * 1.15,
    unit: "KIAS",
  };
}

export function speedTapeMarkers(state = {}) {
  const cornerKias = finiteNumber(state.corner_speed_kias);
  if (cornerKias === null || cornerKias <= 0) return [];
  return [{ value: cornerKias, label: "COR", unit: "KIAS" }];
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
  const primaryBusPowered = typeof state.primary_bus_powered === "boolean"
    ? state.primary_bus_powered
    : null;
  const gearHandle = normalizedEnum(state.gear_handle, ["UP", "DOWN"], "--");
  const gear = {
    nose: gearLeg(state.gear_nose, state.gear_nose_indication, primaryBusPowered),
    left: gearLeg(state.gear_left, state.gear_left_indication, primaryBusPowered),
    right: gearLeg(state.gear_right, state.gear_right_indication, primaryBusPowered),
  };
  const gearAvailable = gearHandle !== "--"
    || Object.values(gear).some((leg) => leg.state !== "unknown")
    || typeof state.gear_unsafe === "boolean"
    || typeof state.gear_warning_horn === "boolean"
    || typeof state.gear_limit_exceeded === "boolean";
  const gearUnsafe = state.gear_unsafe === true
    || Object.values(gear).some((leg) => leg.state === "transit");

  const flapLever = normalizedEnum(state.flap_lever, ["UP", "HOLD", "DOWN"], "--");
  const flapLeftDeg = finiteNumber(state.flap_left_deg);
  const flapRightDeg = finiteNumber(state.flap_right_deg);
  const flapAvailable = flapLever !== "--" || flapLeftDeg !== null || flapRightDeg !== null
    || typeof state.flap_split === "boolean" || typeof state.flap_limit_exceeded === "boolean";
  const flapSplit = state.flap_split === true
    || (flapLeftDeg !== null && flapRightDeg !== null && Math.abs(flapLeftDeg - flapRightDeg) > 2);
  const flapPositionText = flapLeftDeg === null && flapRightDeg === null
    ? "--"
    : flapLeftDeg !== null && flapRightDeg !== null
      ? `${Math.round(flapLeftDeg)}°/${Math.round(flapRightDeg)}°`
      : `${Math.round(flapLeftDeg ?? flapRightDeg)}°`;

  const utilityHydraulicPressurePsi = finiteNumber(state.utility_hydraulic_pressure_psi);
  const engineRpmPct = finiteNumber(state.engine_rpm_pct);
  const engineRunning = typeof state.engine_running === "boolean" ? state.engine_running : null;
  const engineAvailable = engineRpmPct !== null || engineRunning !== null;
  const electricalAvailable = primaryBusPowered !== null;
  const hydraulicAvailable = utilityHydraulicPressurePsi !== null;

  const warnings = [];
  if (engineRunning === false) warnings.push({ text: "ENGINE FLAMEOUT", level: "warning" });
  if (state.gear_warning_horn === true) warnings.push({ text: "GEAR WARNING", level: "warning" });
  if (state.gear_limit_exceeded === true) warnings.push({ text: "GEAR OVERSPEED", level: "warning" });
  else if (gearUnsafe) warnings.push({ text: "GEAR UNSAFE", level: "caution" });
  if (state.flap_limit_exceeded === true) warnings.push({ text: "FLAP OVERSPEED", level: "warning" });
  if (flapSplit) warnings.push({ text: "FLAP SPLIT", level: "warning" });
  if (primaryBusPowered === false) warnings.push({ text: "PRIMARY BUS", level: "caution" });

  return {
    available: gearAvailable || flapAvailable || engineAvailable || electricalAvailable || hydraulicAvailable,
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
    primaryBusPowered,
    utilityHydraulicPressurePsi,
    engineAvailable,
    engineRpmPct,
    engineRunning,
    warnings,
  };
}
