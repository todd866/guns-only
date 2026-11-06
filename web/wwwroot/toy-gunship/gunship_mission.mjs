// TOY GUNSHIP mission: protect the green-army-men squad marching sandpit →
// under the trampoline → past the dog kennel → to the treehouse, against
// escalating waves of bad-guy toys and one giant inflatable pool dinosaur.
// Deadpan gunship radio throughout; the gunner cannot lose. Pure logic.

import {FRIENDLY_SPLAT_CAPTION} from "../render/toy/toy_pass.js";
import {
  makeGunshipToy, pathDone, reinforceSquad, squadLead, stepGunshipToy,
} from "./gunship_targets.mjs";

// The backyard, top-down (x east, z north). Landmarks the view draws too.
export const YARD = Object.freeze({
  sandpit: Object.freeze({x: -30, z: -24}),
  trampoline: Object.freeze({x: -10, z: -4}),
  kennel: Object.freeze({x: 8, z: 10}),
  treehouse: Object.freeze({x: 30, z: 28}),
  pool: Object.freeze({x: 14, z: -14}),
  fenceX: 38,
});

export const SQUAD_PATH = Object.freeze([
  YARD.sandpit, Object.freeze({x: -20, z: -14}), YARD.trampoline,
  Object.freeze({x: -2, z: 4}), YARD.kennel, Object.freeze({x: 20, z: 20}), YARD.treehouse,
]);

export const SQUAD = Object.freeze({size: 5, spawn: YARD.sandpit, path: SQUAD_PATH});

// The joke played straight: flat gunship-crew radio over a backyard of toys.
export const RADIO = Object.freeze({
  brief: "Gunship on station. Friendly squad moving sandpit to treehouse. Keep them covered.",
  splash: Object.freeze({
    "balloon-tower": "Balloon tower down.",
    "sandcastle": "Good effect on the sandcastle.",
    "wind-up-tank": "Splash one wind-up tank.",
    "wind-up-robot": "Robot's wound down. Good key hit.",
    "jack-in-the-box": "Box is shut. Staying shut.",
    "rubber-band-sniper": "Sniper off the fence.",
    "evil-teddy": "Teddy is soaked. Threat hugged out.",
    "plastic-dinosaur": "Dinosaur's down. The small one.",
    "rc-car": "Convoy vehicle parked. Permanently.",
    "tin-soldier": "Tin soldier toppled. Hat first.",
    "spinning-top": "Top's down. Caught the wobble.",
    "pool-dinosaur": "Big dinosaur is fully deflated. Yard secure.",
  }),
  friendly: Object.freeze(["Hey!", FRIENDLY_SPLAT_CAPTION, "Check your targets. ...He's fine."]),
  deflect: Object.freeze(["No effect. Try the water balloon.", "That one's shrugging it off. Wait for the wobble."]),
  spotted: "Searchlight from the bedroom window. Break orbit.",
  crateOnTarget: "Supplies on the money. Squad's happy.",
  crateOff: "Crate's in the hedge. We'll get the next one.",
  squadBump: "Man down on the path. ...He's fine.",
  bossRise: "Large inflatable contact rising from the paddling pool. Weapons free.",
  bossPhase: Object.freeze(["It's deflating. Partially.", "More deflated. Keep at it."]),
  clear: "Squad's at the treehouse. Good effect on everything. RTB for juice boxes.",
});

export function splashLine(type) {
  return RADIO.splash[type] ?? "Target down.";
}

