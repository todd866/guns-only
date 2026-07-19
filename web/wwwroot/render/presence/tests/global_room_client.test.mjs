import test from "node:test";
import assert from "node:assert/strict";
import {
  GlobalRoomClient,
  normaliseRoomSnapshot,
  resolvePilotKey,
  resolveGlobalRoomUrl,
} from "../global_room_client.js";

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
    this.bufferedAmount = 0;
    this.closedWith = null;
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  emit(type, value = {}) { this.listeners.get(type)?.(value); }
  send(value) { this.sent.push(value); }
  close(code, reason) { this.readyState = 3; this.closedWith = { code, reason }; }
}

const welcome = (socket, {
  playerId = "pilot-own",
  callsign = "PILOT-OWN",
  worldEpoch = "world-test",
  sectorIndex = 0,
  spawnOrigin = [0, 0, 0],
  serverTimeMs = 1,
} = {}) => socket.emit("message", { data: JSON.stringify({
  type: "welcome",
  protocol: 2,
  playerId,
  callsign,
  worldEpoch,
  sectorIndex,
  spawnOrigin,
  serverTimeMs,
}) });

const flyingState = ({
  presentationId = "presentation.vehicle.player.v1",
  entityId = "entity.player.1",
  missionId = "mission.perch-attack.v1",
} = {}) => ({
  tick: 1,
  px: 0, py: 1_000, pz: 0,
  pfx: 0, pfy: 0, pfz: 1,
  plx: 0, ply: 1, plz: 0,
  mission_definition_id: missionId,
  player_presentation_id: presentationId,
  player_entity_id: entityId,
  player_terminal_state: "FLYING",
  player_alive: true,
  session_phase: "ACTIVE",
});

test("global-room URL defaults locally and stays opt-in in production", () => {
  assert.equal(resolveGlobalRoomUrl({
    location: { hostname: "localhost", protocol: "http:", origin: "http://localhost:8877", search: "" },
  }), "ws://localhost:5080/room");
  assert.equal(resolveGlobalRoomUrl({
    location: { hostname: "guns-only.vercel.app", protocol: "https:", origin: "https://guns-only.vercel.app", search: "" },
  }), "");
  assert.equal(resolveGlobalRoomUrl({
    location: { hostname: "example.test", protocol: "https:", origin: "https://example.test", search: "?server=wss%3A%2F%2Frealtime.example.test%2Froom" },
  }), "");
  assert.equal(resolveGlobalRoomUrl({
    location: { hostname: "localhost", protocol: "http:", origin: "http://localhost:8877", search: "?server=ws%3A%2F%2Flocalhost%3A5081%2Froom" },
  }), "ws://localhost:5081/room");
});

test("room snapshots reject invalid transport data and keep valid pilots", () => {
  assert.equal(normaliseRoomSnapshot({ type: "snapshot", protocol: 99, players: [] }), null);
  const snapshot = normaliseRoomSnapshot({
    type: "snapshot",
    protocol: 2,
    room: "global",
    worldEpoch: "world-test",
    serverTimeMs: 100,
    connected: 2,
    players: [{
      playerId: "pilot-1",
      callsign: "PILOT-1",
      sequence: 2,
      tick: 120,
      position: [1, 2, 3],
      forward: [0, 0, 1],
      up: [0, 1, 0],
      alive: false,
      entityId: "entity.player.2",
      streamId: "stream-2",
      bodyPresent: true,
      terminalState: "DESTROYED_AIRBORNE",
      impactSurface: "FLIGHT_DECK",
      phase: "PAUSED",
    }, {
      playerId: "bad",
      sequence: 1,
      tick: 1,
      position: [Number.NaN, 0, 0],
      forward: [0, 0, 1],
      up: [0, 1, 0],
    }],
    bogeys: [{
      bogeyId: "bogey-0-0", callsign: "BOGEY-011", sequence: 2,
      position: [5000, 2000, 0], forward: [0, 0, 1], up: [0, 1, 0], alive: true,
    }],
  });
  assert.equal(snapshot.players.length, 1);
  assert.equal(snapshot.players[0].playerId, "pilot-1");
  assert.equal(snapshot.players[0].entityId, "entity.player.2");
  assert.equal(snapshot.players[0].streamId, "stream-2");
  assert.equal(snapshot.players[0].alive, false);
  assert.equal(snapshot.players[0].bodyPresent, true);
  assert.equal(snapshot.players[0].impactSurface, "FLIGHT_DECK");
  assert.equal(snapshot.players[0].combatEligible, false);
  assert.equal(snapshot.connected, 2);
  assert.equal(snapshot.bogeys.length, 1);
  assert.equal(normaliseRoomSnapshot({
    type: "snapshot", protocol: 2, room: "global", worldEpoch: "world-test",
    serverTimeMs: 101, connected: 1,
    players: [{
      playerId: "bad-frame", sequence: 1, tick: 1, position: [0, 0, 0],
      forward: [0, 0, 1], up: [0, 0, 1],
    }],
    bogeys: [],
  }).players.length, 0);
});

