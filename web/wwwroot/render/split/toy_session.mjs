// Split-screen toy fight. Dogfight is two pads, first to 5. Co-op is both
// pads against the cast. The second pad's Start joins; its stick replaces AI.

import {joinPadIndex} from "../../rc/join.mjs";
import {CAST, castAt, hitAccepted} from "./toy_cast.mjs";
import {aiCommand} from "./toy_ai.mjs";
import {assistDirection, craftRadius, noseOf, stepCraft} from "./toy_flight.mjs";
import {listPads, readFlightPad} from "./pad_flight.mjs";
import {
  dogfightWinner,
  emptyPops,
  popBack,
  POPS_TO_WIN,
  scoreHit,
  stepDowned,
} from "./toy_score.mjs";

const DART_COOL = 0.22;
const BALLOON_COOL = 0.8;
const DART_SPEED = 32;
const BALLOON_SPEED = 16;

function rid() {
  return Math.random().toString(36).slice(2, 8);
}

export function createToyFight() {
  return {
    phase: "menu",
    mode: "dogfight",
    craft: "jet",
    split: false,
    p1Pad: null,
    p2Pad: null,
    castIndex: 0,
    pops: emptyPops(),
    winner: null,
    callout: null,
    crafts: [],
    shots: [],
    now: 0,
    minions: 0,
    _prev: {p1: {}, p2: {}, join: {}},
  };
}

export function splitTelemetry(session) {
  return {
    split: session?.split ? 1 : 0,
    mode: session?.mode === "coop" ? "coop" : "dogfight",
  };
}

function spawnHuman(session, seat, x) {
  const kind = session.craft === "chopper" ? "chopper" : "jet";
  return {
    id: seat,
    seat,
    team: "good",
    kind,
    kindId: "army",
    x,
    y: kind === "chopper" ? 4 : 8,
    z: seat === "p2" ? -8 : 8,
    heading: seat === "p2" ? Math.PI : 0,
    pitch: 0,
    bank: 0,
    speed: kind === "chopper" ? 0 : 12,
    lever: kind === "chopper" ? 0.5 : 0.45,
    vy: 0,
    rotor: 0,
    balloons: 1,
    maxBalloons: 1,
    downFor: 0,
    invuln: 1,
    tumble: 0,
    bounceV: 0,
    coolDart: 0,
    coolBalloon: 0,
    splat: 0,
    pop: 0,
    radius: craftRadius("army"),
    ai: null,
  };
}

function makeBandit(spec, slot, count) {
  const spread = (slot - (count - 1) / 2) * 5;
  const slow = spec.id === "balloon-animal-blimp" || spec.id === "toy-chest-boss";
  return {
    id: `${spec.id}-${slot}-${rid()}`,
    seat: null,
    team: "bad",
    kind: spec.id === "balloon-animal-blimp" ? "chopper" : "jet",
    kindId: spec.id,
    slot,
    x: spread,
    y: spec.id === "rc-car-gang" ? 1.6 : spec.id === "balloon-animal-blimp" ? 14 : spec.id === "toy-chest-boss" ? 8 : 6,
    z: -16 - Math.abs(spread),
    heading: Math.PI,
    pitch: 0,
    bank: 0,
    speed: slow ? 4 : 10,
    lever: slow ? 0.3 : 0.6,
    vy: 0,
    rotor: 0,
    balloons: spec.balloons,
    maxBalloons: spec.balloons,
    downFor: 0,
    invuln: 0.4,
    tumble: 0,
    bounceV: 0,
    coolDart: 0,
    coolBalloon: 0,
    splat: 0,
    pop: 0,
    radius: craftRadius(spec.id),
    color: spec.color,
    ai: {t: 0, phase: "run", open: false, lid: true, telegraph: 0, orbit: slot, spit: false},
    minion: false,
  };
}

function spawnWave(session) {
  session.crafts = session.crafts.filter((craft) => craft.team === "good");
  const spec = castAt(session.castIndex);
  if (!spec) return;
  const count = spec.count ?? 1;
  for (let i = 0; i < count; i += 1) session.crafts.push(makeBandit(spec, i, count));
}

export function beginToyFight(session) {
  session.phase = "fly";
  session.pops = emptyPops();
  session.winner = null;
  session.castIndex = 0;
  session.shots = [];
  session.callout = null;
  session.minions = 0;
  session.now = 0;
  session.quietUntil = null;
  session.crafts = [spawnHuman(session, "p1", -6)];
  if (session.split) session.crafts.push(spawnHuman(session, "p2", 6));
  if (session.mode === "coop") spawnWave(session);
  session._prev = {p1: {}, p2: {}, join: {}};
  return session;
}

export function againToyFight(session) {
  const split = session.split;
  const p1Pad = session.p1Pad;
  const p2Pad = session.p2Pad;
  beginToyFight(session);
  session.split = split;
  session.p1Pad = p1Pad;
  session.p2Pad = p2Pad;
  if (split && !session.crafts.some((craft) => craft.seat === "p2")) {
    session.crafts.push(spawnHuman(session, "p2", 6));
  }
  return session;
}

