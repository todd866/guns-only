import assert from "node:assert/strict";
import test from "node:test";
import {
  FACILITY,
  createIndoorMission,
  detachFiber,
  missionSnapshot,
  stepIndoorMission,
} from "../../../indoor/sim.js";

const DT = 1 / 60;

function advance(state, frames, input = {}) {
  let next = state;
  for (let frame = 0; frame < frames; frame += 1) {
    next = stepIndoorMission(
      next,
      typeof input === "function" ? input(frame) : input,
      DT,
    );
  }
  return next;
}

test("exports immutable facility truth and creates independent mission states", () => {
  assert.equal(Object.isFrozen(FACILITY), true);
  assert.equal(Object.isFrozen(FACILITY.walls), true);
  assert.ok(FACILITY.walls.length >= 6);
  assert.ok(FACILITY.doors.length >= 2);
  assert.ok(FACILITY.pathNodes.length >= 3);
  assert.equal(FACILITY.objectiveNodes.length, 3);
  assert.equal(FACILITY.checkpoint.id, "interior-checkpoint");
  assert.deepEqual(FACILITY.startPosition, { x: 0, y: 2, z: 14 });
  assert.deepEqual(FACILITY.relayPosition, { x: 0, y: 1.15, z: 14.9 });

  const first = createIndoorMission();
  const second = createIndoorMission();
  assert.equal(first.drone.ammo, 36);
  assert.equal(first.link.rf.maxSurvivalTimer, 45);
  assert.equal(first.link.rf.videoState, "clear");
  assert.equal(first.link.rf.quality, 1);
  assert.deepEqual(first.drone.autonomy, {
    active: false,
    authority: 1,
    level: 0,
    mode: "standby",
    targetId: null,
  });
  first.drone.position.x = 7;
  first.objectives[0].integrity = 0;
  assert.equal(second.drone.position.x, FACILITY.startPosition.x);
  assert.equal(second.objectives[0].integrity, second.objectives[0].maxIntegrity);
});

test("is deterministic for identical fixed-step input streams", () => {
  const original = createIndoorMission();
  let left = original;
  let right = createIndoorMission();
  for (let frame = 0; frame < 360; frame += 1) {
    const input = {
      forward: frame < 210 ? 0.72 : -0.2,
      right: frame % 90 < 45 ? 0.13 : -0.13,
      up: frame > 100 && frame < 180 ? 0.08 : 0,
      yaw: frame % 120 < 60 ? 0.09 : -0.09,
      pitch: frame % 80 < 40 ? 0.03 : -0.03,
      fire: frame === 75 || frame === 155,
    };
    left = stepIndoorMission(left, input, DT);
    right = stepIndoorMission(right, input, DT);
  }
  assert.deepEqual(missionSnapshot(left), missionSnapshot(right));
  assert.deepEqual(original.drone.position, FACILITY.startPosition,
    "stepIndoorMission must not mutate its input state");
});

test("manual fibre detachment starts the finite RF phase without mutating input", () => {
  const fiberState = createIndoorMission();
  const rfState = detachFiber(fiberState, "planned-release");
  assert.equal(fiberState.link.mode, "fiber");
  assert.equal(fiberState.link.fiber.connected, true);
  assert.equal(rfState.link.mode, "rf");
  assert.equal(rfState.link.fiber.connected, false);
  assert.equal(rfState.link.fiber.detached, true);
  assert.equal(rfState.link.fiber.detachReason, "planned-release");
  assert.equal(rfState.link.rf.active, true);
  assert.equal(rfState.link.rf.survivalTimer, rfState.link.rf.maxSurvivalTimer);
  assert.ok(rfState.link.rf.signal > 0);
  assert.equal(rfState.link.rf.signalState, "strong");
  assert.equal(rfState.link.rf.videoState, "clear");
  assert.ok(rfState.link.rf.quality > 0.9);

  const after = stepIndoorMission(rfState, {}, 1);
  assert.ok(after.link.rf.survivalTimer < rfState.link.rf.survivalTimer);
  assert.ok(after.link.rf.signal >= 0 && after.link.rf.signal <= 1);
});

test("the gun remains safe on optical ingress and arms on RF handoff", () => {
  const optical = createIndoorMission();
  const stillOptical = stepIndoorMission(optical, { fire: true }, DT);
  assert.equal(stillOptical.drone.ammo, 36);
  assert.equal(stillOptical.gun.shots, 0);
  assert.equal(stillOptical.projectiles.length, 0);

  const radio = stepIndoorMission(stillOptical, { detachFiber: true, fire: true }, DT);
  assert.equal(radio.link.mode, "rf");
  assert.equal(radio.drone.ammo, 35);
  assert.equal(radio.gun.shots, 1);
  assert.equal(radio.projectiles.length, 1);
});

