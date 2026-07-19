const UNKNOWN = "--";

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function enumToken(value, accepted) {
  if (typeof value !== "string") return UNKNOWN;
  const token = value.trim().toUpperCase();
  return accepted.includes(token) ? token : UNKNOWN;
}

function gearIndication(value) {
  if (typeof value !== "string") return { text: UNKNOWN, state: "unknown" };
  const token = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (token === "DOWN_LOCKED" || token === "DOWN") return { text: "DOWN", state: "down" };
  if (token === "UP_LOCKED" || token === "UP") return { text: "UP", state: "up" };
  if (token.includes("STRIP") || token.includes("TRANSIT") || token.includes("UNSAFE")) {
    return { text: "STRIPE", state: "striped" };
  }
  return { text: UNKNOWN, state: "unknown" };
}

function roundedText(value, suffix = "") {
  return value === null ? UNKNOWN : `${Math.round(value)}${suffix}`;
}

/**
 * Projects only what the pilot can observe on the test-flight instrumentation. Deliberately do
 * not copy arbitrary properties from the simulation snapshot: scenario fault IDs, actuator
 * internals, and maintenance truth must never become free situational awareness.
 */
export function projectTestFlightState(state = {}) {
  const engineRpmPct = finiteNumber(state.engine_rpm_pct);
  const engineRunning = typeof state.engine_running === "boolean" ? state.engine_running : null;
  const primaryBusPowered = typeof state.primary_bus_powered === "boolean"
    ? state.primary_bus_powered
    : null;
  const utilityHydraulicPressurePsi = finiteNumber(state.utility_hydraulic_pressure_psi);
  const gearHandle = enumToken(state.gear_handle, ["UP", "DOWN"]);
  const flapLever = enumToken(state.flap_lever, ["UP", "HOLD", "DOWN"]);
  const flapLeftDeg = finiteNumber(state.flap_left_deg);
  const flapRightDeg = finiteNumber(state.flap_right_deg);
  const flapSplit = state.flap_split === true
    || (flapLeftDeg !== null && flapRightDeg !== null
      && Math.abs(flapLeftDeg - flapRightDeg) > 1);

  const warnings = [];
  if (engineRunning === false) warnings.push({ text: "ENGINE OUT", level: "warning" });
  if (primaryBusPowered === false) warnings.push({ text: "PRIMARY BUS OFF", level: "caution" });
  if (state.gear_warning_horn === true) warnings.push({ text: "GEAR HORN", level: "warning" });
  if (state.gear_limit_exceeded === true) warnings.push({ text: "GEAR OVERSPEED", level: "warning" });
  else if (state.gear_unsafe === true) warnings.push({ text: "GEAR UNSAFE", level: "caution" });
  if (state.flap_limit_exceeded === true) warnings.push({ text: "FLAP OVERSPEED", level: "warning" });
  if (flapSplit) warnings.push({ text: "FLAP SPLIT", level: "warning" });

  const maintenanceActive = state.maintenance_scenario === true;
  const maintenanceScore = finiteNumber(state.maintenance_score);
  const maintenanceMaximum = finiteNumber(state.maintenance_max_score);
  const maintenanceInstruction = maintenanceActive
    && typeof state.maintenance_instruction === "string"
    && state.maintenance_instruction.trim()
    ? state.maintenance_instruction.trim().toUpperCase()
    : "";

  return {
    engine: {
      rpmText: roundedText(engineRpmPct, "%"),
      runningText: engineRunning === true ? "RUNNING" : engineRunning === false ? "OUT" : UNKNOWN,
      state: engineRunning === false ? "warning" : engineRunning === true ? "nominal" : "unknown",
    },
    electrical: {
      primaryBusText: primaryBusPowered === true ? "ON" : primaryBusPowered === false ? "OFF" : UNKNOWN,
      state: primaryBusPowered === false ? "caution" : primaryBusPowered === true ? "nominal" : "unknown",
    },
    hydraulic: {
      pressureText: roundedText(utilityHydraulicPressurePsi, " PSI"),
      state: utilityHydraulicPressurePsi === null ? "unknown" : "nominal",
    },
    gear: {
      handleText: gearHandle,
      nose: gearIndication(state.gear_nose_indication),
      left: gearIndication(state.gear_left_indication),
      right: gearIndication(state.gear_right_indication),
    },
    flaps: {
      leverText: flapLever,
      leftText: roundedText(flapLeftDeg, "°"),
      rightText: roundedText(flapRightDeg, "°"),
      split: flapSplit,
      overspeed: state.flap_limit_exceeded === true,
    },
    warnings,
    warningText: warnings.length ? warnings.map((warning) => warning.text).join(" · ") : "INDICATIONS NORMAL",
    warningLevel: warnings.some((warning) => warning.level === "warning")
      ? "warning"
      : warnings.length ? "caution" : "nominal",
    maintenance: {
      active: maintenanceActive,
      instructionText: maintenanceActive ? maintenanceInstruction || "ASSESS INDICATIONS" : "NO ACTIVE PROCEDURE",
      scoreText: maintenanceActive && maintenanceScore !== null && maintenanceMaximum !== null
        ? `${Math.round(maintenanceScore)}/${Math.round(maintenanceMaximum)}`
        : UNKNOWN,
      complete: state.maintenance_procedure_complete === true,
      recovered: state.maintenance_recovered === true,
      state: maintenanceActive && typeof state.maintenance_state === "string"
        ? state.maintenance_state.trim().toUpperCase()
        : "INACTIVE",
    },
  };
}