export function leaveSplit(session) {
  session.split = false;
  session.p2Pad = null;
  session.crafts = session.crafts.filter((craft) => craft.seat !== "p2");
  return session;
}

export function applyMenu(session, act) {
  if (act === "mode" && session.phase === "menu") {
    session.mode = session.mode === "coop" ? "dogfight" : "coop";
  } else if (act === "craft" && session.phase === "menu") {
    session.craft = session.craft === "chopper" ? "jet" : "chopper";
  } else if (act === "fly") beginToyFight(session);
  else if (act === "resume") session.phase = "fly";
  else if (act === "again") againToyFight(session);
  else if (act === "tomenu") session.phase = "menu";
  else if (act === "players") {
    if (session.split) leaveSplit(session);
    else session._wantJoin = true;
  }
  return session;
}

function padByIndex(live, index) {
  if (index == null) return null;
  return live.find((pad) => pad.index === index) ?? null;
}

function commandFromPad(read) {
  return {
    pitch: read?.pitch ?? 0,
    roll: read?.roll ?? 0,
    rudder: read?.rudder ?? 0,
    throttleRate: read?.throttleRate ?? 0,
    dartEdge: read?.dartEdge === true,
    balloonEdge: read?.balloonEdge === true,
  };
}

function foesOf(session, craft) {
  return session.crafts.filter((other) => {
    if (other === craft || other.downFor > 0) return false;
    if (session.mode === "dogfight") return other.seat && other.seat !== craft.seat;
    return other.team !== craft.team;
  });
}

function launch(session, craft, weapon) {
  if (craft.downFor > 0) return;
  const coolKey = weapon === "balloon" ? "coolBalloon" : "coolDart";
  if ((craft[coolKey] || 0) > 0) return;
  craft[coolKey] = weapon === "balloon" ? BALLOON_COOL : DART_COOL;
  const origin = {
    x: craft.x + Math.sin(craft.heading) * 1.3,
    y: craft.y + 0.2,
    z: craft.z + Math.cos(craft.heading) * 1.3,
  };
  const aimed = assistDirection(origin, noseOf(craft), foesOf(session, craft));
  const speed = weapon === "balloon" ? BALLOON_SPEED : DART_SPEED;
  if (session.shots.length > 24) session.shots.shift();
  session.shots.push({
    id: rid(),
    owner: craft.id,
    weapon,
    team: craft.team,
    seat: craft.seat,
    x: origin.x,
    y: origin.y,
    z: origin.z,
    vx: aimed.x * speed,
    vy: aimed.y * speed,
    vz: aimed.z * speed,
    age: 0,
    life: weapon === "balloon" ? 2.2 : 1.35,
    radius: weapon === "balloon" ? 0.9 : 0.7,
    splash: weapon === "balloon" ? 3.4 : 0,
  });
}

function sameSide(session, shot, target) {
  if (target.id === shot.owner) return true;
  if (session.mode === "coop" && shot.team && target.team === shot.team) return true;
  if (session.mode === "dogfight" && shot.seat && target.seat === shot.seat) return true;
  return false;
}

function strike(session, shot, target, weapon) {
  const owner = session.crafts.find((craft) => craft.id === shot.owner) ?? null;
  const dx = target.x - shot.x;
  const dy = target.y - shot.y;
  const dz = target.z - shot.z;
  const dist = Math.hypot(dx, dy, dz);
  const accepted = hitAccepted(target, {weapon, dist}, owner);
  if (!accepted) return false;
  const hit = scoreHit(session, {by: owner, target, weapon});
  if (hit) {
    session.callout = {text: hit.text, until: session.now + 0.9, side: owner?.seat ?? "team"};
  }
  return true;
}

function stepShots(session, dt) {
  const keep = [];
  for (const shot of session.shots) {
    shot.age += dt;
    if (shot.weapon === "balloon") shot.vy -= 9 * dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.z += shot.vz * dt;
    const boom = shot.weapon === "balloon" && (shot.y <= 0.8 || shot.age >= shot.life);
    let spent = boom || shot.age >= shot.life || shot.y < -2;
    for (const target of session.crafts) {
      if (sameSide(session, shot, target) || target.downFor > 0 || target.invuln > 0) continue;
      const reach = boom ? shot.splash : shot.radius + target.radius;
      const dist = Math.hypot(target.x - shot.x, target.y - shot.y, target.z - shot.z);
      if (dist > reach) continue;
      strike(session, shot, target, shot.weapon);
      spent = true;
      if (shot.weapon === "dart") break;
    }
    if (!spent) keep.push(shot);
  }
  session.shots = keep;
}

