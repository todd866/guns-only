import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMISSION_BUCKET_HEADER,
  BOGEYS_PER_SECTOR,
  IDENTITY_ADMISSION_BUCKET_COUNT,
  IDENTITY_CAPACITY_WINDOW_MS,
  IDENTITY_CREATION_WINDOW_MS,
  IDENTITY_FORCED_SWEEP_RETRY_MS,
  IDENTITY_LIVE_CAPACITY_WINDOWS,
  IDENTITY_RETENTION_MS,
  IDENTITY_SWEEP_BATCH_SIZE,
  MAXIMUM_IDENTITIES,
  MAXIMUM_GLOBAL_IDENTITY_CREATIONS_PER_WINDOW,
  MAXIMUM_FORCED_IDENTITY_SWEEP_BATCHES_PER_ALLOCATION,
  MAXIMUM_IDENTITY_CREATIONS_PER_SOURCE_WINDOW,
  MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW,
  MAXIMUM_PENDING_HANDSHAKES,
  MAXIMUM_PENDING_HANDSHAKES_PER_ADMISSION_BUCKET,
  MESSAGE_BURST_CAPACITY,
  PROTOCOL_VERSION,
  SECTOR_SPACING_METRES,
  bogeysForSector,
  consumeIdentityCapacityBudget,
  consumeIdentityCreationBudget,
  consumeMessageBudget,
  consumeSourceIdentityCreationBudget,
  isAllowedOrigin,
  normalisePilotKey,
  sectorOrigin,
  trustedAdmissionBucketForRequest,
  validatePose,
  visiblePlayersFor,
  visibleSectorsFor,
  worldPosition,
} from "../src/world.js";
import worker, {
  GlobalWorld,
} from "../src/index.js";

function storageHarness(values = new Map()) {
  const metrics = { maximumPutPairs: 0 };
  const storage = {
    get: async (key) => values.get(key),
    put: async (keyOrEntries, value) => {
      const entries = typeof keyOrEntries === "string"
        ? { [keyOrEntries]: value } : keyOrEntries;
      const pairs = Object.entries(entries);
      if (pairs.length > 128) throw new RangeError("Durable Object put pair limit exceeded");
      metrics.maximumPutPairs = Math.max(metrics.maximumPutPairs, pairs.length);
      for (const [key, entry] of pairs) values.set(key, entry);
    },
    delete: async (keyOrKeys) => {
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      let deleted = 0;
      for (const key of keys) deleted += values.delete(key) ? 1 : 0;
      return deleted;
    },
    list: async ({ prefix = "", startAfter = "", limit = Number.MAX_SAFE_INTEGER } = {}) =>
      new Map([...values.entries()]
        .filter(([key]) => key.startsWith(prefix) && key > startAfter)
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, limit)),
  };
  storage.transaction = async (callback) => callback(storage);
  return { storage, values, metrics };
}

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

test("identity admission refusal gives a bounded retry signal before a 1013 close", async () => {
  let attachment = {
    phase: "awaiting-hello",
    connectedAtMs: 1,
    invalidMessages: 0,
    rateBudget: null,
    admissionBucket: 9,
  };
  const sent = [];
  const closed = [];
  const socket = {
    deserializeAttachment: () => attachment,
    serializeAttachment: (next) => { attachment = next; },
    send: (message) => sent.push(JSON.parse(message)),
    close: (code, reason) => closed.push({ code, reason }),
  };
  const world = Object.create(GlobalWorld.prototype);
  world.connectedSockets = () => [];
  world.allocateIdentity = async () => ({
    ok: false,
    reason: "source-rate-limit",
    retryAfterSeconds: 900,
  });
  await world.webSocketMessage(socket, JSON.stringify({
    type: "hello",
    protocol: PROTOCOL_VERSION,
    pilotKey: "browser-admission-refusal",
  }));
  assert.deepEqual(sent, [{
    type: "identity-unavailable",
    protocol: PROTOCOL_VERSION,
    reason: "source-rate-limit",
    retryAfterSeconds: 900,
  }]);
  assert.deepEqual(closed, [{
    code: 1013,
    reason: "source-rate-limit; retry after 900s",
  }]);
});

