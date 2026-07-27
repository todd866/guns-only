const PHASE = Object.freeze({
  1: "LAUNCH",
  2: "CLIMB · FL560",
  3: "LEVEL ACCEL · M2.20",
  4: "RAM CLIMB · FL700",
  5: "INTERCEPT · FL700",
  6: "ATTACK",
  7: "EGRESS · HOME",
  8: "RETURN · HOME",
  9: "RECOVERY",
  10: "COMPLETE",
});

const CIRCUITS_PHASE = Object.freeze({
  1: "CIRCUITS · DEPART",
  2: "CIRCUITS · DEPART",
  9: "CIRCUITS",
  10: "COMPLETE",
});

const CIRCUIT_LEG_LABEL = Object.freeze({
  DEPART: "DEPART",
  DOWNWIND: "DOWNWIND",
  BASE: "BASE",
  SHORT_FINAL: "SHORT FINAL",
  WIRE_FINAL: "WIRE FINAL",
  COMPLETE: "COMPLETE",
});

const CIRCUIT_LEG_FROM_CODE = Object.freeze({
  1: "DEPART",
  2: "DOWNWIND",
  3: "BASE",
  4: "SHORT_FINAL",
  5: "WIRE_FINAL",
  6: "COMPLETE",
});

// Honest combined-cycle band (matches TurboRamjetPerformanceMap teaching schedule).
const RAM_LIGHT_MACH = 2.0;
const FULL_RAM_MACH = 2.8;
const TURBINE_GONE_MACH = 3.0;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function circuitLegFromState(state) {
  if (typeof state?.rapier_circuit_leg === "string" && state.rapier_circuit_leg) {
    return state.rapier_circuit_leg;
  }
  const code = Math.floor(Number(state?.rapier_circuit_leg_code) || 0);
  return CIRCUIT_LEG_FROM_CODE[code] ?? "";
}

export function circuitLegLabel(leg) {
  return CIRCUIT_LEG_LABEL[leg] ?? (leg ? String(leg).replaceAll("_", " ") : "");
}

function skinFragment(state) {
  const skinC = finiteNumber(state.rapier_stagnation_temp_c);
  const marginC = finiteNumber(state.rapier_thermal_margin_c);
  if (skinC === null) return null;
  if (marginC !== null && marginC < 0) {
    return Object.freeze({
      text: `SKIN OVER ${Math.round(skinC)}°C`,
      level: "attack",
    });
  }
  if (marginC !== null && marginC < 40) {
    return Object.freeze({
      text: `SKIN ${Math.round(skinC)}°C · ${Math.round(marginC)}°C LEFT`,
      level: "caution",
    });
  }
  const marginText = marginC !== null ? ` · +${Math.round(marginC)}°C` : "";
  return Object.freeze({
    text: `SKIN ${Math.round(skinC)}°C${marginText}`,
    level: "normal",
  });
}

