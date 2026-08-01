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
export const IDENTITY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const IDENTITY_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const IDENTITY_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
// Reserve one storage.put entry for the world cursor: a batch of 127 legacy identities plus the
// world record exactly meets Durable Object storage's 128-pair bulk-operation limit.
export const IDENTITY_SWEEP_BATCH_SIZE = 127;
export const MAXIMUM_FORCED_IDENTITY_SWEEP_BATCHES_PER_ALLOCATION = 4;
export const IDENTITY_FORCED_SWEEP_RETRY_MS = 5_000;
export const IDENTITY_CREATION_WINDOW_MS = 60 * 60 * 1000;
export const MAXIMUM_IDENTITY_CREATIONS_PER_SOURCE_WINDOW = 12;
export const MAXIMUM_GLOBAL_IDENTITY_CREATIONS_PER_WINDOW = 1_200;
export const IDENTITY_CAPACITY_WINDOW_MS = 24 * 60 * 60 * 1000;
// A strict `> 90 days` expiry can leave the boundary cohort live when the next window opens.
// Dividing by retention windows plus that one cohort guarantees fixed-window admission cannot
// consume the finite namespace before any identity has had its full retention opportunity.
export const IDENTITY_LIVE_CAPACITY_WINDOWS =
  Math.ceil(IDENTITY_RETENTION_MS / IDENTITY_CAPACITY_WINDOW_MS) + 1;
export const MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW = Math.floor(
  MAXIMUM_IDENTITIES / IDENTITY_LIVE_CAPACITY_WINDOWS,
);
// Admission principals are hashed into a fixed number of persisted buckets. This deliberately
// trades a small collision risk for a hard storage bound: attacker-controlled source addresses
// can never create an unbounded collection of limiter records.
export const IDENTITY_ADMISSION_BUCKET_COUNT = 1_024;
// One Durable Object still fans each snapshot out to every recipient. Keep this deliberately
// conservative until measured load testing supports sector/interest-object sharding.
export const MAXIMUM_CONNECTIONS = 64;
export const MAXIMUM_PENDING_HANDSHAKES = 8;
export const MAXIMUM_PENDING_HANDSHAKES_PER_ADMISSION_BUCKET = 2;
export const MAXIMUM_OUTBOUND_BUFFER_BYTES = 256 * 1024;
export const INTEREST_RADIUS_METRES = 120_000;
export const MAXIMUM_VISIBLE_PLAYERS = 64;
export const MAXIMUM_VISIBLE_SECTORS = 16;

export const ADMISSION_BUCKET_HEADER = "x-guns-internal-admission-bucket";
const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const connectingAddressPrincipal = (value) => {
  if (typeof value !== "string") return "";
  const clean = value.trim().toLowerCase();
  if (clean.length <= 2 || clean.length > 64 || !/^[0-9a-f:.]+$/.test(clean)) return "";
  if (!clean.includes(":")) {
    const octets = clean.split(".");
    if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet)
      || Number(octet) > 255)) return "";
    return `ipv4:${octets.map(Number).join(".")}`;
  }
  try {
    const canonical = new URL(`http://[${clean}]/`).hostname.slice(1, -1);
    const halves = canonical.split("::");
    if (halves.length > 2) return "";
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
    const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right]
      .map((group) => group.padStart(4, "0"));
    if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{4}$/.test(group))) return "";
    // A mapped IPv4 address has no meaningful IPv6 /64 ownership boundary; preserve its exact
    // final 32 bits instead. Native IPv6 privacy-address rotation stays within one /64 principal.
    if (groups.slice(0, 5).every((group) => group === "0000") && groups[5] === "ffff") {
      return `ipv4-mapped:${groups[6]}:${groups[7]}`;
    }
    return `ipv6-64:${groups.slice(0, 4).join(":")}`;
  } catch {
    return "";
  }
};

async function admissionBucketForSource(source) {
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(`guns-only-admission-v1:${source}`),
  );
  return new DataView(digest).getUint32(0, false) % IDENTITY_ADMISSION_BUCKET_COUNT;
}

export async function trustedAdmissionBucketForRequest(request) {
  const url = new URL(request.url);
  if (request.cf) {
    const principal = connectingAddressPrincipal(
      request.headers.get("CF-Connecting-IP"),
    );
    return principal ? admissionBucketForSource(principal) : null;
  }
  // Miniflare and the checked-in local server do not provide Cloudflare request metadata. A
  // single fixed local principal preserves development without allowing a public non-edge route
  // to accept a caller-selected forwarding header.
  if (LOCAL_DEVELOPMENT_HOSTS.has(url.hostname)) {
    return admissionBucketForSource(`local-development:${url.hostname}`);
  }
  return null;
}

const consumeFixedWindowBudget = (
  previousStart,
  previousCount,
  nowMs,
  maximum,
  windowMs = IDENTITY_CREATION_WINDOW_MS,
) => {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const start = Number.isFinite(previousStart) ? previousStart : now;
  const count = Number.isSafeInteger(previousCount) ? Math.max(0, previousCount) : 0;
  const resetWindow = now < start || now - start >= windowMs;
  const windowStartedAtMs = resetWindow ? now : start;
  const creationsInWindow = resetWindow ? 0 : count;
  const allowed = creationsInWindow < maximum;
  return {
    allowed,
    windowStartedAtMs,
    creationsInWindow: allowed ? creationsInWindow + 1 : creationsInWindow,
    retryAfterMs: allowed ? 0 : Math.max(1, windowMs
      - Math.max(0, now - windowStartedAtMs)),
  };
};

