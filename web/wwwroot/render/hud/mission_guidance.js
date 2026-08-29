export const FIRST_RUN_VALLEY_MISSION_ID =
  "mission.modern.visual-merge.first-run-valley.v1";
export const TOP_GUN_MISSION_ID = "mission.top-gun.acm.f14a-vs-mig28.v1";

const RECOVERY_OWNED_MODES = new Set([
  "APPROACH",
  "WAVE-OFF",
  "BOLTER",
  "ARRESTED",
  "STOPPED",
  "CATAPULT",
  "BARRIER",
]);

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function token(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function inset(value) {
  const number = finiteNumber(value);
  return number === null ? 0 : Math.max(0, number);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function action(label, {
  control = null,
  desktopLabel = null,
  touchLabel = null,
} = {}) {
  return Object.freeze({ label, control, desktopLabel, touchLabel });
}

function cue({
  id,
  phase,
  objective,
  status,
  primaryAction,
  secondaryAction = null,
  level = "normal",
  compactText,
  interactive = false,
}) {
  return Object.freeze({
    id,
    phase,
    objective,
    status,
    primaryAction,
    secondaryAction,
    level,
    compactText,
    interactive,
  });
}

/**
 * Consumes the durable valley gate when present and retains the short authority release edge for
 * older recordings. Magazine depletion remains a recovery fact for late legacy HUD mounts; a
 * refilled two-round load resets recordings which do not publish the new gate.
 */
export class FirstRunWeaponsActionabilityLatch {
  constructor() {
    this.reset();
  }

  reset() {
    this.identity = "";
    this.actionable = false;
    this.lastAim9Remaining = null;
  }

  update(state = {}) {
    if (state?.mission_definition_id !== FIRST_RUN_VALLEY_MISSION_ID) {
      this.reset();
      return false;
    }

    const identityValue = state?.player_entity_id
      ?? state?.player_spawn_sequence
      ?? state?.sortie_id
      ?? "legacy";
    const identity = `${FIRST_RUN_VALLEY_MISSION_ID}:${identityValue}`;
    if (identity !== this.identity) {
      this.identity = identity;
      this.actionable = false;
      this.lastAim9Remaining = null;
    }

    const remaining = finiteNumber(state?.aim9_remaining);
    // Build 346 publishes the valley gate as a durable authority fact. Prefer it over both the
    // generic visual-merge inhibit (a different rule) and the short WEAPONS HOT announcement.
    // The edge/magazine fallback below remains for old incident recordings and mixed-version
    // reconnects which predate the field.
    if (state?.first_run_weapons_cold === true) {
      this.actionable = false;
      this.lastAim9Remaining = remaining;
      return false;
    }
    if (state?.first_run_weapons_cold === false) {
      this.actionable = true;
      this.lastAim9Remaining = remaining;
      return true;
    }
    if (remaining === 2 && this.lastAim9Remaining !== null
        && this.lastAim9Remaining < 2
        && state?.aim9_in_flight !== true) {
      this.actionable = false;
    }

    const transition = String(state?.transition_cue ?? "").toUpperCase();
    const explicitRelease = transition.includes("WEAPONS HOT")
      && transition.includes("FOX TWO");
    if (explicitRelease || state?.aim9_in_flight === true
        || (remaining !== null && remaining < 2)) {
      this.actionable = true;
    }
    this.lastAim9Remaining = remaining;
    return this.actionable;
  }
}

/** Terminal snapshots must never retain an in-flight objective or RTB card. */
export function flightHudIsTerminal(state = {}) {
  return state?.terminal_phase_active === true
    || state?.finished === true
    || token(state?.mode) === "TERMINAL";
}

/**
 * The valley ingress teaches terrain following before weapon employment. Combat contacts still
 * exist in authority, but presenting brackets, range and a firing solution before the pop-out
 * contradicts that lesson and crowds the route cues the pilot needs to follow.
 */
export function firstRunCombatPresentationSuppressed(state = {}) {
  return state?.mission_definition_id === FIRST_RUN_VALLEY_MISSION_ID
    && state?.first_run_weapons_cold === true;
}

/** Top Gun owns an exceptional R = Fox Two binding while ordinary sorties keep R = Restart. */
export function topGunControlQuicklookPresentation(state = {}, {
  fireBinding = "F",
  rtbBinding = "O",
} = {}) {
  if (state?.mission_definition_id !== TOP_GUN_MISSION_ID) return null;
  const remaining = finiteNumber(state?.aim9_remaining);
  const foxTwo = remaining === null
    ? "R FOX TWO" : `R FOX TWO ×${Math.max(0, Math.trunc(remaining))}`;
  return Object.freeze({
    weapons: `${String(fireBinding || "F").trim()} GUNS · ${foxTwo}`,
    foxTwo,
    returnToCarrier: `${String(rtbBinding || "O").trim()} RTB TO CARRIER`,
  });
}

/** Recovery symbology owns next-action guidance once the aircraft enters the procedure. */
export function recoveryGuidanceOwnsMissionCue(state = {}) {
  return (state?.approach_guidance_active === true && state?.approach_valid === true)
    || RECOVERY_OWNED_MODES.has(token(state?.mode));
}

/**
 * Shared in-flight objective hierarchy for visual-merge sorties.
 *
 * This is presentation-only: every action is derived from published authority. In particular,
 * first-run Fire remains one control with three truthful states — missile 1, missile 2, then
 * guns — and an active recovery procedure displaces the combat card instead of competing with it.
 */
export function flightMissionGuidance(state = {}, {
  firstRunWeaponsActionable = false,
} = {}) {
  if (state?.visual_merge_evaluation !== true || flightHudIsTerminal(state)
      || recoveryGuidanceOwnsMissionCue(state)) return null;

  const topGun = state?.mission_definition_id === TOP_GUN_MISSION_ID;
  if (topGun) {
    if (state?.player_rtb_active === true) {
      return cue({
        id: "top-gun-rtb",
        phase: "rtb",
        objective: "RETURN TO THE CARRIER",
        status: "CASE I RETURN ROUTE ACTIVE",
        primaryAction: action("FOLLOW NAV TO THE INITIAL"),
        compactText: "RTB · RETURN TO CARRIER",
      });
    }

    const handoffPhase = token(state?.combat_handoff_phase_name
      ?? state?.combat_handoff_phase);
    const rtbAvailable = state?.rtb_available === true
      || finiteNumber(state?.combat_handoff_phase) === 1
      || handoffPhase === "AVAILABLE";
    const replacementPending = state?.opponent_replacement_pending === true;
    if (replacementPending) {
      const seconds = Math.max(0, finiteNumber(state?.opponent_replacement_s) ?? 0);
      return cue({
        id: "top-gun-replacement",
        phase: "decision",
        objective: "CONTINUE OR RECOVER",
        status: `NEXT BANDIT IN ${seconds.toFixed(1)} SEC`,
        primaryAction: action("STAY FOR NEXT ENGAGEMENT"),
        secondaryAction: rtbAvailable
          ? action("RTB TO CARRIER", { control: "rtb" }) : null,
        compactText: rtbAvailable
          ? `NEXT BANDIT ${seconds.toFixed(1)} S · RTB AVAILABLE`
          : `NEXT BANDIT ${seconds.toFixed(1)} S`,
      });
    }

    if (rtbAvailable) {
      const engagement = Math.max(1,
        Math.trunc(finiteNumber(state?.engagement_number) ?? 1));
      return cue({
        id: "top-gun-continue",
        phase: "decision",
        objective: "CONTINUE OR RECOVER",
        status: `ENGAGEMENT ${engagement} · BANDIT LIVE`,
        primaryAction: action("CONTINUE THE FIGHT"),
        secondaryAction: action("RTB TO CARRIER", { control: "rtb" }),
        compactText: "CONTINUE FIGHT · RTB AVAILABLE",
      });
    }

    if (state?.aim9_in_flight === true) {
      return cue({
        id: "top-gun-fox-two-in-flight",
        phase: "attack",
        objective: "ENGAGE THE BANDIT",
        status: "FOX TWO IN FLIGHT",
        primaryAction: action("TRACK THE TARGET"),
        compactText: "FOX TWO IN FLIGHT · TRACK",
      });
    }

    const aim9Remaining = Math.max(0,
      Math.trunc(finiteNumber(state?.aim9_remaining) ?? 0));
    return cue({
      id: "top-gun-engage",
      phase: "attack",
      objective: "ENGAGE THE BANDIT",
      status: aim9Remaining > 0 ? `GUNS HOT · FOX TWO ×${aim9Remaining}` : "GUNS ONLY",
      primaryAction: action("FIRE GUNS ON SOLUTION", { control: "fire" }),
      secondaryAction: aim9Remaining > 0
        ? action("LAUNCH FOX TWO", { control: "fox-two" }) : null,
      compactText: aim9Remaining > 0
        ? `GUNS · FOX TWO ×${aim9Remaining}` : "GUNS · FIRE ON SOLUTION",
    });
  }

  const firstRunValley = state?.mission_definition_id === FIRST_RUN_VALLEY_MISSION_ID;
  if (firstRunValley) {
    if (state?.player_rtb_active === true) {
      return cue({
        id: "first-run-rtb",
        phase: "rtb",
        objective: "RETURN TO BASE",
        status: "ROUTE HOME ACTIVE",
        primaryAction: action("FOLLOW ROUTE TO RECOVERY"),
        compactText: "RTB · FOLLOW THE ROUTE",
      });
    }

    // SnapshotProjection's generic visual-merge `weapons_inhibited` field describes the merge
    // evaluator, not the separate valley interlock. The renderer therefore latches the explicit
    // WEAPONS HOT authority transition and supplies that fact here. Magazine count alone must not
    // promote the cue while the opening pair is still parked beyond the pop-out.
    if (firstRunWeaponsActionable !== true) {
      return cue({
        id: "first-run-ingress",
        phase: "ingress",
        objective: "REACH THE POP-OUT",
        status: "WEAPONS SAFE · ARM AT POP-OUT",
        primaryAction: action("FOLLOW VALLEY NORTH"),
        level: "caution",
        compactText: "FOLLOW VALLEY · WEAPONS SAFE",
      });
    }

    if (state?.weapons_inhibited === true) {
      return cue({
        id: "first-run-safe",
        phase: "attack",
        objective: "HOLD THE POP-OUT",
        status: "WEAPONS SAFE",
        primaryAction: action("WAIT FOR WEAPONS RELEASE"),
        level: "caution",
        compactText: "WEAPONS SAFE · HOLD FIRE",
      });
    }

    const rawRemaining = finiteNumber(state?.aim9_remaining);
    if (rawRemaining === null) {
      return cue({
        id: "first-run-weapon-sync",
        phase: "attack",
        objective: "DESTROY THE TARGETS",
        status: "WEAPON STATE SYNCING",
        primaryAction: action("HOLD FIRE"),
        level: "caution",
        compactText: "WEAPON STATE · SYNC",
      });
    }

    const aim9Remaining = clamp(Math.trunc(rawRemaining), 0, 2);
    if (aim9Remaining > 0 && state?.aim9_in_flight === true) {
      return cue({
        id: "first-run-missile-in-flight",
        phase: "attack",
        objective: "DESTROY THE TARGETS",
        status: "FOX 2 IN FLIGHT",
        primaryAction: action("TRACK · WAIT FOR CLEAR"),
        compactText: "FOX TWO IN FLIGHT · TRACK",
      });
    }

    if (aim9Remaining > 0) {
      const missileNumber = aim9Remaining >= 2 ? 1 : 2;
      return cue({
        id: `first-run-missile-${missileNumber}`,
        phase: "attack",
        objective: "DESTROY THE TARGETS",
        status: "FOX 2 SELECTED",
        primaryAction: action(`FIRE MISSILE ${missileNumber} OF 2`, { control: "fire" }),
        compactText: `FOX TWO ×${aim9Remaining} · FIRE`,
      });
    }

    return cue({
      id: "first-run-guns",
      phase: "attack",
      objective: "DESTROY THE TARGETS",
      status: state?.aim9_in_flight === true
        ? "GUNS SELECTED · MISSILE 2 AWAY" : "GUNS SELECTED",
      primaryAction: action("FIRE GUNS", { control: "fire" }),
      secondaryAction: state?.rtb_available === true
        ? action("RTB AVAILABLE", {
          control: "rtb",
          touchLabel: "RTB AVAILABLE IN PAUSE",
        })
        : null,
      compactText: state?.rtb_available === true
        ? "GUNS · FIRE / RTB · O"
        : "GUNS · FIRE · SPLASH TARGET",
    });
  }

  if (state?.weapons_inhibited === true) {
    return cue({
      id: "visual-merge-safe",
      phase: "merge",
      objective: "COMPLETE THE FIRST PASS",
      status: "GUNS SAFE",
      primaryAction: action("SELECT CUE TO ARM", {
        control: "cue",
        desktopLabel: "CLICK CUE TO ARM",
        touchLabel: "TAP CUE TO ARM",
      }),
      level: "caution",
      compactText: "GUNS SAFE · FIRST PASS",
      interactive: true,
    });
  }
  if (state?.player_trigger_interlocked === true) {
    return cue({
      id: "visual-merge-trigger-interlock",
      phase: "merge",
      objective: "ARM THE GUN",
      status: "TRIGGER INTERLOCK",
      primaryAction: action("RELEASE FIRE CONTROL"),
      level: "warning",
      compactText: "RELEASE TRIGGER TO ARM",
    });
  }
  if (state?.weapons_hot_cue === true) {
    return cue({
      id: "visual-merge-hot",
      phase: "attack",
      objective: "ENGAGE THE BANDIT",
      status: "GUNS HOT",
      primaryAction: action("FIRE ON SOLUTION", { control: "fire" }),
      compactText: "GUNS HOT",
    });
  }
  return null;
}

/** Resolve keyboard versus touch wording without leaking input policy into the state projector. */
export function missionGuidanceActionText(actionPresentation, {
  touchMode = false,
  fireBinding = "F",
  rtbBinding = "O",
  foxTwoBinding = "R",
} = {}) {
  if (!actionPresentation) return "";
  if (touchMode && actionPresentation.touchLabel) return actionPresentation.touchLabel;
  if (!touchMode && actionPresentation.desktopLabel) return actionPresentation.desktopLabel;
  if (touchMode || actionPresentation.control === null
      || actionPresentation.control === "cue") return actionPresentation.label;
  const binding = actionPresentation.control === "rtb" ? rtbBinding
    : actionPresentation.control === "fox-two" ? foxTwoBinding : fireBinding;
  return `${String(binding || "").trim()} · ${actionPresentation.label}`;
}

/**
 * Responsive geometry for the two-level card. The card stays above touch controls, inside safe
 * insets, and collapses from three rows to two before it can cover the short-landscape gunsight.
 */
export function missionGuidanceLayout({
  width,
  height,
  touchMode = false,
  safeInsets = {},
  secondaryBottom = null,
} = {}) {
  const viewportWidth = Math.max(1, finiteNumber(width) ?? 1);
  const viewportHeight = Math.max(1, finiteNumber(height) ?? 1);
  const safe = {
    top: inset(safeInsets.top),
    right: inset(safeInsets.right),
    bottom: inset(safeInsets.bottom),
    left: inset(safeInsets.left),
  };
  const availableWidth = Math.max(1, viewportWidth - safe.left - safe.right);
  const dense = viewportHeight < 440;
  const compact = dense || touchMode || availableWidth < 620;
  const showDetail = !dense && availableWidth >= 420;
  const cardHeight = showDetail ? 56 : dense ? 38 : 44;
  const maximumWidth = Math.max(1, availableWidth - 20);
  const cardWidth = Math.min(compact ? 460 : 520, maximumWidth);
  const fallbackBottom = viewportHeight - safe.bottom - (touchMode ? 108 : 18);
  const requestedBottom = finiteNumber(secondaryBottom) ?? fallbackBottom;
  const minimumBottom = safe.top + cardHeight + 8;
  const maximumBottom = Math.max(minimumBottom, viewportHeight - safe.bottom - 8);
  const bottom = clamp(requestedBottom, minimumBottom, maximumBottom);

  return Object.freeze({
    x: (viewportWidth - cardWidth) / 2,
    y: bottom - cardHeight,
    width: cardWidth,
    height: cardHeight,
    compact,
    dense,
    showDetail,
    bottom,
  });
}
