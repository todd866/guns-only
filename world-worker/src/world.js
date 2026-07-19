export const PROTOCOL_VERSION = 2;
export const BROADCAST_INTERVAL_MS = 50;
export const MAXIMUM_MESSAGE_BYTES = 8 * 1024;
export const SECTOR_SPACING_METRES = 40_000;
export const BOGEYS_PER_SECTOR = 3;
export const HELLO_TIMEOUT_MS = 5_000;
export const PLAYER_STALE_AFTER_MS = 15_000;
export const MAINTENANCE_INTERVAL_MS = 5_000;
export const MESSAGE_RATE_PER_SECOND = 30;
export const MESSAGE_BURST_CAPACITY = 40;
export const MAXIMUM_INVALID_MESSAGES = 6;
export const MAXIMUM_IDENTITIES = 10_000;
// One Durable Object still fans each snapshot out to every recipient. Keep this deliberately
// conservative until measured load testing supports sector/interest-object sharding.
export const MAXIMUM_CONNECTIONS = 64;
export const MAXIMUM_PENDING_HANDSHAKES = 8;
export const MAXIMUM_OUTBOUND_BUFFER_BYTES = 256 * 1024;
export const INTEREST_RADIUS_METRES = 120_000;
export const MAXIMUM_VISIBLE_PLAYERS = 64;
export const MAXIMUM_VISIBLE_SECTORS = 16;

const originOnly = (value) => {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:")
      || url.username || url.password || url.search || url.hash
      || (url.pathname && url.pathname !== "/")) return "";
    return url.origin;
  } catch {
    return "";
  }
};

export function isAllowedOrigin(requestOrigin, configuredOrigins) {
  const requested = originOnly(requestOrigin);
  if (!requested) return false;
  return String(configuredOrigins || "https://guns-only.vercel.app")
    .split(",")
    .map(originOnly)
    .filter(Boolean)
    .includes(requested);
}

export function consumeMessageBudget(previous, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const priorTokens = Number.isFinite(previous?.tokens)
    ? Math.max(0, Math.min(MESSAGE_BURST_CAPACITY, previous.tokens))
    : MESSAGE_BURST_CAPACITY;
  const priorRefill = Number.isFinite(previous?.refillAtMs) ? previous.refillAtMs : now;
  const elapsedMs = Math.max(0, now - priorRefill);
  const available = Math.min(
    MESSAGE_BURST_CAPACITY,
    priorTokens + elapsedMs * MESSAGE_RATE_PER_SECOND / 1000,
  );
  const allowed = available >= 1;
  return {
    allowed,
    budget: {
      tokens: allowed ? available - 1 : available,
      refillAtMs: now,
    },
  };
}

export function sectorOrigin(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("invalid sector index");
  // A square spiral makes the first several pilots equally far apart without an ever-growing row.
  if (index === 0) return [0, 0, 0];
  const ring = Math.ceil((Math.sqrt(index + 1) - 1) / 2);
  const sideLength = ring * 2;
  const maximum = (ring * 2 + 1) ** 2 - 1;
  const offset = maximum - index;
  let x;
  let z;
  if (offset < sideLength) {
    x = ring - offset;
    z = -ring;
  } else if (offset < sideLength * 2) {
    x = -ring;
    z = -ring + (offset - sideLength);
  } else if (offset < sideLength * 3) {
    x = -ring + (offset - sideLength * 2);
    z = ring;
  } else {
    x = ring;
    z = ring - (offset - sideLength * 3);
  }
  return [x * SECTOR_SPACING_METRES, 0, z * SECTOR_SPACING_METRES];
}

export function normalisePilotKey(value) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  return /^[a-zA-Z0-9._-]{16,128}$/.test(clean) ? clean : "";
}

const validTriplet = (value, direction = false) => {
  if (!Array.isArray(value) || value.length !== 3
    || !value.every((component) => Number.isFinite(component) && Math.abs(component) <= 1_000_000)) {
    return false;
  }
  if (!direction) return true;
  const lengthSquared = value.reduce((sum, component) => sum + component * component, 0);
  return lengthSquared > 0.25 && lengthSquared < 4;
};

const normaliseDirection = (value) => {
  const length = Math.hypot(...value);
  return value.map((component) => component / length);
};

const cleanToken = (value, maximumLength, fallback) => {
  if (typeof value !== "string") return fallback;
  const cleaned = [...value.trim()]
    .filter((character) => /[a-zA-Z0-9._:-]/.test(character))
    .join("")
    .slice(0, maximumLength);
  return cleaned || fallback;
};

const VALID_PHASES = new Set(["READY", "ACTIVE", "PAUSED", "FINISHED"]);
const VALID_TERMINAL_STATES = new Set([
  "FLYING", "DESTROYED_AIRBORNE", "IMPACTED", "SETTLED", "SIMULATION_BOUNDED",
]);
const VALID_IMPACT_SURFACES = new Set([
  "NONE", "WATER", "FLIGHT_DECK", "CARRIER_STRUCTURE", "SIMULATION_BOUNDARY",
]);

export function normalisePresencePhase(value) {
  const candidate = cleanToken(value, 24, "ACTIVE").toUpperCase();
  return VALID_PHASES.has(candidate) ? candidate : "ACTIVE";
}

export function normaliseTerminalState(value, { alive = true, bodyPresent = alive } = {}) {
  const fallback = alive ? "FLYING" : bodyPresent ? "DESTROYED_AIRBORNE" : "SETTLED";
  const candidate = cleanToken(value, 32, fallback).toUpperCase();
  return VALID_TERMINAL_STATES.has(candidate) ? candidate : fallback;
}

