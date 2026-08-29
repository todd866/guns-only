/**
 * Pure presentation model for the Cobra result card.
 *
 * The ground war and the aircraft recovery are separate outcomes. Once the ground-war
 * authority has published victory or defeat, a later airframe loss must not overwrite that
 * strategic result with a generic crash card.
 */

const STRATEGIC_OUTCOMES = new Set(["victory", "defeat"]);

function outcomeToken(value) {
  const token = typeof value === "string" ? value.trim().toLowerCase() : "";
  return STRATEGIC_OUTCOMES.has(token) ? token : null;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function nonNegativeCount(value) {
  return Math.round(nonNegativeNumber(value));
}

function strategicOutcome(war, status) {
  return outcomeToken(war?.outcome)
    ?? outcomeToken(war?.debrief?.outcome)
    ?? outcomeToken(status);
}

function strategicOutcomeReason(war) {
  return String(war?.outcome_reason ?? war?.debrief?.outcome_reason ?? "")
    .trim()
    .toLowerCase();
}

function clockText(seconds) {
  const total = Math.round(nonNegativeNumber(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const GARRISON_SUFFIX = ".garrison";

/** Convert authority obstacle IDs into physical, player-facing causes. */
export function cobraObstacleStrikeDetail(obstacleId, sites = []) {
  const id = String(obstacleId ?? "").trim().toLowerCase();
  if (!id) return "Hit a canyon obstacle.";

  if (id.endsWith(GARRISON_SUFFIX)) {
    const siteId = id.slice(0, -GARRISON_SUFFIX.length);
    const site = (Array.isArray(sites) ? sites : [])
      .find((candidate) => String(candidate?.id ?? "").toLowerCase() === siteId);
    const label = String(site?.label ?? "").trim();
    return label
      ? `Hit the fortified position at ${label}.`
      : "Hit a fortified position.";
  }
  if (id.includes("iron-bell")) return "Hit the Iron Bell crossing.";
  if (id.includes("plantation-water-tower")) return "Hit the plantation tower.";
  if (id.includes("wire") || id.includes("ridge-guy")) return "Hit a wire.";
  if (id.includes("radio-mast")) return "Hit the ridge mast.";
  return "Hit a canyon obstacle.";
}

/** Structured evidence shown below the result copy. */
export function cobraDebriefEvidence(war, authorityState) {
  const sites = Array.isArray(war?.sites) ? war.sites : [];
  const heldSites = sites.filter((site) => site?.owner === "friendly" || site?.owner === "hostile");
  const friendlyPoints = heldSites.filter((site) => site?.owner === "friendly").length;
  const hostilePoints = heldSites.filter((site) => site?.owner === "hostile").length;
  const missionDebrief = war?.debrief ?? {};

  return Object.freeze({
    friendlyPoints,
    hostilePoints,
    heldPoints: heldSites.length,
    friendlyTickets: nonNegativeCount(war?.tickets?.friendly),
    hostileTickets: nonNegativeCount(war?.tickets?.hostile),
    hostileKills: nonNegativeCount(missionDebrief.hostile_kills),
    friendlyKills: nonNegativeCount(missionDebrief.friendly_kills),
    roundsExpended: nonNegativeCount(missionDebrief.rounds_expended),
    fobRearms: nonNegativeCount(missionDebrief.fob_rearms),
    airframeSwaps: nonNegativeCount(authorityState?.airframe_swaps),
    battleSeconds: nonNegativeNumber(missionDebrief.elapsed_s),
  });
}

function timeLimitDetail(outcome, war, evidence) {
  const limit = clockText(war?.time_limit_s || 600);
  const board = `${limit} · Points ${evidence.friendlyPoints}–${evidence.hostilePoints}`
    + ` · Tickets ${evidence.friendlyTickets}–${evidence.hostileTickets}`;
  if (evidence.friendlyPoints !== evidence.hostilePoints) return `${board} · Points decide.`;
  if (evidence.friendlyTickets !== evidence.hostileTickets) return `${board} · Tickets break ties.`;
  return `${board} · Ties lose.`;
}

function strategicCopy(outcome, war, evidence) {
  const reason = strategicOutcomeReason(war);
  if (outcome === "victory") {
    return Object.freeze({
      title: "VALLEY HELD",
      detail: reason === "time-limit"
        ? timeLimitDetail(outcome, war, evidence)
        : reason === "tickets-exhausted"
        ? `Hostile tickets exhausted · ${evidence.friendlyPoints}/${evidence.heldPoints} points held.`
        : "Hostile push stopped.",
    });
  }
  if (outcome === "defeat") {
    return Object.freeze({
      title: "VALLEY LOST",
      detail: reason === "time-limit"
        ? timeLimitDetail(outcome, war, evidence)
        : reason === "tickets-exhausted"
        ? `Friendly tickets exhausted · ${evidence.friendlyPoints}/${evidence.heldPoints} points held.`
        : "Ground war lost.",
    });
  }
  return null;
}

/**
 * Compose strategic and recovery truth into one card.
 *
 * `terminalTitle` and `terminalDetail` remain caller-owned because the live route has richer
 * collision and subsystem context than the ground-war snapshot.
 */
export function cobraDebriefPresentation({
  war,
  authorityState,
  status,
  terminalTitle,
  terminalDetail,
}) {
  const evidence = cobraDebriefEvidence(war, authorityState);
  const outcome = strategicOutcome(war, status);
  const outcomeReason = strategicOutcomeReason(war);
  const strategy = strategicCopy(outcome, war, evidence);
  const recoveryFailed = strategy !== null && outcomeToken(status) !== outcome;
  const failureTitle = terminalTitle || "SORTIE ENDED";
  const failureDetail = terminalDetail || `Sortie ended: ${String(status || "unknown").replaceAll("-", " ")}.`;

  if (strategy && recoveryFailed) {
    return Object.freeze({
      strategicOutcome: outcome,
      outcomeReason,
      recoveryFailed: true,
      tone: outcome === "victory" ? "mixed" : "defeat",
      statusLevel: "error",
      kicker: "MISSION + RECOVERY",
      title: `${strategy.title} · RECOVERY FAILED`,
      detail: `${strategy.detail} ${failureDetail}`,
      statusText: `MISSION RESULT · ${strategy.title} · RECOVERY FAILED · R RESTARTS`,
      evidence,
    });
  }

  if (strategy) {
    return Object.freeze({
      strategicOutcome: outcome,
      outcomeReason,
      recoveryFailed: false,
      tone: outcome,
      statusLevel: outcome === "victory" ? "ready" : "error",
      kicker: "MISSION RESULT",
      title: strategy.title,
      detail: strategy.detail,
      statusText: outcome === "victory"
        ? "MISSION COMPLETE · VALLEY HELD"
        : "MISSION COMPLETE · VALLEY LOST",
      evidence,
    });
  }

  return Object.freeze({
    strategicOutcome: null,
    outcomeReason: null,
    recoveryFailed: false,
    tone: "failure",
    statusLevel: "error",
    kicker: "SORTIE FAILED",
    title: failureTitle,
    detail: failureDetail,
    statusText: `MISSION ${String(status || "ended").replaceAll("-", " ").toUpperCase()} · R RESTARTS`,
    evidence,
  });
}

/** One concrete correction, with safety violations taking precedence over score. */
export function cobraNextSortieCorrection({ presentation, status, contactCause = null }) {
  const evidence = presentation?.evidence ?? cobraDebriefEvidence(null, null);
  if (evidence.friendlyKills > 0) {
    return `Friendly fire: ${evidence.friendlyKills}. Check target.`;
  }
  if (contactCause === "water-contact") return "Keep the skids clear of the river.";
  if (presentation?.recoveryFailed) {
    if (presentation.strategicOutcome === "victory") {
      return "Land at Ember.";
    }
    return "Preserve altitude for recovery.";
  }
  if (presentation?.strategicOutcome === "defeat") {
    if (presentation?.outcomeReason === "time-limit") {
      return "Lead on points by 10:00.";
    }
    return "Take the majority before friendly tickets run out.";
  }
  if (presentation?.strategicOutcome === "victory") {
    return "Hold the majority.";
  }
  if (status === "obstacle-collision") {
    return "Give obstacles more clearance.";
  }
  if (status === "vehicle-authority-lost") {
    return "Recover control before re-engaging.";
  }
  return "Fix the terminal cause.";
}
