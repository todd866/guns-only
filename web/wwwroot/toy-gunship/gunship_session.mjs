// TOY GUNSHIP co-op session: one toy cargo plane, two seats. P1 (left half)
// flies the orbit and drops supply crates; P2 (right half) is the toy-camera
// gunner. Pure state machine; the view renders it and forwards the pads.
// Kid fairness throughout: nothing in here can fail the mission.

import {joinPadIndex} from "../rc/join.mjs";
import {listPads, readFlightPad} from "../render/split/pad_flight.mjs";
import {
  createOrbit, createSearchlight, dropCrate, orbitPose, resetCrateIds,
  stepCrates, stepOrbit, stepSearchlight,
} from "./orbit.mjs";
import {
  GUNS, createTvCam, cycleZoom, fireGun, readTvPad, resetRoundIds,
  softLock, stepRounds, stepTvAim,
} from "./tv_cam.mjs";
import {hitGunshipToy, resetGunshipIds, squadLead} from "./gunship_targets.mjs";
import {
  beginPlay, createGunshipMission, missionStars, missionTelemetry,
  noteCrate, noteShot, noteSpotted, scoreHit, stepGunshipMission,
} from "./gunship_mission.mjs";

const BRIEF_S = 4;
export const WASHOUT_S = 1.4; // lens glare while the searchlight holds the plane

export function createGunshipSession() {
  return {
    phase: "title",          // title | brief | fly | pause | result
    mission: null,
    split: false,
    p1Pad: null,
    p2Pad: null,
    orbit: createOrbit(),
    light: createSearchlight(),
    cam: createTvCam(),
    crates: [],
    lastDropAt: -Infinity,
    rounds: [],
    pose: null,              // plane pose this frame
    lock: null,              // {id, x, z} soft-lock marker for both halves
    now: 0,
    briefUntil: 0,
    wobbleS: 0,
    holdSteady: false,
    events: [],              // one frame of juice/audio events for the view
    result: null,            // {stars, telemetry}
    justJoined: false,
    _prev: {p1: {}, p2: {}, join: {}},
  };
}

export function startGunship(session, now = 0) {
  resetGunshipIds();
  resetCrateIds();
  resetRoundIds();
  session.mission = createGunshipMission(now);
  session.orbit = createOrbit();
  session.light = createSearchlight();
  session.cam = createTvCam();
  session.crates = [];
  session.lastDropAt = -Infinity;
  session.rounds = [];
  session.phase = "brief";
  session.briefUntil = now + BRIEF_S;
  session.result = null;
  session.wobbleS = 0;
  session.events = [];
  return session;
}

function emit(session, type, data = {}) {
  session.events.push({type, ...data});
}

/** Resolve one round impact against the yard: darts pick one toy, areas splash. */
function resolveImpact(session, round) {
  const gun = GUNS[round.gun];
  const toys = session.mission.toys;
  const reach = Math.max(gun.hitR, gun.splash);
  let struck = 0;
  let nearest = null;
  let nearestD = Infinity;
  for (const toy of toys) {
    if (toy.state !== "alive") continue;
    const d = Math.hypot(toy.x - round.x, toy.z - round.z);
    if (d > reach) continue;
    if (gun.splash > 0) {
      struck += applyHit(session, toy, round.gun, gun.damage) ? 1 : 0;
    } else if (d < nearestD) {
      nearestD = d;
      nearest = toy;
    }
  }
  if (gun.splash === 0 && nearest) struck += applyHit(session, nearest, round.gun, gun.damage) ? 1 : 0;
  if (round.gun === "balloon") emit(session, "splash", {x: round.x, z: round.z});
  if (round.gun === "confetti") emit(session, "confetti-pop", {x: round.x, z: round.z});
  return struck;
}

function applyHit(session, toy, gun, damage) {
  const result = hitGunshipToy(toy, gun, damage, session.now);
  const note = scoreHit(session.mission, toy, result, session.now);
  if (result.deflected) {
    emit(session, "deflect", {toyId: toy.id, x: toy.x, z: toy.z});
    return false;
  }
  if (!result.accepted) return false;
  session.cam.hits += 1;
  if (result.friendly) {
    emit(session, "friendly-splat", {toyId: toy.id, x: toy.x, z: toy.z});
  } else if (result.popped) {
    emit(session, "pop", {toyId: toy.id, toyType: toy.type, big: result.big === true,
      boss: result.boss === true, x: toy.x, z: toy.z});
  } else if (note?.bossPhase) {
    emit(session, "boss-phase", {toyId: toy.id, x: toy.x, z: toy.z});
  } else {
    emit(session, "chip", {toyId: toy.id, x: toy.x, z: toy.z});
  }
  return true;
}

function padByIndex(live, index) {
  if (index == null) return null;
  return live.find((p) => p.index === index) ?? null;
}

function noteJoin(session, live) {
  if (session.p1Pad == null && live[0]) session.p1Pad = live[0].index;
  if (session.split) return;
  const other = joinPadIndex(live, session.p1Pad);
  if (other == null) return;
  const read = readTvPad(padByIndex(live, other), session._prev.join);
  session._prev.join = read;
  if (!read.startEdge) return;
  session.split = true;
  session.p2Pad = other;
  session.justJoined = true;
  emit(session, "joined", {});
}

function finishMission(session) {
  session.mission.stats.spottedS = session.light.totalSpottedS;
  const stars = missionStars(session.mission);
  const telemetry = missionTelemetry(session.mission);
  session.result = {stars, telemetry};
  session.phase = "result";
  emit(session, "mission-clear", {});
}

