// Co-op toy chopper session: one chopper, two seats. P1 flies (left half),
// P2 is the door gunner (right half). Pure state machine; the view renders it
// and forwards pads. Kid fairness throughout: nothing here can fail a mission.

import {joinPadIndex} from "../rc/join.mjs";
import {listPads, readFlightPad} from "../render/split/pad_flight.mjs";
import {stepCraft} from "../render/split/toy_flight.mjs";
import {
  beginPlay, chopperDamage, createMission, missionStars, missionTelemetry,
  noteShot, notePopType, scorePop, stepMission,
} from "./missions.mjs";
import {hitToy, resetToyIds} from "./targets.mjs";
import {
  createGunner, gunnerDirection, lobArc, pickLock, readGunnerPad, stepGunnerAim,
} from "./gunner.mjs";

export const WEAPONS = Object.freeze({
  dart: {speed: 34, lifeS: 1.6, radius: 1.6, cooldownS: 0.16}, // generous hit box
  balloon: {speed: 16, lifeS: 2.6, radius: 1.1, splash: 3.6, cooldownS: 0.7, gravity: 9},
});

const BRIEF_S = 3.5;

let shotSeq = 0;
const sid = () => `shot-${(shotSeq += 1)}`;

export function createCoopSession() {
  return {
    phase: "title",        // title | brief | fly | pause | result
    missionId: null,
    mission: null,
    split: false,
    p1Pad: null,
    p2Pad: null,
    chopper: null,
    gunner: createGunner(),
    shots: [],
    now: 0,
    briefUntil: 0,
    wobbleS: 0,
    // Same two assist levels as every flying surface (owner, 6 Nov 2026).
    // Kid (default): hands off, the chopper auto-hovers and holds height.
    // Pilot: the lever and the drift are yours.
    assist: "kid",
    holdSteady: false,
    lock: null,            // {id, x, y, z} for both halves' markers
    lobPreview: null,
    events: [],            // one frame of juice/audio events for the view
    result: null,          // {stars, telemetry}
    _prev: {p1: {}, p2: {}, join: {}},
  };
}

function spawnChopper() {
  return {
    id: "coop-chopper", seat: "p1", team: "good", kind: "chopper", kindId: "army",
    // Nose west so the starboard door opens onto the toy field (+z): the
    // gunner has something in the arc the moment the skids leave the pad.
    x: 0, y: 6, z: -6, heading: -Math.PI / 2, pitch: 0, bank: 0, speed: 0, lever: 0.5,
    vy: 0, rotor: 0, coolDart: 0, coolBalloon: 0, invuln: 0, splat: 0, pop: 0,
    downFor: 0, radius: 1.4,
  };
}

