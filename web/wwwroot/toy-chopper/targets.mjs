// Toy targets: spawning, behaviour ticks, hit rules (counters), and the
// friendly green-army-men squad with the toy-ambulance cycle. Pure logic.
// Cast looks/behaviours/counters come from the Toy pass; this module gives
// them positions and hit points, it does not redefine them.

import {TOY_REJOIN_S, badGuyForId, friendlySplatFrame} from "../render/toy/toy_pass.js";

let seq = 0;
export function resetToyIds() { seq = 0; }
const nid = (type) => `${type}-${(seq += 1)}`;

// How many accepted hits pop each type, and which weapon its counter wants.
// weapon: "any" | "dart" | "balloon". bonus: a dart/balloon outside the
// preferred weapon still lands but counts one; the preferred counter pops
// faster. Everything pops, splats or tumbles; nothing explodes or dies.
export const TOY_RULES = Object.freeze({
  "warmup-balloon":    {hp: 1, weapon: "any",     air: true,  points: 1},
  "balloon-tower":     {hp: 1, weapon: "any",     air: false, points: 1},
  "cardboard-fort":    {hp: 3, weapon: "balloon", air: false, points: 3, balloonHits: 1},
  "wind-up-tank":      {hp: 2, weapon: "dart",    air: false, points: 2},
  "toy-plane":         {hp: 1, weapon: "dart",    air: true,  points: 2},
  "jack-in-the-box":   {hp: 2, weapon: "any",     air: false, points: 2},
  "rubber-band-sniper":{hp: 1, weapon: "any",     air: false, points: 2},
  "blimp-segment":     {hp: 2, weapon: "any",     air: true,  points: 3},
  "toy-train":         {hp: Infinity, weapon: "none", air: false, points: 0, friendly: true},
  "army-man":          {hp: 1, weapon: "none", air: false, points: 0, friendly: true},
});

export function makeToy(type, at = {}, extra = {}) {
  const rules = TOY_RULES[type] ?? {hp: 1, weapon: "any", air: false, points: 1};
  return {
    id: nid(type),
    type,
    team: rules.friendly ? "good" : "bad",
    x: at.x ?? 0,
    y: at.y ?? (rules.air ? 8 : 0.6),
    z: at.z ?? 0,
    heading: at.heading ?? 0,
    hp: rules.hp,
    maxHp: rules.hp,
    points: rules.points,
    state: "alive",      // alive | popped | splatted (friendlies)
    poppedAt: null,
    spawnedAt: at.now ?? 0,
    phase: 0,
    path: extra.path ?? null,
    pathT: 0,
    speed: extra.speed ?? 0,
    bob: Math.random() * Math.PI * 2,
    dress: rules.friendly ? null : badGuyForId(nid(type)),
    wobble: 0,
  };
}

function alongPath(toy, dt) {
  const path = toy.path;
  if (!path || path.length < 2) return;
  toy.pathT = Math.min(path.length - 1, toy.pathT + toy.speed * dt);
  const i = Math.min(path.length - 2, Math.floor(toy.pathT));
  const f = toy.pathT - i;
  const a = path[i], b = path[i + 1];
  const nx = a.x + (b.x - a.x) * f;
  const nz = a.z + (b.z - a.z) * f;
  toy.heading = Math.atan2(nx - toy.x, nz - toy.z) || toy.heading;
  toy.x = nx;
  toy.z = nz;
}

export function pathDone(toy) {
  return !!toy.path && toy.pathT >= toy.path.length - 1;
}

/** One behaviour tick. now is mission time in seconds. */
export function stepToy(toy, dt, now = 0) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  if (step === 0 || toy.state === "popped") return toy;
  toy.wobble = Math.max(0, toy.wobble - step);
  if (toy.state === "splatted") {
    // Friendly down: the ambulance timeline runs off elapsed time.
    if (now - toy.poppedAt >= TOY_REJOIN_S) {
      toy.state = "alive";
      toy.poppedAt = null;
    }
    return toy;
  }
  switch (toy.type) {
    case "warmup-balloon":
    case "balloon-tower":
      toy.y += Math.sin(now * 1.4 + toy.bob) * 0.25 * step; // gentle bob
      break;
    case "wind-up-tank": // waddles: surge-pause-surge
      toy.phase = (toy.phase + step) % 1.6;
      if (toy.phase < 1.0) alongPath(toy, step);
      break;
    case "toy-plane": // strafes in a straight line, loops its run
      alongPath(toy, step);
      if (pathDone(toy)) toy.pathT = 0;
      break;
    case "jack-in-the-box": // crank... POP up (vulnerable head), sink back
      toy.phase = (toy.phase + step) % 3;
      break;
    case "rubber-band-sniper": // stretch... flick... rewind
      toy.phase = (toy.phase + step) % 2.4;
      break;
    case "blimp-segment":
      toy.y += Math.sin(now * 0.8 + toy.bob) * 0.4 * step;
      alongPath(toy, step);
      if (toy.path && pathDone(toy)) toy.pathT = 0;
      break;
    case "toy-train":
    case "army-man":
      alongPath(toy, step);
      break;
    default:
      break;
  }
  return toy;
}

/**
 * A shot meets a toy. Friendlies splat (ambulance, no penalty); bad toys lose
 * hp per their counter. Returns a result the session scores and captions.
 */
export function hitToy(toy, weapon, now = 0) {
  if (toy.state !== "alive") return {accepted: false};
  const rules = TOY_RULES[toy.type] ?? {};
  if (rules.friendly) {
    if (toy.type === "toy-train") {
      toy.wobble = 1.2; // the train never minds for long
      return {accepted: true, friendly: true, train: true, popped: false};
    }
    toy.state = "splatted";
    toy.poppedAt = now;
    return {accepted: true, friendly: true, popped: false};
  }
  // The authored counter weapon finishes it; anything else chips one.
  const cost = weapon === "balloon" && rules.balloonHits != null ? toy.hp : 1;
  toy.hp -= cost;
  toy.wobble = 0.5;
  if (toy.hp <= 0) {
    toy.state = "popped";
    toy.poppedAt = now;
    return {accepted: true, friendly: false, popped: true, points: toy.points, big: toy.maxHp >= 2};
  }
  return {accepted: true, friendly: false, popped: false, points: 0};
}

/** View model for a downed friendly: drives the ambulance/stretcher drawing. */
export function friendlyDownFrame(toy, now = 0) {
  if (toy.state !== "splatted" || toy.poppedAt == null) return null;
  return friendlySplatFrame(now - toy.poppedAt);
}

/**
 * The squad keeps itself topped up: fresh army men march from the spawn when
 * fewer than `size` are alive or healing. Returns new toys to add.
 */
export function reinforceSquad(toys, {size = 4, spawn = {x: 0, z: 0}, path = null, now = 0} = {}) {
  const squad = toys.filter((t) => t.type === "army-man" && t.state !== "popped");
  const out = [];
  for (let i = squad.length; i < size; i += 1) {
    out.push(makeToy("army-man", {x: spawn.x, z: spawn.z, now}, {path, speed: 1.1}));
  }
  return out;
}