/// Quiet mode line under the heading tape. Spec:
/// docs/superpowers/specs/2026-07-27-hud-limits-panel-design.md
/// Skin temperature is always on this line for Rapier — the teaching limit that binds the dash.
export function rapierGuidancePresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  const phase = Math.floor(Number(state.rapier_mission_phase) || 0);
  const patternOnly = state.rapier_pattern_only === true
    || (typeof state.rapier_mission_cue === "string"
      && state.rapier_mission_cue.startsWith("CIRCUITS"));
  const leg = circuitLegFromState(state);
  const legLabel = circuitLegLabel(leg);
  let phaseText = patternOnly
    ? (legLabel ? `CIRCUITS · ${legLabel}` : (CIRCUITS_PHASE[phase] ?? "CIRCUITS"))
    : (PHASE[phase] ?? "MISSION");
  const enabled = state.rapier_automation_enabled === true;
  const active = state.rapier_automation_active === true;
  const drones = Math.max(0,
    Math.floor(Number(state.rapier_gun_drones_remaining) || 0));
  const gate = Math.max(0, Math.floor(Number(state.rapier_recovery_gate) || 0));
  if (!patternOnly && phase === 9) {
    phaseText = `RECOVERY · GATE ${gate}/4`;
  } else if (!patternOnly && gate > 0 && phase >= 1 && phase <= 5) {
    phaseText = `${phaseText} · GATE ${gate}/4`;
  }

  const weapon = phase === 6 && !patternOnly
    ? ` · F RELEASES SWARM · ${drones}`
    : "";
  let patternAction = "";
  if (patternOnly) {
    if (leg === "SHORT_FINAL") patternAction = " · GO AROUND BEFORE GEAR";
    else if (leg === "WIRE_FINAL") patternAction = " · ACCEPT WIRE · HOOK DOWN";
    else if (leg === "BASE" || leg === "DOWNWIND") patternAction = " · HOOK DOWN";
    else if (leg === "DEPART") patternAction = " · TO PATTERN";
  }
  const authority = active ? "AUTO" : enabled ? "AUTO STBY" : "PILOT";
  const skin = skinFragment(state);
  const commanded = finiteNumber(state.rapier_commanded_mach);
  const authored = finiteNumber(state.rapier_authored_target_mach);
  const skinLimit = finiteNumber(state.rapier_skin_mach_limit);
  const machClampNote = !patternOnly
    && commanded !== null && authored !== null && skinLimit !== null
    && authored - commanded > 0.05
    ? ` · CMD M${commanded.toFixed(1)}`
    : "";

  let text;
  let level;
  if (skin?.level === "attack") {
    text = `${authority} · ${skin.text} · P TOGGLE AUTO`;
    level = "attack";
  } else {
    text = skin
      ? `${authority} · ${phaseText}${patternAction}${weapon}${machClampNote} · ${skin.text} · P TOGGLE AUTO`
      : `${authority} · ${phaseText}${patternAction}${weapon}${machClampNote} · P TOGGLE AUTO`;
    level = skin?.level === "caution"
      ? "active"
      : patternOnly ? (active ? "active" : "manual")
        : phase === 6 || phase === 7 ? "attack" : active ? "active" : "manual";
  }

  return Object.freeze({
    text,
    detail: "",
    level,
    circuitLeg: leg,
    boxLabel: patternOnly
      ? (legLabel || "")
      : (phase === 9 && gate > 0 ? `GATE ${gate}/4` : ""),
    skinC: finiteNumber(state.rapier_stagnation_temp_c),
    marginC: finiteNumber(state.rapier_thermal_margin_c),
  });
}

/// Circuits / recovery flight-director bugs from kernel-published targets.
export function rapierFlightDirectorPresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  const targetKtas = finiteNumber(state.rapier_fd_target_ktas) ?? 0;
  const targetAltFt = finiteNumber(state.rapier_target_altitude_ft) ?? 0;
  if (targetKtas <= 0 && targetAltFt <= 0) return null;
  const fdBankDeg = finiteNumber(state.rapier_fd_bank_deg) ?? 0;
  const bankDeg = finiteNumber(state.bank_deg) ?? 0;
  const altFt = finiteNumber(state.alt_ft)
    ?? finiteNumber(state.altitude_ft)
    ?? 0;
  const currentKtas = finiteNumber(state.true_airspeed_kts) ?? 0;
  let speedCall = "";
  if (targetKtas > 0) {
    speedCall = currentKtas > targetKtas + 25.0 ? "SLOW"
      : currentKtas < targetKtas - 25.0 ? "ADD POWER" : "ON SPEED";
  }
  return Object.freeze({
    bankErrorDeg: fdBankDeg - bankDeg,
    altErrorFt: targetAltFt - altFt,
    speedCall,
    targetKtas,
    boxLabel: circuitLegLabel(circuitLegFromState(state)),
  });
}

