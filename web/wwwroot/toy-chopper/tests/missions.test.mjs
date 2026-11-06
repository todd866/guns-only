import test from "node:test";
import assert from "node:assert/strict";
import {
  MISSIONS, beginPlay, chopperDamage, createMission, gunnerAccuracy,
  missionCaption, missionStars, missionTelemetry, noteShot, notePopType,
  scorePop, stepMission,
} from "../missions.mjs";
import {hitToy} from "../targets.mjs";

function play(id = "balloon-fort") {
  const m = createMission(id, 0);
  beginPlay(m, 0);
  return m;
}

test("three missions, each 3-5 minutes par, briefs read like a toy game", () => {
  assert.equal(MISSIONS.length, 3);
  for (const def of MISSIONS) {
    assert.ok(def.parS >= 180 && def.parS <= 300, `${def.id} par ${def.parS}`);
    assert.ok(def.brief.length > 10);
  }
  assert.equal(MISSIONS.some((m) => m.kind === "boss"), true);
});

test("something to shoot within 10 seconds: wave zero is immediate and airborne-easy", () => {
  const m = play();
  stepMission(m, 0.05, 0.05);
  const warmups = m.toys.filter((t) => t.type === "warmup-balloon");
  assert.ok(warmups.length >= 3, "warm-up balloons out at t=0");
  assert.ok(warmups.every((t) => Math.hypot(t.x, t.z) < 30), "and close to the pad");
});

test("waves advance by time, gated waves wait for a clear field", () => {
  const m = play();
  stepMission(m, 0.05, 0.05);
  const before = m.toys.length;
  stepMission(m, 0.05, 26); // towers wave is time-only
  assert.ok(m.toys.length > before, "towers arrived");
  stepMission(m, 0.05, 71); // tanks wave wants the field clear first
  assert.equal(m.toys.some((t) => t.type === "wind-up-tank"), false);
  for (const toy of m.toys.filter((t) => t.team === "bad")) hitToy(toy, "balloon", 71);
  stepMission(m, 0.05, 72);
  assert.equal(m.toys.some((t) => t.type === "wind-up-tank"), true);
});

test("a full run clears the mission and the announcer stays cheerful", () => {
  const m = play();
  let now = 0;
  let saw = 0;
  for (let i = 0; i < 20000 && m.phase === "play"; i += 1) {
    now += 0.05;
    stepMission(m, 0.05, now);
    for (const toy of m.toys) {
      if (toy.team === "bad" && toy.state === "alive") {
        noteShot(m);
        const hit = hitToy(toy, "balloon", now);
        const note = scorePop(m, hit, now);
        if (hit.popped) notePopType(m, toy, now);
        if (note) saw += 1;
      }
    }
  }
  assert.equal(m.phase, "clear");
  assert.ok(saw > 3, "pop captions were raised");
  assert.ok(m.stats.pops >= 8);
  const tele = missionTelemetry(m);
  assert.equal(tele.missionId, "balloon-fort");
  assert.ok(tele.durationS > 0);
  assert.ok(tele.typeClearS["balloon-tower"] != null, "time-to-clear per type recorded");
});

test("captions expire; friendly splats caption the medic joke and cost nothing", () => {
  const m = play();
  stepMission(m, 0.05, 0.05);
  noteShot(m);
  const note = scorePop(m, {accepted: true, friendly: true}, 1);
  assert.match(note.caption, /Medic/);
  assert.equal(m.stats.friendlySplats, 1);
  assert.equal(m.stats.pops, 0, "no score change either way");
  assert.ok(missionCaption(m, 1.5));
  assert.equal(missionCaption(m, 60), null);
});

test("kid fairness: chopper damage wobbles, drops a balloon, never fails", () => {
  const m = play();
  const hit = chopperDamage(m, 5);
  assert.equal(hit.failed, false);
  assert.ok(hit.wobbleS > 0);
  assert.equal(m.stats.balloonsDropped, 1);
  assert.equal(m.phase, "play", "mission keeps going");
});

test("stars: the gunner never gets less than 1; good runs earn 3", () => {
  const m = play();
  m.stats.shots = 40;
  m.stats.hits = 2;
  m.playStartedAt = 0;
  m.clearedAt = 1000; // slow and wobbly
  m.stats.wobbles = 9;
  const low = missionStars(m);
  assert.equal(low.gunner, 1);
  assert.equal(low.pilot, 1);
  m.stats.hits = 24;
  m.stats.pops = 12;
  m.clearedAt = 150;
  m.stats.wobbles = 0;
  const high = missionStars(m);
  assert.equal(high.gunner, 3);
  assert.equal(high.pilot, 3);
  assert.equal(gunnerAccuracy(m.stats), 0.6);
});
