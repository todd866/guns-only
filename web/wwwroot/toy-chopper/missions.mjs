// Missions: definitions, the per-mission state machine, pacing waves,
// announcer captions, kid fairness and star scoring. Pure logic.

import {FRIENDLY_SPLAT_CAPTION} from "../render/toy/toy_pass.js";
import {makeToy, reinforceSquad, pathDone, stepToy} from "./targets.mjs";

export const ANNOUNCER = Object.freeze({
  goodSplat: ["Good splat!", "Nice pop!", "Got one!", "Splat-tastic!"],
  more: ["More on the left!", "More on the right!", "Keep popping!"],
  bigPop: ["HUGE pop!", "What a splat!"],
  wobble: ["Whoa, bumpy!", "Hold on tight!"],
  friendly: [FRIENDLY_SPLAT_CAPTION],
});

export function announcerLine(kind, n = 0) {
  const lines = ANNOUNCER[kind] ?? ANNOUNCER.goodSplat;
  return lines[Math.abs(Math.trunc(n)) % lines.length];
}

// Waves are authored pacing: at `atS` seconds (or when the field is clear),
// spawn these toys. calm -> build -> climax -> reward.
function fortWaves() {
  return [
    {atS: 0, label: "Warm up! Pop the balloons!", toys: [
      // Right outside the open door at the pad: the first pop is seconds away.
      ["warmup-balloon", {x: 2, y: 3.5, z: 6}], ["warmup-balloon", {x: -3, y: 4, z: 8}],
      ["warmup-balloon", {x: 5, y: 3, z: 10}],
    ]},
    {atS: 25, label: "Balloon towers ahead!", toys: [
      ["balloon-tower", {x: -10, z: 42}], ["balloon-tower", {x: 0, z: 48}], ["balloon-tower", {x: 12, z: 44}],
    ]},
    {atS: 70, whenClear: true, label: "Wind-up tanks! Splat the keys!", toys: [
      ["wind-up-tank", {x: -24, z: 52}, {path: [{x: -24, z: 52}, {x: 0, z: 30}], speed: 1.6}],
      ["wind-up-tank", {x: 24, z: 56}, {path: [{x: 24, z: 56}, {x: 2, z: 32}], speed: 1.4}],
    ]},
    {atS: 130, whenClear: true, label: "The cardboard fort! Balloon time!", toys: [
      ["cardboard-fort", {x: 0, z: 62}],
      ["jack-in-the-box", {x: -8, z: 58}], ["jack-in-the-box", {x: 8, z: 58}],
    ]},
  ];
}

function trainWaves() {
  const rail = [{x: -40, z: 20}, {x: -10, z: 26}, {x: 14, z: 34}, {x: 40, z: 40}];
  return [
    {atS: 0, label: "Here comes the toy train — keep it rolling!", toys: [
      ["toy-train", {x: -40, z: 20}, {path: rail, speed: 0.45}],
      ["warmup-balloon", {x: -30, y: 7, z: 26}], ["warmup-balloon", {x: -22, y: 8, z: 30}],
    ]},
    {atS: 20, label: "Wind-up tanks after the train!", toys: [
      ["wind-up-tank", {x: -20, z: 48}, {path: [{x: -20, z: 48}, {x: -6, z: 28}], speed: 1.5}],
      ["wind-up-tank", {x: 0, z: 54}, {path: [{x: 0, z: 54}, {x: 8, z: 32}], speed: 1.5}],
    ]},
    {atS: 60, label: "Rubber-band snipers in the flowerbed!", toys: [
      ["rubber-band-sniper", {x: 20, z: 52}], ["rubber-band-sniper", {x: 30, z: 48}],
      ["wind-up-tank", {x: 10, z: 58}, {path: [{x: 10, z: 58}, {x: 20, z: 38}], speed: 1.7}],
    ]},
  ];
}

