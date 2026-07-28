import {
  CASEVAC_COURSE_SITE_IDS,
} from "./casevac_course_plan.js";

/**
 * Observer-safe DOM presentation for the first CASEVAC course.
 *
 * This module consumes an already-projected presentation frame. It does not
 * advance a clock, resolve a gate, derive mission phase, assess evidence, or
 * own quiet-beat completion. The simulation/assessment adapters remain the
 * sole authority for every value shown here.
 */

export const CASEVAC_MISSION_PRESENTATION_SCHEMA =
  "casevac.mission-presentation.v1";

const PHASE_COPY = Object.freeze({
  READY: "READY",
  INGRESS: "INGRESS",
  PICKUP_APPROACH: "PICKUP APPROACH",
  LOADING: "LOADING",
  OUTBOUND: "OUTBOUND",
  DROPOFF_APPROACH: "HANDOFF APPROACH",
  HANDOFF: "HANDOFF",
  QUIET: "QUIET",
  COMPLETE: "COMPLETE",
  ABORT_RETURN: "ABORT RETURN",
  ABORTED: "ABORTED",
  AIRCRAFT_LOST: "AIRCRAFT LOST",
});

const SITE_COPY = Object.freeze({
  [CASEVAC_COURSE_SITE_IDS.pickup]: Object.freeze({
    target: "PICKUP",
    site: "ORCHARD PAD",
  }),
  [CASEVAC_COURSE_SITE_IDS.receiver]: Object.freeze({
    target: "HANDOFF",
    site: "CLINIC PAD",
  }),
  "volume.ukraine.casevac-safe-exit-a.v1": Object.freeze({
    target: "RETURN",
    site: "SAFE EXIT",
  }),
});

const WINDOW_COPY = Object.freeze({
  OPEN: "",
  PASSED: "WINDOW PASSED · COMPLETE IF ABLE",
  NOT_ASSESSED: "REQUEST WINDOW · NOT ASSESSED",
});

const OCCUPANCY_COPY = Object.freeze({
  EMPTY: "EMPTY",
  OCCUPIED: "OCCUPIED",
});

const GATE_COPY = Object.freeze({
  OUTSIDE: "OUTSIDE STABLE GATE",
  UNSTABLE: "CONTACT UNSTABLE",
  STABILIZING: "STABILIZING",
  STABLE: "STABLE CONTACT",
  PAUSED: "DWELL PAUSED",
  COMPLETE: "DWELL COMPLETE",
  NOT_ASSESSED: "STABLE GATE · NOT ASSESSED",
});

const DWELL_COPY = Object.freeze({
  STABILIZATION: "STABLE DWELL",
  LOADING: "LOADING",
  HANDOFF: "HANDOFF",
});

const AXIS_STATUS_COPY = Object.freeze({
  SAFE: Object.freeze({
    CLEAR: "CLEAR",
    REVIEW: "REVIEW",
    NOT_ASSESSED: "NOT ASSESSED",
  }),
  CONTROLLED: Object.freeze({
    CONTROLLED: "CONTROLLED",
    REVIEW: "REVIEW",
    NOT_ASSESSED: "NOT ASSESSED",
  }),
  MASKED: Object.freeze({
    MASKED: "MASKED",
    MIXED: "MIXED",
    EXPOSED: "EXPOSED",
    NOT_ASSESSED: "NOT ASSESSED",
  }),
  TIMELY: Object.freeze({
    WITHIN_REQUEST: "WITHIN REQUEST",
    WINDOW_PASSED: "WINDOW PASSED",
    NOT_ASSESSED: "NOT ASSESSED",
  }),
});

const EVENT_COPY = Object.freeze({
  CASEVAC_TASK_STARTED: Object.freeze({
    channel: "DISPATCH",
    text: "CASEVAC task. Orchard pickup, clinic handoff.",
  }),
  PICKUP_APPROACH_ENTERED: Object.freeze({
    channel: "CREW",
    text: "Pickup in sight. Set the approach.",
  }),
  APPROACH_ATTEMPT_STARTED: Object.freeze({
    channel: "CREW",
    text: "Approach started. Stable gate is live.",
  }),
  STABLE_CONTACT_ENTERED: Object.freeze({
    channel: "CREW",
    text: "Stable contact. Hold it.",
  }),
  STABLE_CONTACT_EXITED: Object.freeze({
    channel: "CREW",
    text: "Contact outside limits. Dwell paused.",
  }),
  LOADING_STARTED: Object.freeze({
    channel: "GROUND",
    text: "Capsule coming aboard.",
  }),
  LOADING_PAUSED: Object.freeze({
    channel: "CREW",
    text: "Loading paused. Hold stable.",
  }),
  LOADING_RESUMED: Object.freeze({
    channel: "CREW",
    text: "Stable again. Loading resumed.",
  }),
  LOADING_RESET: Object.freeze({
    channel: "CREW",
    text: "Pad contact lost. Loading reset.",
  }),
  CAPSULE_SECURED: Object.freeze({
    channel: "CREW",
    text: "Capsule secure. OCCUPIED.",
  }),
  REQUESTED_HANDOFF_WINDOW_PASSED: Object.freeze({
    channel: "DISPATCH",
    text: "Requested window passed. Complete if able.",
    emphasis: "notice",
  }),
  DROPOFF_APPROACH_ENTERED: Object.freeze({
    channel: "CREW",
    text: "Receiver in sight. Set the handoff.",
  }),
  APPROACH_DISCONTINUED: Object.freeze({
    channel: "CREW",
    text: "Approach discontinued. Reposition.",
  }),
  HANDOFF_STARTED: Object.freeze({
    channel: "RECEIVER",
    text: "Handoff started. Hold stable.",
  }),
  HANDOFF_PAUSED: Object.freeze({
    channel: "CREW",
    text: "Handoff paused. Hold stable.",
  }),
  HANDOFF_RESUMED: Object.freeze({
    channel: "RECEIVER",
    text: "Stable again. Handoff resumed.",
  }),
  HANDOFF_RESET: Object.freeze({
    channel: "CREW",
    text: "Contact lost. Handoff reset.",
  }),
  HANDOFF_COMPLETED: Object.freeze({
    channel: "RECEIVER",
    text: "Capsule received.",
  }),
  ABORT_RETURN_STARTED: Object.freeze({
    channel: "DISPATCH",
    text: "Abort return acknowledged. Fly the safe exit.",
  }),
  CASEVAC_ABORTED: Object.freeze({
    channel: "DISPATCH",
    text: "Controlled abort. Pickup incomplete.",
  }),
  CASEVAC_AIRCRAFT_LOST: Object.freeze({
    channel: "DISPATCH",
    text: "Aircraft signal lost.",
    emphasis: "notice",
  }),
});

