/// Pure ANCA view model: flat kernel snapshot in, four frozen priority layers out.
///
///   Aviate       NOW     — the immediate constraint or flight profile.
///   Navigate     NEXT    — the lateral vector, route, gate, or destination.
///   Communicate  WHO     — the shared-airspace / coordination posture.
///   Administrate VERIFY  — checks, configuration, and procedural closure.
///
/// A blank layer is an honest answer. ANCA is opened deliberately, so relevant standing
/// priorities may appear even when they are not alerts; raw instrumentation and completed work
/// still stay with their primary displays.
export const CHECKLIST_NAMES = Object.freeze({
  0: "", 1: "LAUNCH", 2: "COMMIT", 3: "RECOVERY", 4: "RTB",
});

export const RAPIER_PHASE_NAMES = Object.freeze({
  1: "LAUNCH",
  2: "CLIMB",
  3: "ACCELERATE",
  4: "RAM CLIMB",
  5: "ZOOM PULL",
  6: "ZOOM COAST",
  7: "REENTER",
  8: "RELIGHT",
  9: "INTERCEPT",
  10: "ATTACK",
  11: "EGRESS",
  12: "RTB",
  13: "RECOVERY",
});

const QUIET_ROW = Object.freeze({
  line: "—", tone: "quiet", shown: false, notify: false,
});

const row = (letter, key, body) =>
  Object.freeze({
    letter,
    key,
    ...(body ? { shown: true, notify: false, ...body } : QUIET_ROW),
  });

const token = (value) => (typeof value === "string" ? value.trim() : "");
const finite = (value) => (Number.isFinite(value) ? value : null);
const upperToken = (value) => token(value).toUpperCase();
const whole = (value) => Math.round(value);

function missionKind(state) {
  if (state?.rapier_mission_available === true) return "rapier";
  if (state?.drone_raid_evaluation === true) return "drone";
  if (state?.visual_merge_evaluation === true) return "dogfight";
  return "other";
}

function formattedMinutes(value) {
  if (value < 10) return value.toFixed(1).replace(/\.0$/, "");
  return String(Math.round(value));
}

function formattedBearing(value) {
  const wrapped = ((whole(value) % 360) + 360) % 360;
  return `${String(wrapped).padStart(3, "0")}°`;
}

function formattedRangeNm(value) {
  if (value < 10) return `${value.toFixed(1)} NM`;
  return `${Math.round(value)} NM`;
}

function vectorFromPoints(state, eastField, northField) {
  const ownEast = finite(state?.px);
  const ownNorth = finite(state?.pz);
  const destEast = finite(state?.[eastField]);
  const destNorth = finite(state?.[northField]);
  if ([ownEast, ownNorth, destEast, destNorth].some((value) => value === null))
    return null;
  const east = destEast - ownEast;
  const north = destNorth - ownNorth;
  const rangeM = Math.hypot(east, north);
  if (rangeM < 1) return { bearingDeg: null, rangeNm: 0 };
  return {
    bearingDeg: Math.atan2(east, north) * 180 / Math.PI,
    rangeNm: rangeM / 1852,
  };
}

function vectorLine(label, bearingDeg, rangeNm, etaMinutes = null) {
  const parts = [label];
  if (bearingDeg !== null) parts.push(formattedBearing(bearingDeg));
  if (rangeNm !== null) parts.push(formattedRangeNm(rangeNm));
  if (etaMinutes !== null) parts.push(`ETA ${Math.max(0, whole(etaMinutes))} MIN`);
  return parts.length > 1 ? parts.join(" · ") : null;
}

function configurationWarnings(state) {
  const warnings = [];
  if (state?.gear_warning_horn === true) warnings.push("GEAR WARNING");
  else if (state?.gear_limit_exceeded === true) warnings.push("GEAR OVERSPEED");
  else if (state?.gear_unsafe === true) warnings.push("GEAR UNSAFE");
  if (state?.flap_limit_exceeded === true) warnings.push("FLAPS OVERSPEED");
  if (state?.flap_split === true) warnings.push("FLAPS SPLIT");
  return warnings;
}

function limitingFuelRow(state) {
  const fuelLb = finite(state?.fuel_lb);
  if (state?.fuel_emergency === true) {
    return {
      line: `EMERGENCY FUEL${fuelLb === null ? "" : ` · ${whole(fuelLb)} LB`}`,
      tone: "attention",
    };
  }
  if (state?.fuel_minimum === true) {
    return {
      line: `MINIMUM FUEL${fuelLb === null ? "" : ` · ${whole(fuelLb)} LB`}`,
      tone: "attention",
    };
  }

  const reserveMargin = finite(state?.fuel_reserve_margin_lb);
  if (reserveMargin !== null && reserveMargin < 0) {
    return {
      line: `RESERVE SHORT ${whole(-reserveMargin)} LB`,
      tone: "attention",
    };
  }

  const minutesToBingo = finite(state?.fuel_minutes_to_bingo);
  if (state?.fuel_bingo === true) {
    return {
      line: `BINGO${fuelLb === null ? "" : ` · ${whole(fuelLb)} LB`}`,
      tone: "attention",
    };
  }
  if (state?.fuel_joker === true) {
    return {
      line: minutesToBingo === null
        ? "JOKER"
        : `JOKER · BINGO ${formattedMinutes(Math.max(0, minutesToBingo))} MIN`,
      tone: "attention",
    };
  }

  // In a continuing engagement the usable time remaining is the flight constraint, not a
  // navigation statistic. Long-range endurance remains on the limits display until it becomes
  // operationally limiting.
  if (["dogfight", "drone"].includes(missionKind(state))
      && minutesToBingo !== null && minutesToBingo <= 30) {
    return {
      line: `BINGO ${formattedMinutes(Math.max(0, minutesToBingo))} MIN`,
      tone: "steady",
    };
  }
  return null;
}