function blimpWaves() {
  const drift = [{x: -16, z: 46}, {x: 16, z: 50}, {x: -16, z: 46}];
  return [
    {atS: 0, label: "The balloon-animal blimp! Pop it bit by bit!", toys: [
      ["warmup-balloon", {x: 4, y: 8, z: 12}], ["warmup-balloon", {x: -6, y: 9, z: 16}],
      ["blimp-segment", {x: -12, y: 14, z: 46}, {path: drift, speed: 0.3}],
      ["blimp-segment", {x: -6, y: 15, z: 48}, {path: drift, speed: 0.3}],
      ["blimp-segment", {x: 0, y: 14, z: 50}, {path: drift, speed: 0.3}],
    ]},
    {atS: 60, whenClear: true, label: "Toy planes! And more blimp!", toys: [
      ["toy-plane", {x: -40, y: 10, z: 30}, {path: [{x: -40, z: 30}, {x: 40, z: 36}], speed: 6}],
      ["blimp-segment", {x: 6, y: 16, z: 48}, {path: drift, speed: 0.35}],
      ["blimp-segment", {x: 12, y: 14, z: 46}, {path: drift, speed: 0.35}],
    ]},
    {atS: 120, whenClear: true, label: "The blimp's nose! Last pop!", toys: [
      ["blimp-segment", {x: 0, y: 17, z: 44}, {path: drift, speed: 0.4}],
      ["toy-plane", {x: 40, y: 12, z: 26}, {path: [{x: 40, z: 26}, {x: -40, z: 34}], speed: 7}],
    ]},
  ];
}

export const MISSIONS = Object.freeze([
  Object.freeze({
    id: "balloon-fort", name: "Pop the balloon fort", kind: "assault", parS: 210,
    brief: "Towers, tanks, then the fort. Gunner, darts up!", waves: fortWaves,
    squad: {size: 4, spawn: {x: -6, z: 6}},
  }),
  Object.freeze({
    id: "toy-train", name: "Escort the toy train", kind: "escort", parS: 240,
    brief: "The train must get through. Splat anything that waddles at it!", waves: trainWaves,
    squad: {size: 3, spawn: {x: -36, z: 14}},
  }),
  Object.freeze({
    id: "blimp-boss", name: "Blimp boss", kind: "boss", parS: 270,
    brief: "A giant balloon-animal blimp. Pop every bit of it!", waves: blimpWaves,
    squad: {size: 3, spawn: {x: -4, z: 4}},
  }),
]);

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

export function createMission(id, now = 0) {
  const def = missionById(id);
  return {
    id: def.id,
    def,
    phase: "brief",            // brief | play | clear
    startedAt: now,
    playStartedAt: null,
    clearedAt: null,
    toys: [],
    waves: def.waves(),
    waveIndex: 0,
    caption: null,             // {line, until}
    captionSeq: 0,
    stats: {
      shots: 0, hits: 0, pops: 0, bigPops: 0, points: 0,
      friendlySplats: 0, wobbles: 0, balloonsDropped: 0, holdSteadyS: 0,
      typeFirstSeen: {}, typeLastPop: {},
    },
  };
}

export function beginPlay(mission, now = 0) {
  if (mission.phase !== "brief") return mission;
  mission.phase = "play";
  mission.playStartedAt = now;
  return mission;
}

function say(mission, line, now, holdS = 2.6) {
  mission.caption = {line, until: now + holdS};
  mission.captionSeq += 1;
}

export function missionCaption(mission, now) {
  if (!mission.caption || now > mission.caption.until) return null;
  return mission.caption.line;
}

function badAliveCount(mission) {
  return mission.toys.filter((t) => t.team === "bad" && t.state === "alive").length;
}

function spawnWave(mission, now) {
  const wave = mission.waves[mission.waveIndex];
  mission.waveIndex += 1;
  for (const [type, at, extra] of wave.toys) {
    const toy = makeToy(type, {...at, now}, extra ?? {});
    mission.toys.push(toy);
    if (mission.stats.typeFirstSeen[type] == null) mission.stats.typeFirstSeen[type] = now;
  }
  if (wave.label) say(mission, wave.label, now, 3.2);
}