test("origin policy accepts only configured complete origins", () => {
  const configured = "https://guns-only.vercel.app,http://localhost:8877";
  assert.equal(isAllowedOrigin("https://guns-only.vercel.app", configured), true);
  assert.equal(isAllowedOrigin("http://localhost:8877", configured), true);
  assert.equal(isAllowedOrigin("http://localhost:3000", configured), false);
  assert.equal(isAllowedOrigin("https://guns-only.vercel.app.evil.test", configured), false);
  assert.equal(isAllowedOrigin("https://guns-only.vercel.app/path", configured), false);
  assert.equal(isAllowedOrigin("null", configured), false);
  // The canonical production domain (2026-07-29 domain move): the unset-config fallback must
  // admit guns-only.com, and a config carrying both custom domains must admit each exactly.
  assert.equal(isAllowedOrigin("https://guns-only.com", undefined), true);
  assert.equal(isAllowedOrigin("https://guns-only.vercel.app", undefined), false);
  const domains = "https://guns-only.com,https://guns-only.cohort.md";
  assert.equal(isAllowedOrigin("https://guns-only.com", domains), true);
  assert.equal(isAllowedOrigin("https://guns-only.cohort.md", domains), true);
  assert.equal(isAllowedOrigin("https://guns-only.com.evil.test", domains), false);
});

test("edge admission uses Cloudflare source context, overwrites spoofed buckets, and fails closed", async () => {
  const edgeRequest = new Request("https://world.example/room", {
    headers: {
      Origin: "https://guns-only.com",
      "CF-Connecting-IP": "203.0.113.42",
      [ADMISSION_BUCKET_HEADER]: "999",
    },
  });
  Object.defineProperty(edgeRequest, "cf", { value: { colo: "PER" } });
  const bucket = await trustedAdmissionBucketForRequest(edgeRequest);
  assert.ok(Number.isSafeInteger(bucket));
  assert.ok(bucket >= 0 && bucket < IDENTITY_ADMISSION_BUCKET_COUNT);

  let forwarded = null;
  const env = {
    GUNS_ALLOWED_ORIGINS: "https://guns-only.com",
    GLOBAL_WORLD: {
      idFromName: () => "world-id",
      get: () => ({
        fetch: async (request) => {
          forwarded = request;
          return new Response("forwarded");
        },
      }),
    },
  };
  const response = await worker.fetch(edgeRequest, env);
  assert.equal(response.status, 200);
  assert.equal(forwarded.headers.get(ADMISSION_BUCKET_HEADER), String(bucket));
  assert.notEqual(forwarded.headers.get(ADMISSION_BUCKET_HEADER), "999");

  const ipv6Request = (address) => {
    const request = new Request("https://world.example/room", {
      headers: { "CF-Connecting-IP": address },
    });
    Object.defineProperty(request, "cf", { value: { colo: "PER" } });
    return request;
  };
  assert.equal(
    await trustedAdmissionBucketForRequest(ipv6Request("2001:db8:1234:5678::1")),
    await trustedAdmissionBucketForRequest(ipv6Request("2001:db8:1234:5678:ffff::2")),
    "IPv6 privacy addresses in one /64 must share one admission principal",
  );
  assert.equal(await trustedAdmissionBucketForRequest(ipv6Request("dead:beef")), null);

  const missingSource = new Request("https://world.example/room", {
    headers: { Origin: "https://guns-only.com" },
  });
  Object.defineProperty(missingSource, "cf", { value: { colo: "PER" } });
  assert.equal(await trustedAdmissionBucketForRequest(missingSource), null);
  const denied = await worker.fetch(missingSource, env);
  assert.equal(denied.status, 503);
  assert.equal(denied.headers.get("retry-after"), "60");

  const bypassingCloudflare = new Request("https://world.example/room", {
    headers: {
      Origin: "https://guns-only.com",
      "CF-Connecting-IP": "203.0.113.42",
    },
  });
  assert.equal(await trustedAdmissionBucketForRequest(bypassingCloudflare), null);
  assert.ok(Number.isSafeInteger(await trustedAdmissionBucketForRequest(
    new Request("http://localhost/room"),
  )));
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

test("the global emergency identity budget bounds distributed churn and resets", () => {
  let world = {};
  const now = 10_000;
  for (let index = 0; index < MAXIMUM_GLOBAL_IDENTITY_CREATIONS_PER_WINDOW; index += 1) {
    const result = consumeIdentityCreationBudget(world, now);
    assert.equal(result.allowed, true);
    world = result.world;
  }
  const rejected = consumeIdentityCreationBudget(world, now);
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.world.identityCreationsInWindow,
    MAXIMUM_GLOBAL_IDENTITY_CREATIONS_PER_WINDOW);
  assert.equal(rejected.retryAfterMs, IDENTITY_CREATION_WINDOW_MS);
  const reset = consumeIdentityCreationBudget(
    rejected.world,
    now + IDENTITY_CREATION_WINDOW_MS,
  );
  assert.equal(reset.allowed, true);
  assert.equal(reset.world.identityCreationsInWindow, 1);
});

test("capacity admission cannot consume the namespace inside one retention horizon", () => {
  assert.equal(MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW, 109);
  assert.equal(IDENTITY_LIVE_CAPACITY_WINDOWS, 91);
  assert.ok(
    MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW * IDENTITY_LIVE_CAPACITY_WINDOWS
      <= MAXIMUM_IDENTITIES,
  );
  assert.ok(
    (MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW + 1) * IDENTITY_LIVE_CAPACITY_WINDOWS
      > MAXIMUM_IDENTITIES,
    "the derived rate is the largest safe integer cohort",
  );

  let world = {};
  const now = 20_000;
  for (let index = 0; index < MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW; index += 1) {
    const result = consumeIdentityCapacityBudget(world, now);
    assert.equal(result.allowed, true);
    world = result.world;
  }
  const rejected = consumeIdentityCapacityBudget(world, now);
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.retryAfterMs, IDENTITY_CAPACITY_WINDOW_MS);
  assert.equal(rejected.world.identityCapacityCreationsInWindow,
    MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW);
  const reset = consumeIdentityCapacityBudget(
    rejected.world,
    now + IDENTITY_CAPACITY_WINDOW_MS,
  );
  assert.equal(reset.allowed, true);
  assert.equal(reset.world.identityCapacityCreationsInWindow, 1);
});