function rapierAuthority(state) {
  if (state?.rapier_pattern_only === true) {
    if (state?.rapier_automation_active === true) return "DEMO";
    if (state?.rapier_automation_enabled === true) return "DIRECT";
    return "MONITOR";
  }
  return state?.rapier_automation_active === true ? "AUTO" : "PILOT";
}

function altitudeTarget(value) {
  if (value >= 18_000) return `FL${String(whole(value / 100)).padStart(3, "0")}`;
  return `${whole(value)} FT`;
}

function rapierProfileRow(state) {
  if (state?.rapier_mission_computer_available === false) {
    return { line: "PILOT · PROFILE UNAVAILABLE", tone: "attention" };
  }
  const phase = Math.trunc(finite(state?.rapier_mission_phase) ?? 0);
  const phaseName = RAPIER_PHASE_NAMES[phase];
  if (!phaseName) return null;

  const authority = rapierAuthority(state);
  const parts = [authority];
  const leg = upperToken(state?.rapier_circuit_leg).replaceAll("_", " ");
  parts.push(state?.rapier_pattern_only === true && leg ? leg : phaseName);

  if (state?.rapier_pattern_only === true) {
    const targetKtas = finite(state?.rapier_fd_target_ktas);
    const targetAltitude = finite(state?.rapier_target_altitude_ft);
    if (targetKtas !== null) parts.push(`${whole(targetKtas)} KT`);
    if (targetAltitude !== null) parts.push(altitudeTarget(targetAltitude));
  } else {
    const targetMach = finite(state?.rapier_target_mach);
    const targetAltitude = finite(state?.rapier_target_altitude_ft);
    if (targetMach !== null && targetMach > 0)
      parts.push(`M${targetMach.toFixed(2)}`);
    if (targetAltitude !== null) parts.push(altitudeTarget(targetAltitude));
  }
  return {
    line: parts.join(" · "),
    tone: state?.rapier_automation_active === true ? "active" : "steady",
  };
}

export function aviateRow(state) {
  const warnings = configurationWarnings(state);
  if (warnings.length > 0)
    return { line: warnings.join(" · "), tone: "attention" };

  // Critical fuel always displaces a normal profile. Otherwise Rapier's authored vertical /
  // energy profile is the Aviate answer, while continuing combat uses minutes to bingo.
  const fuel = limitingFuelRow(state);
  if (fuel?.tone === "attention") return fuel;
  if (missionKind(state) === "rapier") return rapierProfileRow(state);
  return fuel;
}

function homeVectorRow(state) {
  const known = state?.recovery_point_known === true
    || state?.player_rtb_active === true;
  if (!known) return null;
  const bearing = finite(state?.rtb_bearing_deg);
  const range = finite(state?.rtb_range_nm);
  const eta = state?.player_rtb_active === true ? finite(state?.rtb_eta_min) : null;
  const home = upperToken(state?.recovery_display_name) || "HOME";
  const line = vectorLine(home, bearing, range, eta);
  return line ? { line, tone: "steady" } : null;
}

function rapierVectorRow(state) {
  const phase = Math.trunc(finite(state?.rapier_mission_phase) ?? 0);
  if (phase >= 12) {
    const home = homeVectorRow(state);
    if (home) return home;
  }

  const vector = vectorFromPoints(state, "rapier_guidance_x", "rapier_guidance_z");
  if (!vector) return phase >= 12 ? homeVectorRow(state) : null;
  const leg = upperToken(state?.rapier_circuit_leg).replaceAll("_", " ");
  const label = state?.rapier_pattern_only === true && leg
    ? leg
    : phase >= 11 ? "HOME" : "MISSION TRACK";
  const line = vectorLine(label, vector.bearingDeg, vector.rangeNm);
  return line ? { line, tone: "steady" } : null;
}

function droneVectorRow(state) {
  if (state?.drone_raid_finished === true) return homeVectorRow(state);
  const vector = vectorFromPoints(state, "bx", "bz");
  const rangeM = finite(state?.range_m);
  if (!vector && rangeM === null) return null;
  const target = Math.max(1,
    Math.trunc(finite(state?.drone_raid_active_target) ?? 1));
  const line = vectorLine(
    `RAIDER ${target}`,
    vector?.bearingDeg ?? null,
    rangeM === null ? vector?.rangeNm ?? null : rangeM / 1852,
  );
  return line ? { line, tone: "steady" } : null;
}