// Waves: calm → build → climax (boss) → reward. Par 4–6 minutes.
function gunshipWaves() {
  const mid = SQUAD_PATH[3];
  return [
    {atS: 0, label: "Warm up: balloon towers by the sandpit.", toys: [
      ["balloon-tower", {x: -24, z: -30}], ["balloon-tower", {x: -34, z: -16}],
      ["balloon-tower", {x: -18, z: -22}], ["sandcastle", {x: -28, z: -31}],
    ]},
    {atS: 25, label: "Wind-up armor inbound from the flowerbed.", toys: [
      ["wind-up-tank", {x: -36, z: 10}, {path: [{x: -36, z: 10}, {x: -16, z: -6}, {x: -4, z: 2}], speed: 1.2}],
      ["wind-up-tank", {x: 0, z: -34}, {path: [{x: 0, z: -34}, {x: -12, z: -12}], speed: 1.1}],
      ["wind-up-robot", {x: 24, z: -28}, {path: [{x: 24, z: -28}, {x: 2, z: -2}, {x: -8, z: -4}], speed: 1.0}],
    ]},
    {atS: 60, label: "Snipers on the fence. Boxes on the path.", toys: [
      ["rubber-band-sniper", {x: YARD.fenceX, z: 2}],
      ["rubber-band-sniper", {x: -YARD.fenceX, z: 14}],
      ["jack-in-the-box", {x: 0, z: 8}], ["jack-in-the-box", {x: 12, z: 14}],
    ]},
    {atS: 100, label: "RC convoy circling. And that teddy looks wrong.", toys: [
      ["rc-car", {}, {center: mid, circleR: 12}],
      ["rc-car", {}, {center: mid, circleR: 15, phase: 2}],
      ["rc-car", {}, {center: mid, circleR: 18, phase: 4}],
      ["evil-teddy", {x: 34, z: -10}, {path: [{x: 34, z: -10}, {x: 16, z: 6}, {x: 10, z: 12}], speed: 0.7}],
    ]},
    {atS: 145, label: "Tin soldiers in step. Tops spinning up. Dinosaur. Small one.", toys: [
      ["tin-soldier", {x: 36, z: 34}, {path: [{x: 36, z: 34}, {x: 26, z: 24}, {x: 18, z: 18}], speed: 0.9}],
      ["tin-soldier", {x: 38, z: 30}, {path: [{x: 38, z: 30}, {x: 28, z: 20}, {x: 20, z: 14}], speed: 0.9}],
      ["tin-soldier", {x: 40, z: 26}, {path: [{x: 40, z: 26}, {x: 30, z: 16}, {x: 22, z: 10}], speed: 0.9}],
      ["spinning-top", {}, {center: {x: 14, z: 18}, circleR: 5}],
      ["spinning-top", {}, {center: {x: 18, z: 22}, circleR: 4, phase: 1.3}],
      ["plastic-dinosaur", {x: -30, z: 30}, {path: [{x: -30, z: 30}, {x: -8, z: 16}, {x: 4, z: 10}], speed: 1.0}],
    ]},
    {atS: 190, whenClear: true, boss: true, label: RADIO.bossRise, toys: [
      ["pool-dinosaur", {x: YARD.pool.x, z: YARD.pool.z}],
      ["balloon-tower", {x: 26, z: -8}], ["balloon-tower", {x: 4, z: -20}],
    ]},
  ];
}

export const GUNSHIP_MISSION = Object.freeze({
  id: "toy-gunship",
  name: "Toy Gunship: Backyard Watch",
  brief: RADIO.brief,
  parS: 330, // 5.5 min par; 4–6 minute envelope
});

export function createGunshipMission(now = 0) {
  return {
    id: GUNSHIP_MISSION.id,
    def: GUNSHIP_MISSION,
    phase: "brief",          // brief | play | clear
    startedAt: now,
    playStartedAt: null,
    clearedAt: null,
    toys: [],
    waves: gunshipWaves(),
    waveIndex: 0,
    caption: null,           // {line, until}
    captionSeq: 0,
    stats: {
      shots: 0, hits: 0, pops: 0, bigPops: 0, points: 0,
      friendlySplats: 0, squadBumps: 0, deflects: 0,
      crates: 0, cratesOnTarget: 0, spottedS: 0,
      popsByType: {}, typeFirstSeen: {}, typeLastPop: {},
      bossClearS: null,
    },
  };
}