test("per-source identity creation budget is independent and has an exact retry horizon", () => {
  const now = 50_000;
  let firstSource = null;
  for (let index = 0; index < MAXIMUM_IDENTITY_CREATIONS_PER_SOURCE_WINDOW; index += 1) {
    const result = consumeSourceIdentityCreationBudget(firstSource, now);
    assert.equal(result.allowed, true);
    firstSource = result.budget;
  }
  const rejected = consumeSourceIdentityCreationBudget(firstSource, now + 5_000);
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.retryAfterMs, IDENTITY_CREATION_WINDOW_MS - 5_000);
  const independent = consumeSourceIdentityCreationBudget(null, now + 5_000);
  assert.equal(independent.allowed, true);
  assert.equal(independent.budget.creationsInWindow, 1);
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

test("one source cannot occupy every pending handshake slot", () => {
  const pendingSocket = (admissionBucket) => ({
    deserializeAttachment: () => ({ admissionBucket }),
  });
  const sameSource = Array.from(
    { length: MAXIMUM_PENDING_HANDSHAKES_PER_ADMISSION_BUCKET },
    () => pendingSocket(11),
  );
  const world = Object.create(GlobalWorld.prototype);
  world.allSockets = () => sameSource;
  assert.deepEqual(world.pendingHandshakeCapacity(11), {
    allowed: false,
    status: 429,
    retryAfterSeconds: 2,
    message: "Client handshake capacity reached",
  });
  assert.deepEqual(world.pendingHandshakeCapacity(12), { allowed: true },
    "a different trusted source can still reach hello and reconnect its stored identity");

  const globallyFull = [
    ...sameSource,
    ...Array.from(
      { length: MAXIMUM_PENDING_HANDSHAKES - sameSource.length },
      (_, index) => pendingSocket(20 + index),
    ),
  ];
  world.allSockets = () => globallyFull;
  assert.equal(world.pendingHandshakeCapacity(99).allowed, false);
  assert.equal(world.pendingHandshakeCapacity(99).status, 503);
});

test("concurrent and reconnecting hellos preserve one browser identity and sector", async () => {
  const { storage } = storageHarness();
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: 0, identityCount: 0,
    identityCreationWindowStartedAtMs: Date.now(), identityCreationsInWindow: 0,
    identitySweepAfterKey: null, lastIdentitySweepAtMs: Date.now(),
  };
  world.identityAllocationTail = Promise.resolve();
  world.connectedSockets = () => [];
  world.ctx = { storage };
  const [first, second] = await Promise.all([
    world.allocateIdentity("browser-1234567890", true, 17),
    world.allocateIdentity("browser-1234567890", true, 17),
  ]);
  const reconnected = await world.allocateIdentity("browser-1234567890", true, 17);
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(reconnected.created, false);
  assert.deepEqual(second.identity, first.identity);
  assert.deepEqual(reconnected.identity, first.identity);
  assert.equal(reconnected.identity.sectorIndex, first.identity.sectorIndex);
  assert.deepEqual(reconnected.identity.spawnOrigin, first.identity.spawnOrigin);
  assert.equal(world.world.identityCount, 1);
  assert.equal(world.world.nextSector, 1);
});

