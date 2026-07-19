const cleanLabel = (value, maximumLength, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
  return cleaned || fallback;
};

const contactId = (contact) => cleanLabel(
  contact?.playerId ?? contact?.bogeyId,
  80,
  "unknown",
);
const PHASES = new Set(["READY", "ACTIVE", "PAUSED", "FINISHED"]);
const TERMINAL_STATES = new Set([
  "FLYING", "DESTROYED_AIRBORNE", "IMPACTED", "SETTLED", "SIMULATION_BOUNDED",
]);
const IMPACT_SURFACES = new Set([
  "NONE", "WATER", "FLIGHT_DECK", "CARRIER_STRUCTURE", "SIMULATION_BOUNDARY",
]);

/**
 * Project transport state into the small set of facts the 3D presence layer actually needs.
 *
 * `alive` is a combat fact: a catastrophically damaged aircraft is no longer combat-capable.
 * `bodyPresent` is a presentation fact: that same aircraft must remain visible while terminal
 * physics integrates it through impact. Keeping these separate prevents a remote kill from
 * popping out of existence before the authoritative wreck motion has finished.
 */
export function projectRemoteContact(contact) {
  const alive = contact?.alive !== false;
  const bodyPresent = typeof contact?.bodyPresent === "boolean"
    ? contact.bodyPresent
    : alive; // Protocol-v2 fallback until the explicit physical-presence field is available.
  const id = contactId(contact);
  const entityId = cleanLabel(contact?.entityId, 128);
  const streamId = cleanLabel(contact?.streamId, 80);
  const missionId = cleanLabel(contact?.missionId, 96, "mission.unknown");
  const phaseCandidate = cleanLabel(contact?.phase, 24, "ACTIVE").toUpperCase();
  const phase = PHASES.has(phaseCandidate) ? phaseCandidate : "ACTIVE";
  const terminalFallback = alive ? "FLYING" : bodyPresent ? "DESTROYED_AIRBORNE" : "SETTLED";
  const terminalCandidate = cleanLabel(contact?.terminalState, 32, terminalFallback).toUpperCase();
  const terminalState = TERMINAL_STATES.has(terminalCandidate) ? terminalCandidate : terminalFallback;
  const impactFallback = terminalState === "SIMULATION_BOUNDED"
    ? "SIMULATION_BOUNDARY" : "NONE";
  const impactCandidate = cleanLabel(contact?.impactSurface, 32, impactFallback).toUpperCase();
  return Object.freeze({
    id,
    alive,
    bodyPresent,
    terminalState,
    impactSurface: IMPACT_SURFACES.has(impactCandidate) ? impactCandidate : impactFallback,
    phase,
    missionId,
    entityId: entityId || null,
    streamId: streamId || null,
    // A new per-sortie entity is a discontinuity even when the browser pilot identity and mission
    // stay the same. Legacy peers fall back to mission, which still fixes cross-mission restaging.
    continuityKey: `${id}|${streamId || "legacy-stream"}|${entityId || missionId}`,
  });
}

export function shouldResetRemoteInterpolation(previousContinuityKey, projection) {
  return Boolean(previousContinuityKey && projection?.continuityKey
    && previousContinuityKey !== projection.continuityKey);
}

export function remoteContactVisible(projection, { historicalReplay = false } = {}) {
  // Incident replay is recorded local truth. Showing current room traffic in the same scene would
  // combine two different times and let an unrelated live contact contaminate the lesson.
  return !historicalReplay && projection?.bodyPresent === true;
}

/** Return concise visible copy plus a teaching-oriented tooltip for the room status chip. */
export function presenceStatusPresentation(status) {
  const phase = cleanLabel(status?.phase, 24, "off").toLowerCase();
  const callsign = cleanLabel(status?.callsign, 24);
  const prefix = callsign ? `${callsign} · ` : "";
  const count = Math.max(phase === "online" ? 1 : 0, Number(status?.connected) || 0);
  const bogeys = Math.max(0, Number(status?.bogeys) || 0);

  let text;
  if (phase === "online") {
    text = `${prefix}GLOBAL · ${count} ${count === 1 ? "PILOT" : "PILOTS"} · ${bogeys} BOGEYS`;
  } else if (phase === "connecting") {
    text = `${prefix}GLOBAL · CONNECTING`;
  } else if (phase === "reconnecting") {
    text = `${prefix}GLOBAL · RECONNECTING`;
  } else if (phase === "offline") {
    text = `${prefix}GLOBAL · OFFLINE`;
  } else {
    text = "SOLO · ROOM NOT CONFIGURED";
  }

  const origin = Array.isArray(status?.spawnOrigin)
    && status.spawnOrigin.length === 3
    && status.spawnOrigin.every(Number.isFinite)
    ? status.spawnOrigin.map(Math.round)
    : null;
  const sector = origin ? ` Assigned world origin ${origin.join(" / ")} m.` : "";
  const title = callsign
    ? `${callsign} is this browser's local pilot identity.${sector}`
    : "Global multiplayer presence";
  return Object.freeze({ text, title, callsign, count, bogeys, phase });
}

/**
 * Low-volume context for flight telemetry. This deliberately excludes the browser pilot key and
 * every remote pose: connection/sector facts are enough to correlate a sortie with room health,
 * while duplicating a 20 Hz world snapshot would add cost without improving flight reconstruction.
 */
export function presenceTelemetryContext(status) {
  const origin = Array.isArray(status?.spawnOrigin)
    && status.spawnOrigin.length === 3
    && status.spawnOrigin.every(Number.isFinite)
    ? status.spawnOrigin.map(Math.round)
    : null;
  return Object.freeze({
    phase: cleanLabel(status?.phase, 24, "off").toLowerCase(),
    playerId: cleanLabel(status?.playerId, 80) || null,
    callsign: cleanLabel(status?.callsign, 24) || null,
    worldEpoch: cleanLabel(status?.worldEpoch, 80) || null,
    spawnOrigin: origin,
    connected: Math.max(0, Number(status?.connected) || 0),
    bogeys: Math.max(0, Number(status?.bogeys) || 0),
  });
}
