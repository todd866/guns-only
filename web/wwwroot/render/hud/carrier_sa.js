export const CARRIER_PADLOCK_RADIUS_M = 12 * 1852;
export const CARRIER_PADLOCK_RELEASE_RADIUS_M = 13 * 1852;

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

// `carrier` is the legacy maritime-presence flag. New recovery sites publish the shared
// `recovery_platform` contract and use `carrier` only to distinguish a ship from a fixed strip.
export function recoveryPlatformAvailable(state = {}) {
  return state?.recovery_platform === true || state?.carrier === true;
}

export function recoveryPlatformIsMaritime(state = {}) {
  return state?.carrier === true || token(state?.platform_kind) === "SHIP";
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
  const maritime = recoveryPlatformIsMaritime(state);

  if (phase === "FINAL") {
    const extended = (finite(state?.deck_along) ?? 0) < -3000;
    return {
      phase,
      lineup,
      title: extended ? "EXTENDED FINAL" : maritime ? "FINAL · BALL" : "FINAL · STRIP",
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
    return {
      phase,
      lineup: null,
      title: maritime ? "PORT DOWNWIND" : "LEFT DOWNWIND",
      instruction,
    };
  }
  if (phase === "INITIAL") {
    let instruction = `800 FT · 350 KIAS · BREAK LEFT ABM ${maritime ? "BOW" : "THRESHOLD"}`;
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
    title: maritime ? "JOIN PORT PATTERN" : "JOIN LEFT PATTERN",
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
  if (!state || typeof state !== "object" || !recoveryPlatformAvailable(state)) return false;
  if (state.replay_external === true || state.finished === true
      || state.terminal_phase_active === true || token(state.mode) === "TERMINAL") return false;
  const distanceM = carrierDistanceM(state);
  return distanceM !== null && distanceM <= radiusM;
}

function banditPadlockEligible(state = {}) {
  if (!state || typeof state !== "object" || state.replay_external === true
      || state.finished === true || token(state.mode) === "TERMINAL") return false;
  // NOT gated on terminal_phase_active. That flag is SESSION scope — it is true whenever anyone
  // in the sortie is in a terminal state — and in a formation fight the leader dying sets it while
  // a wingman is still shooting at you. Gating on it invalidated every padlock the moment the
  // pilot got their first kill: press V, acquire, and the next frame released it as "target
  // unavailable". That is the "after splash I can't cycle to the remaining dude" report.
  //
  // Liveness is per-contact and already on the wire, so ask about THIS contact instead.
  return [state.bx, state.by, state.bz].every((value) => finite(value) !== null)
    && state.opponent_body_present !== false
    && state.bandit_alive !== false
    && state.opponent_alive !== false;
}

function carrierRecoveryIntent(state = {}) {
  const mode = token(state?.mode);
  return state?.maintenance_scenario === true
    || state?.approach === true
    || ["APPROACH", "WAVE-OFF", "BOLTER", "BARRIER", "ARRESTED", "STOPPED", "CATAPULT"].includes(mode)
    || token(state?.configuration_target) === "RECOVERY";
}

export function carrierPadlockSupersededByCombat(state = {}) {
  if (circuitsPatternOnly(state)) return false;
  return carrierPadlockEligible(state, CARRIER_PADLOCK_RELEASE_RADIUS_M)
    && banditPadlockEligible(state)
    && !carrierRecoveryIntent(state);
}

export function circuitsPatternOnly(state = {}) {
  return state?.rapier_pattern_only === true;
}

export function circuitsPadlockTargets(state = {}) {
  const targets = ["carrier"];
  if (state?.w1_present === 1 && state?.w1_alive === 1) targets.push("wingman");
  if (state?.w2_present === 1 && state?.w2_alive === 1) targets.push("traffic2");
  if (state?.w3_present === 1 && state?.w3_alive === 1) targets.push("traffic3");
  return targets;
}

/// Slot 1 → wingman/w1, slot 2 → traffic2/w2, slot 3 → traffic3/w3.
export function circuitTrafficPadlockAvailable(state = {}, slot = 1) {
  if (slot === 1) return state?.w1_present === 1 && state?.w1_alive === 1;
  if (slot === 2) return state?.w2_present === 1 && state?.w2_alive === 1;
  if (slot === 3) return state?.w3_present === 1 && state?.w3_alive === 1;
  return false;
}

export function contextualPadlockTarget(state = {}) {
  if (circuitsPatternOnly(state) && carrierPadlockEligible(state)) return "carrier";
  const carrierAvailable = carrierPadlockEligible(state);
  const banditAvailable = banditPadlockEligible(state);
  return carrierAvailable && (carrierRecoveryIntent(state) || !banditAvailable)
    ? "carrier" : "bandit";
}

export function padlockTargetValid(state = {}, target = "bandit") {
  // See banditPadlockEligible: terminal_phase_active is session scope and must not decide whether
  // a specific, living contact can be tracked.
  if (!state || typeof state !== "object" || state.replay_external === true
      || state.finished === true || token(state.mode) === "TERMINAL") return false;
  // Acquisition remains the deliberate 12 NM gate. Once selected, one mile of release
  // hysteresis prevents normal ship/aircraft motion at the boundary from chattering the view.
  // A selected recovery platform must not survive the authoritative transition back to combat when
  // a live bandit is available: release it, then let the pilot deliberately reacquire the threat.
  if (target === "carrier") {
    if (circuitsPatternOnly(state)) {
      return carrierPadlockEligible(state, CARRIER_PADLOCK_RELEASE_RADIUS_M);
    }
    return carrierPadlockEligible(state, CARRIER_PADLOCK_RELEASE_RADIUS_M)
      && !carrierPadlockSupersededByCombat(state);
  }
  // A formation's second aircraft is only a valid lock while it is actually out there and alive.
  // When it is shot down — or promoted into the primary slot after the leader dies — the lock
  // releases and the pilot reacquires deliberately, exactly as it works for the primary.
  if (target === "wingman") return state.w1_present === 1 && state.w1_alive === 1;
  if (target === "traffic2") return state.w2_present === 1 && state.w2_alive === 1;
  if (target === "traffic3") return state.w3_present === 1 && state.w3_alive === 1;
  if (circuitsPatternOnly(state)) return false;
  return banditPadlockEligible(state);
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
  // The simulation exits APPROACH as the aircraft passes +30 m. If a fresh padlock is acquired
  // immediately after an overflight, infer the missed approach from observable aircraft truth
  // instead of sending a low, dirty jet to a 350-knot initial. The DOWN handle deliberately
  // distinguishes this from a post-catapult departure whose gear may still be in transit.
  const missedApproach = alongM > 30 && alongM <= 500
    && Math.abs(crossM) <= finalCrossLimit
    && inbound === true
    && approachEnergy
    && configured
    && token(state.gear_handle) === "DOWN";
  if (missedApproach) return phaseCue("WAVE-OFF", state, details);

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