test("creation throttling still permits an existing browser to reconnect", async () => {
  const { storage } = storageHarness();
  const world = Object.create(GlobalWorld.prototype);
  const now = 20_000;
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: 0, identityCount: 0,
    identityCreationWindowStartedAtMs: now, identityCreationsInWindow: 0,
    identitySweepAfterKey: null, lastIdentitySweepAtMs: now,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [];
  const existing = await world.allocateIdentitySerial(
    "browser-existing-1234", true, now, 23,
  );
  assert.equal(existing.ok, true);
  world.world = {
    ...world.world,
    identityCreationsInWindow: MAXIMUM_GLOBAL_IDENTITY_CREATIONS_PER_WINDOW,
  };
  await storage.put("world", world.world);
  const reconnected = await world.allocateIdentitySerial(
    "browser-existing-1234", true, now + 1, null,
  );
  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.created, false);
  assert.deepEqual(reconnected.identity, existing.identity);
  const rejected = await world.allocateIdentitySerial(
    "browser-new-user-1234", true, now + 1, 23,
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "global-rate-limit");
  assert.equal(rejected.retryAfterSeconds, IDENTITY_CREATION_WINDOW_MS / 1000);
  assert.equal(world.world.identityCount, 1);
});

test("one source cannot exhaust admission for a distinct source", async () => {
  const { storage, values } = storageHarness();
  const world = Object.create(GlobalWorld.prototype);
  const now = 70_000;
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: 0, identityCount: 0,
    identityCreationWindowStartedAtMs: now, identityCreationsInWindow: 0,
    identitySweepAfterKey: null, lastIdentitySweepAtMs: now,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [];
  for (let index = 0; index < MAXIMUM_IDENTITY_CREATIONS_PER_SOURCE_WINDOW; index += 1) {
    const allocation = await world.allocateIdentitySerial(
      `browser-source-a-${String(index).padStart(4, "0")}`,
      true,
      now,
      31,
    );
    assert.equal(allocation.ok, true);
  }
  const throttled = await world.allocateIdentitySerial(
    "browser-source-a-over-limit", true, now, 31,
  );
  assert.equal(throttled.ok, false);
  assert.equal(throttled.reason, "source-rate-limit");
  assert.equal(throttled.retryAfterSeconds, IDENTITY_CREATION_WINDOW_MS / 1000);

  const independent = await world.allocateIdentitySerial(
    "browser-source-b-admitted", true, now, 32,
  );
  assert.equal(independent.ok, true);
  assert.equal(world.world.identityCount,
    MAXIMUM_IDENTITY_CREATIONS_PER_SOURCE_WINDOW + 1);
  assert.equal(world.world.identityAdmissionRejectionSignals, 1);
  assert.equal([...values.keys()].filter((key) => key.startsWith("identity-admission:")).length, 2);
});

