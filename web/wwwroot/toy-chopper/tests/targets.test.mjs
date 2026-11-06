import test from "node:test";
import assert from "node:assert/strict";
import {TOY_REJOIN_S} from "../../render/toy/toy_pass.js";
import {
  TOY_RULES, friendlyDownFrame, hitToy, makeToy, pathDone, reinforceSquad,
  resetToyIds, stepToy,
} from "../targets.mjs";

test("balloons pop on one dart; forts want a balloon but darts chip", () => {
  resetToyIds();
  const balloon = makeToy("balloon-tower");
  assert.equal(hitToy(balloon, "dart").popped, true);
  const fort = makeToy("cardboard-fort");
  assert.equal(hitToy(fort, "dart").popped, false);
  assert.equal(hitToy(fort, "dart").popped, false);
  assert.equal(hitToy(fort, "dart").popped, true, "three darts chip it down");
  const fort2 = makeToy("cardboard-fort");
  assert.equal(hitToy(fort2, "balloon").popped, true, "one balloon finishes the fort");
});

test("popped toys refuse further hits; big pops are flagged", () => {
  const fort = makeToy("cardboard-fort");
  assert.equal(hitToy(fort, "balloon").big, true);
  assert.equal(hitToy(fort, "balloon").accepted, false);
});

test("friendly splat: stiff fall, ambulance out, good as new - and never a penalty", () => {
  const man = makeToy("army-man", {now: 0});
  const hit = hitToy(man, "dart", 10);
  assert.equal(hit.friendly, true);
  assert.equal(hit.popped, false);
  assert.equal(man.state, "splatted");
  assert.equal(friendlyDownFrame(man, 10.1).phase, "fall-stiff");
  assert.equal(friendlyDownFrame(man, 10.6).phase, "ambulance-out");
  assert.equal(friendlyDownFrame(man, 10.6).siren, true);
  stepToy(man, 0.05, 10 + TOY_REJOIN_S);
  assert.equal(man.state, "alive", "he's fine");
});

test("the train wobbles but never pops", () => {
  const train = makeToy("toy-train");
  const hit = hitToy(train, "balloon", 5);
  assert.equal(hit.train, true);
  assert.equal(train.state, "alive");
  assert.ok(train.wobble > 0);
  assert.equal(TOY_RULES["toy-train"].hp, Infinity);
});

test("wind-up tank waddles: it pauses part of every cycle", () => {
  const tank = makeToy("wind-up-tank", {x: 0, z: 0}, {path: [{x: 0, z: 0}, {x: 0, z: 100}], speed: 2});
  let lastZ = tank.z;
  let moved = 0;
  let paused = 0;
  for (let t = 0; t < 3.2; t += 0.04) {
    stepToy(tank, 0.04, t);
    if (tank.z > lastZ + 1e-9) moved += 1; else paused += 1;
    lastZ = tank.z;
  }
  assert.ok(moved > 10, "it does advance");
  assert.ok(paused > 10, "and it does pause (waddle)");
});

test("toys follow their paths to the end", () => {
  const train = makeToy("toy-train", {x: 0, z: 0}, {path: [{x: 0, z: 0}, {x: 10, z: 0}], speed: 10});
  for (let t = 0; t < 1; t += 0.04) stepToy(train, 0.04, t);
  assert.equal(pathDone(train), true);
  assert.ok(Math.abs(train.x - 10) < 0.5);
});

test("the squad tops itself up from the spawn", () => {
  resetToyIds();
  const toys = [makeToy("army-man"), makeToy("army-man")];
  const fresh = reinforceSquad(toys, {size: 4, spawn: {x: 1, z: 2}, now: 3});
  assert.equal(fresh.length, 2);
  assert.equal(fresh[0].x, 1);
  assert.equal(fresh[0].team, "good");
  const none = reinforceSquad([...toys, ...fresh], {size: 4});
  assert.equal(none.length, 0);
});