/** Solo fallback: nobody on the toy camera, so it tracks and darts for itself. */
function autoGunner(session, step) {
  const lead = session.mission.toys
    .filter((t) => t.team === "bad" && t.state === "alive" && !t.prop) // darts can't dent the sandcastle
    .sort((a, b) => Math.hypot(a.x - session.cam.x, a.z - session.cam.z)
      - Math.hypot(b.x - session.cam.x, b.z - session.cam.z))[0];
  if (!lead) { stepTvAim(session.cam, {x: 0, y: 0}, step); return; }
  const stick = {
    x: Math.max(-1, Math.min(1, (lead.x - session.cam.x) * 0.4)),
    y: Math.max(-1, Math.min(1, (lead.z - session.cam.z) * 0.4)),
  };
  stepTvAim(session.cam, stick, step);
  if (Math.hypot(lead.x - session.cam.x, lead.z - session.cam.z) < 3) {
    tryFire(session, "dart");
  }
}

function tryFire(session, gunId) {
  const round = fireGun(session.cam, gunId, session.mission.toys, session.now);
  if (!round) return;
  noteShot(session.mission);
  session.rounds.push(round);
  emit(session, gunId === "dart" ? "dart-fire" : gunId === "balloon" ? "balloon-drop" : "confetti-fire", {});
}

export function stepGunship(session, {dt, pads, now} = {}) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  session.now = Number.isFinite(now) ? now : session.now + step;
  session.events = [];
  session.justJoined = false;
  const live = listPads(pads);
  if (session.phase === "title" || session.phase === "result") return session;
  noteJoin(session, live);
  const p1raw = padByIndex(live, session.p1Pad ?? live[0]?.index);
  const p1 = readFlightPad(p1raw, session._prev.p1);
  const p1lb = (() => {
    const b = p1raw?.buttons?.[4];
    return b ? Math.max(b.pressed === true ? 1 : 0, Number(b.value) || 0) > 0.5 : false;
  })();
  const p2 = session.split
    ? readTvPad(padByIndex(live, session.p2Pad), session._prev.p2)
    : readTvPad(null, session._prev.p2);
  session._prev.p1 = p1;
  session._prev.p2 = p2;

  if (session.phase === "pause") {
    if ((p1.startEdge || p2.startEdge) && !session.justJoined) session.phase = "fly";
    return session;
  }
  if (session.phase === "brief") {
    if (session.now >= session.briefUntil || p1.startEdge || p1.dartEdge || p2.dartEdge) {
      session.phase = "fly";
      beginPlay(session.mission, session.now);
    }
    return session;
  }
  if (p1.startEdge || (p2.startEdge && !session.justJoined)) {
    session.phase = "pause";
    return session;
  }
  if (step === 0) return session;

  // P1 flies the orbit: stick x = radius in/out, stick y = altitude,
  // triggers = orbit speed, LB = hold the orbit steady for clean shots.
  session.holdSteady = p1lb;
  stepOrbit(session.orbit, {
    radiusRate: p1.roll,
    altRate: -p1.pitch,         // pull back = climb, like the chopper
    speedRate: p1.throttleRate,
  }, step, session.holdSteady);
  session.pose = orbitPose(session.orbit);

  // The bedroom-window searchlight: getting caught washes out the toy camera
  // and wobbles the plane until the pilot breaks the orbit. Never a failure.
  const spottedNow = stepSearchlight(session.light, session.pose, step, session.now);
  if (spottedNow) {
    noteSpotted(session.mission, session.now);
    emit(session, "spotted", {});
  }
  if (session.light.caught) {
    session.cam.washoutS = WASHOUT_S;
    session.wobbleS = 0.4;
  }
  if (session.wobbleS > 0) session.wobbleS = Math.max(0, session.wobbleS - step);

  // P1 A drops a supply crate for the squad.
  if (p1.dartEdge) {
    const crate = dropCrate(session.crates, session.pose, session.now, session.lastDropAt);
    if (crate) {
      session.lastDropAt = session.now;
      emit(session, "crate-away", {});
    }
  }
  const lead = squadLead(session.mission.toys);
  for (const landed of stepCrates(session.crates, step, lead, session.now)) {
    noteCrate(session.mission, landed, session.now);
    emit(session, landed.onTarget ? "crate-on-target" : "crate-off-target", {x: landed.x, z: landed.z});
  }

  // P2 runs the toy camera; solo, it minds itself so Dad can test-fly.
  if (session.split) {
    stepTvAim(session.cam, {x: p2.x, y: p2.y}, step);
    if (p2.zoomEdge) { cycleZoom(session.cam); emit(session, "zoom", {level: session.cam.zoom}); }
    if (p2.dartEdge || p2.dartDown) tryFire(session, "dart"); // held A keeps the darts coming
    if (p2.balloonEdge) tryFire(session, "balloon");
    if (p2.confettiEdge) tryFire(session, "confetti");
  } else {
    autoGunner(session, step);
  }
  const locked = softLock(session.cam, session.mission.toys);
  session.lock = locked ? {id: locked.id, x: locked.x, z: locked.z} : null;

  for (const round of stepRounds(session.rounds, session.now)) {
    resolveImpact(session, round);
  }

  const bossWave = stepGunshipMission(session.mission, step, session.now);
  if (bossWave) emit(session, "boss-rise", {});
  if (session.mission.phase === "clear") finishMission(session);
  return session;
}

export function leaveToTitle(session) {
  session.phase = "title";
  session.mission = null;
  session.result = null;
  return session;
}
