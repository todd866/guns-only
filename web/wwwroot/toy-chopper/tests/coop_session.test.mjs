import test from "node:test";
import assert from "node:assert/strict";
import {
  WEAPONS, createCoopSession, leaveToTitle, startMission, stepCoop,
} from "../coop_session.mjs";
import {DOOR, gunnerDirection} from "../gunner.mjs";

function pad(index, id = "Xbox 360 (standard)") {
  return {
    connected: true,
    index,
    id,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({length: 17}, () => ({pressed: false, value: 0})),
  };
}

function press(p, i, value = 1) {
  p.buttons[i] = {pressed: value > 0.5, value};
}

function run(session, pads, seconds, perStep) {
  const dt = 0.025;
  for (let t = 0; t < seconds; t += dt) {
    perStep?.(t);
    stepCoop(session, {dt, pads, now: session.now + dt});
  }
}

test("brief plays, then flying starts; P2 joins on Start for split screen", () => {
  const s = createCoopSession();
  startMission(s, "balloon-fort", 0);
  assert.equal(s.phase, "brief");
  const p1 = pad(0);
  const p2 = pad(1, "8Bitdo SN30 Pro");
  run(s, [p1, p2], 4);
  assert.equal(s.phase, "fly");
  assert.equal(s.split, false);
  press(p2, 9); // Start on the second pad
  stepCoop(s, {dt: 0.025, pads: [p1, p2], now: s.now + 0.025});
  assert.equal(s.split, true);
  assert.equal(s.p2Pad, 1);
  press(p2, 9, 0);
});

test("the gunner pops a warm-up balloon inside the first 10 seconds", () => {
  const s = createCoopSession();
  startMission(s, "balloon-fort", 0);
  const p1 = pad(0);
  const p2 = pad(1);
  press(p2, 9);
  run(s, [p1, p2], 0.1);
  press(p2, 9, 0);
  run(s, [p1, p2], 3.6); // brief
  assert.equal(s.phase, "fly");
  let popped = false;
  let trigger = 0;
  run(s, [p1, p2], 6, () => {
    // A kid mashing A while the soft lock does the aiming.
    trigger += 1;
    press(p2, 0, trigger % 8 < 2 ? 1 : 0);
    for (const e of s.events) if (e.type === "pop") popped = true;
  });
  assert.equal(popped, true, "a toy popped within 10 s of take-off");
  assert.ok(s.now <= 10);
  assert.ok(s.mission.stats.pops >= 1);
});

test("soft lock is live while flying and marks both halves", () => {
  const s = createCoopSession();
  startMission(s, "balloon-fort", 0);
  const p1 = pad(0);
  const p2 = pad(1);
  press(p2, 9);
  run(s, [p1, p2], 0.1);
  press(p2, 9, 0);
  run(s, [p1, p2], 5);
  assert.ok(s.lock, "a warm-up balloon is near the door arc");
  assert.ok(typeof s.lock.x === "number");
});

test("kid auto-hover: released sticks damp the chopper for a clean shot", () => {
  const s = createCoopSession();
  startMission(s, "balloon-fort", 0);
  assert.equal(s.assist, "kid", "kid is the default assist");
  const p1 = pad(0);
  run(s, [p1], 4); // solo: pilot + auto-aim
  p1.axes[0] = 0.9; // bank hard
  run(s, [p1], 1.2);
  const banked = Math.abs(s.chopper.bank);
  assert.ok(banked > 0.1, "chopper banked");
  p1.axes[0] = 0; // hands off — no button needed
  run(s, [p1], 1.5);
  assert.ok(Math.abs(s.chopper.bank) < banked / 3, "auto-hover levelled it");
  assert.ok(Math.abs(s.chopper.lever - 0.5) < 0.1, "height holds: the lever eases to hover");
  assert.ok(s.mission.stats.holdSteadyS > 1);
});

test("pilot assist: the collective is a lever that stays where you leave it", () => {
  const s = createCoopSession();
  startMission(s, "balloon-fort", 0);
  s.assist = "pilot";
  const p1 = pad(0);
  run(s, [p1], 4);
  press(p1, 7); // RT: collective up
  run(s, [p1], 0.8);
  press(p1, 7, 0);
  const lever = s.chopper.lever;
  assert.ok(lever > 0.6, "RT raised the collective");
  run(s, [p1], 1.5); // hands off — a pilot gets no auto-hover
  assert.ok(Math.abs(s.chopper.lever - lever) < 1e-9, "the lever held");
  assert.equal(s.mission.stats.holdSteadyS, 0);
});

