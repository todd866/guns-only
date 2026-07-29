const PHASE = Object.freeze({
  1: "LAUNCH",
  2: "CLIMB · FL560",
  3: "LEVEL ACCEL · M2.20",
  4: "RAM CLIMB · FL700",
  5: "ZOOM PULL",
  6: "ZOOM COAST",
  7: "REENTER · NOSE→V",
  8: "DIP RELIGHT",
  9: "INTERCEPT · FL700",
  10: "ATTACK",
  11: "EGRESS · HOME",
  12: "RETURN · HOME",
  13: "RECOVERY",
  14: "COMPLETE",
});

const CIRCUITS_PHASE = Object.freeze({
  1: "CIRCUITS · DEPART",
  2: "CIRCUITS · DEPART",
  13: "CIRCUITS",
  14: "COMPLETE",
});

const PHASE_ATTACK = 10;
const PHASE_EGRESS = 11;
const PHASE_RECOVERY = 13;
const PHASE_INTERCEPT = 9;
const PHASE_RAM_CLIMB = 4;

const CIRCUIT_LEG_LABEL = Object.freeze({
  DEPART: "DEPART",
  INITIAL: "INITIAL",
  BREAK: "BREAK",
  DOWNWIND: "DOWNWIND",
  BASE: "BASE",
  SHORT_FINAL: "SHORT FINAL",
  WIRE_FINAL: "WIRE FINAL",
  COMPLETE: "COMPLETE",
});

const CIRCUIT_LEG_FROM_CODE = Object.freeze({
  1: "DEPART",
  2: "INITIAL",
  3: "BREAK",
  4: "DOWNWIND",
  5: "BASE",
  6: "SHORT_FINAL",
  7: "WIRE_FINAL",
  8: "COMPLETE",
});

// Backward-compatible values for old recorded snapshots. Current sorties publish these constants
// from TurboRamjetPerformanceMap, so live teaching and briefing copy follow the executable kernel.
const LEGACY_RAM_LIGHT_MACH = 2.0;
const LEGACY_FULL_RAM_MACH = 2.8;
const LEGACY_TURBINE_GONE_MACH = 3.0;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function rapierPropulsionThresholds(state = {}) {
  return Object.freeze({
    ramLightMach: finiteNumber(state.rapier_ram_light_mach)
      ?? LEGACY_RAM_LIGHT_MACH,
    fullRamMach: finiteNumber(state.rapier_full_ram_mach)
      ?? LEGACY_FULL_RAM_MACH,
    turbineGoneMach: finiteNumber(state.rapier_turbine_gone_mach)
      ?? LEGACY_TURBINE_GONE_MACH,
  });
}

