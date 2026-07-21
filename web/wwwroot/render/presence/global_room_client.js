export const PRESENCE_PROTOCOL_VERSION = 2;
export const PRESENCE_SEND_INTERVAL_MS = 50;
export const PRESENCE_IDLE_SEND_INTERVAL_MS = 1_000;
export const PRESENCE_MAXIMUM_BUFFERED_BYTES = 64 * 1024;
export const PRESENCE_MAXIMUM_PLAYERS = 64;
export const PRESENCE_MAXIMUM_BOGEYS = 48;
const PILOT_KEY_STORAGE = "guns-only.pilot-key.v1";

const validTriplet = (value, { direction = false, maximumAbs = 1_000_000 } = {}) => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) return false;
  if (!direction) return value.every((component) => Math.abs(component) <= maximumAbs);
  const lengthSquared = value.reduce((sum, component) => sum + component * component, 0);
  return lengthSquared > 0.25 && lengthSquared < 4;
};

const cleanText = (value, maximumLength, fallback) => {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
  return cleaned || fallback;
};

const VALID_PHASES = new Set(["READY", "ACTIVE", "PAUSED", "FINISHED"]);
const VALID_TERMINAL_STATES = new Set([
  "FLYING", "DESTROYED_AIRBORNE", "IMPACTED", "SETTLED", "SIMULATION_BOUNDED",
]);
const VALID_IMPACT_SURFACES = new Set([
  "NONE", "WATER", "GROUND", "FLIGHT_DECK", "CARRIER_STRUCTURE", "SIMULATION_BOUNDARY",
]);
const normalisePhase = (value) => {
  const candidate = cleanText(value, 24, "ACTIVE").toUpperCase();
  return VALID_PHASES.has(candidate) ? candidate : "ACTIVE";
};
const normaliseTerminalState = (value, alive, bodyPresent) => {
  const fallback = alive ? "FLYING" : bodyPresent ? "DESTROYED_AIRBORNE" : "SETTLED";
  const candidate = cleanText(value, 32, fallback).toUpperCase();
  return VALID_TERMINAL_STATES.has(candidate) ? candidate : fallback;
};
const normaliseImpactSurface = (value, terminalState) => {
  const fallback = terminalState === "SIMULATION_BOUNDED" ? "SIMULATION_BOUNDARY" : "NONE";
  const candidate = cleanText(value, 32, fallback).toUpperCase();
  return VALID_IMPACT_SURFACES.has(candidate) ? candidate : fallback;
};

function normalisePlayer(value) {
  if (!value || typeof value !== "object"
    || typeof value.playerId !== "string"
    || !Number.isSafeInteger(value.sequence)
    || value.sequence < 0
    || !Number.isSafeInteger(value.tick)
    || value.tick < 0
    || !validTriplet(value.position, { maximumAbs: 10_000_000 })
    || !validTriplet(value.forward, { direction: true })
    || !validTriplet(value.up, { direction: true })) return null;
  const forwardLength = Math.hypot(...value.forward);
  const upLength = Math.hypot(...value.up);
  const frameCosine = Math.abs(value.forward.reduce(
    (sum, component, index) => sum + component * value.up[index], 0,
  ) / (forwardLength * upLength));
  if (!Number.isFinite(frameCosine) || frameCosine >= 0.98) return null;
  const terminalCandidate = cleanText(value.terminalState, 32, "").toUpperCase();
  const hasTerminalState = VALID_TERMINAL_STATES.has(terminalCandidate);
  const alive = hasTerminalState ? terminalCandidate === "FLYING" : value.alive !== false;
  const bodyPresent = hasTerminalState
    ? terminalCandidate !== "SETTLED"
    : typeof value.bodyPresent === "boolean" ? value.bodyPresent : alive;
  const terminalState = normaliseTerminalState(value.terminalState, alive, bodyPresent);
  return {
    playerId: cleanText(value.playerId, 80, "unknown"),
    callsign: cleanText(value.callsign, 24, "PILOT"),
    sequence: value.sequence,
    tick: value.tick,
    missionId: cleanText(value.missionId, 96, "mission.unknown"),
    presentationId: cleanText(value.presentationId, 128, "presentation.vehicle.player.v1"),
    phase: normalisePhase(value.phase),
    alive,
    entityId: cleanText(value.entityId, 128, "") || null,
    streamId: cleanText(value.streamId, 80, "") || null,
    bodyPresent,
    terminalState,
    impactSurface: normaliseImpactSurface(value.impactSurface, terminalState),
    sectorIndex: Number.isSafeInteger(value.sectorIndex) && value.sectorIndex >= 0
      ? value.sectorIndex : null,
    authority: "client-presence",
    combatEligible: false,
    position: value.position.slice(0, 3),
    forward: value.forward.slice(0, 3),
    up: value.up.slice(0, 3),
  };
}

