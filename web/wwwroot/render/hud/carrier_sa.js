export const CARRIER_PADLOCK_RADIUS_M = 12 * 1852;

const M_TO_FT = 3.280839895;
const DEFAULT_PHASE_ACQUIRE_SECONDS = 0.28;
const DEFAULT_PHASE_MINIMUM_SECONDS = 0.55;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function token(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function indicationDown(value, position) {
  const indication = token(value);
  if (indication.includes("DOWN") || indication === "DN") return true;
  const fraction = finite(position);
  return indication === "" && fraction !== null && fraction >= 0.98;
}

function phaseCue(phase, state, details = {}) {
  const crossM = finite(state?.deck_cross) ?? 0;
  const altitudeFt = details.altitudeFt;
  const iasKts = details.iasKts;
  const configured = details.configured === true;
  const lineup = details.lineup ?? "HOLD LINEUP";

  if (phase === "FINAL") {
    const extended = (finite(state?.deck_along) ?? 0) < -3000;
    return {
      phase,
      lineup,
      title: extended ? "EXTENDED FINAL" : "FINAL · BALL",
      instruction: `${lineup} · ON-SPEED AOA · NO FLARE`,
    };
  }
  if (phase === "180") {
    return {
      phase,
      lineup: null,
      title: "THE 180",
      instruction: "600 FT · ON-SPEED · START DESCENT",
    };
  }
  if (phase === "DOWNWIND") {
    let instruction = "ABEAM · 600 FT · 140 KIAS";
    if (!configured) instruction = "GEAR / FLAP · 600 FT · 140 KIAS";
    else if (altitudeFt !== null && altitudeFt > 700) instruction = "DESCEND 600 FT · HOLD 140 KIAS";
    else if (altitudeFt !== null && altitudeFt < 500) instruction = "CLIMB 600 FT · HOLD 140 KIAS";
    else if (iasKts !== null && iasKts > 155) instruction = "SLOW 140 KIAS · HOLD 600 FT";
    return { phase, lineup: null, title: "PORT DOWNWIND", instruction };
  }
  if (phase === "INITIAL") {
    let instruction = "800 FT · 350 KIAS · BREAK LEFT ABM BOW";
    if (altitudeFt !== null && altitudeFt > 950) instruction = "DESCEND 800 FT · HOLD 350 KIAS";
    else if (altitudeFt !== null && altitudeFt < 650) instruction = "CLIMB 800 FT · HOLD 350 KIAS";
    else if (iasKts !== null && iasKts < 325) instruction = "ACCELERATE 350 KIAS · HOLD 800 FT";
    else if (iasKts !== null && iasKts > 375) instruction = "SLOW 350 KIAS · HOLD 800 FT";
    return { phase, lineup: null, title: "INITIAL", instruction };
  }
  if (phase === "WAVE-OFF") {
    return {
      phase,
      lineup: null,
      title: "WAVE-OFF",
      instruction: "POWER · CLIMB AHEAD · CLEAN UP WHEN SAFE",
    };
  }

  const side = crossM > 450 ? "COME LEFT" : crossM < -1200 ? "COME RIGHT" : "";
  return {
    phase: "JOIN",
    lineup: null,
    title: "JOIN PORT PATTERN",
    instruction: `${side ? `${side} · ` : ""}INTERCEPT INITIAL · 800 FT · 350 KIAS`,
  };
}

export function carrierDistanceM(state = {}) {
  if (!state || typeof state !== "object") return null;
  const px = finite(state.px);
  const py = finite(state.py);
  const pz = finite(state.pz);
  const cx = finite(state.cx);
  const cy = finite(state.cy);
  const cz = finite(state.cz);
  if ([px, py, pz, cx, cy, cz].some((value) => value === null)) return null;
  return Math.hypot(px - cx, py - cy, pz - cz);
}

export function carrierPadlockEligible(state = {}, radiusM = CARRIER_PADLOCK_RADIUS_M) {
  if (!state || typeof state !== "object" || state.carrier !== true) return false;
  if (state.replay_external === true || state.finished === true
      || state.terminal_phase_active === true || token(state.mode) === "TERMINAL") return false;
  const distanceM = carrierDistanceM(state);
  return distanceM !== null && distanceM <= radiusM;
}

export function contextualPadlockTarget(state = {}) {
  return carrierPadlockEligible(state) ? "carrier" : "bandit";
}

export function padlockTargetValid(state = {}, target = "bandit") {
  if (!state || typeof state !== "object" || state.replay_external === true
      || state.finished === true || state.terminal_phase_active === true
      || token(state.mode) === "TERMINAL") return false;
  if (target === "carrier") return carrierPadlockEligible(state);
  return [state.bx, state.by, state.bz].every((value) => finite(value) !== null)
    && state.opponent_body_present !== false;
}

export function carrierRelativeMotion(state = {}) {
  if (!state || typeof state !== "object") {
    return { alongMps: null, crossMps: null, trackRad: null };
  }
  const heading = finite(state.landing_heading);
  const vx = finite(state.deck_vx);
  const vz = finite(state.deck_vz);
  if (heading === null || vx === null || vz === null) {
    return { alongMps: null, crossMps: null, trackRad: null };
  }
  const alongMps = vx * Math.sin(heading) + vz * Math.cos(heading);
  const crossMps = vx * Math.cos(heading) - vz * Math.sin(heading);
  return { alongMps, crossMps, trackRad: Math.atan2(crossMps, alongMps) };
}

export function carrierLandingConfigured(state = {}) {
  if (!state || typeof state !== "object") return false;
  const gearDown = [
    indicationDown(state.gear_nose_indication, state.gear_nose),
    indicationDown(state.gear_left_indication, state.gear_left),
    indicationDown(state.gear_right_indication, state.gear_right),
  ].every(Boolean);
  const flapLeft = finite(state.flap_left_deg);
  const flapRight = finite(state.flap_right_deg);
  const flapsSet = flapLeft !== null && flapRight !== null
    && Math.min(flapLeft, flapRight) >= 20;
  return gearDown && flapsSet;
}

export function carrierConfigurationCue(systems = {}) {
  const gear = systems?.gear ?? {};
  const legs = [gear.nose, gear.left, gear.right];
  const gearAvailable = systems?.gearAvailable === true;
  const gearLocked = gearAvailable && legs.every((leg) => leg?.state === "down");
  const legText = (leg) => typeof leg?.text === "string" && leg.text ? leg.text : "--";
  const gearText = gearAvailable
    ? `GEAR N:${legText(gear.nose)} L:${legText(gear.left)} R:${legText(gear.right)}`
    : "GEAR --";

  const left = finite(systems?.flapLeftDeg);
  const right = finite(systems?.flapRightDeg);
  const split = systems?.flapSplit === true
    || (left !== null && right !== null && Math.abs(left - right) > 2);
  let flapText = "FLAP --";
  if (left !== null && right !== null) {
    flapText = split
      ? `FLAP L:${Math.round(left)}° R:${Math.round(right)}° SPLIT`
      : `FLAP ${Math.round((left + right) / 2)}°`;
  } else if (left !== null || right !== null) {
    flapText = `FLAP L:${left === null ? "--" : `${Math.round(left)}°`} R:${right === null ? "--" : `${Math.round(right)}°`}`;
  }
  return {
    gearText,
    gearLocked,
    flapText,
    flapSplit: split,
    flapsKnown: left !== null || right !== null,
  };
}

// On-speed AoA is recovery guidance, not a generic energy judgement. Calling a correctly flown
// 350-knot initial "FAST" teaches the wrong task, so expose the indexer only after the pilot has
// entered the landing pattern (and retain it through a wave-off).
export function carrierAoARelevant(phase) {
  return ["DOWNWIND", "180", "FINAL", "WAVE-OFF"].includes(token(phase));
}

function lineupCue(crossM, previousLineup = null) {
  if (previousLineup === "COME LEFT" && crossM > 6) return "COME LEFT";
  if (previousLineup === "COME RIGHT" && crossM < -6) return "COME RIGHT";
  if (crossM > 14) return "COME LEFT";
  if (crossM < -14) return "COME RIGHT";
  return "HOLD LINEUP";
}

// Candidate pattern phase from authoritative deck-frame truth. Relative track distinguishes a
// 350-knot initial from a 140-knot final at the same astern position; previousPhase widens only the
// active gate, providing spatial/energy hysteresis before the display qualifier adds dwell.
export function carrierPatternCue(state = {}, options = {}) {
  const alongM = finite(state?.deck_along);
  const crossM = finite(state?.deck_cross);
  if (alongM === null || crossM === null) return phaseCue("JOIN", state);

  const previousPhase = token(options.previousPhase);
  const previousLineup = options.previousLineup ?? null;
  const mode = token(state.mode);
  const iasKts = finite(state.indicated_airspeed_kts) ?? finite(state.speed_kts);
  const altitudeFt = finite(state.deck_height) === null
    ? finite(state.radar_alt_ft) ?? finite(state.alt_ft)
    : finite(state.deck_height) * M_TO_FT;
  const motion = carrierRelativeMotion(state);
  const alongMps = motion.alongMps;
  const crossMps = motion.crossMps;
  // `deck_closure_kts` is the simulation's authoritative projection on the active landing line.
  // Prefer it over reconstructing closure from rounded world-vector components: close to the ship,
  // a stale/missing component must not turn a configured inbound aircraft into a 350-knot join.
  const closureKts = finite(state.deck_closure_kts);
  const closureMps = closureKts === null ? alongMps : closureKts / 1.94384;
  const inbound = closureMps === null ? null
    : closureMps > (previousPhase === "FINAL" ? 3 : 7);
  const outbound = closureMps !== null
    && closureMps < (previousPhase === "DOWNWIND" ? 3 : -5);
  const configured = carrierLandingConfigured(state);
  const approachMode = state.approach === true || mode === "APPROACH";
  const approachEnergy = iasKts !== null
    && iasKts <= (previousPhase === "FINAL" ? 205 : 190);
  const initialEnergy = iasKts !== null
    && iasKts >= (previousPhase === "INITIAL" ? 215 : 240);
  const initialAltitude = altitudeFt === null
    || (altitudeFt >= (previousPhase === "INITIAL" ? 500 : 600)
      && altitudeFt <= (previousPhase === "INITIAL" ? 1350 : 1200));
  const patternAltitude = altitudeFt === null
    || (altitudeFt >= 300 && altitudeFt <= 1100);
  const details = {
    altitudeFt,
    iasKts,
    configured,
    lineup: lineupCue(crossM, previousLineup),
  };

  if (mode === "WAVE-OFF" || mode === "BOLTER") return phaseCue("WAVE-OFF", state, details);

  const finalCrossLimit = previousPhase === "FINAL" ? 450 : 360;
  // Keep final guidance through the ramp and wire area. The old -350 m upper bound dropped a
  // correctly configured aircraft into JOIN during the most workload-intensive final seconds.
  // +30 m matches the simulation's authoritative approach-slot boundary; wave-off and bolter
  // states are already handled above.
  const finalGeometry = alongM <= 30 && alongM > -12_000
    && Math.abs(crossM) <= finalCrossLimit;
  // Inside roughly one mile, landing configuration + approach energy is sufficient recovery
  // intent even if a frame arrives without closure. Wave-off/bolter modes are handled above.
  const closeConfiguredFinal = alongM > -1852 && configured && approachEnergy;
  if (finalGeometry && (inbound === true || inbound === null && closeConfiguredFinal)
      && (approachMode || approachEnergy && (configured || patternAltitude))) {
    return phaseCue("FINAL", state, details);
  }

  const initialCrossLimit = previousPhase === "INITIAL" ? 800 : 650;
  const initialGeometry = alongM >= -7000 && alongM <= 1200
    && crossM >= -180 && crossM <= initialCrossLimit;
  if (mode !== "APPROACH" && initialGeometry && inbound && initialEnergy && initialAltitude) {
    return phaseCue("INITIAL", state, details);
  }

  const portGate = previousPhase === "DOWNWIND" || previousPhase === "180" ? -300 : -380;
  if (crossM < portGate && alongM < -600 && alongM > -3200
      && patternAltitude && crossMps !== null
      && crossMps > (previousPhase === "180" ? -1 : 2)) {
    return phaseCue("180", state, details);
  }
  if (crossM < portGate && alongM >= -2200 && alongM <= 1900
      && patternAltitude && outbound) {
    return phaseCue("DOWNWIND", state, details);
  }

  return phaseCue("JOIN", state, details);
}

export class CarrierPatternCueQualifier {
  constructor({
    acquireSeconds = DEFAULT_PHASE_ACQUIRE_SECONDS,
    minimumSeconds = DEFAULT_PHASE_MINIMUM_SECONDS,
  } = {}) {
    this.acquireSeconds = Math.max(0, finite(acquireSeconds) ?? DEFAULT_PHASE_ACQUIRE_SECONDS);
    this.minimumSeconds = Math.max(0, finite(minimumSeconds) ?? DEFAULT_PHASE_MINIMUM_SECONDS);
    this.reset();
  }

  reset() {
    this.current = null;
    this.currentSeconds = 0;
    this.pending = null;
    this.pendingSeconds = 0;
  }

  update(state = {}, deltaSeconds = 0) {
    const dt = Math.min(0.25, Math.max(0, finite(deltaSeconds) ?? 0));
    const candidate = carrierPatternCue(state, {
      previousPhase: this.current?.phase,
      previousLineup: this.current?.lineup,
    });
    if (!this.current) {
      this.current = candidate;
      this.currentSeconds = 0;
      return this.current;
    }

    this.currentSeconds += dt;
    if (candidate.phase === this.current.phase) {
      this.current = candidate;
      this.pending = null;
      this.pendingSeconds = 0;
      return this.current;
    }

    if (this.pending?.phase !== candidate.phase) {
      this.pending = candidate;
      this.pendingSeconds = 0;
    } else {
      this.pending = candidate;
    }
    this.pendingSeconds += dt;
    if (this.currentSeconds >= this.minimumSeconds
        && this.pendingSeconds >= this.acquireSeconds) {
      this.current = this.pending;
      this.currentSeconds = 0;
      this.pending = null;
      this.pendingSeconds = 0;
    }
    return this.current;
  }
}
