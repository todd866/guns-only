import {
  BOGEYS_PER_SECTOR,
  BROADCAST_INTERVAL_MS,
  HELLO_TIMEOUT_MS,
  ADMISSION_BUCKET_HEADER,
  IDENTITY_ADMISSION_BUCKET_COUNT,
  IDENTITY_CAPACITY_WINDOW_MS,
  IDENTITY_CREATION_WINDOW_MS,
  IDENTITY_FORCED_SWEEP_RETRY_MS,
  IDENTITY_RETENTION_MS,
  IDENTITY_SWEEP_BATCH_SIZE,
  IDENTITY_SWEEP_INTERVAL_MS,
  IDENTITY_TOUCH_INTERVAL_MS,
  MAINTENANCE_INTERVAL_MS,
  MAXIMUM_CONNECTIONS,
  MAXIMUM_GLOBAL_IDENTITY_CREATIONS_PER_WINDOW,
  MAXIMUM_IDENTITIES,
  MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW,
  MAXIMUM_IDENTITY_CREATIONS_PER_SOURCE_WINDOW,
  MAXIMUM_FORCED_IDENTITY_SWEEP_BATCHES_PER_ALLOCATION,
  MAXIMUM_INVALID_MESSAGES,
  MAXIMUM_MESSAGE_BYTES,
  MAXIMUM_OUTBOUND_BUFFER_BYTES,
  MAXIMUM_PENDING_HANDSHAKES,
  MAXIMUM_PENDING_HANDSHAKES_PER_ADMISSION_BUCKET,
  PLAYER_STALE_AFTER_MS,
  PROTOCOL_VERSION,
  bogeysForSector,
  consumeIdentityCapacityBudget,
  consumeIdentityCreationBudget,
  consumeMessageBudget,
  consumeSourceIdentityCreationBudget,
  currentIdentityCreationCount,
  currentIdentityCapacityCreationCount,
  isAllowedOrigin,
  normalisePilotKey,
  sectorOrigin,
  trustedAdmissionBucketForRequest,
  validatePose,
  visiblePlayersFor,
  visibleSectorsFor,
  worldPosition,
} from "./world.js";

const json = (value, init = {}) => new Response(JSON.stringify(value), {
  ...init,
  headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
});