test("rotating source buckets cannot exhaust the retained namespace in hours", async () => {
  const { storage } = storageHarness();
  const world = Object.create(GlobalWorld.prototype);
  const now = 90_000;
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: 0, identityCount: 0,
    identityCapacityWindowStartedAtMs: now, identityCapacityCreationsInWindow: 0,
    identityCreationWindowStartedAtMs: now, identityCreationsInWindow: 0,
    identitySweepAfterKey: null, lastIdentitySweepAtMs: now,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [];

  for (let index = 0; index < MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW; index += 1) {
    const allocation = await world.allocateIdentitySerial(
      `browser-capacity-${String(index).padStart(4, "0")}`,
      true,
      now,
      index,
    );
    assert.equal(allocation.ok, true);
  }
  const rejected = await world.allocateIdentitySerial(
    "browser-capacity-over-limit",
    true,
    now,
    MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW,
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "capacity-rate-limit");
  assert.equal(rejected.retryAfterSeconds, IDENTITY_CAPACITY_WINDOW_MS / 1000);
  assert.equal(world.world.identityCount,
    MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW);
  assert.equal(world.world.identityCreationsInWindow,
    MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW,
    "the existing hourly global backstop remains independently accounted");

  const reconnect = await world.allocateIdentitySerial(
    "browser-capacity-0000",
    true,
    now + 1,
    null,
  );
  assert.equal(reconnect.ok, true);
  assert.equal(reconnect.created, false, "capacity pacing must never block a known pilot");

  const nextWindow = await world.allocateIdentitySerial(
    "browser-capacity-next-window",
    true,
    now + IDENTITY_CAPACITY_WINDOW_MS,
    999,
  );
  assert.equal(nextWindow.ok, true);
  assert.equal(world.world.identityCapacityCreationsInWindow, 1);
});

test("health reports aggregate admission pressure without exposing source principals", async () => {
  const now = Date.now();
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-health", createdAtMs: 1, nextSector: 8, identityCount: 7,
    identityCapacityWindowStartedAtMs: now, identityCapacityCreationsInWindow: 17,
    identityCreationWindowStartedAtMs: now, identityCreationsInWindow: 42,
    identityAdmissionRejectionSignals: 3,
    identityAdmissionLastRejectedAtMs: now - 1_000,
    identityAdmissionLastRejection: "source-rate-limit",
  };
  world.allSockets = () => [];
  world.connectedSockets = () => [];
  const response = await world.fetch(new Request("https://world.example/healthz"));
  const health = await response.json();
  assert.equal(health.identityAdmission.perSourceLimit,
    MAXIMUM_IDENTITY_CREATIONS_PER_SOURCE_WINDOW);
  assert.equal(health.identityAdmission.globalEmergencyLimit,
    MAXIMUM_GLOBAL_IDENTITY_CREATIONS_PER_WINDOW);
  assert.equal(health.identityAdmission.globalCreatedInWindow, 42);
  assert.equal(health.identityAdmission.capacityWindowSeconds,
    IDENTITY_CAPACITY_WINDOW_MS / 1000);
  assert.equal(health.identityAdmission.capacityLimit,
    MAXIMUM_IDENTITY_CREATIONS_PER_CAPACITY_WINDOW);
  assert.equal(health.identityAdmission.capacityCreatedInWindow, 17);
  assert.equal(health.identityAdmission.sampledRejectionIntervals, 3);
  assert.equal(JSON.stringify(health).includes("203.0.113"), false);
});

test("rejection diagnostics are minute-sampled instead of writing once per denied hello", async () => {
  const { storage } = storageHarness();
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: 0, identityCount: 0,
    identityAdmissionRejectionSignals: 0,
    identityAdmissionLastRejectedAtMs: null,
    identityAdmissionLastRejection: null,
  };
  world.ctx = { storage };
  await world.recordIdentityAdmissionRejection("source-rate-limit", 100_000);
  await world.recordIdentityAdmissionRejection("global-rate-limit", 100_001);
  assert.equal(world.world.identityAdmissionRejectionSignals, 1);
  assert.equal(world.world.identityAdmissionLastRejection, "source-rate-limit");
  await world.recordIdentityAdmissionRejection("global-rate-limit", 160_000);
  assert.equal(world.world.identityAdmissionRejectionSignals, 2);
  assert.equal(world.world.identityAdmissionLastRejection, "global-rate-limit");
});

