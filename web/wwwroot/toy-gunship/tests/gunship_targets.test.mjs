import test from "node:test";
import assert from "node:assert/strict";
import {TOY_REJOIN_S} from "../../render/toy/toy_pass.js";
import {
  BOSS, CYCLES, friendlyDownFrame, hitGunshipToy, makeGunshipToy, pathDone,
  pathLength, reinforceSquad, resetGunshipIds, squadLead, stepGunshipToy, toyWindow,
} from "../gunship_targets.mjs";

test("every bad-guy type has a distinct dress or an authored look of its own", () => {
  for (const type of ["wind-up-robot", "jack-in-the-box", "rubber-band-sniper", "evil-teddy",
    "plastic-dinosaur", "rc-car", "tin-soldier", "spinning-top"]) {
    const toy = makeGunshipToy(type);
    assert.ok(toy.dress, `${type} wears a BAD_GUYS dress`);
  }
});

test("spinning top shrugs darts off mid-spin; the wobble window pops it", () => {
  const top = makeGunshipToy("spinning-top", {}, {center: {x: 0, z: 0}, circleR: 4});
  top.phase = 1; // spinning hard
  assert.equal(hitGunshipToy(top, "dart", 1).accepted, false);
  assert.equal(top.state, "alive");
  top.phase = CYCLES.top.wobbleFrom + 0.1;
  assert.equal(toyWindow(top), "wobble");
  assert.equal(hitGunshipToy(top, "dart", 1).popped, true);
});

test("confetti pops a spinning top regardless — it fills the screen", () => {
  const top = makeGunshipToy("spinning-top");
  top.phase = 1;
  assert.equal(hitGunshipToy(top, "confetti", 3).popped, true);
});

test("jack-in-the-box: chip it shut, or one hit while it is up", () => {
  const shut = makeGunshipToy("jack-in-the-box");
  shut.phase = 1;
  assert.equal(hitGunshipToy(shut, "dart", 1).popped, false);
  assert.equal(shut.hp, 1);
  const up = makeGunshipToy("jack-in-the-box");
  up.phase = CYCLES.jack.upFrom + 0.1;
  assert.equal(hitGunshipToy(up, "dart", 1).popped, true);
});

test("evil teddy: three darts, or one soaking water balloon", () => {
  const chipped = makeGunshipToy("evil-teddy");
  hitGunshipToy(chipped, "dart", 1);
  hitGunshipToy(chipped, "dart", 1);
  assert.equal(chipped.state, "alive");
  assert.equal(hitGunshipToy(chipped, "dart", 1).popped, true);
  const soaked = makeGunshipToy("evil-teddy");
  assert.equal(hitGunshipToy(soaked, "balloon", 1).popped, true);
});

test("rc-car parks instantly under a water balloon", () => {
  const car = makeGunshipToy("rc-car", {}, {center: {x: 0, z: 0}, circleR: 10});
  assert.equal(hitGunshipToy(car, "balloon", 1).popped, true);
});

test("the sandcastle shrugs darts; a balloon is good effect", () => {
  const castle = makeGunshipToy("sandcastle");
  assert.equal(hitGunshipToy(castle, "dart", 1).accepted, false);
  assert.equal(hitGunshipToy(castle, "balloon", 1).popped, true);
  assert.equal(castle.prop, true, "props never block the mission clear");
});

test("plastic dinosaur takes double damage in the mouth-open pause", () => {
  const dino = makeGunshipToy("plastic-dinosaur");
  dino.phase = CYCLES.dino.pauseFrom + 0.1;
  hitGunshipToy(dino, "dart", 1);
  assert.equal(dino.hp, 1, "2 of 3 hp in one pause hit");
});

test("boss: invulnerable while rising, phase gaps after each 3 hp, 9 total", () => {
  const boss = makeGunshipToy("pool-dinosaur");
  assert.equal(hitGunshipToy(boss, "dart", 1).accepted, false, "still rising");
  boss.invulnS = 0;
  const phase = hitGunshipToy(boss, "confetti", 3);
  assert.equal(phase.bossPhase, true);
  assert.equal(boss.hp, 6);
  assert.equal(hitGunshipToy(boss, "dart", 1).accepted, false, "phase gap");
  boss.invulnS = 0;
  hitGunshipToy(boss, "confetti", 3);
  boss.invulnS = 0;
  const done = hitGunshipToy(boss, "confetti", 3);
  assert.equal(done.popped, true);
  assert.equal(done.boss, true);
});

test("friendly splat: stiff plastic fall, ambulance timeline, back good as new", () => {
  const man = makeGunshipToy("army-man");
  const result = hitGunshipToy(man, "dart", 1, 100);
  assert.equal(result.friendly, true);
  assert.equal(result.popped, false, "friendlies never pop");
  assert.equal(man.state, "splatted");
  assert.equal(friendlyDownFrame(man, 100.1).phase, "fall-stiff");
  assert.equal(friendlyDownFrame(man, 101).siren, true, "toy ambulance rolling");
  stepGunshipToy(man, 0.05, 100 + TOY_REJOIN_S + 0.05);
  assert.equal(man.state, "alive", "good as new at the spawn");
});

test("fresh army men march out to keep the squad topped up", () => {
  resetGunshipIds();
  const path = [{x: 0, z: 0}, {x: 10, z: 0}];
  const toys = reinforceSquad([], {size: 5, spawn: {x: 0, z: 0}, path, now: 0});
  assert.equal(toys.length, 5);
  toys[0].pathT = 4; // furthest along
  assert.equal(squadLead(toys).id, toys[0].id);
  const popped = [...toys];
  popped[1].state = "splatted"; // healing men still count toward the roster
  assert.equal(reinforceSquad(popped, {size: 5, spawn: {x: 0, z: 0}, path, now: 1}).length, 0);
});

test("walkers travel the path by distance, not by waypoint count", () => {
  const path = [{x: 0, z: 0}, {x: 10, z: 0}, {x: 10, z: 10}];
  assert.equal(pathLength(path), 20);
  const man = makeGunshipToy("army-man", {x: 0, z: 0}, {path, speed: 1});
  for (let i = 0; i < 100; i += 1) stepGunshipToy(man, 0.05, i * 0.05); // 5 s at 1 u/s
  assert.ok(Math.abs(man.x - 5) < 0.2, `walked ~5 units, at x=${man.x}`);
  assert.equal(pathDone(man), false);
  for (let i = 0; i < 400; i += 1) stepGunshipToy(man, 0.05, 5 + i * 0.05);
  assert.equal(pathDone(man), true);
});

test("the rubber-band sniper flicks once per wind-up cycle", () => {
  const sniper = makeGunshipToy("rubber-band-sniper");
  let flicks = 0;
  for (let i = 0; i < Math.ceil(CYCLES.sniper.total / 0.05) + 1; i += 1) {
    if (stepGunshipToy(sniper, 0.05, i * 0.05)?.flick) flicks += 1;
  }
  assert.equal(flicks, 1);
});