export function rapierBriefingText(template, state = {}) {
  const thresholds = rapierPropulsionThresholds(state);
  return String(template ?? "")
    .replaceAll("{RAM_LIGHT_MACH}", `M${thresholds.ramLightMach.toFixed(1)}`)
    .replaceAll("{FULL_RAM_MACH}", `M${thresholds.fullRamMach.toFixed(1)}`);
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

function thermalChannels(state) {
  // Schema 1.19 separates lagged wall skin from flat-skin recovery and stagnation-point T0.
  // In 1.18 the misleadingly named rapier_stagnation_temp_c carried lagged skin, so only call it
  // T0 when the canonical skin field proves that the new contract is present.
  const canonicalSkinC = finiteNumber(state.rapier_skin_temp_c);
  const skinC = canonicalSkinC ?? finiteNumber(state.rapier_stagnation_temp_c);
  const recoveryC = finiteNumber(state.rapier_recovery_temp_c);
  const stagnationC = canonicalSkinC === null
    ? null
    : finiteNumber(state.rapier_stagnation_temp_c);
  const cmcCapabilityC = finiteNumber(state.rapier_cmc_capability_c);
  const cmcMarginC = finiteNumber(state.rapier_cmc_margin_c)
    ?? (cmcCapabilityC !== null && stagnationC !== null
      ? cmcCapabilityC - stagnationC
      : finiteNumber(state.rapier_thermal_margin_c));
  return Object.freeze({
    skinC,
    recoveryC,
    stagnationC,
    cmcCapabilityC,
    cmcMarginC,
  });
}

function skinFragment(state) {
  const thermal = thermalChannels(state);
  const { skinC, stagnationC, cmcCapabilityC, cmcMarginC } = thermal;
  if (skinC === null && stagnationC === null) return null;
  if (cmcMarginC !== null && cmcMarginC < 0) {
    const hotC = stagnationC ?? skinC;
    const cap = cmcCapabilityC !== null
      ? ` / CMC CAP ${Math.round(cmcCapabilityC)}°C`
      : "";
    return Object.freeze({
      text: `T0 OVER ${Math.round(hotC)}°C${cap}`,
      level: "attack",
    });
  }
  if (cmcMarginC !== null && cmcMarginC < 40) {
    const skin = skinC !== null ? `SKIN ${Math.round(skinC)}°C · ` : "";
    const hotC = stagnationC ?? skinC;
    const cap = cmcCapabilityC !== null
      ? ` · CMC CAP ${Math.round(cmcCapabilityC)}°C`
      : "";
    return Object.freeze({
      text: `${skin}T0 ${Math.round(hotC)}°C${cap}`,
      level: "caution",
    });
  }
  const parts = [];
  if (skinC !== null) parts.push(`SKIN ${Math.round(skinC)}°C`);
  if (stagnationC !== null) parts.push(`T0 ${Math.round(stagnationC)}°C`);
  return Object.freeze({
    text: parts.join(" · "),
    level: "normal",
  });
}

function circuitsConfigFragment(leg, state) {
  const targetKtas = finiteNumber(state.rapier_fd_target_ktas);
  const targetAltFt = finiteNumber(state.rapier_target_altitude_ft);
  const dirty = leg === "DOWNWIND" || leg === "BASE"
    || leg === "SHORT_FINAL" || leg === "WIRE_FINAL";
  const config = dirty
    ? "HOOK DOWN · GEAR DOWN · ELEVONS DOWN"
    : "HOOK DOWN · GEAR UP · ELEVONS UP";
  const speed = targetKtas !== null ? ` · ${Math.round(targetKtas)} KT` : "";
  const alt = targetAltFt !== null && targetAltFt > 0
    ? ` · ${Math.round(targetAltFt)} FT`
    : "";
  let action = "";
  if (leg === "SHORT_FINAL") action = " · LINE UP · CONFIGURED";
  else if (leg === "WIRE_FINAL") action = " · ACCEPT WIRE";
  else if (leg === "INITIAL") action = " · BREAK LEFT ABM";
  else if (leg === "BREAK") action = " · ~60° TO DOWNWIND";
  else if (leg === "DOWNWIND") action = " · GEAR ELEVONS · ABEAM";
  else if (leg === "BASE") action = " · ~45° TO FINAL";
  else if (leg === "DEPART") action = " · CLIMB TO PATTERN";
  return `${config}${speed}${alt}${action}`;
}

function circuitsCoach(state) {
  if (state.rapier_automation_active === true) return "DEMO";
  if (state.rapier_automation_enabled === true) return "DIRECT";
  return "MONITOR";
}

function circuitsConfigOk(leg, state) {
  const gearDown = Math.max(
    Number(state.gear_nose) || 0,
    Number(state.gear_left) || 0,
    Number(state.gear_right) || 0,
  ) > 0.85;
  const flapsDown = Math.max(
    Number(state.flap_left_deg) || 0,
    Number(state.flap_right_deg) || 0,
  ) > 8;
  const dirty = leg === "DOWNWIND" || leg === "BASE"
    || leg === "SHORT_FINAL" || leg === "WIRE_FINAL";
  if (dirty) return gearDown && flapsDown;
  // DEPART / INITIAL / BREAK: gear up, flaps up (hook is always-down teaching).
  return !gearDown && !flapsDown;
}

/// Active flythrough gate status for Circuits: volume + energy + config.
export function circuitGatePresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  const patternOnly = state.rapier_pattern_only === true
    || (typeof state.rapier_mission_cue === "string"
      && state.rapier_mission_cue.startsWith("CIRCUITS"));
  if (!patternOnly) return null;
  const halfM = finiteNumber(state.rapier_gate_half_m) ?? 0;
  if (halfM <= 0) return null;
  const leg = circuitLegFromState(state);
  const legLabel = circuitLegLabel(leg);
  const inVolume = state.rapier_gate_in_volume === true;
  const energyOk = state.rapier_gate_energy_ok === true;
  const configOk = circuitsConfigOk(leg, state);
  const targetKtas = finiteNumber(state.rapier_fd_target_ktas);
  let status = "FLY THE BOX";
  let accent = "armed";
  if (inVolume && energyOk && configOk) {
    status = "GATE OPEN";
    accent = "open";
  } else if (inVolume && !energyOk) {
    status = "ENERGY";
    accent = "fault";
  } else if (inVolume && !configOk) {
    status = "CONFIG";
    accent = "fault";
  } else if (energyOk) {
    status = "ON SPEED";
    accent = "armed";
  }
  const dirty = leg === "DOWNWIND" || leg === "BASE"
    || leg === "SHORT_FINAL" || leg === "WIRE_FINAL";
  const config = dirty
    ? "HOOK · GEAR · ELEVONS DOWN"
    : "HOOK DOWN · GEAR UP · ELEVONS UP";
  const speed = targetKtas !== null ? `${Math.round(targetKtas)} KT` : "";
  return Object.freeze({
    halfM,
    faceX: finiteNumber(state.rapier_gate_face_x) ?? 0,
    faceY: finiteNumber(state.rapier_gate_face_y) ?? 0,
    faceZ: finiteNumber(state.rapier_gate_face_z) ?? 1,
    inVolume,
    energyOk,
    configOk,
    status,
    accent,
    boxLabel: legLabel ? `${legLabel} · ${status}` : status,
    configLine: speed ? `${config} · ${speed}` : config,
  });
}

