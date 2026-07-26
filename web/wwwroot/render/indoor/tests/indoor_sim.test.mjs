import assert from "node:assert/strict";
import test from "node:test";
import {
  FACILITY,
  SURVEY_PROFILES,
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

function completeSurveyScans(state) {
  let next = state;
  for (const scan of next.survey.scanPoints) {
    next.drone.position = { ...scan.position };
    next.drone.velocity = { x: 0, y: 0, z: 0 };
    next = advance(next, Math.ceil((scan.dwellRequired + 0.05) / DT));
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

test("survey profiles are immutable doctrine and produce independent mission state", () => {
  assert.equal(Object.isFrozen(SURVEY_PROFILES), true);
  assert.deepEqual(Object.keys(SURVEY_PROFILES), [
    "attack-site",
    "discretionary-site",
    "diversion-site",
  ]);

  const attack = createIndoorMission({ missionId: "attack-site" });
  const diversion = createIndoorMission({ missionId: "diversion-site" });
  assert.equal(attack.missionType, "survey");
  assert.equal(attack.survey.doctrine, "stealth-mandatory");
  assert.equal(diversion.survey.doctrine, "noisy-provocation");
  assert.ok(attack.survey.distanceFromBaseKm < diversion.survey.distanceFromBaseKm);
  attack.survey.scanPoints[0].complete = true;
  assert.equal(diversion.survey.scanPoints[0].complete, false);
  assert.throws(
    () => createIndoorMission({ missionId: "not-a-site" }),
    /Unknown indoor mission profile/,
  );
});

test("survey observations require a dwell, complete once, and expose return readiness", () => {
  let state = createIndoorMission({ missionId: "attack-site" });
  const first = state.survey.scanPoints[0];
  state.drone.position = { ...first.position };
  state.drone.velocity = { x: 0, y: 0, z: 0 };

  state = advance(state, Math.floor(first.dwellRequired / DT) - 1);
  assert.equal(state.survey.scanPoints[0].complete, false);
  assert.equal(state.survey.scanning, true);
  state = advance(state, 3);
  assert.equal(state.survey.scanPoints[0].complete, true);
  assert.equal(
    state.events.filter((event) => event.type === "survey-scan-complete"
      && event.scanId === first.id).length,
    1,
  );

  state = completeSurveyScans(state);
  assert.equal(state.survey.objectives.scan.complete, true);
  assert.equal(state.survey.objectives.scan.completed, state.survey.scanPoints.length);
  assert.equal(state.survey.phase, "return-ready");
});

test("tomorrow's attack-site sortie succeeds only as a dark survey and silent return", () => {
  const breachCases = [
    [{ detachFiber: true }, "stealth-rf-breach"],
    [{ broadcast: true }, "stealth-broadcast-breach"],
    [{ fire: true }, "stealth-fire-breach"],
  ];
  for (const [input, reason] of breachCases) {
    const breached = stepIndoorMission(
      createIndoorMission({ missionId: "attack-site" }),
      input,
      DT,
    );
    assert.equal(breached.status, "failure");
    assert.equal(breached.failureReason, reason);
  }

  let state = completeSurveyScans(createIndoorMission({ missionId: "attack-site" }));
  state = stepIndoorMission(state, { returnHome: true }, DT);
  assert.equal(state.survey.returnRequested, true);
  assert.equal(state.survey.silentReturn, true);
  assert.equal(state.drone.autonomy.mode, "return-home");
  assert.equal(state.drone.autonomy.authority, 0);
  state.drone.position = { ...state.survey.extractionPosition };
  state.drone.velocity = { x: 0, y: 0, z: 0 };
  state = stepIndoorMission(state, {}, DT);
  assert.equal(state.status, "success");
  assert.equal(state.survey.objectives.return.complete, true);
  assert.equal(state.link.mode, "fiber");
});

test("the same broadcast draws more attention as survey distance from base increases", () => {
  const attention = Object.keys(SURVEY_PROFILES).map((missionId) => {
    const state = stepIndoorMission(
      createIndoorMission({ missionId }),
      { broadcast: true },
      DT,
    );
    return state.survey.attention;
  });
  assert.ok(attention[0] < attention[1]);
  assert.ok(attention[1] < attention[2]);
});

test("diversion doctrine requires a deliberate signature, investigator, and first shot", () => {
  let state = completeSurveyScans(createIndoorMission({ missionId: "diversion-site" }));
  state = stepIndoorMission(state, { returnHome: true }, DT);
  assert.equal(state.survey.returnRequested, true);
  assert.equal(state.status, "active",
    "an early return may be requested but cannot complete before provocation requirements");

  state = completeSurveyScans(createIndoorMission({ missionId: "diversion-site" }));
  state = stepIndoorMission(state, { detachFiber: true }, DT);
  state = advance(state, 60, { broadcast: true });
  assert.equal(state.survey.objectives.broadcast.complete, true);
  assert.equal(state.survey.investigator.summoned, true);
  state = advance(state, Math.ceil((state.survey.investigator.delay + 0.1) / DT));
  assert.equal(state.survey.investigator.arrived, true);
  assert.equal(state.survey.combat.active, false,
    "being observed does not start the reinforcement clock before the player fires");

  const investigator = state.hostiles.find((hostile) => hostile.id === "investigator-drone");
  state.drone.position = {
    x: investigator.position.x,
    y: investigator.position.y,
    z: investigator.position.z + 2,
  };
  state.drone.velocity = { x: 0, y: 0, z: 0 };
  state.drone.yaw = 0;
  state.drone.pitch = 0;
  state = stepIndoorMission(state, { fire: true }, DT);
  state = advance(state, 12);
  assert.equal(state.survey.combat.active, true);
  assert.equal(state.survey.objectives.combat.complete, true);
  assert.ok(state.survey.combat.reinforcementRemaining
    < state.survey.combat.reinforcementDuration);
});

test("reinforcement arrival has an exact clock boundary and activates drone-v-drone combat", () => {
  let state = createIndoorMission({ missionId: "diversion-site" });
  state.survey.combat.active = true;
  state.survey.combat.reinforcementClockActive = true;
  state.survey.combat.reinforcementRemaining = DT * 2;
  state.survey.combat.reinforcementArrived = false;
  state.survey.objectives.combat.complete = true;

  state = stepIndoorMission(state, {}, DT);
  assert.equal(state.survey.combat.reinforcementArrived, false);
  state = stepIndoorMission(state, {}, DT);
  assert.equal(state.survey.combat.reinforcementArrived, true);
  const reinforcement = state.hostiles.find(
    (hostile) => hostile.id === "reinforcement-drone",
  );
  assert.equal(reinforcement.active, true);
  assert.equal(reinforcement.engaged, true);
  assert.ok(state.events.some((event) => event.type === "reinforcement-arrived"));
});

test("discretionary survey supports both a quiet recovery and a defended radio branch", () => {
  let quiet = completeSurveyScans(
    createIndoorMission({ missionId: "discretionary-site" }),
  );
  quiet = stepIndoorMission(quiet, { returnHome: true }, DT);
  quiet.drone.position = { ...quiet.survey.extractionPosition };
  quiet.drone.velocity = { x: 0, y: 0, z: 0 };
  quiet = stepIndoorMission(quiet, {}, DT);
  assert.equal(quiet.status, "success");
  assert.equal(quiet.survey.silentReturn, true);

  let noisy = completeSurveyScans(
    createIndoorMission({ missionId: "discretionary-site" }),
  );
  noisy = stepIndoorMission(noisy, { detachFiber: true }, DT);
  noisy = advance(noisy, 130, { broadcast: true });
  assert.equal(noisy.status, "active");
  assert.equal(noisy.survey.investigator.summoned, true);
  assert.equal(noisy.survey.breach, null);
  assert.equal(noisy.link.mode, "rf");
});