async function identityStorageKey(pilotKey) {
  const bytes = new TextEncoder().encode(pilotKey);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `pilot:${[...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

const publicIdentity = (identity) => ({
  playerId: identity.playerId,
  callsign: identity.callsign,
  sectorIndex: identity.sectorIndex,
  spawnOrigin: identity.spawnOrigin,
});

const validIdentityActivityMs = (identity) => Number.isFinite(identity?.lastSeenAtMs)
  ? identity.lastSeenAtMs : null;

const admissionBudgetStorageKey = (bucket) =>
  `identity-admission:${String(bucket).padStart(4, "0")}`;

const retrySeconds = (milliseconds) => Math.max(
  1, Math.ceil((Number.isFinite(milliseconds) ? milliseconds : 1_000) / 1_000),
);

const allocationAccepted = (identity, created) => ({
  ok: true,
  identity: publicIdentity(identity),
  created,
});

const allocationRejected = (reason, retryAfterMs) => ({
  ok: false,
  reason,
  retryAfterSeconds: retrySeconds(retryAfterMs),
});

const UNTRUSTED_SOURCE_RETRY_SECONDS = 60;
const ADMISSION_DIAGNOSTIC_INTERVAL_MS = 60_000;

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/room" && url.pathname !== "/healthz") {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/room"
      && !isAllowedOrigin(request.headers.get("Origin"), env.GUNS_ALLOWED_ORIGINS)) {
      return new Response("WebSocket origin is not allowed", { status: 403 });
    }
    let forwardedRequest = request;
    if (url.pathname === "/room") {
      const admissionBucket = await trustedAdmissionBucketForRequest(request);
      if (admissionBucket === null) {
        return new Response("Trusted client admission context is unavailable", {
          status: 503,
          headers: { "retry-after": String(UNTRUSTED_SOURCE_RETRY_SECONDS) },
        });
      }
      const headers = new Headers(request.headers);
      // Always overwrite a caller-supplied value. Only this edge Worker can reach the Durable
      // Object binding, so the forwarded bucket is trusted inside GlobalWorld.
      headers.set(ADMISSION_BUCKET_HEADER, String(admissionBucket));
      forwardedRequest = new Request(request, { headers });
    }
    const id = env.GLOBAL_WORLD.idFromName("global");
    return env.GLOBAL_WORLD.get(id).fetch(forwardedRequest);
  },
};

export default worker;

export class GlobalWorld {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.lastBroadcastAt = 0;
    this.world = null;
    this.identityAllocationTail = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => {
      this.world = await ctx.storage.get("world");
      if (!this.world) {
        const now = Date.now();
        this.world = {
          epoch: `world-${crypto.randomUUID()}`,
          createdAtMs: now,
          nextSector: 0,
          identityCount: 0,
          identityCapacityWindowStartedAtMs: now,
          identityCapacityCreationsInWindow: 0,
          identityCreationWindowStartedAtMs: now,
          identityCreationsInWindow: 0,
          identityAdmissionRejectionSignals: 0,
          identityAdmissionLastRejectedAtMs: null,
          identityAdmissionLastRejection: null,
          identitySweepAfterKey: null,
          identityForcedSweepActive: false,
          identityForcedSweepStopAfterKey: null,
          identityForcedSweepWrapped: false,
          lastIdentitySweepAtMs: 0,
          lastForcedIdentitySweepAtMs: 0,
        };
        await ctx.storage.put("world", this.world);
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    await this.pruneStaleSockets(now);
    if (url.pathname === "/healthz") {
      const connected = this.connectedSockets().length;
      return json({
        status: "ok",
        room: "global",
        connected,
        protocol: PROTOCOL_VERSION,
        worldEpoch: this.world.epoch,
        sectors: this.world.nextSector,
        identities: this.world.identityCount,
        identityCapacity: MAXIMUM_IDENTITIES,
        identityAdmission: {
          windowSeconds: IDENTITY_CREATION_WINDOW_MS / 1000,
          perSourceLimit: MAXIMUM_IDENTITY_CREATIONS_PER_SOURCE_WINDOW,
          globalEmergencyLimit: MAXIMUM_GLOBAL_IDENTITY_CREATIONS_PER_WINDOW,
          globalCreatedInWindow: currentIdentityCreationCount(this.world, now),
          capacityWindowSeconds: IDENTITY_CAPACITY_WINDOW_MS / 1000,
          capacityLimit: MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW,
          capacityCreatedInWindow: currentIdentityCapacityCreationCount(this.world, now),
          sampledRejectionIntervals: Number.isSafeInteger(
            this.world.identityAdmissionRejectionSignals,
          ) ? this.world.identityAdmissionRejectionSignals : 0,
          lastRejectedAtMs: Number.isFinite(this.world.identityAdmissionLastRejectedAtMs)
            ? this.world.identityAdmissionLastRejectedAtMs : null,
          lastRejection: typeof this.world.identityAdmissionLastRejection === "string"
            ? this.world.identityAdmissionLastRejection : null,
        },
        bogeysPerSector: BOGEYS_PER_SECTOR,
      });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const admissionBucket = this.normaliseAdmissionBucket(
      request.headers.get(ADMISSION_BUCKET_HEADER),
    );
    if (admissionBucket === null) {
      return new Response("Trusted client admission context is unavailable", {
        status: 503,
        headers: { "retry-after": String(UNTRUSTED_SOURCE_RETRY_SECONDS) },
      });
    }
    const handshakeCapacity = this.pendingHandshakeCapacity(admissionBucket);
    if (!handshakeCapacity.allowed) {
      return new Response(handshakeCapacity.message, {
        status: handshakeCapacity.status,
        headers: { "retry-after": String(handshakeCapacity.retryAfterSeconds) },
      });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      phase: "awaiting-hello",
      connectedAtMs: now,
      lastValidMessageAtMs: now,
      invalidMessages: 0,
      rateBudget: null,
      admissionBucket,
    });
    await this.scheduleMaintenance(now);
    return new Response(null, { status: 101, webSocket: client });
  }

  allSockets() {
    return this.ctx.getWebSockets().filter((socket) =>
      socket.readyState === undefined || socket.readyState === 1);
  }

  connectedSockets() {
    return this.allSockets().filter((socket) => {
      try { return Boolean(socket.deserializeAttachment()?.identity); }
      catch { return false; }
    });
  }

  pendingSockets() {
    return this.allSockets().filter((socket) => {
      try { return !socket.deserializeAttachment()?.identity; }
      catch { return true; }
    });
  }

  pendingHandshakeCapacity(admissionBucket) {
    const pending = this.pendingSockets();
    const sameBucket = pending.filter((socket) => {
      try {
        return socket.deserializeAttachment()?.admissionBucket === admissionBucket;
      } catch { return false; }
    }).length;
    if (sameBucket >= MAXIMUM_PENDING_HANDSHAKES_PER_ADMISSION_BUCKET) {
      return {
        allowed: false,
        status: 429,
        retryAfterSeconds: 2,
        message: "Client handshake capacity reached",
      };
    }
    if (pending.length >= MAXIMUM_PENDING_HANDSHAKES
      || this.allSockets().length >= MAXIMUM_CONNECTIONS + MAXIMUM_PENDING_HANDSHAKES) {
      return {
        allowed: false,
        status: 503,
        retryAfterSeconds: 10,
        message: "World handshake capacity reached",
      };
    }
    return { allowed: true };
  }

  normaliseAdmissionBucket(value) {
    if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return null;
    const bucket = Number(value);
    return Number.isSafeInteger(bucket) && bucket >= 0
      && bucket < IDENTITY_ADMISSION_BUCKET_COUNT ? bucket : null;
  }

  async scheduleMaintenance(now = Date.now()) {
    const desired = now + MAINTENANCE_INTERVAL_MS;
    const scheduled = await this.ctx.storage.getAlarm();
    if (scheduled === null || scheduled > desired) await this.ctx.storage.setAlarm(desired);
  }

  async alarm() {
    const now = Date.now();
    await this.pruneStaleSockets(now);
    const maintenance = this.identityAllocationTail
      .then(() => this.reclaimExpiredIdentities(now));
    this.identityAllocationTail = maintenance.catch(() => undefined);
    await maintenance;
    await this.broadcast(true, now);
    if (this.allSockets().length > 0) await this.ctx.storage.setAlarm(now + MAINTENANCE_INTERVAL_MS);
  }

  async pruneStaleSockets(now) {
    for (const socket of this.allSockets()) {
      let attachment;
      try { attachment = socket.deserializeAttachment() || {}; }
      catch { attachment = {}; }
      const awaitingHello = !attachment.identity;
      const lastActivity = awaitingHello
        ? attachment.connectedAtMs : attachment.lastValidMessageAtMs;
      const lifetime = awaitingHello ? HELLO_TIMEOUT_MS : PLAYER_STALE_AFTER_MS;
      if (!Number.isFinite(lastActivity) || now - lastActivity <= lifetime) continue;
      try {
        socket.close(
          awaitingHello ? 1008 : 1001,
          awaitingHello ? "Protocol hello timed out" : "Presence timed out",
        );
      } catch { /* already gone */ }
    }
  }

  allocateIdentity(pilotKey, allowCreate = true, admissionBucket = null) {
    const now = Date.now();
    const operation = this.identityAllocationTail
      .then(() => this.allocateIdentitySerial(
        pilotKey, allowCreate, now, admissionBucket,
      ));
    this.identityAllocationTail = operation.catch(() => undefined);
    return operation;
  }

  async recordIdentityAdmissionRejection(reason, now) {
    const lastRecordedAtMs = Number.isFinite(this.world.identityAdmissionLastRejectedAtMs)
      ? this.world.identityAdmissionLastRejectedAtMs : 0;
    // A rejected hello must not become a write-amplification primitive. Aggregate diagnostics are
    // persisted at most once per minute; the close frame remains the exact per-request signal.
    if (lastRecordedAtMs > 0 && now >= lastRecordedAtMs
      && now - lastRecordedAtMs < ADMISSION_DIAGNOSTIC_INTERVAL_MS) return;
    const previous = Number.isSafeInteger(this.world.identityAdmissionRejectionSignals)
      ? Math.max(0, this.world.identityAdmissionRejectionSignals) : 0;
    const nextWorld = {
      ...this.world,
      identityAdmissionRejectionSignals: Math.min(Number.MAX_SAFE_INTEGER, previous + 1),
      identityAdmissionLastRejectedAtMs: now,
      identityAdmissionLastRejection: reason,
    };
    await this.ctx.storage.put("world", nextWorld);
    this.world = nextWorld;
  }

  async allocateIdentitySerial(
    pilotKey,
    allowCreate,
    now = Date.now(),
    admissionBucket = null,
  ) {
    const storageKey = await identityStorageKey(pilotKey);
    const stored = await this.ctx.storage.get(storageKey);
    if (stored) {
      const lastSeenAtMs = validIdentityActivityMs(stored);
      if (lastSeenAtMs === null || now - lastSeenAtMs >= IDENTITY_TOUCH_INTERVAL_MS) {
        await this.ctx.storage.put(storageKey, {
          ...stored,
          createdAtMs: Number.isFinite(stored.createdAtMs) ? stored.createdAtMs : now,
          lastSeenAtMs: now,
        });
      }
      return allocationAccepted(stored, false);
    }
    if (!allowCreate) return allocationRejected("connection-capacity", 10_000);
    if (this.normaliseAdmissionBucket(String(admissionBucket)) === null) {
      await this.recordIdentityAdmissionRejection("untrusted-source", now);
      return allocationRejected(
        "untrusted-source", UNTRUSTED_SOURCE_RETRY_SECONDS * 1_000,
      );
    }
    await this.reclaimExpiredIdentities(now, this.world.identityCount >= MAXIMUM_IDENTITIES);
    if (this.world.identityCount >= MAXIMUM_IDENTITIES) {
      await this.recordIdentityAdmissionRejection("identity-capacity", now);
      const lastForcedSweep = Number.isFinite(this.world.lastForcedIdentitySweepAtMs)
        ? this.world.lastForcedIdentitySweepAtMs : 0;
      const retryAfterMs = this.world.identityForcedSweepActive === true
        ? IDENTITY_FORCED_SWEEP_RETRY_MS
        : lastForcedSweep > 0
          ? Math.max(1_000, IDENTITY_SWEEP_INTERVAL_MS - Math.max(0, now - lastForcedSweep))
          : IDENTITY_SWEEP_INTERVAL_MS;
      return allocationRejected(
        "identity-capacity",
        retryAfterMs,
      );
    }

    const sourceKey = admissionBudgetStorageKey(admissionBucket);
    const sourceBudget = consumeSourceIdentityCreationBudget(
      await this.ctx.storage.get(sourceKey), now,
    );
    const capacityBudget = consumeIdentityCapacityBudget(this.world, now);
    const globalBudget = consumeIdentityCreationBudget(capacityBudget.world, now);
    if (!sourceBudget.allowed || !globalBudget.allowed || !capacityBudget.allowed) {
      const reason = !sourceBudget.allowed && !globalBudget.allowed
        ? "source-and-global-rate-limit"
        : !sourceBudget.allowed ? "source-rate-limit"
          : !globalBudget.allowed ? "global-rate-limit" : "capacity-rate-limit";
      const retryAfterMs = Math.max(
        sourceBudget.allowed ? 0 : sourceBudget.retryAfterMs,
        globalBudget.allowed ? 0 : globalBudget.retryAfterMs,
        capacityBudget.allowed ? 0 : capacityBudget.retryAfterMs,
      );
      await this.recordIdentityAdmissionRejection(reason, now);
      return allocationRejected(reason, retryAfterMs);
    }

    const sectorIndex = this.world.nextSector;
    const identity = {
      playerId: `pilot-${crypto.randomUUID()}`,
      // identityCount falls when stale identities are reclaimed; the monotonic sector ordinal
      // keeps callsigns distinct from identities which remain live across a sweep.
      callsign: `PILOT-${String(sectorIndex + 1).padStart(4, "0")}`,
      sectorIndex,
      spawnOrigin: sectorOrigin(sectorIndex),
      createdAtMs: now,
      lastSeenAtMs: now,
    };
    const nextWorld = {
      ...globalBudget.world,
      nextSector: sectorIndex + 1,
      identityCount: this.world.identityCount + 1,
    };
    await this.ctx.storage.transaction(async (transaction) => {
      await transaction.put({
        [storageKey]: identity,
        [sourceKey]: sourceBudget.budget,
        world: nextWorld,
      });
    });
    this.world = nextWorld;
    return allocationAccepted(identity, true);
  }

  async reclaimExpiredIdentities(now = Date.now(), force = false) {
    if (this.world.identityForcedSweepActive === true
      && this.world.identityCount < MAXIMUM_IDENTITIES) {
      // A batch may have persisted the reclaimed slot immediately before an isolate restart.
      // Clear the now-unneeded forced-cycle marker so ordinary maintenance is not suppressed.
      const nextWorld = {
        ...this.world,
        identityForcedSweepActive: false,
        identityForcedSweepStopAfterKey: null,
        identityForcedSweepWrapped: false,
      };
      await this.ctx.storage.put("world", nextWorld);
      this.world = nextWorld;
    }
    // Do not let an alarm's one-page maintenance pass lose the persisted wrap boundary of a
    // capacity-forced cycle. The next bounded capacity attempt owns that cursor progression.
    if (!force && this.world.identityForcedSweepActive === true) return 0;

    const lastSweepAtMs = Number.isFinite(this.world.lastIdentitySweepAtMs)
      ? this.world.lastIdentitySweepAtMs : 0;
    if (!force && !this.world.identitySweepAfterKey
      && now - lastSweepAtMs < IDENTITY_SWEEP_INTERVAL_MS) return 0;

    const lastForcedSweepAtMs = Number.isFinite(this.world.lastForcedIdentitySweepAtMs)
      ? this.world.lastForcedIdentitySweepAtMs : 0;
    const forcedSweepActive = this.world.identityForcedSweepActive === true;
    if (force && !forcedSweepActive && !this.world.identitySweepAfterKey
      && lastForcedSweepAtMs > 0
      && now - lastForcedSweepAtMs < IDENTITY_SWEEP_INTERVAL_MS) return 0;

    if (force && !forcedSweepActive) {
      this.world = {
        ...this.world,
        identityForcedSweepActive: true,
        identityForcedSweepStopAfterKey:
          typeof this.world.identitySweepAfterKey === "string"
            ? this.world.identitySweepAfterKey : null,
        identityForcedSweepWrapped: false,
      };
    } else if (force && this.world.identityForcedSweepActive === true
      && this.world.identityForcedSweepStopAfterKey
      && this.world.identityForcedSweepWrapped !== true
      && !this.world.identitySweepAfterKey) {
      // Recover cleanly if the tail batch persisted its null cursor but the following one-pair
      // wrap-state write was interrupted.
      this.world = { ...this.world, identityForcedSweepWrapped: true };
    }

    const activePlayerIds = new Set(this.connectedSockets().map((socket) => {
      try { return socket.deserializeAttachment()?.identity?.playerId; }
      catch { return null; }
    }).filter(Boolean));
    let reclaimed = 0;
    const batchLimit = force
      ? MAXIMUM_FORCED_IDENTITY_SWEEP_BATCHES_PER_ALLOCATION : 1;
    for (let batchIndex = 0; batchIndex < batchLimit; batchIndex += 1) {
      const wrapBoundary = force
        && typeof this.world.identityForcedSweepStopAfterKey === "string"
        ? this.world.identityForcedSweepStopAfterKey : null;
      const wrapped = force && this.world.identityForcedSweepWrapped === true;
      const batch = await this.reclaimExpiredIdentityBatch(
        now,
        activePlayerIds,
        wrapped ? wrapBoundary : null,
      );
      reclaimed += batch.reclaimed;
      if (!force) break;
      if (this.world.identityCount < MAXIMUM_IDENTITIES) {
        const nextWorld = {
          ...this.world,
          identityForcedSweepActive: false,
          identityForcedSweepStopAfterKey: null,
          identityForcedSweepWrapped: false,
        };
        await this.ctx.storage.put("world", nextWorld);
        this.world = nextWorld;
        break;
      }
      if (!batch.completedCycle) continue;
      if (wrapBoundary && !wrapped) {
        // A persisted cursor means an earlier maintenance alarm already scanned the prefix. At
        // capacity, finish the tail then persist a wrap and re-check that prefix across bounded
        // attempts; only then is a cooldown-safe full keyspace cycle complete.
        const nextWorld = {
          ...this.world,
          identitySweepAfterKey: null,
          identityForcedSweepWrapped: true,
        };
        await this.ctx.storage.put("world", nextWorld);
        this.world = nextWorld;
        continue;
      }
      const nextWorld = {
        ...this.world,
        identityForcedSweepActive: false,
        identityForcedSweepStopAfterKey: null,
        identityForcedSweepWrapped: false,
        lastForcedIdentitySweepAtMs: now,
      };
      await this.ctx.storage.put("world", nextWorld);
      this.world = nextWorld;
      break;
    }
    return reclaimed;
  }

  async reclaimExpiredIdentityBatch(now, activePlayerIds, stopAfterKey = null) {
    const lastSweepAtMs = Number.isFinite(this.world.lastIdentitySweepAtMs)
      ? this.world.lastIdentitySweepAtMs : 0;
    const options = { prefix: "pilot:", limit: IDENTITY_SWEEP_BATCH_SIZE };
    if (this.world.identitySweepAfterKey) {
      options.startAfter = this.world.identitySweepAfterKey;
    }
    const identities = await this.ctx.storage.list(options);
    const expiredKeys = [];
    const legacyTouches = {};
    let lastKey = null;
    let reachedStopKey = false;
    for (const [key, identity] of identities) {
      if (stopAfterKey && key > stopAfterKey) {
        reachedStopKey = true;
        break;
      }
      lastKey = key;
      const lastSeenAtMs = validIdentityActivityMs(identity);
      if (lastSeenAtMs === null) {
        legacyTouches[key] = {
          ...identity,
          createdAtMs: Number.isFinite(identity?.createdAtMs) ? identity.createdAtMs : now,
          lastSeenAtMs: now,
        };
        if (stopAfterKey && key === stopAfterKey) {
          reachedStopKey = true;
          break;
        }
        continue;
      }
      if (now - lastSeenAtMs > IDENTITY_RETENTION_MS
        && !activePlayerIds.has(identity?.playerId)) expiredKeys.push(key);
      if (stopAfterKey && key === stopAfterKey) {
        reachedStopKey = true;
        break;
      }
    }
    const completedCycle = reachedStopKey || identities.size < IDENTITY_SWEEP_BATCH_SIZE;
    const nextWorld = {
      ...this.world,
      identityCount: Math.max(0, this.world.identityCount - expiredKeys.length),
      identitySweepAfterKey: completedCycle ? null : lastKey,
      lastIdentitySweepAtMs: completedCycle ? now : lastSweepAtMs,
      lastForcedIdentitySweepAtMs: Number.isFinite(this.world.lastForcedIdentitySweepAtMs)
        ? this.world.lastForcedIdentitySweepAtMs : 0,
    };
    await this.ctx.storage.transaction(async (transaction) => {
      if (expiredKeys.length > 0) await transaction.delete(expiredKeys);
      await transaction.put({ ...legacyTouches, world: nextWorld });
    });
    this.world = nextWorld;
    return { reclaimed: expiredKeys.length, completedCycle };
  }

  rejectInvalid(socket, attachment, reason = "Invalid presence message") {
    attachment.invalidMessages = (attachment.invalidMessages || 0) + 1;
    if (attachment.invalidMessages >= MAXIMUM_INVALID_MESSAGES) {
      try { socket.close(1008, reason); } catch { /* already gone */ }
      return;
    }
    socket.serializeAttachment(attachment);
  }

  replaceOlderConnection(socket, identity) {
    for (const existing of this.connectedSockets()) {
      if (existing === socket) continue;
      let attachment;
      try { attachment = existing.deserializeAttachment(); }
      catch { continue; }
      if (attachment?.identity?.playerId !== identity.playerId) continue;
      try { existing.close(4001, "Replaced by newer connection"); }
      catch { /* already gone */ }
    }
  }

  async webSocketMessage(socket, rawMessage) {
    if (typeof rawMessage !== "string") {
      socket.close(1003, "Text messages are required");
      return;
    }
    if (rawMessage.length > MAXIMUM_MESSAGE_BYTES
      || new TextEncoder().encode(rawMessage).byteLength > MAXIMUM_MESSAGE_BYTES) {
      socket.close(1009, "Message is too large");
      return;
    }
    let attachment;
    try { attachment = socket.deserializeAttachment() || { phase: "awaiting-hello" }; }
    catch { attachment = { phase: "awaiting-hello" }; }
    const now = Date.now();
    const rate = consumeMessageBudget(attachment.rateBudget, now);
    attachment.rateBudget = rate.budget;
    if (!rate.allowed) {
      socket.close(1008, "Presence message rate exceeded");
      return;
    }
    let message;
    try { message = JSON.parse(rawMessage); }
    catch {
      this.rejectInvalid(socket, attachment, "Repeated malformed JSON");
      return;
    }

    if (!attachment.identity) {
      const pilotKey = message?.type === "hello" && message.protocol === PROTOCOL_VERSION
        ? normalisePilotKey(message.pilotKey) : "";
      if (!pilotKey) {
        socket.close(1008, "Valid protocol hello required");
        return;
      }
      const atConnectionCapacity = this.connectedSockets().length >= MAXIMUM_CONNECTIONS;
      const allocation = await this.allocateIdentity(
        pilotKey, !atConnectionCapacity, attachment.admissionBucket,
      );
      if (!allocation.ok) {
        try {
          socket.send(JSON.stringify({
            type: "identity-unavailable",
            protocol: PROTOCOL_VERSION,
            reason: allocation.reason,
            retryAfterSeconds: allocation.retryAfterSeconds,
          }));
        } catch { /* the 1013 close below remains the retry signal */ }
        socket.close(
          1013,
          `${allocation.reason}; retry after ${allocation.retryAfterSeconds}s`,
        );
        return;
      }
      const { identity } = allocation;
      const existingIdentityConnection = this.connectedSockets().some((candidate) => {
        try {
          return candidate !== socket
            && candidate.deserializeAttachment()?.identity?.playerId === identity.playerId;
        } catch { return false; }
      });
      if (!existingIdentityConnection && this.connectedSockets().length >= MAXIMUM_CONNECTIONS) {
        socket.close(1013, "World connection capacity reached");
        return;
      }
      attachment = {
        ...attachment,
        phase: "online",
        identity,
        streamId: `stream-${crypto.randomUUID()}`,
        pose: null,
        lastValidMessageAtMs: now,
      };
      socket.serializeAttachment(attachment);
      this.replaceOlderConnection(socket, identity);
      socket.send(JSON.stringify({
        type: "welcome",
        protocol: PROTOCOL_VERSION,
        room: "global",
        ...identity,
        worldEpoch: this.world.epoch,
        serverTimeMs: now,
      }));
      await this.broadcast(true, now);
      return;
    }

    const previousSequence = attachment.pose?.sequence ?? -1;
    const pose = validatePose(message, previousSequence, attachment.pose);
    if (!pose) {
      this.rejectInvalid(socket, attachment);
      return;
    }
    attachment.pose = {
      ...pose,
      receivedAtMs: now,
      sectorIndex: attachment.identity.sectorIndex,
      authority: "client-presence",
      combatEligible: false,
      position: worldPosition(pose.position, attachment.identity.spawnOrigin),
    };
    attachment.lastValidMessageAtMs = now;
    socket.serializeAttachment(attachment);
    await this.broadcast(false, now);
  }

  async broadcast(force, now = Date.now()) {
    if (!force && now - this.lastBroadcastAt < BROADCAST_INTERVAL_MS) return;
    this.lastBroadcastAt = now;
    const sockets = this.connectedSockets();
    if (sockets.length === 0) return;
    const attachments = sockets.map((socket) => socket.deserializeAttachment());
    const activeSectors = [...new Set(attachments.map((value) => value.identity.sectorIndex))];
    const players = attachments
      .filter((value) => value.pose && now - value.pose.receivedAtMs <= PLAYER_STALE_AFTER_MS)
      .map((value) => ({
        playerId: value.identity.playerId,
        callsign: value.identity.callsign,
        sequence: value.pose.sequence,
        tick: value.pose.tick,
        missionId: value.pose.missionId,
        presentationId: value.pose.presentationId,
        phase: value.pose.phase,
        alive: value.pose.alive,
        entityId: value.pose.entityId,
        streamId: value.streamId,
        bodyPresent: value.pose.bodyPresent,
        terminalState: value.pose.terminalState,
        impactSurface: value.pose.impactSurface,
        sectorIndex: value.identity.sectorIndex,
        authority: "client-presence",
        combatEligible: false,
        position: value.pose.position,
        forward: value.pose.forward,
        up: value.pose.up,
      }));

    for (let index = 0; index < sockets.length; index += 1) {
      const socket = sockets[index];
      const recipient = attachments[index];
      if (Number.isFinite(socket.bufferedAmount)
        && socket.bufferedAmount > MAXIMUM_OUTBOUND_BUFFER_BYTES) {
        try { socket.close(1013, "Snapshot consumer is too slow"); } catch { /* gone */ }
        continue;
      }
      const observerPosition = recipient.pose?.position ?? recipient.identity.spawnOrigin;
      const visiblePlayers = visiblePlayersFor(observerPosition, players)
        .sort((left, right) => left.playerId.localeCompare(right.playerId));
      const visibleSectors = visibleSectorsFor(recipient.identity.sectorIndex, activeSectors);
      const bogeys = visibleSectors.flatMap((sector) =>
        bogeysForSector(sector, this.world.createdAtMs, now));
      const payload = JSON.stringify({
        type: "snapshot",
        protocol: PROTOCOL_VERSION,
        room: "global",
        worldEpoch: this.world.epoch,
        serverTimeMs: now,
        connected: sockets.length,
        visiblePlayers: visiblePlayers.length,
        visibleSectors: visibleSectors.length,
        players: visiblePlayers,
        bogeys,
      });
      try { socket.send(payload); }
      catch { try { socket.close(1011, "Snapshot delivery failed"); } catch { /* gone */ } }
    }
  }

  async webSocketClose() { await this.broadcast(true); }
  async webSocketError() { await this.broadcast(true); }
}