function normaliseBogey(value) {
  if (!value || typeof value !== "object"
    || typeof value.bogeyId !== "string"
    || !Number.isSafeInteger(value.sequence)
    || value.sequence < 0
    || !validTriplet(value.position, { maximumAbs: 10_000_000 })
    || !validTriplet(value.forward, { direction: true })
    || !validTriplet(value.up, { direction: true })) return null;
  const forwardLength = Math.hypot(...value.forward);
  const upLength = Math.hypot(...value.up);
  const frameCosine = Math.abs(value.forward.reduce(
    (sum, component, index) => sum + component * value.up[index], 0,
  ) / (forwardLength * upLength));
  if (!Number.isFinite(frameCosine) || frameCosine >= 0.98) return null;
  const terminalCandidate = cleanText(value.terminalState, 32, "").toUpperCase();
  const hasTerminalState = VALID_TERMINAL_STATES.has(terminalCandidate);
  const alive = hasTerminalState ? terminalCandidate === "FLYING" : value.alive !== false;
  const bodyPresent = hasTerminalState
    ? terminalCandidate !== "SETTLED"
    : typeof value.bodyPresent === "boolean" ? value.bodyPresent : alive;
  const terminalState = normaliseTerminalState(value.terminalState, alive, bodyPresent);
  return {
    bogeyId: cleanText(value.bogeyId, 80, "bogey"),
    callsign: cleanText(value.callsign, 24, "BOGEY"),
    sequence: value.sequence,
    presentationId: cleanText(
      value.presentationId, 128, "presentation.vehicle.bandit.v1",
    ),
    alive,
    entityId: cleanText(value.entityId, 128, "") || value.bogeyId,
    streamId: null,
    bodyPresent,
    terminalState,
    impactSurface: normaliseImpactSurface(value.impactSurface, terminalState),
    sectorIndex: Number.isSafeInteger(value.sectorIndex) && value.sectorIndex >= 0
      ? value.sectorIndex : null,
    authority: "server-world",
    combatEligible: false,
    position: value.position.slice(0, 3),
    forward: value.forward.slice(0, 3),
    up: value.up.slice(0, 3),
  };
}

