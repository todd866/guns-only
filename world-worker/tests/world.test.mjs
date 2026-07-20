import test from "node:test";
import assert from "node:assert/strict";
import {
  BOGEYS_PER_SECTOR,
  MESSAGE_BURST_CAPACITY,
  PROTOCOL_VERSION,
  SECTOR_SPACING_METRES,
  bogeysForSector,
  consumeMessageBudget,
  isAllowedOrigin,
  normalisePilotKey,
  sectorOrigin,
  validatePose,
  visiblePlayersFor,
  visibleSectorsFor,
  worldPosition,
} from "../src/world.js";
import { GlobalWorld } from "../src/index.js";

test("persistent sectors are separated by at least forty kilometres", () => {
  const origins = Array.from({ length: 12 }, (_, index) => sectorOrigin(index));
  for (let left = 0; left < origins.length; left += 1) {
    for (let right = left + 1; right < origins.length; right += 1) {
      const distance = Math.hypot(
        origins[left][0] - origins[right][0],
        origins[left][2] - origins[right][2],
      );
      assert.ok(distance >= SECTOR_SPACING_METRES);
    }
  }
});

test("bogeys are deterministic, nearby, and continue moving with world time", () => {
  const createdAt = 1_000_000;
  const origin = sectorOrigin(4);
  const first = bogeysForSector(4, createdAt, createdAt + 5_000);
  const later = bogeysForSector(4, createdAt, createdAt + 15_000);
  assert.equal(first.length, BOGEYS_PER_SECTOR);
  assert.equal(first[0].bogeyId, later[0].bogeyId);
  assert.notDeepEqual(first[0].position, later[0].position);
  for (const bogey of first) {
    assert.ok(Math.hypot(bogey.position[0] - origin[0], bogey.position[2] - origin[2]) < 8_100);
    assert.ok(bogey.position[1] > 1_500);
    assert.equal(bogey.authority, "server-world");
    assert.equal(bogey.combatEligible, false);
  }
});

test("poses are validated before translation into the assigned world sector", () => {
  const pose = validatePose({
    type: "pose", protocol: PROTOCOL_VERSION, sequence: 1, tick: 2,
    position: [10, 2_000, -20], forward: [0, 0, 0.8], up: [0, 1.2, 0],
    missionId: "mission.test", presentationId: "presentation.vehicle.player.v1",
    phase: "ACTIVE", alive: true,
  });
  assert.ok(pose);
  assert.deepEqual(worldPosition(pose.position, [40_000, 0, -40_000]), [40_010, 2_000, -40_020]);
  assert.equal(validatePose({ ...pose, type: "pose", protocol: PROTOCOL_VERSION }, 1), null);
  assert.equal(normalisePilotKey("short"), "");
  assert.equal(normalisePilotKey("browser-1234567890"), "browser-1234567890");
});

test("physical presence and lifecycle tokens are bounded without breaking legacy v2", () => {
  const base = {
    type: "pose", protocol: PROTOCOL_VERSION, sequence: 1, tick: 2,
    position: [10, 2_000, -20], forward: [0, 0, 1], up: [0, 1, 0],
    missionId: "mission.test", presentationId: "presentation.vehicle.player.v1",
  };
  const wreck = validatePose({
    ...base,
    phase: "paused-but-evil",
    alive: false,
    entityId: "entity.player.7",
    bodyPresent: true,
    terminalState: "destroyed_airborne",
    impactSurface: "carrier_structure",
  });
  assert.equal(wreck.phase, "ACTIVE");
  assert.equal(wreck.entityId, "entity.player.7");
  assert.equal(wreck.alive, false);
  assert.equal(wreck.bodyPresent, true);
  assert.equal(wreck.terminalState, "DESTROYED_AIRBORNE");
  assert.equal(wreck.impactSurface, "CARRIER_STRUCTURE");
  const legacyLoss = validatePose({ ...base, alive: false });
  assert.equal(legacyLoss.bodyPresent, false);
  assert.equal(legacyLoss.terminalState, "SETTLED");
  const settledWithGunHealth = validatePose({
    ...base, alive: true, bodyPresent: true, terminalState: "SETTLED",
  });
  assert.equal(settledWithGunHealth.alive, false);
  assert.equal(settledWithGunHealth.bodyPresent, false);
  const undamagedImpact = validatePose({
    ...base, alive: true, bodyPresent: false, terminalState: "IMPACTED",
    impactSurface: "FLIGHT_DECK",
  });
  assert.equal(undamagedImpact.alive, false);
  assert.equal(undamagedImpact.bodyPresent, true);
  assert.equal(undamagedImpact.terminalState, "IMPACTED");
  const bounded = validatePose({
    ...base, alive: false, bodyPresent: true, terminalState: "SIMULATION_BOUNDED",
    impactSurface: "made-up",
  });
  assert.equal(bounded.impactSurface, "SIMULATION_BOUNDARY");
});

