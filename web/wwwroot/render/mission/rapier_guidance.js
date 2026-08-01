import { circuitConfigurationMatches } from "../hud/hud_phase.js";

/// Short quiet-line phase tokens (≤ ~4 tokens with authority). Full schedule copy left the
/// heading strip; FL/Mach targets belong on tapes / Limits, not the mode line.
const PHASE = Object.freeze({
  1: "LAUNCH",
  2: "CLIMB · FL560",
  3: "ACCEL · M2.2",
  4: "RAM CLIMB · FL700",
  5: "ZOOM PULL",
  6: "ZOOM COAST",
  7: "REENTER",
  8: "DIP RELIGHT",
  9: "INTERCEPT",
  10: "ATTACK",
  11: "EGRESS · HOME",
  12: "RETURN · HOME",
  13: "RECOVERY",
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
// Pass 1 measured dash — mirrors RapierMissionDirector.MeasuredDashMach for old recordings.
const LEGACY_DESIGN_DASH_MACH = 3.55;

const JOB_BRIEFING = Object.freeze({
  BALLOON: Object.freeze({
    label: "high-altitude balloon",
    task: "Climb above it, preserve energy, and make the short firing pass.",
  }),
  AWACS: Object.freeze({
    label: "airborne early-warning aircraft",
    task: "Neutralize the enabler, then expect the strongest pursued egress.",
  }),
  TRANSPORT: Object.freeze({
    label: "transport aircraft",
    task: "Convert the zoom-lob energy into a controlled low-altitude dive pass.",
  }),
  SWARM_LOB: Object.freeze({
    label: "swarm carrier",
    task: "Release the gun-drone package at the apex and protect the recovery reserve.",
  }),
  FORMATIONINTERCEPT: Object.freeze({
    label: "fighter formation",
    task: "Release the gun-drone package on the one-pass formation intercept.",
  }),
  FORMATION_INTERCEPT: Object.freeze({
    label: "fighter formation",
    task: "Release the gun-drone package on the one-pass formation intercept.",
  }),
});

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
    designDashMach: finiteNumber(state.rapier_design_dash_mach)
      ?? LEGACY_DESIGN_DASH_MACH,
  });
}

export function rapierBriefingText(template, state = {}) {
  const thresholds = rapierPropulsionThresholds(state);
  const jobToken = String(
    state.rapier_economy_target_kind || state.rapier_job || "FORMATION_INTERCEPT",
  ).trim().toUpperCase();
  const job = JOB_BRIEFING[jobToken] ?? JOB_BRIEFING.FORMATION_INTERCEPT;
  const reward = Math.max(0, Math.trunc(
    finiteNumber(state.rapier_economy_target_reward_credits) ?? 0,
  ));
  return String(template ?? "")
    .replaceAll("{RAM_LIGHT_MACH}", `M${thresholds.ramLightMach.toFixed(1)}`)
    .replaceAll("{FULL_RAM_MACH}", `M${thresholds.fullRamMach.toFixed(1)}`)
    .replaceAll("{DESIGN_DASH_MACH}", `M${thresholds.designDashMach.toFixed(1)}`)
    .replaceAll("{TARGET_LABEL}", job.label)
    .replaceAll("{TARGET_TASK}", job.task)
    .replaceAll("{TARGET_REWARD}", String(reward));
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

function circuitsCoach(state) {
  if (state.rapier_automation_active === true) return "DEMO";
  if (state.rapier_automation_enabled === true) return "DIRECT";
  return "MONITOR";
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
  const inVolume = state.rapier_gate_in_volume === true;
  const energyOk = state.rapier_gate_energy_ok === true;
  const configOk = circuitConfigurationMatches(state);
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
    ? "GEAR · ELEVONS DOWN"
    : "GEAR · ELEVONS UP";
  // The square owns NEXT. Text appears only for the brief gate-open event or an exception;
  // current leg, target speed, and verified configuration have other owners.
  const boxLabel = status === "GATE OPEN" ? status
    : status === "ENERGY" || status === "CONFIG" ? status : "";
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
    boxLabel,
    configLine: status === "CONFIG" ? config : "",
    worldX: null,
    worldY: null,
    worldZ: null,
  });
}