/// Quiet mode line under the heading tape. Spec:
/// docs/superpowers/specs/2026-07-27-hud-limits-panel-design.md
/// Skin temperature is Intercept teaching chrome — never on Circuits.
export function rapierGuidancePresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  if (state.rapier_flight_control_computers_available === false) {
    return Object.freeze({
      text: "FLIGHT CONTROL COMPUTERS LOST · NO CONTROL PATH · UNCONTROLLED REENTRY",
      detail: "",
      level: "attack",
      circuitLeg: "",
      boxLabel: "FCS LOST",
      skinC: finiteNumber(state.rapier_stagnation_temp_c),
      marginC: finiteNumber(state.rapier_thermal_margin_c),
    });
  }
  if (state.rapier_mission_computer_available === false) {
    return Object.freeze({
      text: "MISSION COMPUTER LOST · AUTOMATION / DIRECTOR INOP · FBW + RCS REMAIN · FLY MANUAL",
      detail: "",
      level: "attack",
      circuitLeg: "",
      boxLabel: "MC FAIL",
      skinC: finiteNumber(state.rapier_stagnation_temp_c),
      marginC: finiteNumber(state.rapier_thermal_margin_c),
    });
  }
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
  if (!patternOnly && phase === PHASE_RECOVERY) {
    phaseText = `RECOVERY · GATE ${gate}/4`;
  } else if (!patternOnly && gate > 0 && phase >= 1 && phase <= PHASE_INTERCEPT) {
    phaseText = `${phaseText} · GATE ${gate}/4`;
  }

  const job = typeof state.rapier_job === "string" ? state.rapier_job : "";
  const noseErr = finiteNumber(state.rapier_nose_on_v_err_deg);
  const weapon = phase === PHASE_ATTACK && !patternOnly
    ? (job === "TRANSPORT"
      ? " · GUNS · ONE PASS"
      : job === "BALLOON"
        ? " · GUNS · ONE SLASH"
        : ` · F RELEASES SWARM · ${drones}`)
    : "";
  const coastAlign = !patternOnly && (phase === 6 || phase === 7) && noseErr !== null
    ? (noseErr <= 8 ? " · ON V" : ` · NOSE→V ${Math.round(noseErr)}°`)
    : "";
  const authority = patternOnly
    ? circuitsCoach(state)
    : (active ? "AUTO" : enabled ? "AUTO STBY" : "PILOT");
  const skin = patternOnly ? null : skinFragment(state);
  const thermal = patternOnly ? null : thermalChannels(state);
  const commanded = finiteNumber(state.rapier_commanded_mach);
  const authored = finiteNumber(state.rapier_authored_target_mach);
  const skinLimit = finiteNumber(state.rapier_material_mach_ceiling)
    ?? finiteNumber(state.rapier_skin_mach_limit);
  const machClampNote = !patternOnly
    && commanded !== null && authored !== null && skinLimit !== null
    && authored - commanded > 0.05
    ? ` · CMD M${commanded.toFixed(1)}`
    : "";

  let text;
  let level;
  if (patternOnly) {
    const config = circuitsConfigFragment(leg, state);
    text = `${authority} · ${phaseText} · ${config} · P DEMO/DIRECT/MONITOR`;
    level = active ? "active" : "manual";
  } else if (skin?.level === "attack") {
    text = `${authority} · ${skin.text} · P TOGGLE AUTO`;
    level = "attack";
  } else {
    text = skin
      ? `${authority} · ${phaseText}${coastAlign}${weapon}${machClampNote} · ${skin.text} · P TOGGLE AUTO`
      : `${authority} · ${phaseText}${coastAlign}${weapon}${machClampNote} · P TOGGLE AUTO`;
    level = skin?.level === "caution"
      ? "active"
      : phase === PHASE_ATTACK || phase === PHASE_EGRESS ? "attack"
        : active ? "active" : "manual";
  }

  return Object.freeze({
    text,
    detail: "",
    level,
    circuitLeg: leg,
    boxLabel: patternOnly
      ? (circuitGatePresentation(state)?.boxLabel || legLabel || "")
      : (phase === PHASE_RECOVERY && gate > 0 ? `GATE ${gate}/4`
        : (!patternOnly && (phase === 6 || phase === 7)
          ? (noseErr !== null && noseErr <= 8 ? "ON V" : "NOSE→V")
          : "")),
    skinC: thermal?.skinC ?? null,
    recoveryC: thermal?.recoveryC ?? null,
    stagnationC: thermal?.stagnationC ?? null,
    cmcCapabilityC: thermal?.cmcCapabilityC ?? null,
    cmcMarginC: thermal?.cmcMarginC ?? null,
    // Compatibility alias for existing HUD drawing code.
    marginC: thermal?.cmcMarginC ?? null,
  });
}