export function normaliseImpactSurface(value, terminalState = "FLYING") {
  const fallback = terminalState === "SIMULATION_BOUNDED" ? "SIMULATION_BOUNDARY" : "NONE";
  const candidate = cleanToken(value, 32, fallback).toUpperCase();
  return VALID_IMPACT_SURFACES.has(candidate) ? candidate : fallback;
}

export function validatePose(message, previousSequence = -1) {
  if (!message || message.type !== "pose" || message.protocol !== PROTOCOL_VERSION
    || !Number.isSafeInteger(message.sequence) || message.sequence <= previousSequence
    || !Number.isSafeInteger(message.tick) || message.tick < 0
    || !validTriplet(message.position)
    || !validTriplet(message.forward, true)
    || !validTriplet(message.up, true)) return null;
  const forward = normaliseDirection(message.forward);
  const up = normaliseDirection(message.up);
  const cosine = Math.abs(forward.reduce(
    (sum, component, index) => sum + component * up[index], 0,
  ));
  if (!Number.isFinite(cosine) || cosine >= 0.98) return null;
  const alive = message.alive !== false;
  const terminalCandidate = cleanToken(message.terminalState, 32, "").toUpperCase();
  const hasTerminalState = VALID_TERMINAL_STATES.has(terminalCandidate);
  const bodyPresent = hasTerminalState
    ? terminalCandidate !== "SETTLED"
    : typeof message.bodyPresent === "boolean" ? message.bodyPresent : alive;
  const terminalState = normaliseTerminalState(
    message.terminalState, { alive, bodyPresent },
  );
  return {
    sequence: message.sequence,
    tick: message.tick,
    missionId: cleanToken(message.missionId, 96, "mission.unknown"),
    presentationId: cleanToken(
      message.presentationId, 128, "presentation.vehicle.player.v1",
    ),
    phase: normalisePresencePhase(message.phase),
    alive,
    entityId: cleanToken(message.entityId, 128, "") || null,
    bodyPresent,
    terminalState,
    impactSurface: normaliseImpactSurface(message.impactSurface, terminalState),
    position: message.position.slice(),
    forward,
    up,
  };
}

function seededUnit(sectorIndex, slot, salt) {
  let value = Math.imul(sectorIndex + 1, 0x45d9f3b)
    ^ Math.imul(slot + 11, 0x27d4eb2d)
    ^ Math.imul(salt + 101, 0x165667b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 0x1_0000_0000;
}

export function bogeysForSector(sectorIndex, worldCreatedAtMs, nowMs) {
  const origin = sectorOrigin(sectorIndex);
  const elapsedSeconds = Math.max(0, nowMs - worldCreatedAtMs) / 1000;
  const sequence = Math.max(0, Math.floor(nowMs / BROADCAST_INTERVAL_MS));
  return Array.from({ length: BOGEYS_PER_SECTOR }, (_, slot) => {
    const radius = 3_500 + seededUnit(sectorIndex, slot, 1) * 4_500;
    const altitude = 1_800 + seededUnit(sectorIndex, slot, 2) * 2_800;
    const angularVelocity = (0.012 + seededUnit(sectorIndex, slot, 3) * 0.014)
      * (slot % 2 === 0 ? 1 : -1);
    const phase = seededUnit(sectorIndex, slot, 4) * Math.PI * 2
      + elapsedSeconds * angularVelocity;
    const direction = Math.sign(angularVelocity);
    const forward = [-Math.sin(phase) * direction, 0, Math.cos(phase) * direction];
    return {
      bogeyId: `bogey-${sectorIndex}-${slot}`,
      entityId: `entity.world.bogey-${sectorIndex}-${slot}`,
      callsign: `BOGEY-${String(sectorIndex + 1).padStart(2, "0")}${slot + 1}`,
      sequence,
      sectorIndex,
      presentationId: "presentation.vehicle.bandit.v1",
      alive: true,
      bodyPresent: true,
      terminalState: "FLYING",
      impactSurface: "NONE",
      authority: "server-world",
      combatEligible: false,
      position: [
        origin[0] + Math.cos(phase) * radius,
        altitude,
        origin[2] + Math.sin(phase) * radius,
      ],
      forward,
      up: [0, 1, 0],
    };
  });
}

export function worldPosition(localPosition, origin) {
  return localPosition.map((component, index) => component + origin[index]);
}

const horizontalDistanceSquared = (left, right) =>
  (left[0] - right[0]) ** 2 + (left[2] - right[2]) ** 2;

export function visibleSectorsFor(observerSectorIndex, activeSectors) {
  const observerOrigin = sectorOrigin(observerSectorIndex);
  const maximumDistanceSquared = INTEREST_RADIUS_METRES ** 2;
  return [...new Set(activeSectors)]
    .filter((sector) => Number.isSafeInteger(sector) && sector >= 0)
    .map((sector) => ({
      sector,
      distanceSquared: horizontalDistanceSquared(observerOrigin, sectorOrigin(sector)),
    }))
    .filter((entry) => entry.distanceSquared <= maximumDistanceSquared)
    .sort((left, right) => left.distanceSquared - right.distanceSquared
      || left.sector - right.sector)
    .slice(0, MAXIMUM_VISIBLE_SECTORS)
    .map((entry) => entry.sector);
}

export function visiblePlayersFor(observerOrigin, players) {
  const maximumDistanceSquared = INTEREST_RADIUS_METRES ** 2;
  return players
    .map((player) => ({
      player,
      distanceSquared: horizontalDistanceSquared(observerOrigin, player.position),
    }))
    .filter((entry) => entry.distanceSquared <= maximumDistanceSquared)
    .sort((left, right) => left.distanceSquared - right.distanceSquared
      || left.player.playerId.localeCompare(right.player.playerId))
    .slice(0, MAXIMUM_VISIBLE_PLAYERS)
    .map((entry) => entry.player);
}