export function consumeIdentityCapacityBudget(world, nowMs) {
  const budget = consumeFixedWindowBudget(
    world?.identityCapacityWindowStartedAtMs,
    world?.identityCapacityCreationsInWindow,
    nowMs,
    MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW,
    IDENTITY_CAPACITY_WINDOW_MS,
  );
  return {
    allowed: budget.allowed,
    retryAfterMs: budget.retryAfterMs,
    world: {
      ...world,
      identityCapacityWindowStartedAtMs: budget.windowStartedAtMs,
      identityCapacityCreationsInWindow: budget.creationsInWindow,
    },
  };
}

export function consumeIdentityCreationBudget(world, nowMs) {
  const budget = consumeFixedWindowBudget(
    world?.identityCreationWindowStartedAtMs,
    world?.identityCreationsInWindow,
    nowMs,
    MAXIMUM_GLOBAL_IDENTITY_CREATIONS_PER_WINDOW,
  );
  return {
    allowed: budget.allowed,
    retryAfterMs: budget.retryAfterMs,
    world: {
      ...world,
      identityCreationWindowStartedAtMs: budget.windowStartedAtMs,
      identityCreationsInWindow: budget.creationsInWindow,
    },
  };
}

export function consumeSourceIdentityCreationBudget(previous, nowMs) {
  const budget = consumeFixedWindowBudget(
    previous?.windowStartedAtMs,
    previous?.creationsInWindow,
    nowMs,
    MAXIMUM_IDENTITY_CREATIONS_PER_SOURCE_WINDOW,
  );
  return {
    allowed: budget.allowed,
    retryAfterMs: budget.retryAfterMs,
    budget: {
      windowStartedAtMs: budget.windowStartedAtMs,
      creationsInWindow: budget.creationsInWindow,
    },
  };
}

export function currentIdentityCreationCount(world, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const start = Number.isFinite(world?.identityCreationWindowStartedAtMs)
    ? world.identityCreationWindowStartedAtMs : now;
  if (now < start || now - start >= IDENTITY_CREATION_WINDOW_MS) return 0;
  return Number.isSafeInteger(world?.identityCreationsInWindow)
    ? Math.max(0, world.identityCreationsInWindow) : 0;
}

export function currentIdentityCapacityCreationCount(world, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const start = Number.isFinite(world?.identityCapacityWindowStartedAtMs)
    ? world.identityCapacityWindowStartedAtMs : now;
  if (now < start || now - start >= IDENTITY_CAPACITY_WINDOW_MS) return 0;
  return Number.isSafeInteger(world?.identityCapacityCreationsInWindow)
    ? Math.max(0, world.identityCapacityCreationsInWindow) : 0;
}

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
  return String(configuredOrigins || "https://guns-only.com")
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
  "NONE", "WATER", "GROUND", "FLIGHT_DECK", "CARRIER_STRUCTURE", "SIMULATION_BOUNDARY",
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

const PLAYER_PRESENTATION_IDS = new Set([
  "presentation.vehicle.player.v1",
  "presentation.vehicle.glider-strike.v1",
  "presentation.vehicle.f22a.public-data-surrogate.v1",
  "presentation.vehicle.rapier.public-data-surrogate.v1",
]);

function normalisePlayerPresentationId(value) {
  const candidate = cleanToken(value, 128, "presentation.vehicle.player.v1");
  return PLAYER_PRESENTATION_IDS.has(candidate)
    ? candidate
    : "presentation.vehicle.player.v1";
}

function presentationForConnection(requestedPresentationId, previousPose) {
  const requested = normalisePlayerPresentationId(requestedPresentationId);
  if (!previousPose) return requested;
  // entityId is also client-reported, so changing it cannot authorize a model allocation. Keep
  // one presentation for the validated socket lifetime; a reconnect is the current trusted edge.
  return normalisePlayerPresentationId(previousPose.presentationId);
}

export function validatePose(message, previousSequence = -1, previousPose = null) {
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
  const terminalCandidate = cleanToken(message.terminalState, 32, "").toUpperCase();
  const hasTerminalState = VALID_TERMINAL_STATES.has(terminalCandidate);
  const alive = hasTerminalState ? terminalCandidate === "FLYING" : message.alive !== false;
  const bodyPresent = hasTerminalState
    ? terminalCandidate !== "SETTLED"
    : typeof message.bodyPresent === "boolean" ? message.bodyPresent : alive;
  const entityId = cleanToken(message.entityId, 128, "") || null;
  const terminalState = normaliseTerminalState(
    message.terminalState, { alive, bodyPresent },
  );
  return {
    sequence: message.sequence,
    tick: message.tick,
    missionId: cleanToken(message.missionId, 96, "mission.unknown"),
    presentationId: presentationForConnection(message.presentationId, previousPose),
    phase: normalisePresencePhase(message.phase),
    alive,
    entityId,
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