/// Circuits / recovery / zoom-coast flight-director bugs from kernel-published targets.
export function rapierFlightDirectorPresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  if (state.rapier_mission_computer_available === false
    || state.rapier_flight_control_computers_available === false) return null;
  const targetKtas = finiteNumber(state.rapier_fd_target_ktas) ?? 0;
  const targetAltFt = finiteNumber(state.rapier_target_altitude_ft) ?? 0;
  const noseErr = finiteNumber(state.rapier_nose_on_v_err_deg);
  const zoomLob = state.rapier_zoom_lob === true;
  const phase = Math.floor(Number(state.rapier_mission_phase) || 0);
  const coastPhase = phase === 6 || phase === 7;
  if (targetKtas <= 0 && targetAltFt <= 0 && !(zoomLob && coastPhase && noseErr !== null)) {
    return null;
  }
  const fdBankDeg = finiteNumber(state.rapier_fd_bank_deg) ?? 0;
  const bankDeg = finiteNumber(state.bank_deg) ?? 0;
  const altFt = finiteNumber(state.alt_ft)
    ?? finiteNumber(state.altitude_ft)
    ?? 0;
  const verticalSpeedFpm = finiteNumber(state.vertical_speed_fpm);
  const currentKtas = finiteNumber(state.true_airspeed_kts) ?? 0;
  let speedCall = "";
  if (targetKtas > 0) {
    speedCall = currentKtas > targetKtas + 25.0 ? "SLOW"
      : currentKtas < targetKtas - 25.0 ? "ADD POWER" : "ON SPEED";
  }
  let noseCall = "";
  if (noseErr !== null && (zoomLob || coastPhase)) {
    noseCall = noseErr <= 8.0 ? "ON V" : "ALIGN NOSE→V";
  }
  const altitudeErrorFt = targetAltFt - altFt;
  const altitudeCapturePhase = phase === PHASE_RAM_CLIMB || phase === PHASE_INTERCEPT;
  const closingAltitude = verticalSpeedFpm !== null
    && Math.abs(verticalSpeedFpm) >= 500
    && altitudeErrorFt * verticalSpeedFpm > 0;
  const timeToAltitudeS = closingAltitude
    ? Math.abs(altitudeErrorFt / verticalSpeedFpm) * 60
    : null;
  const flightLevel = targetAltFt > 0
    ? `FL${Math.round(targetAltFt / 100)}`
    : "";
  let altitudeCall = "";
  let altitudeSeverity = "normal";
  const requestedG = finiteNumber(state.requested_g_cmd);
  const manualHighGPull = state.rapier_automation_active !== true
    && requestedG !== null
    && requestedG >= 4.0;
  if (altitudeCapturePhase && targetAltFt > 0 && verticalSpeedFpm !== null) {
    if (altitudeErrorFt < 0 && verticalSpeedFpm > 1000) {
      altitudeCall = manualHighGPull
        ? "UNLOAD NOW · ENERGY HIGH"
        : `LEVEL NOW · DESCEND ${flightLevel}`;
      altitudeSeverity = "danger";
    } else if (altitudeErrorFt > 0 && verticalSpeedFpm > 1000
      && timeToAltitudeS !== null && timeToAltitudeS <= 12) {
      altitudeCall = `CAPTURE ${flightLevel} · UNLOAD`;
      altitudeSeverity = timeToAltitudeS <= 6 ? "danger" : "caution";
    }
  }
  return Object.freeze({
    bankErrorDeg: fdBankDeg - bankDeg,
    altErrorFt: altitudeErrorFt,
    altitudeCall,
    altitudeSeverity,
    timeToAltitudeS,
    speedCall,
    targetKtas,
    noseOnVErrorDeg: noseErr,
    noseCall,
    boxLabel: circuitLegLabel(circuitLegFromState(state))
      || (noseCall === "ON V" ? "ON V" : noseCall === "ALIGN NOSE→V" ? "NOSE→V" : ""),
  });
}

