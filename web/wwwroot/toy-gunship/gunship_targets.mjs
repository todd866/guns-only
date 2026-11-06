// Toy Gunship cast: the rogues' gallery of bad-guy toys seen from above, the
// green-army-men squad, and the toy-ambulance friendly-splat cycle. Looks and
// one-line counters come from the Toy pass (BAD_GUYS); this module gives each
// type a distinct TOP-DOWN behaviour and hit rule. Pure logic.
//
// Every type reads at a glance and has a how-to-beat-it:
//   balloon-tower      static; anything pops it
//   sandcastle         static prop; a water balloon flattens it beautifully
//   wind-up-tank       surge-pause waddle at the squad; darts splat the key (2)
//   wind-up-robot      ticks forward, leans, lunges; darts on the key (2)
//   jack-in-the-box    cranks, then POPS UP — any hit while up finishes it
//   rubber-band-sniper on the fence, flicks bands at the squad; one dart
//   evil-teddy         waddles in for a hug; a water balloon soaks it instantly
//   plastic-dinosaur   charge... pause with mouth open — hits count double then
//   rc-car             circles the squad fast; a balloon paints the wheels
//   tin-soldier        marches in step; one bonk on the tall hat
//   spinning-top       invulnerable while spinning; dart the WOBBLE window
//   pool-dinosaur      boss: giant inflatable, three deflating phases

import {BAD_GUYS, TOY_REJOIN_S, friendlySplatFrame} from "../render/toy/toy_pass.js";

let seq = 0;
export function resetGunshipIds() { seq = 0; }
const nid = (type) => `${type}-${(seq += 1)}`;

export const GUNSHIP_RULES = Object.freeze({
  "balloon-tower":      {hp: 1, points: 1, dress: "balloon-animal-blimp"},
  "sandcastle":         {hp: 1, points: 1, prop: true, balloonOnly: true},
  "wind-up-tank":       {hp: 2, points: 2, biter: true},
  "wind-up-robot":      {hp: 2, points: 2, biter: true, dress: "wind-up-robot"},
  "jack-in-the-box":    {hp: 2, points: 2, dress: "jack-in-the-box"},
  "rubber-band-sniper": {hp: 1, points: 2, sniper: true, dress: "rubber-band-sniper"},
  "evil-teddy":         {hp: 3, points: 3, biter: true, soak: true, dress: "evil-teddy"},
  "plastic-dinosaur":   {hp: 3, points: 3, biter: true, dress: "plastic-dinosaur"},
  "rc-car":             {hp: 1, points: 2, biter: true, parks: true, dress: "rc-car-gang"},
  "tin-soldier":        {hp: 1, points: 1, biter: true, dress: "tin-soldier-wrong-colour"},
  "spinning-top":       {hp: 1, points: 2, spins: true, dress: "spinning-top-swarm"},
  "pool-dinosaur":      {hp: 9, points: 10, boss: true},
  "army-man":           {hp: 1, points: 0, friendly: true},
});

// Phase windows (seconds into each type's cycle).
export const CYCLES = Object.freeze({
  jack:   {total: 3.4, upFrom: 2.4},    // up = vulnerable, pops in one
  dino:   {total: 2.4, pauseFrom: 1.4}, // mouth-open pause = double damage
  top:    {total: 4.2, wobbleFrom: 3.2},// only the wobble accepts hits
  sniper: {total: 3.0, flickAt: 2.6},   // flicks a band at the squad
  tank:   {total: 1.6, moveUntil: 1.0}, // surge-pause waddle
  robot:  {total: 2.2, moveUntil: 1.2, lungeFrom: 1.9},
});

export const BOSS = Object.freeze({
  phaseHp: 3, phases: 3, invulnS: 1.5, riseS: 3,
});

export function dressFor(type) {
  const id = GUNSHIP_RULES[type]?.dress;
  return id ? BAD_GUYS.find((g) => g.id === id) ?? null : null;
}