export function startMission(session, missionId, now = 0) {
  resetToyIds();
  session.missionId = missionId;
  session.mission = createMission(missionId, now);
  session.chopper = spawnChopper();
  session.gunner = createGunner();
  session.shots = [];
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

function gunOrigin(session) {
  const c = session.chopper; // muzzle sits just outside the starboard door
  return {
    x: c.x + Math.sin(c.heading + Math.PI / 2) * 1.2,
    y: c.y - 0.2,
    z: c.z + Math.cos(c.heading + Math.PI / 2) * 1.2,
  };
}

function fire(session, weapon) {
  const spec = WEAPONS[weapon];
  const coolKey = weapon === "balloon" ? "coolBalloon" : "coolDart";
  if ((session.chopper[coolKey] || 0) > 0) return;
  session.chopper[coolKey] = spec.cooldownS;
  const origin = gunOrigin(session);
  const dir = gunnerDirection(session.chopper.heading, session.gunner);
  const {aim} = pickLock(origin, dir, session.mission.toys);
  noteShot(session.mission);
  session.gunner.shots += 1;
  emit(session, weapon === "balloon" ? "balloon-throw" : "dart-fire");
  session.shots.push({
    id: sid(), weapon,
    x: origin.x, y: origin.y, z: origin.z,
    vx: aim.x * spec.speed, vy: aim.y * spec.speed, vz: aim.z * spec.speed,
    age: 0,
  });
}

function strike(session, toy, weapon) {
  const result = hitToy(toy, weapon, session.now);
  if (!result.accepted) return false;
  session.gunner.hits += 1;
  const note = scorePop(session.mission, result, session.now);
  if (result.popped) {
    notePopType(session.mission, toy, session.now);
    emit(session, "pop", {toyId: toy.id, toyType: toy.type, big: result.big === true, x: toy.x, y: toy.y, z: toy.z});
  } else if (result.friendly) {
    emit(session, "friendly-splat", {toyId: toy.id, train: result.train === true, x: toy.x, y: toy.y, z: toy.z});
  } else {
    emit(session, "chip", {toyId: toy.id, x: toy.x, y: toy.y, z: toy.z});
  }
  return true;
}

function stepShots(session, dt) {
  const keep = [];
  for (const shot of session.shots) {
    const spec = WEAPONS[shot.weapon];
    shot.age += dt;
    if (shot.weapon === "balloon") shot.vy -= spec.gravity * dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.z += shot.vz * dt;
    const burst = shot.weapon === "balloon" && shot.y <= 0.4;
    let spent = burst || shot.age >= spec.lifeS || shot.y < -1;
    for (const toy of session.mission.toys) {
      if (toy.state !== "alive") continue;
      const reach = burst ? spec.splash : spec.radius + 1.1;
      const dist = Math.hypot(toy.x - shot.x, toy.y - shot.y, toy.z - shot.z);
      if (dist > reach) continue;
      strike(session, toy, shot.weapon);
      spent = true;
      if (shot.weapon === "dart") break;
    }
    if (burst) emit(session, "splash", {x: shot.x, y: 0, z: shot.z});
    if (!spent) keep.push(shot);
  }
  session.shots = keep;
}

/** Bad toys that reached the chopper's patch of sky bump it: wobble only. */
function stepThreats(session, dt) {
  if (session.wobbleS > 0) session.wobbleS = Math.max(0, session.wobbleS - dt);
  for (const toy of session.mission.toys) {
    if (toy.team !== "bad" || toy.state !== "alive" || toy.type !== "toy-plane") continue;
    const c = session.chopper;
    const dist = Math.hypot(toy.x - c.x, toy.y - c.y, toy.z - c.z);
    if (dist < 3 && session.wobbleS <= 0) {
      const hit = chopperDamage(session.mission, session.now);
      session.wobbleS = hit.wobbleS;
      emit(session, "wobble", {});
    }
  }
}

// Released sticks: nothing on the cyclic, pedals or collective.
function sticksReleased(p1) {
  return (
    Math.abs(p1.pitch || 0) < 0.08 &&
    Math.abs(p1.roll || 0) < 0.08 &&
    (p1.rudder || 0) === 0 &&
    Math.abs(p1.throttleRate || 0) < 0.05
  );
}

function pilotCommand(session, p1) {
  if (session.holdSteady) {
    // Kid auto-hover (owner, 6 Nov 2026): released sticks damp everything
    // toward a clean, height-holding hover — the gunner's steady shot without
    // a button. LB/RB are the pedals now, like every other flying surface.
    const c = session.chopper;
    return {
      pitch: -c.pitch * 2.2,
      roll: -c.bank * 2.2,
      rudder: 0,
      throttleRate: (0.5 - c.lever) * 2,
    };
  }
  return {
    pitch: p1.pitch,
    roll: p1.roll,
    rudder: p1.rudder,
    throttleRate: p1.throttleRate,
  };
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
  const read = readGunnerPad(padByIndex(live, other), session._prev.join);
  session._prev.join = read;
  if (!read.startEdge) return;
  session.split = true;
  session.p2Pad = other;
  session.justJoined = true;
  emit(session, "joined", {});
}

function finishMission(session) {
  const stars = missionStars(session.mission);
  const telemetry = {
    ...missionTelemetry(session.mission),
    holdSteadyS: Math.round(session.mission.stats.holdSteadyS * 10) / 10,
  };
  session.result = {stars, telemetry};
  session.phase = "result";
  emit(session, "mission-clear", {});
}

export function stepCoop(session, {dt, pads, now} = {}) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  session.now = Number.isFinite(now) ? now : session.now + step;
  session.events = [];
  session.justJoined = false;
  const live = listPads(pads);
  if (session.phase === "title" || session.phase === "result") return session;
  noteJoin(session, live);
  const p1raw = padByIndex(live, session.p1Pad ?? live[0]?.index);
  const p1 = readFlightPad(p1raw, session._prev.p1);
  const p2 = session.split
    ? readGunnerPad(padByIndex(live, session.p2Pad), session._prev.p2)
    : readGunnerPad(null, session._prev.p2);
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
  if ((p1.startEdge || (p2.startEdge && !session.justJoined))) {
    session.phase = "pause";
    return session;
  }
  if (step === 0) return session;

  session.holdSteady = session.assist !== "pilot" && p1.connected && sticksReleased(p1);
  if (session.holdSteady) session.mission.stats.holdSteadyS += step;

  // Fly the one shared chopper; wobble adds a shudder the pilot must ride out.
  const cmd = pilotCommand(session, p1);
  if (session.wobbleS > 0) {
    cmd.roll += Math.sin(session.now * 23) * 0.5;
    cmd.pitch += Math.cos(session.now * 19) * 0.3;
  }
  stepCraft(session.chopper, cmd, step);

  // Gunner aim: P2's stick, or gentle auto-track when playing solo.
  if (session.split) {
    stepGunnerAim(session.gunner, {x: p2.x, y: p2.y}, step, p2.zoom);
  } else {
    stepGunnerAim(session.gunner, {x: 0, y: 0}, step, false);
  }

  const origin = gunOrigin(session);
  const dir = gunnerDirection(session.chopper.heading, session.gunner);
  const picked = pickLock(origin, dir, session.mission.toys);
  session.lock = picked.target
    ? {id: picked.target.id, x: picked.target.x, y: picked.target.y, z: picked.target.z}
    : null;

  const dartEdge = session.split ? p2.dartEdge : p1.dartEdge;
  const balloonDown = session.split ? p2.balloonDown : p1.balloonDown;
  const balloonEdge = session.split ? p2.balloonEdge : p1.balloonEdge;
  session.lobPreview = balloonDown
    ? lobArc(origin, dir, WEAPONS.balloon.speed, WEAPONS.balloon.gravity)
    : null;
  if (dartEdge) fire(session, "dart");
  if (balloonEdge) fire(session, "balloon");

  stepShots(session, step);
  stepThreats(session, step);
  stepMission(session.mission, step, session.now);
  if (session.mission.phase === "clear") finishMission(session);
  return session;
}

export function leaveToTitle(session) {
  session.phase = "title";
  session.mission = null;
  session.result = null;
  return session;
}