function cycleMode(mach, thresholds) {
  if (mach < thresholds.ramLightMach) return "TURBINE";
  if (mach < thresholds.fullRamMach) return "HANDOVER";
  if (mach < thresholds.turbineGoneMach) return "FULL RAM";
  return "RAM ONLY";
}

function cycleExplainer(mode, thresholds) {
  switch (mode) {
    case "TURBINE":
      return `Turbojet + AB make thrust now. Ram needs ~M${thresholds.ramLightMach.toFixed(1)} before it lights.`;
    case "HANDOVER":
      return "Handover band: turbine fading, ram lighting. Expect a thrust bucket.";
    case "FULL RAM":
      return "Ram owns the dash. Turbine is shutting down as inlet air gets too hot.";
    case "RAM ONLY":
      return "Ram only — turbine is out. Engine/inlet envelope binds before CMC capability.";
    default:
      return "Turbine low, ram high. They hand over around Mach 2.";
  }
}

const NEWTONS_PER_POUND_FORCE = 4.4482216153;

function streamThrustLbf(state, lbfField, knField) {
  const direct = finiteNumber(state?.[lbfField]);
  if (direct !== null) return Math.max(0, direct);
  const legacyKn = finiteNumber(state?.[knField]);
  return legacyKn === null ? 0 : Math.max(0, legacyKn * 1000 / NEWTONS_PER_POUND_FORCE);
}

