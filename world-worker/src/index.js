import {
  BOGEYS_PER_SECTOR,
  BROADCAST_INTERVAL_MS,
  HELLO_TIMEOUT_MS,
  MAINTENANCE_INTERVAL_MS,
  MAXIMUM_CONNECTIONS,
  MAXIMUM_IDENTITIES,
  MAXIMUM_INVALID_MESSAGES,
  MAXIMUM_MESSAGE_BYTES,
  MAXIMUM_OUTBOUND_BUFFER_BYTES,
  MAXIMUM_PENDING_HANDSHAKES,
  PLAYER_STALE_AFTER_MS,
  PROTOCOL_VERSION,
  bogeysForSector,
  consumeMessageBudget,
  isAllowedOrigin,
  normalisePilotKey,
  sectorOrigin,
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/room" && url.pathname !== "/healthz") {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/room"
      && !isAllowedOrigin(request.headers.get("Origin"), env.GUNS_ALLOWED_ORIGINS)) {
      return new Response("WebSocket origin is not allowed", { status: 403 });
    }
    const id = env.GLOBAL_WORLD.idFromName("global");
    return env.GLOBAL_WORLD.get(id).fetch(request);
  },
};

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
        this.world = {
          epoch: `world-${crypto.randomUUID()}`,
          createdAtMs: Date.now(),
          nextSector: 0,
          identityCount: 0,
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
        bogeysPerSector: BOGEYS_PER_SECTOR,
      });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    if (this.allSockets().length >= MAXIMUM_CONNECTIONS + MAXIMUM_PENDING_HANDSHAKES) {
      return new Response("World is at connection capacity", {
        status: 503,
        headers: { "retry-after": "10" },
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

  async scheduleMaintenance(now = Date.now()) {
    const desired = now + MAINTENANCE_INTERVAL_MS;
    const scheduled = await this.ctx.storage.getAlarm();
    if (scheduled === null || scheduled > desired) await this.ctx.storage.setAlarm(desired);
  }

  async alarm() {
    const now = Date.now();
    await this.pruneStaleSockets(now);
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

  allocateIdentity(pilotKey, allowCreate = true) {
    const operation = this.identityAllocationTail
      .then(() => this.allocateIdentitySerial(pilotKey, allowCreate));
    this.identityAllocationTail = operation.catch(() => undefined);
    return operation;
  }

  async allocateIdentitySerial(pilotKey, allowCreate) {
    const storageKey = await identityStorageKey(pilotKey);
    const stored = await this.ctx.storage.get(storageKey);
    if (stored) return stored;
    if (!allowCreate || this.world.identityCount >= MAXIMUM_IDENTITIES) return null;
    const sectorIndex = this.world.nextSector;
    const identity = {
      playerId: `pilot-${crypto.randomUUID()}`,
      callsign: `PILOT-${String(this.world.identityCount + 1).padStart(4, "0")}`,
      sectorIndex,
      spawnOrigin: sectorOrigin(sectorIndex),
    };
    const nextWorld = {
      ...this.world,
      nextSector: sectorIndex + 1,
      identityCount: this.world.identityCount + 1,
    };
    await this.ctx.storage.put({ [storageKey]: identity, world: nextWorld });
    this.world = nextWorld;
    return identity;
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
      const identity = await this.allocateIdentity(pilotKey, !atConnectionCapacity);
      if (!identity) {
        socket.close(1013, atConnectionCapacity
          ? "World connection capacity reached" : "World identity capacity reached");
        return;
      }
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