test("pilot key remains stable in browser storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const cryptoImpl = { randomUUID: () => "12345678-1234-1234-1234-123456789abc" };
  const first = resolvePilotKey({ storage, cryptoImpl });
  assert.equal(resolvePilotKey({ storage, cryptoImpl }), first);
});

test("client accepts identity, publishes bounded poses, and filters its send rate", () => {
  let clock = 100;
  let socket;
  const statuses = [];
  const snapshots = [];
  const client = new GlobalRoomClient({
    url: "ws://localhost:5080/room",
    WebSocketImpl: class extends FakeSocket {
      constructor(url) { super(url); socket = this; }
    },
    now: () => clock,
    pilotKey: "browser-1234567890",
    onStatus: (status) => statuses.push(status),
    onSnapshot: (snapshot, ownId) => snapshots.push({ snapshot, ownId }),
  });
  client.start();
  socket.readyState = 1;
  socket.emit("open");
  const hello = JSON.parse(socket.sent[0]);
  assert.equal(hello.type, "hello");
  assert.equal(hello.pilotKey, "browser-1234567890");
  socket.emit("message", { data: JSON.stringify({
    type: "welcome", protocol: 2, playerId: "pilot-own", callsign: "PILOT-OWN",
    worldEpoch: "world-test", sectorIndex: 1, spawnOrigin: [40000, 0, -40000],
    serverTimeMs: 150,
  }) });

  const state = {
    tick: 10,
    px: 1, py: 2, pz: 3,
    pfx: 0, pfy: 0, pfz: 1,
    plx: 0, ply: 1, plz: 0,
    mission_definition_id: "mission.test",
    player_presentation_id: "presentation.vehicle.player.v1",
    session_phase: "ACTIVE",
    player_alive: true,
    player_entity_id: "entity.player.7",
    player_terminal_state: "FLYING",
    player_impact_surface: "NONE",
  };
  assert.equal(client.publish(state), true);
  assert.equal(client.publish(state), false);
  clock += 50;
  assert.equal(client.publish(state), true);
  const pose = JSON.parse(socket.sent[1]);
  assert.equal(pose.type, "pose");
  assert.equal(pose.sequence, 1);
  assert.equal(pose.entityId, "entity.player.7");
  assert.equal(pose.bodyPresent, true);
  assert.equal(pose.terminalState, "FLYING");
  assert.equal(pose.impactSurface, "NONE");
  assert.deepEqual(pose.position, [1, 2, 3]);

  socket.emit("message", { data: JSON.stringify({
    type: "snapshot", protocol: 2, room: "global", worldEpoch: "world-test",
    serverTimeMs: 200, connected: 1,
    players: [{
      playerId: "pilot-other", callsign: "PILOT-2", sequence: 1, tick: 1,
      position: [80010, 2000, -39980], forward: [0, 0, 1], up: [0, 1, 0],
      alive: true,
    }],
    bogeys: [{
      bogeyId: "bogey-1-0", callsign: "BOGEY-021", sequence: 1,
      position: [45000, 2200, -40000], forward: [0, 0, 1], up: [0, 1, 0],
      alive: true,
    }],
  }) });
  assert.equal(snapshots[0].ownId, "pilot-own");
  assert.deepEqual(snapshots[0].snapshot.players[0].position, [40010, 2000, 20]);
  assert.deepEqual(snapshots[0].snapshot.bogeys[0].position, [5000, 2200, 0]);
  assert.equal(statuses.at(-1).connected, 1);
  assert.equal(statuses.at(-1).bogeys, 1);
  client.stop();
  assert.equal(snapshots.at(-1).snapshot.players.length, 0);
});