/// Always-on teaching presentation for the combined-cycle motor + skin limit.
/// Circuits is pattern school — hide Intercept TBCC/skin chrome there.
export function rapierCycleTeachPresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  const patternOnly = state.rapier_pattern_only === true
    || (typeof state.rapier_mission_cue === "string"
      && state.rapier_mission_cue.startsWith("CIRCUITS"));
  if (patternOnly) return null;
  const mach = Math.max(0, finiteNumber(state.mach) ?? 0);
  const turbineLbf = streamThrustLbf(
    state, "rapier_turbine_thrust_lbf", "rapier_turbine_thrust_kn");
  const ramLbf = streamThrustLbf(
    state, "rapier_ramjet_thrust_lbf", "rapier_ramjet_thrust_kn");
  const totalLbf = Math.max(turbineLbf + ramLbf, 0.01);
  const thermal = thermalChannels(state);
  const {
    skinC,
    recoveryC,
    stagnationC,
    cmcCapabilityC,
    cmcMarginC,
  } = thermal;
  const thresholds = rapierPropulsionThresholds(state);
  const mode = cycleMode(mach, thresholds);
  let thermalLevel = "normal";
  if (cmcMarginC !== null && cmcMarginC < 0) thermalLevel = "fault";
  else if (cmcMarginC !== null && cmcMarginC < 40) thermalLevel = "caution";

  const skinText = skinC !== null ? `SKIN ${Math.round(skinC)}°C` : "SKIN --";
  const t0Text = stagnationC !== null ? ` · T0 ${Math.round(stagnationC)}°C` : "";
  const capText = cmcCapabilityC !== null
    ? ` · CMC CAP ${Math.round(cmcCapabilityC)}°C`
    : "";

  return Object.freeze({
    mode,
    explainer: cycleExplainer(mode, thresholds),
    mach,
    turbineLbf,
    ramLbf,
    totalLbf,
    // Legacy engineering values remain available to non-rendering tests/consumers, but every
    // player-facing string below is pounds-force.
    turbineKn: turbineLbf * NEWTONS_PER_POUND_FORCE / 1000,
    ramKn: ramLbf * NEWTONS_PER_POUND_FORCE / 1000,
    turbineShare: turbineLbf / totalLbf,
    ramShare: ramLbf / totalLbf,
    skinC,
    recoveryC,
    stagnationC,
    cmcCapabilityC,
    cmcMarginC,
    // Compatibility alias for existing HUD drawing code.
    marginC: cmcMarginC,
    thermalLevel,
    skinText: thermalLevel === "fault"
      ? `T0 OVER ${Math.round(stagnationC ?? skinC)}°C${capText}`
      : `${skinText}${t0Text} · ENGINE/INLET LIMITING`,
  });
}

/// Diagnostic engine state for the Aircraft Systems console / tests — not drawn on the HUD ladder.
export function rapierEnginePresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  // Systems console still wants cycle truth on Circuits even when the HUD teach panel is gated.
  const teach = rapierCycleTeachPresentation({
    ...state,
    rapier_pattern_only: false,
  });
  if (!teach) return null;
  const trueAirspeedKts = Math.max(0, Number(state.true_airspeed_kts) || 0);
  const thrustLbf = Math.max(0, Number(state.engine_net_thrust_lbf) || teach.totalLbf);
  const lever = Math.max(0, Number(state.throttle) || 0);
  const turbineFuelPpm = Math.max(0, Number(state.rapier_turbine_fuel_ppm) || 0);
  const ramjetFuelPpm = Math.max(0, Number(state.rapier_ramjet_fuel_ppm) || 0);
  const skinText = teach.skinC !== null
    ? ` · SKIN ${Math.round(teach.skinC)}°C`
    : "";
  const stagnationText = teach.stagnationC !== null
    ? ` · T0 ${Math.round(teach.stagnationC)}°C`
    : "";
  return Object.freeze({
    text: `PROPULSION ${teach.mode} · ${Math.round(thrustLbf).toLocaleString("en-US")} LBF · LEVER ${lever.toFixed(2)} · M${teach.mach.toFixed(2)} · ${Math.round(trueAirspeedKts).toLocaleString("en-US")} KTAS${skinText}${stagnationText}`,
    explainer: teach.explainer,
    level: teach.mode === "TURBINE" ? "turbine"
      : teach.mode === "HANDOVER" ? "transition" : "ram",
    channels: Object.freeze([
      Object.freeze({
        label: "TURBINE / A-B",
        thrustLbf: teach.turbineLbf,
        thrustKn: teach.turbineKn,
        fuelPpm: turbineFuelPpm,
      }),
      Object.freeze({
        label: "RAMJET",
        thrustLbf: teach.ramLbf,
        thrustKn: teach.ramKn,
        fuelPpm: ramjetFuelPpm,
      }),
    ]),
  });
}