test("identity sweeps reclaim only expired inactive records and migrate legacy activity", async () => {
  const now = IDENTITY_RETENTION_MS + 50_000;
  const expiredAt = now - IDENTITY_RETENTION_MS - 1;
  const values = new Map([
    ["pilot:expired", {
      playerId: "pilot-expired", callsign: "PILOT-0001", sectorIndex: 0,
      spawnOrigin: [0, 0, 0], createdAtMs: 1, lastSeenAtMs: expiredAt,
    }],
    ["pilot:active", {
      playerId: "pilot-active", callsign: "PILOT-0002", sectorIndex: 1,
      spawnOrigin: [40_000, 0, 0], createdAtMs: 1, lastSeenAtMs: expiredAt,
    }],
    ["pilot:legacy", {
      playerId: "pilot-legacy", callsign: "PILOT-0003", sectorIndex: 2,
      spawnOrigin: [0, 0, 40_000],
    }],
  ]);
  const { storage } = storageHarness(values);
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: 3, identityCount: 3,
    identityCreationWindowStartedAtMs: now, identityCreationsInWindow: 0,
    identitySweepAfterKey: null, lastIdentitySweepAtMs: 0,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [{
    deserializeAttachment: () => ({ identity: { playerId: "pilot-active" } }),
  }];
  assert.equal(await world.reclaimExpiredIdentities(now, true), 1);
  assert.equal(values.has("pilot:expired"), false);
  assert.equal(values.has("pilot:active"), true);
  assert.equal(values.get("pilot:legacy").lastSeenAtMs, now);
  assert.equal(world.world.identityCount, 2);
});

test("a persisted reclaimed slot clears interrupted forced-sweep state", async () => {
  const now = IDENTITY_RETENTION_MS + 55_000;
  const { storage } = storageHarness();
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: MAXIMUM_IDENTITIES,
    identityCount: MAXIMUM_IDENTITIES - 1,
    identitySweepAfterKey: "pilot:after-reclaimed-slot",
    identityForcedSweepActive: true,
    identityForcedSweepStopAfterKey: "pilot:original-boundary",
    identityForcedSweepWrapped: true,
    lastIdentitySweepAtMs: now,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [];

  assert.equal(await world.reclaimExpiredIdentities(now), 0);
  assert.equal(world.world.identityForcedSweepActive, false);
  assert.equal(world.world.identityForcedSweepStopAfterKey, null);
  assert.equal((await storage.get("world")).identityForcedSweepActive, false);
});

test("a full legacy sweep page stays within the 128-pair Durable Object put limit", async () => {
  const now = IDENTITY_RETENTION_MS + 60_000;
  const values = new Map();
  for (let index = 0; index < IDENTITY_SWEEP_BATCH_SIZE; index += 1) {
    values.set(`pilot:${String(index).padStart(4, "0")}`, {
      playerId: `pilot-legacy-${index}`,
      callsign: `PILOT-${String(index + 1).padStart(4, "0")}`,
      sectorIndex: index,
      spawnOrigin: sectorOrigin(index),
    });
  }
  const { storage, metrics } = storageHarness(values);
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: IDENTITY_SWEEP_BATCH_SIZE,
    identityCount: IDENTITY_SWEEP_BATCH_SIZE,
    identitySweepAfterKey: null, lastIdentitySweepAtMs: 0,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [];

  assert.equal(await world.reclaimExpiredIdentities(now), 0);
  assert.equal(metrics.maximumPutPairs, 128);
  assert.equal(values.get("pilot:0000").lastSeenAtMs, now);
  assert.equal(values.get(
    `pilot:${String(IDENTITY_SWEEP_BATCH_SIZE - 1).padStart(4, "0")}`,
  ).lastSeenAtMs, now);
});

test("an expired identity frees capacity for a distinct new pilot", async () => {
  const now = IDENTITY_RETENTION_MS + 80_000;
  const values = new Map([["pilot:000-expired", {
    playerId: "pilot-expired", callsign: "PILOT-0001", sectorIndex: 0,
    spawnOrigin: [0, 0, 0], createdAtMs: 1,
    lastSeenAtMs: now - IDENTITY_RETENTION_MS - 1,
  }]]);
  const { storage } = storageHarness(values);
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: MAXIMUM_IDENTITIES,
    identityCount: MAXIMUM_IDENTITIES,
    identityCreationWindowStartedAtMs: now, identityCreationsInWindow: 0,
    identitySweepAfterKey: null, lastIdentitySweepAtMs: now,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [];
  const replacement = await world.allocateIdentitySerial(
    "browser-replacement-1234", true, now, 29,
  );
  assert.equal(replacement.ok, true);
  assert.equal(replacement.identity.callsign, "PILOT-10001");
  assert.equal(values.has("pilot:000-expired"), false);
  assert.equal(world.world.identityCount, MAXIMUM_IDENTITIES);
});