function action(id, code, gkey, behavior) {
  return Object.freeze({ id, code, gkey, behavior });
}

/** Stable UI-to-GKey contract. Codes share the app's multi-owner input arbitration. */
export const TEST_FLIGHT_ACTIONS = Object.freeze({
  gearToggle: action("gearToggle", "KeyG", 13, "momentary"),
  flapUp: action("flapUp", "BracketLeft", 14, "hold"),
  flapDown: action("flapDown", "BracketRight", 15, "hold"),
  // Physical shortcuts allow a desktop pilot to hold the spring-loaded release while issuing a
  // second inspection action. A single mouse pointer cannot operate two panel buttons at once.
  emergencyGearRelease: action("emergencyGearRelease", "KeyE", 16, "hold"),
  gearHornCutout: action("gearHornCutout", "TestFlightGearHornCutout", 17, "momentary"),
  confirmGearFailure: action("confirmGearFailure", "KeyN", 18, "momentary"),
  inspectGearDownlocks: action("inspectGearDownlocks", "KeyI", 19, "momentary"),
});

/**
 * Pointer/keyboard-agnostic action ownership. Each owner can hold one action; duplicate starts are
 * idempotent, and cancelling an owner or the whole console always emits the matching release.
 */
export function createPilotActionController({ press, release, onChange = () => {} }) {
  if (typeof press !== "function" || typeof release !== "function") {
    throw new TypeError("press and release callbacks are required");
  }

  const activeOwners = new Map();

  function notify(actionId) {
    const owners = [...activeOwners.values()].filter((entry) => entry.actionId === actionId).length;
    onChange({ actionId, active: owners > 0, owners });
  }

  function releaseOwner(owner) {
    const entry = activeOwners.get(owner);
    if (!entry) return false;
    activeOwners.delete(owner);
    release(entry.action.code, owner, entry.action);
    notify(entry.actionId);
    return true;
  }

  function begin(actionId, owner) {
    const selected = TEST_FLIGHT_ACTIONS[actionId];
    if (!selected) throw new RangeError(`Unknown test-flight action: ${actionId}`);
    if (owner === null || owner === undefined || owner === "") {
      throw new TypeError("an action owner is required");
    }

    const current = activeOwners.get(owner);
    if (current?.actionId === actionId) return true;
    if (current) releaseOwner(owner);
    if (press(selected.code, owner, selected) === false) return false;
    activeOwners.set(owner, { actionId, action: selected });
    notify(actionId);
    return true;
  }

  function releaseAll() {
    for (const owner of [...activeOwners.keys()]) releaseOwner(owner);
  }

  return Object.freeze({
    begin,
    releaseOwner,
    releaseAll,
    isActive(actionId) {
      return [...activeOwners.values()].some((entry) => entry.actionId === actionId);
    },
    get activeOwnerCount() { return activeOwners.size; },
  });
}