export function beginPlay(mission, now = 0) {
  if (mission.phase !== "brief") return mission;
  mission.phase = "play";
  mission.playStartedAt = now;
  return mission;
}

function say(mission, line, now, holdS = 3) {
  mission.caption = {line, until: now + holdS};
  mission.captionSeq += 1;
}

export function missionCaption(mission, now) {
  if (!mission.caption || now > mission.caption.until) return null;
  return mission.caption.line;
}

/** Props (the sandcastle) are poppable for laughs but never block the clear. */
function badAliveCount(mission) {
  return mission.toys.filter((t) => t.team === "bad" && !t.prop && t.state === "alive").length;
}

function spawnWave(mission, now) {
  const wave = mission.waves[mission.waveIndex];
  mission.waveIndex += 1;
  for (const [type, at, extra] of wave.toys) {
    mission.toys.push(makeGunshipToy(type, {...at, now}, extra ?? {}));
    if (mission.stats.typeFirstSeen[type] == null) mission.stats.typeFirstSeen[type] = now;
  }
  if (wave.label) say(mission, wave.label, now, 3.6);
  return wave;
}

/** A sniper flick or a biter reaching the squad: one army man down (ambulance). */
function bumpSquad(mission, now) {
  const lead = squadLead(mission.toys);
  if (!lead) return;
  lead.state = "splatted";
  lead.poppedAt = now;
  mission.stats.squadBumps += 1;
  say(mission, RADIO.squadBump, now, 2.6);
}

function stepThreats(mission, flicks, now) {
  for (let i = 0; i < flicks.length; i += 1) bumpSquad(mission, now);
  for (const toy of mission.toys) {
    if (toy.team !== "bad" || toy.state !== "alive" || toy.bumpCool > 0) continue;
    if (!["wind-up-tank", "wind-up-robot", "evil-teddy", "plastic-dinosaur", "rc-car", "tin-soldier"].includes(toy.type)) continue;
    for (const man of mission.toys) {
      if (man.type !== "army-man" || man.state !== "alive") continue;
      if (Math.hypot(man.x - toy.x, man.z - toy.z) > 1.8) continue;
      man.state = "splatted";
      man.poppedAt = now;
      toy.bumpCool = 4;
      mission.stats.squadBumps += 1;
      say(mission, RADIO.squadBump, now, 2.6);
      break;
    }
  }
}

/** Clear: all waves out, every bad toy popped, squad lead home at the treehouse. */
function checkClear(mission, now) {
  if (mission.waveIndex < mission.waves.length) return false;
  if (badAliveCount(mission) > 0) return false;
  const lead = squadLead(mission.toys);
  if (!lead || !pathDone(lead)) return false;
  mission.phase = "clear";
  mission.clearedAt = now;
  say(mission, RADIO.clear, now, 5);
  return true;
}

export function stepGunshipMission(mission, dt, now) {
  if (mission.phase !== "play") return null;
  const t = now - mission.playStartedAt;
  let bossWave = null;
  const wave = mission.waves[mission.waveIndex];
  if (wave && t >= wave.atS && (!wave.whenClear || badAliveCount(mission) === 0)) {
    const spawned = spawnWave(mission, now);
    if (spawned.boss) bossWave = spawned;
  }
  const flicks = [];
  for (const toy of mission.toys) {
    const event = stepGunshipToy(toy, dt, now);
    if (event?.flick) flicks.push(event);
  }
  for (const fresh of reinforceSquad(mission.toys, {...SQUAD, now})) {
    mission.toys.push(fresh);
  }
  stepThreats(mission, flicks, now);
  checkClear(mission, now);
  return bossWave;
}

