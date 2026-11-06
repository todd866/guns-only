import test from "node:test";
import assert from "node:assert/strict";
import {
  GUNSHIP_MISSION, RADIO, SQUAD_PATH, YARD, beginPlay, createGunshipMission,
  gunnerAccuracy, missionCaption, missionStars, missionTelemetry, noteCrate,
  noteShot, scoreHit, splashLine, stepGunshipMission,
} from "../gunship_mission.mjs";
import {hitGunshipToy, resetGunshipIds, squadLead} from "../gunship_targets.mjs";

function freshMission(now = 0) {
  resetGunshipIds();
  const mission = createGunshipMission(now);
  beginPlay(mission, now);
  return mission;
}

/** Run the mission popping every vulnerable bad toy immediately: a perfect gunner. */
function simulatePerfectRun(maxS = 420) {
  const mission = freshMission(0);
  const dt = 0.05;
  let now = 0;
  while (mission.phase === "play" && now < maxS) {
    now += dt;
    stepGunshipMission(mission, dt, now);
    for (const toy of mission.toys) {
      if (toy.team !== "bad" || toy.state !== "alive") continue;
      noteShot(mission);
      const result = hitGunshipToy(toy, "confetti", 3, now);
      scoreHit(mission, toy, result, now);
    }
  }
  return {mission, now};
}

test("the squad path walks the authored landmarks in order", () => {
  assert.deepEqual(SQUAD_PATH[0], YARD.sandpit);
  assert.ok(SQUAD_PATH.includes(YARD.trampoline));
  assert.ok(SQUAD_PATH.includes(YARD.kennel));
  assert.deepEqual(SQUAD_PATH[SQUAD_PATH.length - 1], YARD.treehouse);
});

test("waves arrive on schedule and the first wave speaks its label", () => {
  const mission = freshMission(0);
  stepGunshipMission(mission, 0.05, 0.05);
  assert.ok(mission.toys.some((t) => t.type === "balloon-tower"));
  assert.ok(mission.toys.some((t) => t.type === "sandcastle"));
  assert.ok(mission.toys.some((t) => t.type === "army-man"), "squad marches from the start");
  assert.equal(missionCaption(mission, 0.1), mission.waves[0].label);
  assert.equal(mission.waveIndex, 1);
  // Jump to 26 s: the wind-up armor is out.
  stepGunshipMission(mission, 0.05, 26);
  assert.ok(mission.toys.some((t) => t.type === "wind-up-tank"));
});

test("the boss wave waits until the field is clear, then rises from the pool", () => {
  const {mission} = simulatePerfectRun();
  const boss = mission.toys.find((t) => t.type === "pool-dinosaur");
  assert.ok(boss, "the inflatable pool dinosaur showed up");
  assert.equal(boss.x, YARD.pool.x);
});

test("a perfect run clears in the 4-6 minute envelope and the gunner cannot lose", () => {
  const {mission, now} = simulatePerfectRun();
  assert.equal(mission.phase, "clear", `mission still ${mission.phase} at ${now}s`);
  assert.ok(now >= 240 && now <= 360, `cleared at ${Math.round(now)}s`);
  const stars = missionStars(mission);
  assert.ok(stars.gunner >= 1, "the 6-year-old never scores below one star");
  assert.ok(stars.pilot >= 1);
});

test("deadpan radio: splash lines per type, the owner's sandcastle line included", () => {
  assert.equal(splashLine("sandcastle"), "Good effect on the sandcastle.");
  assert.equal(splashLine("wind-up-tank"), "Splash one wind-up tank.");
  assert.ok(RADIO.friendly.includes("Hey!"));
  assert.ok(RADIO.friendly.some((line) => line.includes("He's fine")));
});

test("friendly splats caption deadpan and are telemetry, never a penalty", () => {
  const mission = freshMission(0);
  stepGunshipMission(mission, 0.05, 0.05);
  const man = mission.toys.find((t) => t.type === "army-man");
  const result = hitGunshipToy(man, "balloon", 1, 1);
  const note = scoreHit(mission, man, result, 1);
  assert.equal(note.friendly, true);
  assert.equal(mission.stats.friendlySplats, 1);
  assert.equal(mission.stats.points, 0, "no points move either way");
  assert.ok(RADIO.friendly.includes(missionCaption(mission, 1.1)));
  assert.equal(missionTelemetry(mission).friendlySplats, 1, "tracked for laughs");
});

test("squad bumps knock one man over (ambulance) and never fail the mission", () => {
  const mission = freshMission(0);
  stepGunshipMission(mission, 0.05, 0.05);
  // March a wind-up tank right onto the squad lead.
  stepGunshipMission(mission, 0.05, 25.1);
  const tank = mission.toys.find((t) => t.type === "wind-up-tank");
  const lead = squadLead(mission.toys);
  tank.x = lead.x; tank.z = lead.z; tank.path = null;
  stepGunshipMission(mission, 0.05, 25.2);
  assert.equal(mission.stats.squadBumps, 1);
  assert.equal(missionCaption(mission, 25.3), RADIO.squadBump);
  assert.equal(mission.phase, "play", "nothing fails");
});

test("crates score the pilot and caption both outcomes", () => {
  const mission = freshMission(0);
  noteCrate(mission, {onTarget: true}, 1);
  assert.equal(missionCaption(mission, 1.1), RADIO.crateOnTarget);
  noteCrate(mission, {onTarget: false}, 2);
  assert.equal(missionCaption(mission, 2.1), RADIO.crateOff);
  assert.equal(mission.stats.crates, 2);
  assert.equal(mission.stats.cratesOnTarget, 1);
});

test("telemetry carries the tuning numbers: per-type clear times, deflects, boss time", () => {
  const {mission} = simulatePerfectRun();
  const t = missionTelemetry(mission);
  assert.equal(t.missionId, GUNSHIP_MISSION.id);
  assert.ok(t.durationS > 0);
  assert.ok(t.pops > 10);
  assert.ok(t.bossClearS > 0);
  assert.ok(Object.keys(t.popsByType).length >= 8, "the whole rogues' gallery appears");
  assert.ok(t.typeClearS["pool-dinosaur"] != null);
  assert.equal(gunnerAccuracy(mission.stats), t.accuracy >= 0 ? gunnerAccuracy(mission.stats) : 0);
});