test("a fresh Beat 4 pose keeps the actual server-known glider contract", () => {
  const base = {
    type: "pose",
    protocol: 2,
    sequence: 1,
    tick: 1,
    missionId: "mission.korea-2030s.balloon-strike.prototype.v1",
    entityId: "entity.player.4",
    position: [0, 1000, 0],
    forward: [0, 0, 1],
    up: [0, 1, 0],
  };
  assert.equal(
    validatePose({ ...base, presentationId: "presentation.vehicle.glider-strike.v1" })
      .presentationId,
    "presentation.vehicle.glider-strike.v1",
  );
  assert.equal(
    validatePose({ ...base, presentationId: "presentation.vehicle.f22a.public-data-surrogate.v1" })
      .presentationId,
    "presentation.vehicle.f22a.public-data-surrogate.v1",
  );
  assert.equal(
    validatePose({ ...base, presentationId: "presentation.attacker.allocate-every-frame" })
      .presentationId,
    "presentation.vehicle.player.v1",
  );
});

test("a socket keeps one allowed presentation despite presentation and entity oscillation", () => {
  const base = {
    type: "pose",
    protocol: PROTOCOL_VERSION,
    tick: 1,
    missionId: "mission.presentation-pin",
    entityId: "entity.sortie.1",
    position: [0, 1000, 0],
    forward: [0, 0, 1],
    up: [0, 1, 0],
  };
  let previous = validatePose({
    ...base,
    sequence: 1,
    presentationId: "presentation.vehicle.player.v1",
  });
  for (let sequence = 2; sequence <= 40; sequence += 1) {
    const requested = sequence % 2 === 0
      ? "presentation.vehicle.glider-strike.v1"
      : "presentation.vehicle.player.v1";
    const next = validatePose(
      { ...base, sequence, entityId: `entity.attacker.${sequence}`, presentationId: requested },
      previous.sequence,
      previous,
    );
    assert.equal(next.presentationId, "presentation.vehicle.player.v1");
    previous = next;
  }
  const reconnected = validatePose({
    ...base,
    sequence: 41,
    entityId: "entity.sortie.2",
    presentationId: "presentation.vehicle.glider-strike.v1",
  });
  assert.equal(reconnected.presentationId, "presentation.vehicle.glider-strike.v1");
});

test("the production socket handler applies the presentation pin before storing presence", async () => {
  let attachment = {
    phase: "online",
    identity: {
      playerId: "pilot-test",
      callsign: "PILOT-TEST",
      sectorIndex: 0,
      spawnOrigin: [0, 0, 0],
    },
    streamId: "stream-test",
    pose: null,
    invalidMessages: 0,
    rateBudget: null,
  };
  const socket = {
    deserializeAttachment: () => attachment,
    serializeAttachment: (next) => { attachment = next; },
    close: () => assert.fail("valid bounded poses must not close the socket"),
  };
  const world = Object.create(GlobalWorld.prototype);
  world.lastBroadcastAt = 0;
  world.broadcast = async () => {};
  const base = {
    type: "pose",
    protocol: PROTOCOL_VERSION,
    tick: 1,
    missionId: "mission.socket-pin",
    position: [0, 1000, 0],
    forward: [0, 0, 1],
    up: [0, 1, 0],
  };
  for (let sequence = 1; sequence <= 30; sequence += 1) {
    const presentationId = sequence % 2 === 0
      ? "presentation.vehicle.glider-strike.v1"
      : "presentation.vehicle.player.v1";
    await world.webSocketMessage(socket, JSON.stringify({
      ...base,
      sequence,
      entityId: `entity.attacker.${sequence}`,
      presentationId,
    }));
    assert.equal(attachment.pose.presentationId, "presentation.vehicle.player.v1");
  }
  attachment = {
    ...attachment,
    streamId: "stream-beat-4",
    pose: null,
    rateBudget: null,
  };
  await world.webSocketMessage(socket, JSON.stringify({
    ...base,
    sequence: 31,
    missionId: "mission.korea-2030s.balloon-strike.prototype.v1",
    entityId: "entity.player.4",
    presentationId: "presentation.vehicle.glider-strike.v1",
  }));
  assert.equal(attachment.identity.sectorIndex, 0);
  assert.equal(attachment.pose.presentationId, "presentation.vehicle.glider-strike.v1");
});