function cycleMode(mach) {
  if (mach < RAM_LIGHT_MACH) return "TURBINE";
  if (mach < FULL_RAM_MACH) return "HANDOVER";
  if (mach < TURBINE_GONE_MACH) return "FULL RAM";
  return "RAM ONLY";
}

function cycleExplainer(mode) {
  switch (mode) {
    case "TURBINE":
      return "Turbojet + AB make thrust now. Ram needs ~M2 before it lights.";
    case "HANDOVER":
      return "Handover band: turbine fading, ram lighting. Expect a thrust bucket.";
    case "FULL RAM":
      return "Ram owns the dash. Turbine is shutting down as inlet air gets too hot.";
    case "RAM ONLY":
      return "Ram only — turbine is out. Skin heat is the binding limit now.";
    default:
      return "Turbine low, ram high. They hand over around Mach 2.";
  }
}

/// Always-on teaching presentation for the combined-cycle motor + skin limit.
export function rapierCycleTeachPresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  const mach = Math.max(0, finiteNumber(state.mach) ?? 0);
  const turbineKn = Math.max(0, finiteNumber(state.rapier_turbine_thrust_kn) ?? 0);
  const ramKn = Math.max(0, finiteNumber(state.rapier_ramjet_thrust_kn) ?? 0);
  const totalKn = Math.max(turbineKn + ramKn, 0.01);
  const skinC = finiteNumber(state.rapier_stagnation_temp_c);
  const marginC = finiteNumber(state.rapier_thermal_margin_c);
  const mode = cycleMode(mach);
  let thermalLevel = "normal";
  if (marginC !== null && marginC < 0) thermalLevel = "fault";
  else if (marginC !== null && marginC < 40) thermalLevel = "caution";

  return Object.freeze({
    mode,
    explainer: cycleExplainer(mode),
    mach,
    turbineKn,
    ramKn,
    turbineShare: turbineKn / totalKn,
    ramShare: ramKn / totalKn,
    skinC,
    marginC,
    thermalLevel,
    skinText: skinC === null
      ? "SKIN --"
      : marginC !== null && marginC < 0
        ? `SKIN OVER ${Math.round(skinC)}°C`
        : marginC !== null
          ? `SKIN ${Math.round(skinC)}°C · +${Math.round(marginC)}°C TO LIMIT`
          : `SKIN ${Math.round(skinC)}°C`,
  });
}

/// Diagnostic engine state for the Aircraft Systems console / tests — not drawn on the HUD ladder.
export function rapierEnginePresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  const teach = rapierCycleTeachPresentation(state);
  if (!teach) return null;
  const trueAirspeedKts = Math.max(0, Number(state.true_airspeed_kts) || 0);
  const thrustKn = Math.max(0,
    (Number(state.engine_net_thrust_lbf) || 0) * 4.4482216153 / 1000);
  const lever = Math.max(0, Number(state.throttle) || 0);
  const turbineFuelPpm = Math.max(0, Number(state.rapier_turbine_fuel_ppm) || 0);
  const ramjetFuelPpm = Math.max(0, Number(state.rapier_ramjet_fuel_ppm) || 0);
  return Object.freeze({
    text: `PROPULSION ${teach.mode} · ${thrustKn.toFixed(0)} KN · LEVER ${lever.toFixed(2)} · M${teach.mach.toFixed(2)} · ${Math.round(trueAirspeedKts).toLocaleString("en-US")} KTAS${teach.skinC !== null ? ` · T0 ${Math.round(teach.skinC)}°C` : ""}`,
    explainer: teach.explainer,
    level: teach.mode === "TURBINE" ? "turbine"
      : teach.mode === "HANDOVER" ? "transition" : "ram",
    channels: Object.freeze([
      Object.freeze({
        label: "TURBINE / A-B",
        thrustKn: teach.turbineKn,
        fuelPpm: turbineFuelPpm,
      }),
      Object.freeze({
        label: "RAMJET",
        thrustKn: teach.ramKn,
        fuelPpm: ramjetFuelPpm,
      }),
    ]),
  });
}