test("sustained fibre tension at a collision smoothly auto-detaches to RF", () => {
  let state = createIndoorMission();
  state.drone.position = { x: 9.5, y: 2, z: 10 };
  state.drone.velocity = { x: 0, y: 0, z: 0 };
  state = advance(state, 180, { right: 1 });
  assert.ok(state.drone.position.x <= FACILITY.bounds.max.x - state.drone.radius + 1e-5);
  assert.ok(state.drone.collisionCount > 0);
  assert.equal(state.link.mode, "rf");
  assert.equal(state.link.fiber.detachReason, "fiber-tension");
  assert.ok(state.link.fiber.tension >= state.link.fiber.maxTension);
});

test("closed AABB doors block the drone and opened doors permit passage", () => {
  let state = createIndoorMission();
  const vestibule = state.doors.find((door) => door.id === "vestibule-door");
  vestibule.open = false;
  state.drone.position = { x: 0, y: 2, z: 7 };
  state.drone.velocity = { x: 0, y: 0, z: 0 };

  state = advance(state, 100, { forward: 1 });
  assert.ok(state.drone.position.z >= vestibule.aabb.max.z + state.drone.radius - 0.01);
  assert.ok(state.drone.collisionCount > 0);

  state.doors.find((door) => door.id === "vestibule-door").open = true;
  state = advance(state, 100, { forward: 1 });
  assert.ok(state.drone.position.z < vestibule.aabb.min.z - state.drone.radius);
});