function stepContacts(session) {
  const touchers = new Set(["evil-teddy", "plastic-dinosaur", "jack-in-the-box", "spinning-top-swarm"]);
  for (const bad of session.crafts) {
    if (bad.team !== "bad" || bad.downFor > 0 || !touchers.has(bad.kindId)) continue;
    if (bad.kindId === "jack-in-the-box" && !bad.ai?.open) continue;
    for (const good of session.crafts) {
      if (good.team !== "good" || good.downFor > 0 || good.invuln > 0) continue;
      const dist = Math.hypot(bad.x - good.x, bad.y - good.y, bad.z - good.z);
      if (dist > bad.radius + good.radius) continue;
      const hit = scoreHit(session, {by: bad, target: good, weapon: "bump"});
      if (hit) session.callout = {text: hit.text, until: session.now + 0.9, side: good.seat};
    }
  }
}

function checkEnd(session) {
  if (session.phase !== "fly") return;
  if (session.mode === "dogfight") {
    const winner = dogfightWinner(session.pops);
    if (winner) {
      session.phase = "result";
      session.winner = winner;
    }
    return;
  }
  if ((session.pops.team ?? 0) < POPS_TO_WIN) return;
  session.pops.team = 0;
  session.castIndex += 1;
  if (session.castIndex >= CAST.length) {
    session.phase = "result";
    session.winner = "team";
    return;
  }
  spawnWave(session);
}

function noteJoin(session, live) {
  if (!session.p1Pad && live[0]) session.p1Pad = live[0].index;
  if (session.split || session.phase !== "fly") return;
  if (session._wantJoin) {
    const forced = joinPadIndex(live, session.p1Pad);
    if (forced != null) {
      session.split = true;
      session.p2Pad = forced;
      session._wantJoin = false;
      if (!session.crafts.some((craft) => craft.seat === "p2")) {
        session.crafts.push(spawnHuman(session, "p2", 6));
      }
    }
  }
  const other = joinPadIndex(live, session.p1Pad);
  if (other == null) return;
  const read = readFlightPad(padByIndex(live, other), session._prev.join);
  session._prev.join = read;
  if (!read.startEdge) return;
  session.split = true;
  session.p2Pad = other;
  session.justJoined = true;
  if (!session.crafts.some((craft) => craft.seat === "p2")) {
    session.crafts.push(spawnHuman(session, "p2", 6));
  }
}

function spitMinion(session, boss) {
  if (session.minions >= 2) return;
  session.minions += 1;
  const spec = castAt(0);
  const minion = makeBandit(spec, session.minions, 1);
  minion.minion = true;
  minion.x = boss.x + session.minions * 2;
  minion.y = boss.y;
  minion.z = boss.z + 2;
  minion.maxBalloons = 1;
  minion.balloons = 1;
  session.crafts.push(minion);
}

export function stepToyFight(session, {dt, pads, now} = {}) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  session.now = Number.isFinite(now) ? now : session.now + step;
  session.justJoined = false;
  const live = listPads(pads);
  if (session.phase === "menu") return session;
  noteJoin(session, live);
  const p1 = readFlightPad(padByIndex(live, session.p1Pad ?? live[0]?.index), session._prev.p1);
  const p2 = session.split
    ? readFlightPad(padByIndex(live, session.p2Pad), session._prev.p2)
    : readFlightPad(null, session._prev.p2);
  session._prev.p1 = p1;
  session._prev.p2 = p2;
  if (session.phase === "pause") {
    if ((p1.startEdge || p2.startEdge) && !session.justJoined) session.phase = "fly";
    return session;
  }
  if (session.phase === "result") return session;
  if ((p1.startEdge || (p2.startEdge && !session.justJoined))) {
    session.phase = "pause";
    return session;
  }
  if (session.quietUntil == null) session.quietUntil = session.now + 0.3;
  const armed = session.now >= session.quietUntil;
  if (!armed) {
    session._prev.p1 = {...p1, dartDown: false, balloonDown: false};
    session._prev.p2 = {...p2, dartDown: false, balloonDown: false};
  }
  if (step === 0) return session;
  const goods = session.crafts.filter((craft) => craft.team === "good" && craft.downFor <= 0);
  for (const craft of session.crafts) {
    if (craft.downFor > 0) {
      stepDowned(craft, step);
      craft.downFor -= step;
      if (craft.downFor <= 0) popBack(craft);
      continue;
    }
    let cmd;
    if (craft.seat === "p1") cmd = commandFromPad(p1);
    else if (craft.seat === "p2") cmd = session.split ? commandFromPad(p2) : {pitch: 0, roll: 0, rudder: 0, throttleRate: 0};
    else cmd = aiCommand(craft, goods, step);
    if (craft.kindId === "toy-chest-boss" && craft.ai?.spit) {
      craft.ai.spit = false;
      spitMinion(session, craft);
    }
    stepCraft(craft, cmd, step);
    if (!armed) continue;
    if (cmd?.dartEdge) launch(session, craft, "dart");
    if (cmd?.balloonEdge) launch(session, craft, "balloon");
  }
  stepShots(session, step);
  stepContacts(session);
  checkEnd(session);
  if (session.callout && session.now > session.callout.until) session.callout = null;
  return session;
}