export function makeGunshipToy(type, at = {}, extra = {}) {
  const rules = GUNSHIP_RULES[type] ?? {hp: 1, points: 1};
  return {
    id: nid(type),
    type,
    team: rules.friendly ? "good" : "bad",
    x: at.x ?? 0,
    z: at.z ?? 0,
    y: at.y ?? 0,
    heading: at.heading ?? 0,
    hp: rules.hp,
    maxHp: rules.hp,
    points: rules.points,
    state: "alive",          // alive | popped | splatted (friendlies)
    poppedAt: null,
    spawnedAt: at.now ?? 0,
    phase: extra.phase ?? 0,
    path: extra.path ?? null,
    pathT: 0,
    speed: extra.speed ?? 0,
    center: extra.center ?? null,  // rc-car / spinning-top motion anchor
    circleR: extra.circleR ?? 0,
    bumpCool: 0,
    invulnS: rules.boss ? BOSS.riseS : 0, // the boss is still rising
    wobble: 0,
    prop: rules.prop === true,
    dress: dressFor(type),
  };
}

export function pathLength(path) {
  let total = 0;
  for (let i = 0; i < (path?.length ?? 0) - 1; i += 1) {
    total += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
  }
  return total;
}

/** Distance-based walk: pathT is lawn units travelled, speed is units/s. */
function alongPath(toy, dt) {
  const path = toy.path;
  if (!path || path.length < 2) return;
  toy.pathT = Math.min(pathLength(path), toy.pathT + toy.speed * dt);
  let d = toy.pathT;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i], b = path[i + 1];
    const seg = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6;
    if (d <= seg) {
      const f = d / seg;
      const nx = a.x + (b.x - a.x) * f;
      const nz = a.z + (b.z - a.z) * f;
      toy.heading = Math.atan2(nx - toy.x, nz - toy.z) || toy.heading;
      toy.x = nx;
      toy.z = nz;
      return;
    }
    d -= seg;
  }
  toy.x = path[path.length - 1].x;
  toy.z = path[path.length - 1].z;
}

export function pathDone(toy) {
  return !!toy.path && toy.pathT >= pathLength(toy.path) - 1e-6;
}

/** Is this toy in its vulnerable/special window right now? */
export function toyWindow(toy) {
  switch (toy.type) {
    case "jack-in-the-box": return toy.phase >= CYCLES.jack.upFrom ? "up" : "shut";
    case "plastic-dinosaur": return toy.phase >= CYCLES.dino.pauseFrom ? "mouth-open" : "charging";
    case "spinning-top": return toy.phase >= CYCLES.top.wobbleFrom ? "wobble" : "spinning";
    case "rubber-band-sniper": return toy.phase >= CYCLES.sniper.flickAt ? "flick" : "stretching";
    default: return null;
  }
}

/** One behaviour tick. Returns a "flick" event for snipers, else null. */
export function stepGunshipToy(toy, dt, now = 0) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  if (step === 0 || toy.state === "popped") return null;
  toy.wobble = Math.max(0, toy.wobble - step);
  toy.bumpCool = Math.max(0, toy.bumpCool - step);
  toy.invulnS = Math.max(0, toy.invulnS - step);
  if (toy.state === "splatted") {
    if (now - toy.poppedAt >= TOY_REJOIN_S) {
      toy.state = "alive";
      toy.poppedAt = null;
    }
    return null;
  }
  switch (toy.type) {
    case "wind-up-tank":
      toy.phase = (toy.phase + step) % CYCLES.tank.total;
      if (toy.phase < CYCLES.tank.moveUntil) alongPath(toy, step);
      break;
    case "wind-up-robot":
      toy.phase = (toy.phase + step) % CYCLES.robot.total;
      if (toy.phase < CYCLES.robot.moveUntil) alongPath(toy, step);
      else if (toy.phase >= CYCLES.robot.lungeFrom) alongPath(toy, step * 3); // the lunge
      break;
    case "jack-in-the-box":
      toy.phase = (toy.phase + step) % CYCLES.jack.total;
      break;
    case "plastic-dinosaur":
      toy.phase = (toy.phase + step) % CYCLES.dino.total;
      if (toy.phase < CYCLES.dino.pauseFrom) alongPath(toy, step * 1.6); // the stomp charge
      break;
    case "spinning-top": {
      toy.phase = (toy.phase + step) % CYCLES.top.total;
      const whirl = toy.phase < CYCLES.top.wobbleFrom ? 2.2 : 0.4; // the wobble slows it
      toy.heading += whirl * step;
      if (toy.center) {
        toy.x = toy.center.x + Math.sin(toy.heading) * toy.circleR;
        toy.z = toy.center.z + Math.cos(toy.heading) * toy.circleR;
      }
      break;
    }
    case "rc-car": {
      if (toy.center) {
        // Fast for a toy car, slow enough that a dart's flight time still lands.
        const a = toy.phase * 2 + now * 0.6;
        toy.x = toy.center.x + Math.sin(a) * toy.circleR;
        toy.z = toy.center.z + Math.cos(a) * toy.circleR;
        toy.heading = a + Math.PI / 2;
      }
      break;
    }
    case "rubber-band-sniper": {
      const before = toy.phase;
      toy.phase = (toy.phase + step) % CYCLES.sniper.total;
      if (before < CYCLES.sniper.flickAt && toy.phase >= CYCLES.sniper.flickAt) {
        return {flick: true, from: toy};
      }
      break;
    }
    case "evil-teddy":
    case "tin-soldier":
    case "army-man":
      alongPath(toy, step);
      break;
    default:
      break;
  }
  return null;
}