const uniqueContacts = (values, key) => {
  const seen = new Set();
  return values.filter((value) => {
    const id = value[key];
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export function normaliseRoomSnapshot(value) {
  if (!value || value.type !== "snapshot" || value.protocol !== PRESENCE_PROTOCOL_VERSION
    || !Number.isFinite(value.serverTimeMs) || !Array.isArray(value.players)
    || typeof value.worldEpoch !== "string" || !value.worldEpoch.trim()) return null;
  const players = uniqueContacts(value.players.slice(0, PRESENCE_MAXIMUM_PLAYERS)
    .map(normalisePlayer).filter(Boolean), "playerId");
  const bogeys = Array.isArray(value.bogeys)
    ? uniqueContacts(value.bogeys.slice(0, PRESENCE_MAXIMUM_BOGEYS)
      .map(normaliseBogey).filter(Boolean), "bogeyId") : [];
  return {
    type: "snapshot",
    protocol: PRESENCE_PROTOCOL_VERSION,
    room: cleanText(value.room, 32, "global"),
    worldEpoch: cleanText(value.worldEpoch, 80, "world.unknown"),
    serverTimeMs: value.serverTimeMs,
    connected: Number.isSafeInteger(value.connected) && value.connected >= 0
      ? value.connected : players.length,
    visiblePlayers: Number.isSafeInteger(value.visiblePlayers) && value.visiblePlayers >= 0
      ? value.visiblePlayers : players.length,
    visibleSectors: Number.isSafeInteger(value.visibleSectors) && value.visibleSectors >= 0
      ? value.visibleSectors : Math.ceil(bogeys.length / 3),
    players,
    bogeys,
  };
}

function translatedContact(contact, origin) {
  return {
    ...contact,
    position: contact.position.map((component, index) => component - origin[index]),
  };
}

export function resolvePilotKey({
  storage = globalThis.localStorage,
  cryptoImpl = globalThis.crypto,
} = {}) {
  try {
    const existing = storage?.getItem(PILOT_KEY_STORAGE);
    if (typeof existing === "string" && /^[a-zA-Z0-9._-]{16,128}$/.test(existing)) {
      return existing;
    }
  } catch {
    // Private browsing and locked-down embeds may deny storage; an ephemeral key still connects.
  }
  const generated = `browser-${cryptoImpl?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 128);
  try { storage?.setItem(PILOT_KEY_STORAGE, generated); }
  catch { /* Persistence is an enhancement, never a connection requirement. */ }
  return generated;
}

function webSocketUrl(origin, path = "/room") {
  const url = new URL(path, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

export function resolveGlobalRoomUrl({
  location = globalThis.location,
  configured = globalThis.GUNS_MULTIPLAYER_URL,
} = {}) {
  const query = new URLSearchParams(location?.search || "");
  const override = query.get("server");
  if (override === "off" || override === "0") return "";
  if (override === "same-origin") return webSocketUrl(location.origin);
  const localPage = location?.hostname === "localhost" || location?.hostname === "127.0.0.1"
    || location?.hostname === "::1";
  // A production query string must never redirect the stable browser identity and live pose to
  // an arbitrary WebSocket. Explicit endpoint overrides remain available from local QA pages.
  const candidate = override && localPage ? override : configured;
  if (candidate) {
    try {
      const url = new URL(candidate, location?.origin);
      return (url.protocol === "ws:" || url.protocol === "wss:")
        && !url.username && !url.password ? url.href : "";
    } catch {
      return "";
    }
  }
  if (localPage) {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.hostname}:5080/room`;
  }
  return "";
}

export class GlobalRoomClient {
  constructor({
    url = resolveGlobalRoomUrl(),
    WebSocketImpl = globalThis.WebSocket,
    now = () => performance.now(),
    setTimer = (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimer = (timer) => clearTimeout(timer),
    pilotKey = resolvePilotKey(),
    onSnapshot = () => {},
    onStatus = () => {},
  } = {}) {
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.pilotKey = pilotKey;
    this.onSnapshot = onSnapshot;
    this.onStatus = onStatus;
    this.socket = null;
    this.playerId = "";
    this.callsign = "";
    this.connected = 0;
    this.bogeys = 0;
    this.worldEpoch = "";
    this.sectorIndex = null;
    this.spawnOrigin = [0, 0, 0];
    this.sequence = 0;
    this.socketPresentationId = "";
    this.lastSentAt = Number.NEGATIVE_INFINITY;
    this.lastPublishedTransition = "";
    this.lastCadence = null;
    this.lastServerTimeMs = Number.NEGATIVE_INFINITY;
    this.reconnectDelayMs = 500;
    this.reconnectTimer = null;
    this.started = false;
    this.phase = url ? "idle" : "off";
    this.lastError = null;
    this.hasSnapshot = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (!this.url || typeof this.WebSocketImpl !== "function") {
      this.setStatus("off");
      return;
    }
    this.connect();
  }

  connect() {
    if (!this.started || !this.url) return;
    this.setStatus(this.playerId ? "reconnecting" : "connecting");
    let socket;
    try { socket = new this.WebSocketImpl(this.url); }
    catch (error) {
      this.lastError = String(error);
      this.scheduleReconnect();
      return;
    }
    this.socketPresentationId = "";
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      try {
        socket.send(JSON.stringify({
          type: "hello",
          protocol: PRESENCE_PROTOCOL_VERSION,
          pilotKey: this.pilotKey,
        }));
      } catch (error) {
        this.lastError = String(error);
        try { socket.close(); } catch { /* gone */ }
        return;
      }
      this.setStatus("connecting");
    });
    socket.addEventListener("message", (event) => {
      if (socket === this.socket) this.receive(event.data);
    });
    socket.addEventListener("error", () => {
      if (socket !== this.socket) return;
      this.lastError = "WebSocket transport error";
      this.setStatus(this.phase);
    });
    socket.addEventListener("close", () => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.socketPresentationId = "";
      this.clearRemoteContacts("disconnect");
      this.lastServerTimeMs = Number.NEGATIVE_INFINITY;
      if (!this.started) return;
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (!this.started || this.reconnectTimer !== null) return;
    this.setStatus("reconnecting");
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(10_000, this.reconnectDelayMs * 2);
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  clearRemoteContacts(reason) {
    this.connected = 0;
    this.bogeys = 0;
    if (!this.hasSnapshot) return;
    this.hasSnapshot = false;
    try {
      this.onSnapshot({
        type: "snapshot",
        protocol: PRESENCE_PROTOCOL_VERSION,
        room: "global",
        worldEpoch: this.worldEpoch || "world.unknown",
        serverTimeMs: Number.isFinite(this.lastServerTimeMs) ? this.lastServerTimeMs : 0,
        connected: 0,
        visiblePlayers: 0,
        visibleSectors: 0,
        players: [],
        bogeys: [],
        clearedBecause: reason,
      }, this.playerId);
    } catch (error) { this.lastError = String(error); }
  }

  reconnectForPresentationContract() {
    const socket = this.socket;
    this.socket = null;
    this.socketPresentationId = "";
    this.lastSentAt = Number.NEGATIVE_INFINITY;
    this.lastPublishedTransition = "";
    this.lastCadence = null;
    this.lastServerTimeMs = Number.NEGATIVE_INFINITY;
    this.clearRemoteContacts("presentation-contract-change");
    if (socket && socket.readyState < 2) {
      try { socket.close(4002, "Presentation contract changed"); }
      catch { /* The replacement connection remains the recovery path. */ }
    }
    // The browser pilot key is deliberately unchanged. Both room implementations resolve it to
    // the existing player identity and sector, while the fresh socket gets a new presentation pin.
    if (this.started) this.connect();
  }

  receive(raw) {
    let message;
    try { message = JSON.parse(raw); }
    catch { return; }
    if (message?.type === "welcome" && message.protocol === PRESENCE_PROTOCOL_VERSION) {
      const playerId = cleanText(message.playerId, 80, "");
      const worldEpoch = cleanText(message.worldEpoch, 80, "");
      const validOrigin = validTriplet(message.spawnOrigin, { maximumAbs: 10_000_000 });
      const sectorIndex = Number.isSafeInteger(message.sectorIndex) && message.sectorIndex >= 0
        ? message.sectorIndex : null;
      if (!playerId || !worldEpoch || !validOrigin || sectorIndex === null
        || !Number.isFinite(message.serverTimeMs)) {
        this.lastError = "Invalid multiplayer welcome contract";
        try { this.socket?.close(1008, "Invalid welcome contract"); } catch { /* gone */ }
        return;
      }
      if ((this.worldEpoch && this.worldEpoch !== worldEpoch)
        || (this.playerId && this.playerId !== playerId)) {
        this.clearRemoteContacts("world-identity-change");
      }
      this.playerId = playerId;
      this.callsign = cleanText(message.callsign, 24, "PILOT");
      this.worldEpoch = worldEpoch;
      this.sectorIndex = sectorIndex;
      this.spawnOrigin = message.spawnOrigin.slice(0, 3);
      this.lastServerTimeMs = Number.NEGATIVE_INFINITY;
      this.lastSentAt = Number.NEGATIVE_INFINITY;
      this.lastPublishedTransition = "";
      this.lastCadence = null;
      this.reconnectDelayMs = 500;
      this.lastError = null;
      this.setStatus("online");
      return;
    }
    const snapshot = normaliseRoomSnapshot(message);
    if (!snapshot || snapshot.serverTimeMs <= this.lastServerTimeMs) return;
    if (!this.playerId || snapshot.worldEpoch !== this.worldEpoch) {
      this.lastError = "Snapshot world epoch does not match the welcomed world";
      this.clearRemoteContacts("world-epoch-mismatch");
      try { this.socket?.close(1008, "Snapshot world epoch mismatch"); } catch { /* gone */ }
      return;
    }
    this.lastServerTimeMs = snapshot.serverTimeMs;
    const localSnapshot = {
      ...snapshot,
      players: snapshot.players.map((player) => translatedContact(player, this.spawnOrigin)),
      bogeys: snapshot.bogeys.map((bogey) => translatedContact(bogey, this.spawnOrigin)),
    };
    const statusChanged = this.phase !== "online" || this.connected !== snapshot.connected
      || this.bogeys !== snapshot.bogeys.length;
    this.connected = snapshot.connected;
    this.bogeys = snapshot.bogeys.length;
    this.hasSnapshot = true;
    this.lastError = null;
    try { this.onSnapshot(localSnapshot, this.playerId); }
    catch (error) { this.lastError = String(error); }
    if (statusChanged) this.setStatus("online");
  }

  publish(state) {
    const socket = this.socket;
    const now = this.now();
    // A reconnect retains playerId for UI continuity, so transport readiness alone is not enough:
    // wait for the new welcome before a pose can race ahead of its hello handshake.
    if (!state || !this.playerId || this.phase !== "online"
      || !socket || socket.readyState !== 1) return false;
    const position = [state.px, state.py, state.pz];
    const forward = [state.pfx, state.pfy, state.pfz];
    const up = [state.plx, state.ply, state.plz];
    if (!validTriplet(position) || !validTriplet(forward, { direction: true })
      || !validTriplet(up, { direction: true })) return false;
    if (Number.isFinite(socket.bufferedAmount)
      && socket.bufferedAmount > PRESENCE_MAXIMUM_BUFFERED_BYTES) return false;

    const phase = normalisePhase(state.session_phase);
    const terminalCandidate = cleanText(state.player_terminal_state, 32, "").toUpperCase();
    const hasExplicitTerminalState = VALID_TERMINAL_STATES.has(terminalCandidate);
    // Terminal state is lifecycle truth. An undamaged deck/water impact is still no longer a
    // combat-capable aircraft even when subsystem health leaves player_alive true.
    const alive = hasExplicitTerminalState
      ? terminalCandidate === "FLYING"
      : state.player_alive !== false;
    const bodyPresent = hasExplicitTerminalState
      ? terminalCandidate !== "SETTLED"
      : typeof state.player_body_present === "boolean" ? state.player_body_present : alive;
    const terminalState = normaliseTerminalState(
      state.player_terminal_state, alive, bodyPresent,
    );
    const impactSurface = normaliseImpactSurface(state.player_impact_surface, terminalState);
    const entityId = cleanText(state.player_entity_id, 128, "") || null;
    const missionId = cleanText(state.mission_definition_id, 96, "mission.unknown");
    const presentationId = cleanText(
      state.player_presentation_id, 128, "presentation.vehicle.player.v1",
    );
    if (this.socketPresentationId && presentationId !== this.socketPresentationId) {
      this.reconnectForPresentationContract();
      return false;
    }
    const sendInterval = phase === "ACTIVE"
      ? PRESENCE_SEND_INTERVAL_MS : PRESENCE_IDLE_SEND_INTERVAL_MS;
    const transition = [
      phase, alive, bodyPresent, terminalState, impactSurface,
      entityId || "legacy", missionId, presentationId,
    ].join("|");
    if (transition === this.lastPublishedTransition
      && now - this.lastSentAt < sendInterval) return false;

    const sequence = this.sequence + 1;
    const payload = JSON.stringify({
      type: "pose",
      protocol: PRESENCE_PROTOCOL_VERSION,
      sequence,
      tick: Number.isSafeInteger(state.tick) && state.tick >= 0 ? state.tick : 0,
      missionId,
      presentationId,
      phase,
      alive,
      entityId,
      bodyPresent,
      terminalState,
      impactSurface,
      position,
      forward,
      up,
    });
    try { socket.send(payload); }
    catch (error) {
      this.lastError = String(error);
      try { socket.close(); } catch { /* gone */ }
      return false;
    }
    this.sequence = sequence;
    this.socketPresentationId = presentationId;
    this.lastSentAt = now;
    this.lastPublishedTransition = transition;
    this.lastCadence = sendInterval === PRESENCE_SEND_INTERVAL_MS ? "20Hz" : "1Hz";
    return true;
  }

  stop() {
    this.started = false;
    if (this.reconnectTimer !== null) this.clearTimer(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.socketPresentationId = "";
    if (socket && socket.readyState < 2) socket.close(1000, "Leaving room");
    this.clearRemoteContacts("stopped");
    this.setStatus(this.url ? "offline" : "off");
  }

  setStatus(phase) {
    this.phase = phase;
    try { this.onStatus(this.diagnostics()); }
    catch (error) { this.lastError = String(error); }
  }

  diagnostics() {
    return Object.freeze({
      url: this.url || null,
      phase: this.phase,
      playerId: this.playerId || null,
      callsign: this.callsign || null,
      connected: this.connected,
      bogeys: this.bogeys,
      worldEpoch: this.worldEpoch || null,
      sectorIndex: this.sectorIndex,
      spawnOrigin: Object.freeze(this.spawnOrigin.slice()),
      sequence: this.sequence,
      socketPresentationId: this.socketPresentationId || null,
      cadence: this.lastCadence,
      lastServerTimeMs: Number.isFinite(this.lastServerTimeMs) ? this.lastServerTimeMs : null,
      lastError: this.lastError,
    });
  }
}