/** Score a hit result (from hitGunshipToy); returns caption/juice hints. */
export function scoreHit(mission, toy, result, now) {
  if (result?.deflected) {
    mission.stats.deflects += 1;
    say(mission, RADIO.deflect[mission.captionSeq % RADIO.deflect.length], now, 2);
    return {deflected: true};
  }
  if (!result?.accepted) return null;
  mission.stats.hits += 1;
  if (result.friendly) {
    mission.stats.friendlySplats += 1;
    say(mission, RADIO.friendly[mission.stats.friendlySplats % RADIO.friendly.length], now, 2.8);
    return {friendly: true, big: false};
  }
  if (result.bossPhase) {
    const n = Math.max(0, 2 - Math.ceil(toy.hp / 3));
    say(mission, RADIO.bossPhase[Math.min(n, RADIO.bossPhase.length - 1)], now, 2.8);
    return {bossPhase: true, big: true};
  }
  if (result.popped) {
    mission.stats.pops += 1;
    mission.stats.points += result.points ?? 1;
    if (result.big) mission.stats.bigPops += 1;
    mission.stats.popsByType[toy.type] = (mission.stats.popsByType[toy.type] ?? 0) + 1;
    mission.stats.typeLastPop[toy.type] = now;
    if (result.boss) mission.stats.bossClearS = Math.round((now - mission.playStartedAt) * 10) / 10;
    say(mission, splashLine(toy.type), now, 2.8);
    return {popped: true, big: result.big === true, boss: result.boss === true};
  }
  return {chip: true, big: false};
}

export function noteShot(mission) {
  mission.stats.shots += 1;
}

export function noteCrate(mission, crate, now) {
  mission.stats.crates += 1;
  if (crate.onTarget) {
    mission.stats.cratesOnTarget += 1;
    say(mission, RADIO.crateOnTarget, now, 2.6);
  } else {
    say(mission, RADIO.crateOff, now, 2.6);
  }
}

export function noteSpotted(mission, now) {
  say(mission, RADIO.spotted, now, 2.6);
}

export function gunnerAccuracy(stats) {
  if (!stats.shots) return 0;
  return Math.min(1, stats.hits / stats.shots);
}

/** Stars 1..3 each. The gunner (a 6-year-old) never scores below 1. */
export function missionStars(mission) {
  const stats = mission.stats;
  const acc = gunnerAccuracy(stats);
  const gunner = 1 + (acc >= 0.25 || stats.pops >= 8 ? 1 : 0) + (acc >= 0.5 ? 1 : 0);
  const timeS = (mission.clearedAt ?? 0) - (mission.playStartedAt ?? 0);
  const pilot = 1 + (stats.cratesOnTarget >= 2 ? 1 : 0)
    + (stats.spottedS <= 8 && timeS <= mission.def.parS ? 1 : 0);
  return {gunner: Math.min(3, gunner), pilot: Math.min(3, pilot), timeS};
}

export function missionTelemetry(mission) {
  const stats = mission.stats;
  const perType = {};
  for (const [type, seen] of Object.entries(stats.typeFirstSeen)) {
    const last = stats.typeLastPop[type];
    perType[type] = last == null ? null : Math.round((last - seen) * 10) / 10;
  }
  return {
    missionId: mission.id,
    durationS: mission.clearedAt != null && mission.playStartedAt != null
      ? Math.round(mission.clearedAt - mission.playStartedAt) : null,
    shots: stats.shots,
    hits: stats.hits,
    accuracy: Math.round(gunnerAccuracy(stats) * 100) / 100,
    pops: stats.pops,
    points: stats.points,
    popsByType: {...stats.popsByType},
    friendlySplats: stats.friendlySplats, // the laughs ledger: never a penalty
    squadBumps: stats.squadBumps,
    deflects: stats.deflects,
    crates: stats.crates,
    cratesOnTarget: stats.cratesOnTarget,
    spottedS: Math.round(stats.spottedS * 10) / 10,
    bossClearS: stats.bossClearS,
    typeClearS: perType,
  };
}