test("LB/RB are the pedals, the same buttons as every flying surface", () => {
  const s = createCoopSession();
  startMission(s, "balloon-fort", 0);
  const p1 = pad(0);
  run(s, [p1], 4);
  const heading = s.chopper.heading;
  press(p1, 5); // RB: right pedal
  run(s, [p1], 1);
  assert.ok(s.chopper.heading < heading - 0.5, "right pedal yaws right");
  press(p1, 5, 0);
  press(p1, 4); // LB: left pedal
  const mid = s.chopper.heading;
  run(s, [p1], 1);
  assert.ok(s.chopper.heading > mid + 0.5, "left pedal yaws left");
});

test("balloon lob shows an arc preview while B is held", () => {
  const s = createCoopSession();
  startMission(s, "balloon-fort", 0);
  const p1 = pad(0);
  const p2 = pad(1);
  press(p2, 9);
  run(s, [p1, p2], 0.1);
  press(p2, 9, 0);
  run(s, [p1, p2], 4);
  press(p2, 1); // Xbox B
  stepCoop(s, {dt: 0.025, pads: [p1, p2], now: s.now + 0.025});
  assert.ok(Array.isArray(s.lobPreview) && s.lobPreview.length > 2);
  assert.equal(s.shots.filter((shot) => shot.weapon === "balloon").length, 1);
  assert.ok(WEAPONS.balloon.splash > WEAPONS.dart.radius, "balloons are the area weapon");
});

test("gunner aim stays inside the door arc during play", () => {
  const s = createCoopSession();
  startMission(s, "balloon-fort", 0);
  const p1 = pad(0);
  const p2 = pad(1);
  press(p2, 9);
  run(s, [p1, p2], 0.1);
  press(p2, 9, 0);
  p2.axes[0] = 1;
  run(s, [p1, p2], 8);
  assert.ok(s.gunner.yaw <= DOOR.yawCenter + DOOR.yawHalf + 1e-9);
});

test("start pauses and resumes; leaving returns to the title", () => {
  const s = createCoopSession();
  startMission(s, "balloon-fort", 0);
  const p1 = pad(0);
  run(s, [p1], 4);
  press(p1, 9);
  stepCoop(s, {dt: 0.025, pads: [p1], now: s.now + 0.025});
  assert.equal(s.phase, "pause");
  press(p1, 9, 0);
  stepCoop(s, {dt: 0.025, pads: [p1], now: s.now + 0.025});
  press(p1, 9);
  stepCoop(s, {dt: 0.025, pads: [p1], now: s.now + 0.025});
  assert.equal(s.phase, "fly");
  leaveToTitle(s);
  assert.equal(s.phase, "title");
  assert.equal(s.mission, null);
});

test("a whole mission can be finished and produces stars + telemetry", () => {
  const s = createCoopSession();
  startMission(s, "balloon-fort", 0);
  const p1 = pad(0);
  const p2 = pad(1);
  press(p2, 9);
  run(s, [p1, p2], 0.1);
  press(p2, 9, 0);
  let frame = 0;
  run(s, [p1, p2], 400, () => {
    if (s.phase !== "fly") return;
    frame += 1;
    press(p2, 0, frame % 4 < 2 ? 1 : 0); // mash darts
    press(p2, 1, frame % 30 < 2 ? 1 : 0); // occasional balloon
    // Test cheat: drag every live bad toy onto the gunner's line of sight so
    // the soft lock can see it; the game itself never does this.
    const dir = gunnerDirection(s.chopper.heading, s.gunner);
    for (const toy of s.mission.toys) {
      if (toy.team === "bad" && toy.state === "alive") {
        toy.x = s.chopper.x + dir.x * 14;
        toy.y = Math.max(1, s.chopper.y + dir.y * 14);
        toy.z = s.chopper.z + dir.z * 14;
      }
    }
  });
  assert.equal(s.phase, "result");
  assert.ok(s.result.stars.gunner >= 1);
  assert.ok(s.result.stars.pilot >= 1);
  assert.equal(s.result.telemetry.missionId, "balloon-fort");
  assert.ok(s.result.telemetry.shots > 0);
  assert.ok(s.result.telemetry.accuracy >= 0);
});