export function navigateRow(state) {
  if (missionKind(state) === "rapier") return rapierVectorRow(state);
  if (missionKind(state) === "drone") {
    const raider = droneVectorRow(state);
    if (raider) return raider;
  }
  return homeVectorRow(state);
}

function communicationPosture(state) {
  if (missionKind(state) === "dogfight") {
    const egressing = state?.player_rtb_active === true
      || state?.combat_handoff_requested === true
      || state?.combat_handoff_active === true;
    return { audience: "PACKAGE", posture: egressing ? "EGRESSING" : "ENGAGING" };
  }
  if (missionKind(state) === "drone") {
    return {
      audience: "CONTROL",
      posture: state?.drone_raid_finished === true ? "RAID COMPLETE" : "INTERCEPTING",
    };
  }
  if (missionKind(state) !== "rapier") return null;

  const phase = Math.trunc(finite(state?.rapier_mission_phase) ?? 0);
  if (state?.rapier_pattern_only === true) {
    const leg = upperToken(state?.rapier_circuit_leg).replaceAll("_", " ");
    return leg ? { audience: "TOWER", posture: leg } : null;
  }
  if (phase >= 1 && phase <= 4)
    return { audience: "CONTROL", posture: "DEPARTING" };
  if (phase >= 5 && phase <= 10)
    return { audience: "CONTROL", posture: "INTERCEPTING" };
  if (phase === 11)
    return { audience: "CONTROL", posture: "EGRESSING" };
  if (phase === 12)
    return { audience: "CONTROL", posture: "RTB" };
  if (phase === 13)
    return { audience: "APPROACH", posture: "INBOUND" };
  return null;
}

export function communicateRow(state) {
  const posture = communicationPosture(state);
  const transmitting = state?.radio_active === true;
  if (!posture && !transmitting) return null;

  const audience = transmitting
    ? upperToken(state?.radio_channel) || upperToken(state?.radio_frequency) || "R/T"
    : posture.audience;
  const parts = [audience];
  if (posture?.posture) parts.push(posture.posture);
  if (transmitting) parts.push("AUTO TX");
  return {
    line: parts.join(" · "),
    tone: transmitting ? "active" : "steady",
  };
}

function configurationVerificationRow(state) {
  if (state?.configuration_automatic !== true) return null;
  const transition = state?.configuration_transition === true;
  const target = upperToken(state?.configuration_target);
  const mode = upperToken(state?.mode);
  const recovery = target === "RECOVERY"
    && (mode === "APPROACH" || state?.approach === true);
  if (!transition && !recovery) return null;

  const parts = [recovery ? "RECOVERY" : target || "CONFIG"];
  parts.push(transition ? "AUTO CONFIGURING" : "VERIFY");
  const gear = upperToken(state?.gear_handle);
  if (gear) parts.push(gear === "DOWN" ? "GEAR DN" : "GEAR UP");
  const flapLeft = finite(state?.flap_left_deg);
  const flapRight = finite(state?.flap_right_deg);
  if (state?.has_flaps === true || flapLeft !== null || flapRight !== null) {
    const deflection = Math.max(flapLeft ?? 0, flapRight ?? 0);
    parts.push(deflection > 1 ? "FLAPS LDG" : "FLAPS UP");
  }
  return { line: parts.join(" · "), tone: transition ? "active" : "steady" };
}

export function administrateRow(state) {
  if (state?.checklist_active === true) {
    const total = finite(state?.checklist_total);
    const done = finite(state?.checklist_done) ?? 0;
    if (total !== null && total > 0 && done < total) {
      const name = token(state?.checklist_name)
        || CHECKLIST_NAMES[finite(state?.checklist_id) ?? 0] || "CHECK";
      const next = token(state?.checklist_next);
      // Fuel constraint belongs to Aviate. Do not turn a reserve condition back into a second
      // administrative task simply because the verification director can observe it.
      if (upperToken(next) !== "RESERVE MARGIN") {
        const parts = [`${name} · VERIFY ${done}/${total}`];
        if (next) parts.push(`→ ${next}`);
        return { line: parts.join(" "), tone: "active" };
      }
    }
  }
  return configurationVerificationRow(state);
}

export function closedAncaTone(rows) {
  // The drawer is optional. Another surface's warning or an ordinary standing priority does not
  // light the stowed control; a future ANCA-exclusive condition must opt in explicitly.
  return rows.some((item) => item.notify === true && item.tone === "attention")
    ? "attention" : "quiet";
}

export function deriveAncaView(state) {
  const rows = Object.freeze([
    row("A", "aviate", aviateRow(state)),
    row("N", "navigate", navigateRow(state)),
    row("C", "communicate", communicateRow(state)),
    row("A", "administrate", administrateRow(state)),
  ]);
  const shownRows = Object.freeze(rows.filter((item) => item.shown));
  const visible = Boolean(state)
    && state.ready !== true
    && state.finished !== true;
  return Object.freeze({
    visible,
    tone: closedAncaTone(rows),
    rows,
    shownRows,
  });
}