test("origin policy accepts only configured complete origins", () => {
  const configured = "https://guns-only.vercel.app,http://localhost:8877";
  assert.equal(isAllowedOrigin("https://guns-only.vercel.app", configured), true);
  assert.equal(isAllowedOrigin("http://localhost:8877", configured), true);
  assert.equal(isAllowedOrigin("http://localhost:3000", configured), false);
  assert.equal(isAllowedOrigin("https://guns-only.vercel.app.evil.test", configured), false);
  assert.equal(isAllowedOrigin("https://guns-only.vercel.app/path", configured), false);
  assert.equal(isAllowedOrigin("null", configured), false);
});

test("message budget permits network jitter but bounds sustained flooding", () => {
  let budget = null;
  for (let index = 0; index < MESSAGE_BURST_CAPACITY; index += 1) {
    const result = consumeMessageBudget(budget, 1_000);
    assert.equal(result.allowed, true);
    budget = result.budget;
  }
  assert.equal(consumeMessageBudget(budget, 1_000).allowed, false);
  const refilled = consumeMessageBudget(budget, 2_000);
  assert.equal(refilled.allowed, true);
});

test("interest management keeps nearby truth and bounds global fan-out", () => {
  const sectors = visibleSectorsFor(0, Array.from({ length: 100 }, (_, index) => index));
  assert.equal(sectors[0], 0);
  assert.ok(sectors.includes(1));
  assert.ok(sectors.length <= 16);
  const players = Array.from({ length: 100 }, (_, index) => ({
    playerId: `pilot-${String(index).padStart(3, "0")}`,
    position: [index * 1_000, 2_000, 0],
  }));
  const visible = visiblePlayersFor([0, 0, 0], players);
  assert.equal(visible[0].playerId, "pilot-000");
  assert.ok(visible.length <= 64);
});

test("a newer socket deterministically replaces the older stable identity connection", () => {
  const closed = [];
  const identity = { playerId: "pilot-stable" };
  const oldSocket = {
    deserializeAttachment: () => ({ identity }),
    close: (code, reason) => closed.push({ code, reason }),
  };
  const newSocket = { deserializeAttachment: () => ({ identity }) };
  const world = Object.create(GlobalWorld.prototype);
  world.connectedSockets = () => [oldSocket, newSocket];
  world.replaceOlderConnection(newSocket, identity);
  assert.deepEqual(closed, [{ code: 4001, reason: "Replaced by newer connection" }]);
});

test("concurrent and reconnecting hellos preserve one browser identity and sector", async () => {
  const values = new Map();
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: 0, identityCount: 0,
  };
  world.identityAllocationTail = Promise.resolve();
  world.ctx = {
    storage: {
      get: async (key) => values.get(key),
      put: async (entries) => {
        for (const [key, value] of Object.entries(entries)) values.set(key, value);
      },
    },
  };
  const [first, second] = await Promise.all([
    world.allocateIdentity("browser-1234567890"),
    world.allocateIdentity("browser-1234567890"),
  ]);
  const reconnected = await world.allocateIdentity("browser-1234567890");
  assert.deepEqual(second, first);
  assert.deepEqual(reconnected, first);
  assert.equal(reconnected.sectorIndex, first.sectorIndex);
  assert.deepEqual(reconnected.spawnOrigin, first.spawnOrigin);
  assert.equal(world.world.identityCount, 1);
  assert.equal(world.world.nextSector, 1);
});

test("maintenance expires incomplete handshakes and stale valid-presence sockets", async () => {
  const closed = [];
  const handshake = {
    deserializeAttachment: () => ({ connectedAtMs: 1_000 }),
    close: (code, reason) => closed.push({ kind: "hello", code, reason }),
  };
  const stale = {
    deserializeAttachment: () => ({
      identity: { playerId: "pilot-stale" }, lastValidMessageAtMs: 1_000,
    }),
    close: (code, reason) => closed.push({ kind: "pose", code, reason }),
  };
  const world = Object.create(GlobalWorld.prototype);
  world.allSockets = () => [handshake, stale];
  await world.pruneStaleSockets(21_001);
  assert.deepEqual(closed.map((entry) => [entry.kind, entry.code]), [
    ["hello", 1008], ["pose", 1001],
  ]);
});