/** The clear condition: all waves out and every bad toy popped (escort: train home too). */
function checkClear(mission, now) {
  if (mission.waveIndex < mission.waves.length) return false;
  if (badAliveCount(mission) > 0) return false;
  if (mission.def.kind === "escort") {
    const train = mission.toys.find((t) => t.type === "toy-train");
    if (train && !pathDone(train)) return false;
  }
  mission.phase = "clear";
  mission.clearedAt = now;
  return true;
}

export function stepMission(mission, dt, now) {
  if (mission.phase !== "play") return mission;
  const t = now - mission.playStartedAt;
  const wave = mission.waves[mission.waveIndex];
  if (wave && t >= wave.atS && (!wave.whenClear || badAliveCount(mission) === 0)) {
    spawnWave(mission, now);
  }
  for (const toy of mission.toys) stepToy(toy, dt, now);
  const squad = mission.def.squad;
  if (squad) {
    const fresh = reinforceSquad(mission.toys, {...squad, now});
    for (const toy of fresh) mission.toys.push(toy);
  }
  checkClear(mission, now);
  return mission;
}

/** Score one shot result (from hitToy) into the mission; returns caption/juice hints. */
export function scorePop(mission, result, now) {
  mission.stats.shots += 0; // shots are counted at launch
  if (!result?.accepted) return null;
  mission.stats.hits += 1;
  if (result.friendly) {
    if (!result.train) {
      mission.stats.friendlySplats += 1;
      say(mission, announcerLine("friendly"), now, 3);
      return {caption: FRIENDLY_SPLAT_CAPTION, big: false, friendly: true};
    }
    say(mission, announcerLine("wobble", mission.captionSeq), now, 2);
    return {caption: null, big: false, friendly: true};
  }
  if (result.popped) {
    mission.stats.pops += 1;
    mission.stats.points += result.points ?? 1;
    if (result.big) mission.stats.bigPops += 1;
    const kind = result.big ? "bigPop" : "goodSplat";
    const extra = badAliveCount(mission) > 2 ? ` ${announcerLine("more", mission.captionSeq)}` : "";
    say(mission, `${announcerLine(kind, mission.captionSeq)}${extra}`, now);
    return {caption: mission.caption.line, big: result.big === true, friendly: false};
  }
  return {caption: null, big: false, friendly: false};
}

export function noteShot(mission) {
  mission.stats.shots += 1;
}

/** Kid fairness: a hit on the chopper only wobbles it and drops one balloon. */
export function chopperDamage(mission, now) {
  mission.stats.wobbles += 1;
  mission.stats.balloonsDropped += 1;
  say(mission, announcerLine("wobble", mission.stats.wobbles), now, 2);
  return {wobbleS: 1.1, dropBalloon: true, failed: false};
}

export function gunnerAccuracy(stats) {
  if (!stats.shots) return 0;
  return Math.min(1, stats.hits / stats.shots);
}

/** Stars: both players 1..3; the gunner never gets less than 1. */
export function missionStars(mission) {
  const stats = mission.stats;
  const acc = gunnerAccuracy(stats);
  const gunner = 1 + (acc >= 0.25 || stats.pops >= 5 ? 1 : 0) + (acc >= 0.5 ? 1 : 0);
  const timeS = (mission.clearedAt ?? 0) - (mission.playStartedAt ?? 0);
  const pilot = 1 + (timeS <= mission.def.parS ? 1 : 0) + (stats.wobbles <= 2 ? 1 : 0);
  return {gunner: Math.min(3, gunner), pilot: Math.min(3, pilot), timeS};
}

/** Which target types took longest: first seen -> last pop, for telemetry. */
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
    friendlySplats: stats.friendlySplats,
    wobbles: stats.wobbles,
    typeClearS: perType,
  };
}

export function notePopType(mission, toy, now) {
  mission.stats.typeLastPop[toy.type] = now;
}