test("a fresh Beat 4 connection publishes the actual glider presentation contract", () => {
  const sockets = [];
  const client = new GlobalRoomClient({
    url: "ws://localhost:5080/room",
    WebSocketImpl: class extends FakeSocket {
      constructor(url) { super(url); sockets.push(this); }
    },
    pilotKey: "browser-1234567890",
  });
  client.start();
  const socket = sockets[0];
  socket.readyState = 1;
  socket.emit("open");
  welcome(socket, { sectorIndex: 4, spawnOrigin: [80_000, 0, 0] });
  assert.equal(client.publish(flyingState({
    presentationId: "presentation.vehicle.glider-strike.v1",
    entityId: "entity.player.4",
    missionId: "mission.korea-2030s.balloon-strike.prototype.v1",
  })), true);
  assert.equal(sockets.length, 1);
  assert.equal(
    JSON.parse(socket.sent.at(-1)).presentationId,
    "presentation.vehicle.glider-strike.v1",
  );
  client.stop();
});

test("player-to-Beat-4 restage reconnects with the stable pilot identity and sector", () => {
  const sockets = [];
  const client = new GlobalRoomClient({
    url: "ws://localhost:5080/room",
    WebSocketImpl: class extends FakeSocket {
      constructor(url) { super(url); sockets.push(this); }
    },
    pilotKey: "browser-1234567890",
  });
  client.start();
  const sabreSocket = sockets[0];
  sabreSocket.readyState = 1;
  sabreSocket.emit("open");
  welcome(sabreSocket, { sectorIndex: 4, spawnOrigin: [80_000, 0, 0] });
  assert.equal(client.publish(flyingState()), true);

  const beat4State = flyingState({
    presentationId: "presentation.vehicle.glider-strike.v1",
    entityId: "entity.player.4",
    missionId: "mission.korea-2030s.balloon-strike.prototype.v1",
  });
  assert.equal(client.publish(beat4State), false);
  assert.equal(sabreSocket.closedWith.code, 4002);
  assert.equal(sabreSocket.closedWith.reason, "Presentation contract changed");
  assert.equal(sockets.length, 2);

  const gliderSocket = sockets[1];
  gliderSocket.readyState = 1;
  gliderSocket.emit("open");
  assert.equal(JSON.parse(gliderSocket.sent[0]).pilotKey, "browser-1234567890");
  assert.equal(client.publish(beat4State), false,
    "the Beat 4 pose must not race ahead of the reconnect hello/welcome handshake");
  assert.equal(gliderSocket.sent.length, 1);
  welcome(gliderSocket, { sectorIndex: 4, spawnOrigin: [80_000, 0, 0], serverTimeMs: 2 });
  assert.equal(client.diagnostics().sectorIndex, 4);
  assert.deepEqual(client.diagnostics().spawnOrigin, [80_000, 0, 0]);
  assert.equal(client.publish(beat4State), true);
  assert.equal(
    JSON.parse(gliderSocket.sent.at(-1)).presentationId,
    "presentation.vehicle.glider-strike.v1",
  );
  assert.equal(client.diagnostics().socketPresentationId,
    "presentation.vehicle.glider-strike.v1");
  client.stop();
});