test("a capacity hello sweeps consecutive bounded batches until a later expiry frees a slot", async () => {
  const now = IDENTITY_RETENTION_MS + 90_000;
  const expiryIndex = IDENTITY_SWEEP_BATCH_SIZE * 2 + 4;
  const values = new Map();
  for (let index = 0; index < IDENTITY_SWEEP_BATCH_SIZE * 3; index += 1) {
    values.set(`pilot:${String(index).padStart(4, "0")}`, {
      playerId: `pilot-${index}`,
      callsign: `PILOT-${String(index + 1).padStart(4, "0")}`,
      sectorIndex: index,
      spawnOrigin: sectorOrigin(index),
      createdAtMs: 1,
      lastSeenAtMs: index === expiryIndex
        ? now - IDENTITY_RETENTION_MS - 1
        : now,
    });
  }
  const expiredKey = `pilot:${String(expiryIndex).padStart(4, "0")}`;
  const { storage } = storageHarness(values);
  const originalList = storage.list;
  let listCalls = 0;
  storage.list = async (options) => {
    listCalls += 1;
    return originalList(options);
  };
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: MAXIMUM_IDENTITIES,
    identityCount: MAXIMUM_IDENTITIES,
    identityCreationWindowStartedAtMs: now, identityCreationsInWindow: 0,
    identitySweepAfterKey: null, lastIdentitySweepAtMs: now,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [];

  const replacement = await world.allocateIdentitySerial(
    "browser-multi-batch-replacement", true, now, 37,
  );
  assert.equal(replacement.ok, true);
  assert.equal(values.has(expiredKey), false);
  assert.equal(listCalls, 3);
  assert.equal(world.world.identityCount, MAXIMUM_IDENTITIES);
});

test("a forced capacity sweep completes one full cycle when every identity is retained", async () => {
  const now = IDENTITY_RETENTION_MS + 100_000;
  const values = new Map();
  for (let index = 0; index < IDENTITY_SWEEP_BATCH_SIZE * 2; index += 1) {
    values.set(`pilot:${String(index).padStart(4, "0")}`, {
      playerId: `pilot-${index}`,
      callsign: `PILOT-${String(index + 1).padStart(4, "0")}`,
      sectorIndex: index,
      spawnOrigin: sectorOrigin(index),
      createdAtMs: now,
      lastSeenAtMs: now,
    });
  }
  const { storage } = storageHarness(values);
  const originalList = storage.list;
  let listCalls = 0;
  storage.list = async (options) => {
    listCalls += 1;
    return originalList(options);
  };
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: MAXIMUM_IDENTITIES,
    identityCount: MAXIMUM_IDENTITIES,
    identitySweepAfterKey: null, lastIdentitySweepAtMs: 0,
    lastForcedIdentitySweepAtMs: 0,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [];

  assert.equal(await world.reclaimExpiredIdentities(now, true), 0);
  assert.equal(listCalls, 3);
  assert.equal(world.world.identitySweepAfterKey, null);
  assert.equal(world.world.lastForcedIdentitySweepAtMs, now);
  assert.equal(await world.reclaimExpiredIdentities(now + 1, true), 0);
  assert.equal(listCalls, 3, "the completed force cycle has a one-hour rescan cooldown");
});

test("a forced capacity sweep wraps a persisted cursor to reclaim an earlier expired key", async () => {
  const now = IDENTITY_RETENTION_MS + 120_000;
  const cursorIndex = IDENTITY_SWEEP_BATCH_SIZE - 1;
  const expiredIndex = 1;
  const values = new Map();
  for (let index = 0; index < IDENTITY_SWEEP_BATCH_SIZE * 2; index += 1) {
    values.set(`pilot:${String(index).padStart(4, "0")}`, {
      playerId: `pilot-${index}`,
      callsign: `PILOT-${String(index + 1).padStart(4, "0")}`,
      sectorIndex: index,
      spawnOrigin: sectorOrigin(index),
      createdAtMs: 1,
      lastSeenAtMs: index === expiredIndex
        ? now - IDENTITY_RETENTION_MS - 1
        : now,
    });
  }
  const expiredKey = `pilot:${String(expiredIndex).padStart(4, "0")}`;
  const { storage } = storageHarness(values);
  const originalList = storage.list;
  let listCalls = 0;
  storage.list = async (options) => {
    listCalls += 1;
    return originalList(options);
  };
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: MAXIMUM_IDENTITIES,
    identityCount: MAXIMUM_IDENTITIES,
    identitySweepAfterKey: `pilot:${String(cursorIndex).padStart(4, "0")}`,
    lastIdentitySweepAtMs: 0,
    lastForcedIdentitySweepAtMs: 0,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [];

  assert.equal(await world.reclaimExpiredIdentities(now, true), 1);
  assert.equal(values.has(expiredKey), false);
  assert.equal(listCalls, 3, "force mode must scan the tail and then wrap to the cursor");
  assert.equal(world.world.lastForcedIdentitySweepAtMs, 0,
    "freeing a slot before full-cycle completion must not start the cooldown");
});