/// Mesh ND recovery procedure gates, falling back to Circuits pattern boxes.
export function recoveryGatePresentation(state) {
  const kind = Math.max(0, Math.floor(Number(state?.recovery_procedure_kind) || 0));
  if (kind > 0) {
    const halfM = finiteNumber(state.recovery_gate_half_m) ?? 0;
    const worldX = finiteNumber(state.recovery_gate_x);
    const worldY = finiteNumber(state.recovery_gate_y);
    const worldZ = finiteNumber(state.recovery_gate_z);
    if (halfM <= 0 || worldX === null || worldY === null || worldZ === null) return null;
    const inVolume = state.recovery_gate_in_volume === true;
    const energyOk = state.recovery_gate_energy_ok === true;
    const configOk = state.recovery_gate_config_ok === true;
    const dirty = state.recovery_gate_dirty === true;
    const targetKtas = finiteNumber(state.recovery_gate_target_ktas);
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
    const label = typeof state.recovery_procedure_label === "string"
      && state.recovery_procedure_label.trim()
      ? state.recovery_procedure_label.trim().toUpperCase()
      : (kind === 1 ? "OVERHEAD" : kind === 2 ? "DOWNWIND REJOIN" : "STRAIGHT-IN");
    const config = dirty
      ? "HOOK · GEAR · ELEVONS DOWN"
      : "HOOK DOWN · GEAR UP · ELEVONS UP";
    const speed = targetKtas !== null ? `${Math.round(targetKtas)} KT` : "";
    return Object.freeze({
      halfM,
      faceX: finiteNumber(state.recovery_gate_face_x) ?? 0,
      faceY: finiteNumber(state.recovery_gate_face_y) ?? 0,
      faceZ: finiteNumber(state.recovery_gate_face_z) ?? 1,
      inVolume,
      energyOk,
      configOk,
      status,
      accent,
      boxLabel: `${label} · ${status}`,
      configLine: speed ? `${config} · ${speed}` : config,
      worldX,
      worldY,
      worldZ,
    });
  }
  return circuitGatePresentation(state);
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
  let phaseText = PHASE[phase] ?? "MISSION";
  if (!patternOnly && phase === PHASE_INTERCEPT) {
    const strategy = typeof state.rapier_strategy === "string"
      ? state.rapier_strategy.toLowerCase()
      : "";
    if (strategy === "level_dash") phaseText = "INTERCEPT · DASH";
    else if (strategy === "direct_join") phaseText = "INTERCEPT · DIRECT";
  }
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

  let text;
  let level;
  if (patternOnly) {
    // Authority + current leg is the whole persistent line. Profile belongs to director/tapes,
    // NEXT to the world gate, and configuration to exception-driven VERIFY.
    text = legLabel ? `${authority} · ${legLabel}` : authority;
    level = active ? "active" : "manual";
  } else if (skin?.level === "attack") {
    // Urgency owns the quiet line; Controls still documents P for auto toggle.
    text = `${authority} · ${skin.text}`;
    level = "attack";
  } else {
    // Normal/caution skin temps stay off the strip — Limits accent + cycle teach carry them.
    text = `${authority} · ${phaseText}${coastAlign}${weapon}`;
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
    boxLabel: (() => {
      const recovery = recoveryGatePresentation(state);
      if (recovery?.boxLabel) return recovery.boxLabel;
      return patternOnly
        ? (circuitGatePresentation(state)?.boxLabel || "")
        : (phase === PHASE_RECOVERY && gate > 0 ? `GATE ${gate}/4`
          : (!patternOnly && (phase === 6 || phase === 7)
            ? (noseErr !== null && noseErr <= 8 ? "ON V" : "NOSE→V")
            : ""));
    })(),
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
/// Intercept v1 suppresses center FD command essays. Circuits keeps director geometry, with
/// textual coaching only when the aircraft is materially off the authored profile.
export function rapierFlightDirectorPresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  if (state.rapier_mission_computer_available === false
    || state.rapier_flight_control_computers_available === false) return null;
  const patternOnly = state.rapier_pattern_only === true
    || (typeof state.rapier_mission_cue === "string"
      && state.rapier_mission_cue.startsWith("CIRCUITS"));
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
  if (patternOnly && targetKtas > 0) {
    speedCall = currentKtas > targetKtas + 25.0 ? "SLOW"
      : currentKtas < targetKtas - 25.0 ? "ADD POWER" : "";
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
  // Intercept: no center altitude essays. Circuits keeps capture coaching.
  if (patternOnly && altitudeCapturePhase && targetAltFt > 0 && verticalSpeedFpm !== null) {
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
    targetKtas: patternOnly ? targetKtas : 0,
    noseOnVErrorDeg: noseErr,
    noseCall,
    centerFdCommands: patternOnly,
    boxLabel: circuitLegLabel(circuitLegFromState(state))
      || (noseCall === "ON V" ? "ON V" : noseCall === "ALIGN NOSE→V" ? "NOSE→V" : ""),
  });
}

/// Ram thrust below this fraction of the total is not "lighting", it is off.
const RAM_LIT_SHARE = 0.04;

/// The Rapier's dynamic-pressure placard, kPa. RapierAerodynamics derives 49,035 Pa from
/// Vne 550 KIAS; the kernel publishes q but never published the placard, so it is mirrored here
/// and asserted against the kernel value by the guidance tests.
export const DYNAMIC_PRESSURE_PLACARD_KPA = 49.0;

/// Which cycle the engine is ACTUALLY running, not which one its Mach number implies.
///
/// This used to be a pure function of Mach, and it was wrong in the one place a pilot most needs
/// it: the ram spike is scheduled on DENSITY as well as Mach and stays locked below roughly
/// FL225, so a dive that crosses the ram-light Mach in thick air produced "HANDOVER -- turbine
/// fading, ram lighting, expect a thrust bucket" while the ram duct was shut and making nothing.
/// The pilot was told the engine was handing over while it was doing no such thing; the aircraft
/// then stopped accelerating for a reason nothing on the HUD could explain.
///
/// RAM LOCKED is that missing state: fast enough to light, too low to open the spike.
function cycleMode(mach, thresholds, ramShare = null) {
  const ramDead = ramShare !== null && ramShare < RAM_LIT_SHARE;
  if (mach < thresholds.ramLightMach) return "TURBINE";
  if (ramDead) return "RAM LOCKED";
  if (mach < thresholds.fullRamMach) return "HANDOVER";
  if (mach < thresholds.turbineGoneMach) return "FULL RAM";
  return "RAM ONLY";
}

function cycleExplainer(mode, thresholds) {
  switch (mode) {
    case "TURBINE":
      return `Turbojet + AB make thrust now. Ram needs ~M${thresholds.ramLightMach.toFixed(1)} before it lights.`;
    case "RAM LOCKED":
      return "Fast enough to light, too low to open the spike. The duct stays shut in dense air — climb.";
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

function buildCycleTeach(state) {
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
  const mode = cycleMode(mach, thresholds, ramLbf / totalLbf);
  let thermalLevel = "normal";
  if (cmcMarginC !== null && cmcMarginC < 0) thermalLevel = "fault";
  else if (cmcMarginC !== null && cmcMarginC < 40) thermalLevel = "caution";

  const dynamicPressureKpa = finiteNumber(state.dynamic_pressure_kpa);
  const overDynamicPressure = dynamicPressureKpa !== null
    && dynamicPressureKpa > DYNAMIC_PRESSURE_PLACARD_KPA;

  const skinText = skinC !== null ? `SKIN ${Math.round(skinC)}°C` : "SKIN --";
  const t0Text = stagnationC !== null ? ` · T0 ${Math.round(stagnationC)}°C` : "";
  const capText = cmcCapabilityC !== null
    ? ` · CMC CAP ${Math.round(cmcCapabilityC)}°C`
    : "";

  return Object.freeze({
    mode,
    explainer: cycleExplainer(mode, thresholds),
    mach,
    dynamicPressureKpa,
    overDynamicPressure,
    // Drawn on the card only while it is being exceeded: a placard you are inside is not news.
    dynamicPressureText: overDynamicPressure
      ? `OVER Q ${Math.round(dynamicPressureKpa)} kPa · LIMIT ${Math.round(DYNAMIC_PRESSURE_PLACARD_KPA)}`
      : "",
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
      : `${skinText}${t0Text}`,
  });
}

/// Combined-cycle + skin teach card. Intercept: ascent band only, or thermal OVER anywhere.
/// Circuits is pattern school — hide Intercept TBCC/skin chrome there.
export function rapierCycleTeachPresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  const patternOnly = state.rapier_pattern_only === true
    || (typeof state.rapier_mission_cue === "string"
      && state.rapier_mission_cue.startsWith("CIRCUITS"));
  if (patternOnly) return null;
  const phase = Math.floor(Number(state.rapier_mission_phase) || 0);
  const ascent = phase >= 1 && phase <= 4;
  const marginC = finiteNumber(state.rapier_cmc_margin_c)
    ?? finiteNumber(state.rapier_thermal_margin_c);
  const thermalOver = marginC !== null && marginC < 0;
  const teach = buildCycleTeach(state);

  // The card used to be gated on the ASCENT phase alone, which is exactly backwards for the two
  // situations a pilot cannot diagnose from anything else on the glass:
  //
  //   RAM LOCKED -- a max-afterburner dive from FL500 crosses the ram-light Mach in thick air,
  //   the spike stays shut, and the aircraft simply stops accelerating around M1.8. Nothing on
  //   the HUD said why, because the dive is not the ascent phase.
  //
  //   OVER Q -- that same dive reaches roughly 185 kPa against a 49 kPa placard, nearly four
  //   times the limit. The kernel computes it, records it to service life and publishes it, and
  //   the HUD drew none of it: you can fly the wings off this aeroplane in silence.
  //
  // Both now raise the card wherever they happen.
  const overQ = teach?.overDynamicPressure === true;
  const ramLocked = teach?.mode === "RAM LOCKED";
  if (!ascent && !thermalOver && !overQ && !ramLocked) return null;
  return teach;
}

/// Diagnostic engine state for the Aircraft Systems console / tests — not drawn on the HUD ladder.
export function rapierEnginePresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  // Systems console still wants cycle truth when the HUD teach panel is phase-gated.
  const teach = buildCycleTeach(state);
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