test("idle publication is one hertz while lifecycle transitions and terminal motion bypass it", () => {
  let clock = 0;
  let socket;
  const client = new GlobalRoomClient({
    url: "ws://localhost:5080/room",
    WebSocketImpl: class extends FakeSocket {
      constructor(url) { super(url); socket = this; }
    },
    now: () => clock,
    pilotKey: "browser-1234567890",
  });
  client.start();
  socket.readyState = 1;
  socket.emit("open");
  socket.emit("message", { data: JSON.stringify({
    type: "welcome", protocol: 2, playerId: "pilot-own", callsign: "PILOT-OWN",
    worldEpoch: "world-test", sectorIndex: 0, spawnOrigin: [0, 0, 0], serverTimeMs: 1,
  }) });
  const state = {
    tick: 1, px: 0, py: 1_000, pz: 0,
    pfx: 0, pfy: 0, pfz: 1, plx: 0, ply: 1, plz: 0,
    mission_definition_id: "mission.test",
    player_presentation_id: "presentation.vehicle.player.v1",
    player_entity_id: "entity.player.1",
    player_terminal_state: "FLYING",
    player_alive: true,
    session_phase: "READY",
  };
  assert.equal(client.publish(state), true);
  clock = 999;
  assert.equal(client.publish(state), false);
  clock = 1_000;
  assert.equal(client.publish(state), true);
  clock = 1_001;
  assert.equal(client.publish({ ...state, session_phase: "ACTIVE" }), true);
  clock = 1_020;
  assert.equal(client.publish({ ...state, session_phase: "ACTIVE" }), false);
  clock = 1_021;
  assert.equal(client.publish({
    ...state,
    session_phase: "ACTIVE",
    player_alive: false,
    player_terminal_state: "DESTROYED_AIRBORNE",
    terminal_phase_active: true,
  }), true);
  assert.equal(JSON.parse(socket.sent.at(-1)).bodyPresent, true);
  assert.equal(client.diagnostics().cadence, "20Hz");
  clock = 1_022;
  assert.equal(client.publish({
    ...state,
    session_phase: "FINISHED",
    player_alive: true,
    player_terminal_state: "SETTLED",
    terminal_phase_active: true,
  }), true);
  const undamagedCrash = JSON.parse(socket.sent.at(-1));
  assert.equal(undamagedCrash.alive, false);
  assert.equal(undamagedCrash.bodyPresent, false);
  assert.equal(undamagedCrash.terminalState, "SETTLED");
  assert.equal(client.diagnostics().cadence, "1Hz");
  clock = 1_023;
  assert.equal(client.publish({
    ...state,
    session_phase: "FINISHED",
    player_alive: false,
    player_terminal_state: "SIMULATION_BOUNDED",
    player_impact_surface: "not-real",
    terminal_phase_active: true,
  }), true);
  assert.equal(JSON.parse(socket.sent.at(-1)).bodyPresent, true);
  assert.equal(JSON.parse(socket.sent.at(-1)).impactSurface, "SIMULATION_BOUNDARY");
  assert.equal(client.diagnostics().cadence, "1Hz");
  clock = 1_500;
  assert.equal(client.publish({
    ...state,
    session_phase: "FINISHED",
    player_alive: false,
    player_terminal_state: "SIMULATION_BOUNDED",
    terminal_phase_active: true,
  }), false);
});

test("epoch mismatch clears contacts and closes instead of mixing two worlds", () => {
  let socket;
  const snapshots = [];
  const client = new GlobalRoomClient({
    url: "ws://localhost:5080/room",
    WebSocketImpl: class extends FakeSocket {
      constructor(url) { super(url); socket = this; }
    },
    pilotKey: "browser-1234567890",
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  client.start();
  socket.readyState = 1;
  socket.emit("open");
  socket.emit("message", { data: JSON.stringify({
    type: "welcome", protocol: 2, playerId: "pilot-own", callsign: "PILOT-OWN",
    worldEpoch: "world-one", sectorIndex: 0, spawnOrigin: [0, 0, 0], serverTimeMs: 1,
  }) });
  const player = {
    playerId: "pilot-other", sequence: 1, tick: 1, position: [0, 1000, 0],
    forward: [0, 0, 1], up: [0, 1, 0],
  };
  socket.emit("message", { data: JSON.stringify({
    type: "snapshot", protocol: 2, worldEpoch: "world-one", serverTimeMs: 2,
    connected: 2, players: [player], bogeys: [],
  }) });
  socket.emit("message", { data: JSON.stringify({
    type: "snapshot", protocol: 2, worldEpoch: "world-two", serverTimeMs: 3,
    connected: 2, players: [player], bogeys: [],
  }) });
  assert.equal(snapshots.at(-1).players.length, 0);
  assert.equal(snapshots.at(-1).clearedBecause, "world-epoch-mismatch");
  assert.equal(socket.closedWith.code, 1008);
});