/**
 * A round lands on a toy. Friendlies splat (ambulance, never a penalty); each
 * bad type applies its counter. gun is "dart" | "balloon" | "confetti".
 * damage comes from the gun spec (confetti hits for 3).
 */
export function hitGunshipToy(toy, gun, damage, now = 0) {
  if (toy.state !== "alive") return {accepted: false};
  const rules = GUNSHIP_RULES[toy.type] ?? {};
  if (rules.friendly) {
    toy.state = "splatted";
    toy.poppedAt = now;
    return {accepted: true, friendly: true, popped: false};
  }
  if (toy.invulnS > 0) {
    toy.wobble = 0.4;
    return {accepted: false, deflected: true}; // boss between phases / still rising
  }
  const windowNow = toyWindow(toy);
  if (rules.spins && windowNow !== "wobble" && gun !== "confetti") {
    toy.wobble = 0.4;
    return {accepted: false, deflected: true}; // tops shrug darts off mid-spin
  }
  let dealt = damage;
  if (rules.soak && gun === "balloon") dealt = toy.hp;          // teddy: soaked through
  if (rules.parks && gun === "balloon") dealt = toy.hp;         // rc-car: wheels painted
  if (toy.type === "jack-in-the-box" && windowNow === "up") dealt = toy.hp;
  if (toy.type === "plastic-dinosaur" && windowNow === "mouth-open") dealt = damage * 2;
  if (rules.balloonOnly && gun === "dart") dealt = 0;           // sandcastle shrugs darts
  if (dealt <= 0) {
    toy.wobble = 0.4;
    return {accepted: false, deflected: true};
  }
  toy.hp -= dealt;
  toy.wobble = 0.5;
  if (rules.boss && toy.hp > 0) {
    const phaseEdge = toy.hp % BOSS.phaseHp === 0;
    if (phaseEdge) toy.invulnS = BOSS.invulnS;
    return {accepted: true, friendly: false, popped: false, points: 0, bossPhase: phaseEdge};
  }
  if (toy.hp <= 0) {
    toy.state = "popped";
    toy.poppedAt = now;
    return {accepted: true, friendly: false, popped: true, points: toy.points, big: toy.maxHp >= 2, boss: rules.boss === true};
  }
  return {accepted: true, friendly: false, popped: false, points: 0};
}

/** View model for a downed army man: drives the ambulance/stretcher drawing. */
export function friendlyDownFrame(toy, now = 0) {
  if (toy.state !== "splatted" || toy.poppedAt == null) return null;
  return friendlySplatFrame(now - toy.poppedAt);
}

/** Fresh green army men march from the spawn to keep the squad topped up. */
export function reinforceSquad(toys, {size = 5, spawn = {x: 0, z: 0}, path = null, now = 0} = {}) {
  const squad = toys.filter((t) => t.type === "army-man" && t.state !== "popped");
  const out = [];
  for (let i = squad.length; i < size; i += 1) {
    out.push(makeGunshipToy("army-man", {x: spawn.x, z: spawn.z, now}, {path, speed: 0.3}));
  }
  return out;
}

/** The furthest-along living army man: crates aim for him, snipers flick at him. */
export function squadLead(toys) {
  let lead = null;
  for (const toy of toys) {
    if (toy.type !== "army-man" || toy.state !== "alive") continue;
    if (!lead || toy.pathT > lead.pathT) lead = toy;
  }
  return lead;
}