const BUILT_DEBRIEF_MODELS = new WeakSet();

const PRESENTATION_CSS = `
[data-casevac-presentation] {
  --cv-cold: #bfe9e4;
  --cv-cold-dim: rgba(191, 233, 228, .62);
  --cv-amber: #e3bc72;
  --cv-green: #92d5a6;
  --cv-panel: rgba(6, 15, 18, .86);
  --cv-rule: rgba(191, 233, 228, .23);
  position: fixed;
  z-index: 8;
  inset: 0;
  pointer-events: none;
  color: var(--cv-cold);
  font: 700 10px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .055em;
  text-shadow: 0 1px 4px #000;
}
[data-casevac-presentation],
[data-casevac-presentation] * { box-sizing: border-box; }
[data-casevac-presentation][hidden],
[data-casevac-presentation] [hidden] { display: none !important; }
[data-casevac-part="mission-strip"] {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  left: 50%;
  width: min(840px, calc(100vw - 28px));
  transform: translateX(-50%);
  border: 1px solid var(--cv-rule);
  border-left: 3px solid var(--cv-green);
  background: linear-gradient(90deg, var(--cv-panel), rgba(6, 15, 18, .68));
  box-shadow: 0 8px 25px rgba(0, 0, 0, .24);
  backdrop-filter: blur(3px);
}
.cv-strip-grid {
  display: grid;
  grid-template-columns: 1.2fr 1.8fr 1fr 1.05fr 2fr;
  align-items: stretch;
}
.cv-metric {
  min-width: 0;
  padding: 7px 9px 6px;
  border-right: 1px solid rgba(191, 233, 228, .13);
}
.cv-metric:last-child { border-right: 0; }
.cv-label {
  display: block;
  margin-bottom: 2px;
  color: var(--cv-cold-dim);
  font-size: 7px;
  letter-spacing: .16em;
}
.cv-value {
  display: block;
  overflow: hidden;
  color: #f0fbf8;
  white-space: nowrap;
  text-overflow: ellipsis;
}
[data-casevac-field="occupancy"][data-state="OCCUPIED"] { color: var(--cv-amber); }
[data-casevac-field="gate"][data-state="STABLE"],
[data-casevac-field="gate"][data-state="COMPLETE"] { color: var(--cv-green); }
[data-casevac-field="gate"][data-state="UNSTABLE"],
[data-casevac-field="gate"][data-state="PAUSED"] { color: var(--cv-amber); }
.cv-dwell {
  display: grid;
  grid-template-columns: auto minmax(72px, 1fr) auto;
  gap: 7px;
  align-items: center;
}
.cv-dwell-track {
  height: 3px;
  overflow: hidden;
  background: rgba(191, 233, 228, .18);
}
.cv-dwell-fill {
  display: block;
  width: 0;
  height: 100%;
  background: var(--cv-green);
}
.cv-clock-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 9px;
  border-top: 1px solid rgba(191, 233, 228, .12);
  color: var(--cv-cold-dim);
  font-size: 8px;
}
[data-casevac-field="window"][data-state="PASSED"] { color: var(--cv-amber); }
[data-casevac-part="radio"] {
  position: absolute;
  top: max(98px, calc(env(safe-area-inset-top) + 84px));
  left: max(14px, env(safe-area-inset-left));
  width: min(390px, calc(100vw - 28px));
}
.cv-radio-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cv-radio-item {
  padding: 5px 8px;
  border-left: 2px solid rgba(191, 233, 228, .36);
  background: rgba(5, 13, 16, .63);
  color: rgba(230, 247, 243, .84);
}
.cv-radio-item[data-emphasis="notice"] {
  border-left-color: var(--cv-amber);
  color: #f4dcae;
}
.cv-channel {
  margin-right: 7px;
  color: var(--cv-cold-dim);
  font-size: 7px;
  letter-spacing: .14em;
}
[data-casevac-part="quiet"] {
  position: absolute;
  left: 50%;
  bottom: max(32px, calc(env(safe-area-inset-bottom) + 20px));
  width: min(490px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 13px 15px;
  border: 1px solid rgba(191, 233, 228, .2);
  border-left: 3px solid var(--cv-green);
  background: rgba(5, 13, 16, .82);
  text-align: left;
}
.cv-quiet-title {
  margin: 0;
  color: #f0fbf8;
  font-size: 11px;
  letter-spacing: .16em;
}
.cv-quiet-copy {
  margin: 5px 0 0;
  color: var(--cv-cold-dim);
  font-size: 8px;
  font-weight: 600;
}
.cv-quiet-skip {
  margin-top: 9px;
  padding: 6px 8px;
  border: 1px solid rgba(191, 233, 228, .35);
  color: var(--cv-cold);
  background: rgba(8, 21, 24, .92);
  pointer-events: auto;
  cursor: pointer;
  font: inherit;
  font-size: 7px;
  letter-spacing: .12em;
}
.cv-quiet-skip:focus-visible {
  outline: 2px solid var(--cv-amber);
  outline-offset: 2px;
}
[data-casevac-part="debrief"] {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(860px, calc(100vw - 28px));
  max-height: calc(100dvh - 34px);
  overflow: auto;
  transform: translate(-50%, -50%);
  padding: 17px;
  border: 1px solid rgba(191, 233, 228, .25);
  border-top: 3px solid var(--cv-green);
  background: rgba(5, 13, 16, .96);
  box-shadow: 0 24px 80px rgba(0, 0, 0, .52);
  pointer-events: auto;
}
.cv-debrief-kicker {
  margin: 0 0 3px;
  color: var(--cv-cold-dim);
  font-size: 7px;
  letter-spacing: .18em;
}
.cv-debrief-outcome {
  margin: 0;
  color: #f0fbf8;
  font-size: 18px;
  letter-spacing: .08em;
}
.cv-axis-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 7px;
  margin-top: 14px;
}
.cv-axis {
  padding: 9px;
  border: 1px solid rgba(191, 233, 228, .14);
  background: rgba(191, 233, 228, .025);
}
.cv-axis-name {
  color: var(--cv-cold-dim);
  font-size: 7px;
  letter-spacing: .17em;
}
.cv-axis-status {
  display: block;
  margin-top: 3px;
  color: #f0fbf8;
  font-size: 10px;
}
.cv-axis-evidence {
  margin: 7px 0 0;
  color: rgba(230, 247, 243, .7);
  font-size: 8px;
  font-weight: 600;
  line-height: 1.45;
}
.cv-correction {
  margin-top: 10px;
  padding: 10px;
  border-left: 3px solid var(--cv-amber);
  background: rgba(227, 188, 114, .055);
}
.cv-correction-label {
  color: rgba(227, 188, 114, .72);
  font-size: 7px;
  letter-spacing: .17em;
}
.cv-correction-summary {
  margin: 4px 0 0;
  color: #f2ddb5;
  font-size: 10px;
}
.cv-correction-evidence {
  margin: 5px 0 0;
  color: rgba(230, 247, 243, .7);
  font-size: 8px;
  font-weight: 600;
}
@media (max-width: 680px) {
  .cv-strip-grid { grid-template-columns: repeat(2, 1fr); }
  .cv-metric { border-bottom: 1px solid rgba(191, 233, 228, .1); }
  .cv-metric:last-child { grid-column: 1 / -1; }
  .cv-axis-grid { grid-template-columns: repeat(2, 1fr); }
  [data-casevac-part="radio"] { top: max(170px, calc(env(safe-area-inset-top) + 155px)); }
}
@media (prefers-reduced-motion: reduce) {
  [data-casevac-presentation] * { transition: none !important; animation: none !important; }
}
`;