test("one capacity hello cannot scan a full ten-thousand-identity namespace", async () => {
  const now = IDENTITY_RETENTION_MS + 140_000;
  const values = new Map();
  for (let index = 0; index < MAXIMUM_IDENTITIES; index += 1) {
    values.set(`pilot:${String(index).padStart(5, "0")}`, {
      playerId: `pilot-${index}`,
      callsign: `PILOT-${String(index + 1).padStart(5, "0")}`,
      sectorIndex: index,
      spawnOrigin: sectorOrigin(index),
      createdAtMs: now,
      lastSeenAtMs: now,
    });
  }
  const { storage, metrics } = storageHarness(values);
  const originalList = storage.list;
  let listCalls = 0;
  storage.list = async (options) => {
    listCalls += 1;
    return originalList(options);
  };
  const world = Object.create(GlobalWorld.prototype);
  world.world = {
    epoch: "world-test", createdAtMs: 1, nextSector: MAXIMUM_IDENTITIES,
    identityCount: MAXIMUM_IDENTITIES,
    identitySweepAfterKey: null,
    identityForcedSweepActive: false,
    identityForcedSweepStopAfterKey: null,
    identityForcedSweepWrapped: false,
    lastIdentitySweepAtMs: 0,
    lastForcedIdentitySweepAtMs: 0,
  };
  world.ctx = { storage };
  world.connectedSockets = () => [];

  let attempts = 0;
  do {
    const beforeListCalls = listCalls;
    const rejection = await world.allocateIdentitySerial(
      "browser-full-capacity-shape",
      true,
      now,
      41,
    );
    attempts += 1;
    assert.equal(rejection.ok, false);
    assert.equal(rejection.reason, "identity-capacity");
    assert.ok(
      listCalls - beforeListCalls
        <= MAXIMUM_FORCED_IDENTITY_SWEEP_BATCHES_PER_ALLOCATION,
      "one hello must have a fixed sweep-work ceiling",
    );
    if (world.world.identityForcedSweepActive) {
      assert.equal(rejection.retryAfterSeconds, IDENTITY_FORCED_SWEEP_RETRY_MS / 1000);
      if (attempts === 1) {
        const beforeAlarmSweep = listCalls;
        assert.equal(await world.reclaimExpiredIdentities(now + 1), 0);
        assert.equal(listCalls, beforeAlarmSweep,
          "maintenance must not discard an in-progress forced-cycle wrap boundary");
      }
      const persistedWorld = await storage.get("world");
      assert.equal(persistedWorld.identityForcedSweepActive, true);
      assert.equal(typeof persistedWorld.identitySweepAfterKey, "string");
      world.world = structuredClone(persistedWorld);
    }
    assert.ok(attempts < 100, "the persisted cursor must eventually finish one cycle");
  } while (world.world.identityForcedSweepActive);

  const expectedBatches = Math.ceil(MAXIMUM_IDENTITIES / IDENTITY_SWEEP_BATCH_SIZE);
  assert.equal(listCalls, expectedBatches);
  assert.equal(attempts, Math.ceil(
    expectedBatches / MAXIMUM_FORCED_IDENTITY_SWEEP_BATCHES_PER_ALLOCATION,
  ));
  assert.equal(world.world.identitySweepAfterKey, null);
  assert.equal(world.world.lastForcedIdentitySweepAtMs, now);
  assert.ok(metrics.maximumPutPairs <= 128);

  const beforeCooldownAttempt = listCalls;
  const cooledDown = await world.allocateIdentitySerial(
    "browser-full-capacity-shape",
    true,
    now + 1,
    41,
  );
  assert.equal(cooledDown.ok, false);
  assert.equal(listCalls, beforeCooldownAttempt,
    "a completed no-reclaim cycle must retain its one-hour rescan cooldown");
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