test("player projectiles disable sentries and mission objectives", () => {
  let state = createIndoorMission();
  state.doors.forEach((door) => { door.open = true; });
  // The authored precleared route climbs over the atrium bulkhead at centreline. Keep this
  // isolated ballistics contract in the open east lane so it tests hits rather than the new
  // vertical-ingress obstacle.
  state.drone.position = { x: 3, y: 2, z: 3 };
  state.drone.velocity = { x: 0, y: 0, z: 0 };
  state.drone.yaw = 0;
  state.drone.pitch = 0;
  state.hostiles = [{
    ...state.hostiles[0],
    id: "test-sentry",
    position: { x: 3, y: 2, z: 0 },
    home: { x: 3, y: 2, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    patrolAxis: { x: 0, y: 0, z: 0 },
    patrolAmplitude: 0,
    health: 1,
    maxHealth: 1,
    fireCooldown: 99,
  }];
  state.objectives = [{
    ...state.objectives[0],
    id: "test-objective",
    position: { x: 3, y: 2, z: -3 },
    integrity: 1,
    maxIntegrity: 1,
    destroyed: false,
    required: true,
  }];
  state = detachFiber(state, "test-arm");

  state = stepIndoorMission(state, { fire: true }, DT);
  state = advance(state, 20);
  assert.equal(state.hostiles[0].alive, false);
  assert.equal(state.gun.hits, 1);

  state = stepIndoorMission(state, { fire: true }, DT);
  state = advance(state, 30);
  assert.equal(state.objectives[0].destroyed, true);
  assert.equal(state.gun.hits, 2);
  assert.equal(state.status, "success");
  assert.equal(state.success, true);
});

test("RF degradation exposes choppy video and progressively transfers control authority", () => {
  const stepAtRelayIntegrity = (relayIntegrity, right) => {
    let state = detachFiber(createIndoorMission(), "quality-test");
    state.link.rf.relayIntegrity = relayIntegrity;
    return stepIndoorMission(state, { right }, DT);
  };

  const strongRight = stepAtRelayIntegrity(100, 1);
  const strongLeft = stepAtRelayIntegrity(100, -1);
  const degradedRight = stepAtRelayIntegrity(60, 1);
  const degradedLeft = stepAtRelayIntegrity(60, -1);
  const weakRight = stepAtRelayIntegrity(20, 1);
  const weakLeft = stepAtRelayIntegrity(20, -1);

  assert.equal(strongRight.link.rf.signalState, "strong");
  assert.equal(strongRight.link.rf.videoState, "clear");
  assert.equal(degradedRight.link.rf.signalState, "degraded");
  assert.equal(weakRight.link.rf.signalState, "weak");
  assert.equal(weakRight.link.rf.videoState, "choppy");
  assert.ok(strongRight.drone.autonomy.authority
    > degradedRight.drone.autonomy.authority);
  assert.ok(degradedRight.drone.autonomy.authority
    > weakRight.drone.autonomy.authority);
  assert.ok(weakRight.drone.autonomy.authority > 0,
    "weak RF retains a small, non-binary amount of player authority");

  const strongInputEffect = strongRight.drone.velocity.x - strongLeft.drone.velocity.x;
  const degradedInputEffect = degradedRight.drone.velocity.x
    - degradedLeft.drone.velocity.x;
  const weakInputEffect = weakRight.drone.velocity.x - weakLeft.drone.velocity.x;
  assert.ok(strongInputEffect > degradedInputEffect);
  assert.ok(degradedInputEffect > weakInputEffect);
  assert.ok(weakInputEffect > 0);
  assert.equal(weakRight.drone.autonomy.active, true);
  assert.equal(weakRight.drone.autonomy.mode, "objective-pursuit");
  assert.equal(weakRight.drone.autonomy.targetId, "security-core-a");
  assert.ok(weakRight.events.some((event) => event.type === "rf-degraded"));
  assert.ok(weakRight.events.some((event) => event.type === "autonomy-engaged"));

  let recovered = weakRight;
  recovered.link.rf.relayIntegrity = 100;
  recovered = stepIndoorMission(recovered, {}, DT);
  assert.equal(recovered.link.rf.signalState, "strong");
  assert.equal(recovered.drone.autonomy.active, false);
  assert.ok(recovered.events.some((event) => event.type === "rf-recovered"));
  assert.ok(recovered.events.some((event) => event.type === "autonomy-disengaged"));
});

test("lost-link autonomy stabilizes, clears walls, and pursues the next objective", () => {
  let state = detachFiber(createIndoorMission(), "avoidance-test");
  state.drone.position = { x: 0, y: 2, z: 1.5 };
  state.drone.velocity = { x: 0, y: 0, z: 0 };
  state.link.rf.survivalTimer = 0;
  const target = state.objectives[0].position;
  const initialDistance = Math.hypot(
    state.drone.position.x - target.x,
    state.drone.position.y - target.y,
    state.drone.position.z - target.z,
  );

  state = advance(state, 240);
  const finalDistance = Math.hypot(
    state.drone.position.x - target.x,
    state.drone.position.y - target.y,
    state.drone.position.z - target.z,
  );
  assert.equal(state.link.mode, "lost");
  assert.equal(state.link.rf.signalState, "lost");
  assert.equal(state.link.rf.videoState, "lost");
  assert.equal(state.link.rf.quality, 0);
  assert.equal(state.drone.autonomy.active, true);
  assert.equal(state.drone.autonomy.authority, 0);
  assert.equal(state.drone.collisionCount, 0,
    "the onboard probe steers over the atrium bulkhead");
  assert.ok(finalDistance < initialDistance);
  assert.ok(state.objectives[0].destroyed,
    "automation can aim and act on the objective after clearing the wall");
  assert.equal(state.drone.autonomy.targetId, "security-core-b",
    "the controller advances to the next live objective deterministically");
  assert.ok(state.events.some((event) => event.type === "rf-lost"
    && event.reason === "rf-window-expired"));
});

test("an exhausted RF window or disabled relay hands the mission to onboard automation", () => {
  let relayLost = detachFiber(createIndoorMission(), "relay-test");
  relayLost.link.rf.relayIntegrity = 0;
  relayLost = stepIndoorMission(relayLost, {}, DT);
  assert.equal(relayLost.status, "active");
  assert.equal(relayLost.link.mode, "lost");
  assert.equal(relayLost.link.rf.lossReason, "relay-disabled");
  assert.equal(relayLost.drone.autonomy.active, true);

  let state = detachFiber(createIndoorMission(), "test-release");
  state.link.rf.survivalTimer = 0.01;
  state = stepIndoorMission(state, {}, 0.1);
  assert.equal(state.status, "active");
  assert.equal(state.failure, false);
  assert.equal(state.success, false);
  assert.equal(state.failureReason, null);
  assert.equal(state.link.mode, "lost");
  assert.equal(state.link.rf.lossReason, "rf-window-expired");
  assert.equal(state.drone.autonomy.active, true);

  state.doors.forEach((door) => { door.open = true; });
  state.drone.position = { x: 3, y: 2, z: 3 };
  state.drone.velocity = { x: 0, y: 0, z: 0 };
  state.drone.yaw = 0;
  state.drone.pitch = 0;
  state.hostiles = [];
  state.objectives = [{
    ...state.objectives[0],
    id: "autonomy-test-core",
    position: { x: 3, y: 2, z: -3 },
    integrity: 1,
    maxIntegrity: 1,
    destroyed: false,
    required: true,
  }];
  state = advance(state, 180);
  assert.equal(state.status, "success");
  assert.equal(state.objectives[0].destroyed, true);
  assert.ok(state.gun.shots > 0);
});