function canonicalToken(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegative(value) {
  const number = finite(value);
  return number !== null && number >= 0 ? number : null;
}

function boundedInteger(value) {
  const number = finite(value);
  return number !== null && number >= 0
    ? Math.min(1_000_000, Math.trunc(number))
    : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function formatClock(value) {
  const seconds = nonNegative(value);
  if (seconds === null) return "—";
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatInterval(value) {
  const seconds = nonNegative(value);
  if (seconds === null) return "not recorded";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  return formatClock(seconds);
}

function formatRange(value) {
  const metres = nonNegative(value);
  if (metres === null) return "—";
  if (metres < 1_000) return `${Math.round(metres)} M`;
  const kilometres = metres / 1_000;
  return `${kilometres < 10 ? kilometres.toFixed(1) : Math.round(kilometres)} KM`;
}

function countCopy(value, singular, plural = `${singular}s`) {
  const count = boundedInteger(value);
  return count === null ? null : `${count} ${count === 1 ? singular : plural}`;
}

function joinEvidence(parts, fallback = "No supporting evidence was published.") {
  const available = parts.filter(Boolean);
  return available.length ? available.join(" · ") : fallback;
}

/**
 * Normalize an observer-safe strip projection into concise visible copy.
 * Values are formatting inputs only; this function does not derive mission truth.
 */
export function casevacMissionStripModel(projection = {}) {
  const phase = canonicalToken(projection?.phase);
  const target = SITE_COPY[projection?.targetSiteId] ?? null;
  const windowState = WINDOW_COPY[
    canonicalToken(projection?.requestedWindowState)
  ] !== undefined
    ? canonicalToken(projection.requestedWindowState)
    : "NOT_ASSESSED";
  const occupancy = OCCUPANCY_COPY[canonicalToken(projection?.occupancy)]
    ? canonicalToken(projection.occupancy)
    : "NOT_ASSESSED";
  const gateState = GATE_COPY[canonicalToken(projection?.gateState)]
    ? canonicalToken(projection.gateState)
    : "NOT_ASSESSED";
  const dwellKind = DWELL_COPY[canonicalToken(projection?.dwellKind)]
    ? canonicalToken(projection.dwellKind)
    : "NONE";
  const rawProgress = finite(projection?.dwellProgress01);
  const progress01 = rawProgress === null ? 0 : clamp(rawProgress, 0, 1);
  const progressPercent = Math.round(progress01 * 100);
  const knownPhase = PHASE_COPY[phase] !== undefined;
  const visible = projection?.visible === true
    || (projection?.visible !== false && knownPhase);

  return deepFreeze({
    schema: CASEVAC_MISSION_PRESENTATION_SCHEMA,
    presentationOnly: true,
    authoritative: false,
    visible,
    phase: {
      state: knownPhase ? phase : "NOT_ASSESSED",
      text: PHASE_COPY[phase] ?? "PHASE · NOT ASSESSED",
    },
    target: {
      siteId: target ? projection.targetSiteId : null,
      text: target ? `${target.target} · ${target.site}` : "TARGET · NOT ASSESSED",
    },
    navigation: {
      rangeText: formatRange(projection?.rangeM),
      etaText: formatClock(projection?.etaSeconds),
    },
    clock: {
      callAgeText: formatClock(projection?.callAgeSeconds),
      requestedText: formatClock(projection?.requestedHandoffAgeSeconds),
      combinedText: [
        `TIME SINCE CALL ${formatClock(projection?.callAgeSeconds)}`,
        `REQUESTED ${formatClock(projection?.requestedHandoffAgeSeconds)}`,
      ].join(" · "),
      windowState,
      windowText: WINDOW_COPY[windowState],
    },
    occupancy: {
      state: occupancy,
      text: OCCUPANCY_COPY[occupancy] ?? "LOAD · NOT ASSESSED",
    },
    gate: {
      state: gateState,
      text: GATE_COPY[gateState],
    },
    dwell: {
      visible: dwellKind !== "NONE",
      kind: dwellKind,
      label: DWELL_COPY[dwellKind] ?? "DWELL",
      progress01,
      progressPercent,
      text: dwellKind === "NONE"
        ? "DWELL · NOT ACTIVE"
        : `${DWELL_COPY[dwellKind]} ${progressPercent}%`,
    },
  });
}

/**
 * Convert one sparse, ordered CASEVAC event into fixed subtitle/radio copy.
 * Free-form event fields are deliberately ignored.
 */
export function casevacRadioMessage(event) {
  const sequence = Number(event?.sequence);
  const schemaVersion = event?.schemaVersion === undefined
    ? 1
    : Number(event.schemaVersion);
  if (!Number.isSafeInteger(sequence) || sequence < 0 || schemaVersion !== 1)
    return null;
  const kind = canonicalToken(event?.kind);
  const copy = EVENT_COPY[kind];
  if (!copy) return null;
  return deepFreeze({
    schema: CASEVAC_MISSION_PRESENTATION_SCHEMA,
    id: `${sequence}:${kind}`,
    sequence,
    kind,
    channel: copy.channel,
    text: copy.text,
    emphasis: copy.emphasis ?? "routine",
    presentationOnly: true,
    authoritative: false,
  });
}

function safeAxis(axis) {
  const source = axis ?? {};
  const statusToken = canonicalToken(source.status);
  const status = AXIS_STATUS_COPY.SAFE[statusToken]
    ? statusToken
    : "NOT_ASSESSED";
  const minimumClearance = nonNegative(source.minimumClearanceM);
  return {
    id: "safe",
    label: "SAFE",
    status: AXIS_STATUS_COPY.SAFE[status],
    evidence: joinEvidence([
      minimumClearance === null
        ? null
        : `Minimum clearance ${Math.round(minimumClearance)} m`,
      countCopy(source.obstacleContacts, "obstacle contact"),
      countCopy(
        source.protectionInterventions,
        "protection intervention",
      ),
    ], status === "NOT_ASSESSED"
      ? "Safety evidence was not assessed."
      : undefined),
  };
}

function controlledAxis(axis) {
  const source = axis ?? {};
  const statusToken = canonicalToken(source.status);
  const status = AXIS_STATUS_COPY.CONTROLLED[statusToken]
    ? statusToken
    : "NOT_ASSESSED";
  return {
    id: "controlled",
    label: "CONTROLLED",
    status: AXIS_STATUS_COPY.CONTROLLED[status],
    evidence: joinEvidence([
      countCopy(
        source.pickupApproaches,
        "pickup approach",
        "pickup approaches",
      ),
      countCopy(
        source.handoffApproaches,
        "handoff approach",
        "handoff approaches",
      ),
      countCopy(source.approachDiscontinuations, "discontinued approach"),
      countCopy(source.loadingInterruptions, "loading interruption"),
      countCopy(source.handoffInterruptions, "handoff interruption"),
    ], status === "NOT_ASSESSED"
      ? "Terminal-flight evidence was not assessed."
      : undefined),
  };
}

function maskedAxis(axis) {
  const source = axis ?? {};
  const statusToken = canonicalToken(source.status);
  const status = AXIS_STATUS_COPY.MASKED[statusToken]
    ? statusToken
    : "NOT_ASSESSED";
  const safeBandPercent = finite(source.safeBandPercent);
  const exposedSeconds = nonNegative(source.exposedSeconds);
  return {
    id: "masked",
    label: "MASKED",
    status: AXIS_STATUS_COPY.MASKED[status],
    evidence: joinEvidence([
      safeBandPercent === null
        ? null
        : `${Math.round(clamp(safeBandPercent, 0, 100))}% inside declared safe band`,
      exposedSeconds === null
        ? null
        : `Exposed ${formatInterval(exposedSeconds)}`,
    ], status === "NOT_ASSESSED"
      ? "Masking evidence was not assessed."
      : undefined),
  };
}

function timelyAxis(axis) {
  const source = axis ?? {};
  const statusToken = canonicalToken(source.status);
  const status = AXIS_STATUS_COPY.TIMELY[statusToken]
    ? statusToken
    : "NOT_ASSESSED";
  const callToPickup = nonNegative(source.callToPickupSeconds);
  const pickupToHandoff = nonNegative(source.pickupToHandoffSeconds);
  const total = nonNegative(source.totalCallToHandoffSeconds);
  return {
    id: "timely",
    label: "TIMELY",
    status: AXIS_STATUS_COPY.TIMELY[status],
    evidence: joinEvidence([
      callToPickup === null
        ? null
        : `Call to pickup ${formatClock(callToPickup)}`,
      pickupToHandoff === null
        ? null
        : `Pickup to handoff ${formatClock(pickupToHandoff)}`,
      total === null
        ? null
        : `Call to handoff ${formatClock(total)}`,
    ], status === "NOT_ASSESSED"
      ? "Timing evidence was not assessed."
      : undefined),
  };
}

function operationalOutcome(evidence) {
  const disposition = canonicalToken(evidence?.disposition);
  const handoff = formatClock(evidence?.handoffCallAgeSeconds);
  const requested = formatClock(evidence?.requestedHandoffAgeSeconds);
  switch (disposition) {
    case "TRANSFERRED_ON_TIME":
      return handoff === "—" ? "HANDOFF" : `HANDOFF · ${handoff}`;
    case "TRANSFERRED_AFTER_REQUESTED_TIME":
      return handoff === "—" || requested === "—"
        ? "HANDOFF · WINDOW PASSED"
        : `HANDOFF ${handoff} · REQUESTED ${requested}`;
    case "CONTROLLED_ABORT":
      return "CONTROLLED ABORT · PICKUP INCOMPLETE";
    case "AIRCRAFT_LOST_EMPTY":
      return "AIRCRAFT LOST";
    case "AIRCRAFT_LOST_OCCUPIED":
      return "AIRCRAFT LOST · OCCUPIED";
    default:
      return "OUTCOME · NOT ASSESSED";
  }
}

function unavailableCorrection() {
  return {
    available: false,
    kind: "NOT_AVAILABLE",
    summary: "No replay-supported correction available.",
    evidence: "No bounded correction range was published.",
  };
}

function correctionModel(correction) {
  const kind = canonicalToken(correction?.kind);
  const at = nonNegative(correction?.atCallAgeSeconds);
  const interval = nonNegative(correction?.intervalSeconds);
  const count = boundedInteger(correction?.count);
  if (at === null) return unavailableCorrection();
  const atCopy = formatClock(at);
  switch (kind) {
    case "PICKUP_DECELERATION":
      if (interval === null || interval <= 0) return unavailableCorrection();
      return {
        available: true,
        kind,
        summary: "Begin deceleration before the orchard.",
        evidence: [
          `Pickup terminal entry ${atCopy};`,
          `first stable contact ${formatInterval(interval)} later.`,
        ].join(" "),
      };
    case "APPROACH_DISCIPLINE": {
      if (interval === null || interval <= 0) return unavailableCorrection();
      const site = canonicalToken(correction?.site) === "RECEIVER"
        ? "Handoff" : "Pickup";
      return {
        available: true,
        kind,
        summary: "Discontinue early when stable contact is not assured.",
        evidence: [
          `${site} approach discontinued at ${atCopy};`,
          `stable contact ${formatInterval(interval)} later.`,
        ].join(" "),
      };
    }
    case "LOADING_STABILITY":
      if (count === null || count < 1) return unavailableCorrection();
      return {
        available: true,
        kind,
        summary: "Hold the stable-contact gate through loading.",
        evidence: `First loading pause ${atCopy}; ${countCopy(count, "pause")} recorded.`,
      };
    case "HANDOFF_STABILITY":
      if (count === null || count < 1) return unavailableCorrection();
      return {
        available: true,
        kind,
        summary: "Hold the stable-contact gate through handoff.",
        evidence: `First handoff pause ${atCopy}; ${countCopy(count, "pause")} recorded.`,
      };
    case "ROUTE_MASKING":
      if (interval === null || interval <= 0) return unavailableCorrection();
      return {
        available: true,
        kind,
        summary: "Return to the declared safe masking band sooner.",
        evidence: `Recorded exposure began at ${atCopy} and lasted ${formatInterval(interval)}.`,
      };
    case "DEPARTURE_MARGIN": {
      const margin = finite(correction?.marginPercent);
      if (margin === null) return unavailableCorrection();
      return {
        available: true,
        kind,
        summary: "Build power margin before departure.",
        evidence: `Published departure margin reached ${Math.round(margin)}% at ${atCopy}.`,
      };
    }
    default:
      return unavailableCorrection();
  }
}

/**
 * Build the fixed four-axis debrief from already-assessed, observer-safe facts.
 * Status tokens and correction selection come from the assessment adapter.
 */
export function casevacDebriefModel(evidence = {}) {
  const axes = [
    safeAxis(evidence?.axes?.safe),
    controlledAxis(evidence?.axes?.controlled),
    maskedAxis(evidence?.axes?.masked),
    timelyAxis(evidence?.axes?.timely),
  ];
  const model = deepFreeze({
    schema: CASEVAC_MISSION_PRESENTATION_SCHEMA,
    presentationOnly: true,
    authoritative: false,
    visible: evidence?.visible !== false,
    outcome: operationalOutcome(evidence),
    axes,
    correction: correctionModel(evidence?.correction),
  });
  BUILT_DEBRIEF_MODELS.add(model);
  return model;
}

function validateDocument(documentLike) {
  if (!documentLike || typeof documentLike.createElement !== "function")
    throw new TypeError("CASEVAC mission presentation requires a DOM document.");
}

function element(documentLike, tagName, options = {}) {
  const result = documentLike.createElement(tagName);
  if (options.className) result.className = options.className;
  if (options.text !== undefined) result.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {}))
    result.setAttribute(name, String(value));
  return result;
}

function setText(node, value) {
  const text = String(value ?? "");
  if (node.textContent !== text) node.textContent = text;
}

function append(parent, ...children) {
  for (const child of children) parent.appendChild(child);
  return parent;
}

function metric(documentLike, label, field) {
  const container = element(documentLike, "div", { className: "cv-metric" });
  const labelNode = element(documentLike, "span", {
    className: "cv-label",
    text: label,
  });
  const value = element(documentLike, "output", {
    className: "cv-value",
    attributes: { "data-casevac-field": field },
  });
  append(container, labelNode, value);
  return { container, value };
}

function snapshotView(strip, messages, quiet, debrief) {
  return deepFreeze({
    strip,
    messages: messages.slice(),
    quiet: { ...quiet },
    debrief,
  });
}

/**
 * Create an isolated CASEVAC mission UI.
 *
 * Exact runtime API:
 *   { element, update(frame), clearMessages(), dispose(), disposed }
 *
 * `frame` accepts `{ strip, events, streamId, quiet, debrief }`. Omitted
 * members retain their previous presentation value; explicit null hides the
 * corresponding strip, quiet beat, or debrief.
 */
export function createCasevacMissionPresentation(documentLike, options = {}) {
  validateDocument(documentLike);
  if (options.mount !== undefined
      && typeof options.mount?.appendChild !== "function")
    throw new TypeError("CASEVAC presentation mount must accept appendChild().");

  const maxMessages = clamp(
    Math.trunc(finite(options.maxMessages) ?? 4),
    1,
    6,
  );
  const root = element(documentLike, "section", {
    attributes: {
      "data-casevac-presentation": "v1",
      "data-authoritative": "false",
      "aria-label": "CASEVAC mission presentation",
    },
  });
  root.hidden = true;
  const style = element(documentLike, "style", { text: PRESENTATION_CSS });

  const stripNode = element(documentLike, "section", {
    attributes: {
      "data-casevac-part": "mission-strip",
      "aria-label": "CASEVAC mission status",
    },
  });
  stripNode.hidden = true;
  const stripGrid = element(documentLike, "div", {
    className: "cv-strip-grid",
  });
  const phaseMetric = metric(documentLike, "PHASE", "phase");
  const targetMetric = metric(documentLike, "TARGET / SITE", "target");
  const navMetric = metric(documentLike, "RANGE / ETA", "navigation");
  const occupancyMetric = metric(documentLike, "CABIN", "occupancy");
  const gateMetric = metric(documentLike, "STABLE-CONTACT GATE", "gate");
  gateMetric.value.setAttribute("role", "status");
  gateMetric.value.setAttribute("aria-live", "polite");
  append(
    stripGrid,
    phaseMetric.container,
    targetMetric.container,
    navMetric.container,
    occupancyMetric.container,
    gateMetric.container,
  );

  const dwell = element(documentLike, "div", {
    className: "cv-dwell",
    attributes: { "data-casevac-field": "dwell" },
  });
  dwell.hidden = true;
  const dwellLabel = element(documentLike, "span", {
    className: "cv-label",
    text: "DWELL",
  });
  const dwellTrack = element(documentLike, "div", {
    className: "cv-dwell-track",
    attributes: {
      role: "progressbar",
      "aria-label": "CASEVAC stable-contact dwell progress",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": "0",
      "data-casevac-field": "dwell-progress",
    },
  });
  const dwellFill = element(documentLike, "span", {
    className: "cv-dwell-fill",
  });
  dwellTrack.appendChild(dwellFill);
  const dwellValue = element(documentLike, "output", {
    className: "cv-value",
    text: "0%",
  });
  append(dwell, dwellLabel, dwellTrack, dwellValue);
  gateMetric.container.appendChild(dwell);

  const clockRow = element(documentLike, "div", {
    className: "cv-clock-row",
  });
  const clock = element(documentLike, "output", {
    attributes: { "data-casevac-field": "clock" },
  });
  const window = element(documentLike, "output", {
    attributes: {
      "data-casevac-field": "window",
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
    },
  });
  append(clockRow, clock, window);
  append(stripNode, stripGrid, clockRow);

  const radio = element(documentLike, "aside", {
    attributes: {
      "data-casevac-part": "radio",
      "aria-label": "CASEVAC radio and crew messages",
    },
  });
  radio.hidden = true;
  const radioList = element(documentLike, "ol", {
    className: "cv-radio-list",
    attributes: {
      "aria-live": "polite",
      "aria-relevant": "additions",
      "aria-atomic": "false",
    },
  });
  radio.appendChild(radioList);

  const quiet = element(documentLike, "section", {
    attributes: {
      "data-casevac-part": "quiet",
      "aria-label": "CASEVAC handoff interval",
    },
  });
  quiet.hidden = true;
  const quietAnnouncement = element(documentLike, "div", {
    attributes: {
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
    },
  });
  const quietTitle = element(documentLike, "h2", {
    className: "cv-quiet-title",
    text: "HANDOFF RECORDED",
  });
  const quietCopy = element(documentLike, "p", {
    className: "cv-quiet-copy",
    text: "Transfer is complete. Flight controls remain live during the quiet interval.",
  });
  const quietSkip = element(documentLike, "button", {
    className: "cv-quiet-skip",
    text: "SKIP QUIET INTERVAL",
    attributes: {
      type: "button",
      "aria-label": "Skip the CASEVAC quiet interval",
    },
  });
  quietSkip.hidden = true;
  append(quietAnnouncement, quietTitle, quietCopy);
  append(quiet, quietAnnouncement, quietSkip);

  const debriefNode = element(documentLike, "section", {
    attributes: {
      "data-casevac-part": "debrief",
      "aria-label": "CASEVAC debrief",
    },
  });
  debriefNode.hidden = true;
  const debriefKicker = element(documentLike, "p", {
    className: "cv-debrief-kicker",
    text: "CASEVAC DEBRIEF · SEPARATE EVIDENCE AXES",
  });
  const debriefOutcome = element(documentLike, "h2", {
    className: "cv-debrief-outcome",
  });
  const axisGrid = element(documentLike, "div", {
    className: "cv-axis-grid",
    attributes: { "data-casevac-field": "axes" },
  });
  const axisNodes = new Map();
  for (const axis of [
    ["safe", "SAFE"],
    ["controlled", "CONTROLLED"],
    ["masked", "MASKED"],
    ["timely", "TIMELY"],
  ]) {
    const axisNode = element(documentLike, "article", {
      className: "cv-axis",
      attributes: {
        "data-casevac-axis": axis[0],
        "aria-label": `${axis[1]} assessment`,
      },
    });
    const name = element(documentLike, "span", {
      className: "cv-axis-name",
      text: axis[1],
    });
    const status = element(documentLike, "output", {
      className: "cv-axis-status",
    });
    const evidence = element(documentLike, "p", {
      className: "cv-axis-evidence",
    });
    append(axisNode, name, status, evidence);
    axisGrid.appendChild(axisNode);
    axisNodes.set(axis[0], { node: axisNode, status, evidence });
  }
  const correction = element(documentLike, "article", {
    className: "cv-correction",
    attributes: {
      "data-casevac-field": "correction",
      "aria-label": "Primary evidence-backed correction",
    },
  });
  const correctionLabel = element(documentLike, "span", {
    className: "cv-correction-label",
    text: "ONE RECORDED CORRECTION",
  });
  const correctionSummary = element(documentLike, "p", {
    className: "cv-correction-summary",
  });
  const correctionEvidence = element(documentLike, "p", {
    className: "cv-correction-evidence",
  });
  append(
    correction,
    correctionLabel,
    correctionSummary,
    correctionEvidence,
  );
  append(
    debriefNode,
    debriefKicker,
    debriefOutcome,
    axisGrid,
    correction,
  );
  append(root, style, stripNode, radio, quiet, debriefNode);
  if (options.mount) options.mount.appendChild(root);

  let disposed = false;
  let currentStreamId = "live";
  let eventCursor = -1;
  let messages = [];
  let messageNodes = new Map();
  let stripState = casevacMissionStripModel({ visible: false });
  let quietState = { active: false, skippable: false };
  let debriefState = null;

  const updateRootVisibility = () => {
    root.hidden = stripNode.hidden
      && radio.hidden
      && quiet.hidden
      && debriefNode.hidden;
  };

  const renderStrip = () => {
    stripNode.hidden = !stripState.visible;
    root.setAttribute("data-phase", stripState.phase.state);
    setText(phaseMetric.value, stripState.phase.text);
    setText(targetMetric.value, stripState.target.text);
    setText(
      navMetric.value,
      `${stripState.navigation.rangeText} / ${stripState.navigation.etaText}`,
    );
    setText(occupancyMetric.value, stripState.occupancy.text);
    occupancyMetric.value.setAttribute(
      "data-state",
      stripState.occupancy.state,
    );
    setText(gateMetric.value, stripState.gate.text);
    gateMetric.value.setAttribute("data-state", stripState.gate.state);
    setText(clock, stripState.clock.combinedText);
    setText(window, stripState.clock.windowText);
    window.setAttribute("data-state", stripState.clock.windowState);
    dwell.hidden = !stripState.dwell.visible;
    setText(dwellLabel, stripState.dwell.label);
    setText(dwellValue, `${stripState.dwell.progressPercent}%`);
    dwellTrack.setAttribute(
      "aria-valuenow",
      String(stripState.dwell.progressPercent),
    );
    dwellTrack.setAttribute(
      "aria-valuetext",
      stripState.dwell.text,
    );
    dwellFill.style.width = `${stripState.dwell.progressPercent}%`;
  };

  const renderMessages = () => {
    const retainedIds = new Set(messages.map((message) => message.id));
    for (const [id, node] of messageNodes) {
      if (retainedIds.has(id)) continue;
      node.remove();
      messageNodes.delete(id);
    }
    for (const message of messages) {
      if (messageNodes.has(message.id)) continue;
      const item = element(documentLike, "li", {
        className: "cv-radio-item",
        attributes: {
          "data-message-id": message.id,
          "data-emphasis": message.emphasis,
        },
      });
      const channel = element(documentLike, "span", {
        className: "cv-channel",
        text: message.channel,
      });
      const text = element(documentLike, "span", { text: message.text });
      append(item, channel, text);
      radioList.appendChild(item);
      messageNodes.set(message.id, item);
    }
    radio.hidden = messages.length === 0;
  };

  const resetMessages = () => {
    messages = [];
    for (const node of messageNodes.values()) node.remove();
    messageNodes = new Map();
    radio.hidden = true;
  };

  const consumeEvents = (streamId, events) => {
    const nextStream = typeof streamId === "string"
      && streamId.length > 0
      && streamId.length <= 160
      ? streamId
      : "live";
    if (nextStream !== currentStreamId) {
      currentStreamId = nextStream;
      eventCursor = -1;
      resetMessages();
    }
    if (!Array.isArray(events) || events.length === 0) return;
    const ordered = events
      .filter((event) => Number.isSafeInteger(Number(event?.sequence)))
      .slice()
      .sort((left, right) => Number(left.sequence) - Number(right.sequence));
    for (const event of ordered) {
      const sequence = Number(event.sequence);
      if (sequence <= eventCursor) continue;
      eventCursor = sequence;
      const message = casevacRadioMessage(event);
      if (message) messages.push(message);
    }
    if (messages.length > maxMessages)
      messages = messages.slice(messages.length - maxMessages);
    renderMessages();
  };

  const renderQuiet = () => {
    quiet.hidden = !quietState.active;
    quietSkip.hidden = !quietState.active || !quietState.skippable;
  };

  const renderDebrief = () => {
    const visible = debriefState?.visible === true;
    debriefNode.hidden = !visible;
    if (!visible) return;
    setText(debriefOutcome, debriefState.outcome);
    for (const axis of debriefState.axes) {
      const nodes = axisNodes.get(axis.id);
      if (!nodes) continue;
      setText(nodes.status, axis.status);
      setText(nodes.evidence, axis.evidence);
      nodes.node.setAttribute("data-status", canonicalToken(axis.status));
    }
    setText(correctionSummary, debriefState.correction.summary);
    setText(correctionEvidence, debriefState.correction.evidence);
    correction.setAttribute(
      "data-available",
      String(debriefState.correction.available),
    );
  };

  const quietSkipHandler = () => {
    if (!quietState.active || !quietState.skippable) return;
    if (typeof options.onQuietSkip === "function") {
      options.onQuietSkip(Object.freeze({
        kind: "CASEVAC_QUIET_SKIP_REQUESTED",
        presentationOnly: true,
      }));
    }
  };
  quietSkip.addEventListener("click", quietSkipHandler);

  const api = {
    element: root,
    update(frame = {}) {
      if (disposed) return null;
      if (Object.hasOwn(frame, "strip")) {
        stripState = frame.strip === null
          ? casevacMissionStripModel({ visible: false })
          : casevacMissionStripModel(frame.strip);
        renderStrip();
      }
      if (Object.hasOwn(frame, "events") || Object.hasOwn(frame, "streamId")) {
        consumeEvents(
          Object.hasOwn(frame, "streamId")
            ? frame.streamId
            : currentStreamId,
          frame.events,
        );
      }
      if (Object.hasOwn(frame, "quiet")) {
        quietState = frame.quiet && typeof frame.quiet === "object"
          ? {
            active: frame.quiet.active === true,
            skippable: frame.quiet.active === true
              && frame.quiet.skippable === true,
          }
          : { active: false, skippable: false };
        renderQuiet();
      }
      if (Object.hasOwn(frame, "debrief")) {
        debriefState = BUILT_DEBRIEF_MODELS.has(frame.debrief)
          ? frame.debrief
          : null;
        renderDebrief();
      }
      updateRootVisibility();
      return snapshotView(
        stripState,
        messages,
        quietState,
        debriefState,
      );
    },
    clearMessages() {
      if (disposed) return;
      resetMessages();
      updateRootVisibility();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      quietSkip.removeEventListener("click", quietSkipHandler);
      resetMessages();
      root.remove();
    },
    get disposed() {
      return disposed;
    },
  };
  return Object.freeze(api);
}
