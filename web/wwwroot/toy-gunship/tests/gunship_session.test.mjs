import test from "node:test";
import assert from "node:assert/strict";
import {GUNS} from "../tv_cam.mjs";
import {ORBIT} from "../orbit.mjs";
import {createGunshipSession, leaveToTitle, startGunship, stepGunship} from "../gunship_session.mjs";
import {applyResult, emptyProgress} from "../../toy-chopper/campaign.mjs";

function pad(index, id = "Xbox 360 (standard)") {
  return {
    connected: true, index, id, mapping: "standard",
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
    stepGunship(session, {dt, pads, now: session.now + dt});
  }
}

function flying(twoPads = true) {
  const session = createGunshipSession();
  startGunship(session, 0);
  const p1 = pad(0);
  const p2 = pad(1, "8Bitdo SN30 Pro");
  const pads = twoPads ? [p1, p2] : [p1];
  if (twoPads) {
    press(p2, 9); // START joins the gunner seat
    stepGunship(session, {dt: 0.02, pads, now: 0.02});
    press(p2, 9, 0);
  }
  session.phase = "fly";
  session.mission.phase = "play";
  session.mission.playStartedAt = session.now;
  return {session, p1, p2, pads};
}

test("second pad joins on START and takes the toy camera", () => {
  const {session} = flying(true);
  assert.equal(session.split, true);
  assert.equal(session.p2Pad, 1);
});

test("the pilot widens the orbit with the stick; LB holds it steady", () => {
  const {session, p1, pads} = flying(true);
  const before = session.orbit.radius;
  p1.axes[0] = 1; // stick right = orbit out
  run(session, pads, 1);
  assert.ok(session.orbit.radius > before, "radius grew");
  const held = session.orbit.radius;
  press(p1, 4); // LB hold-steady
  run(session, pads, 1);
  assert.ok(Math.abs(session.orbit.radius - held) < 1e-9, "held radius");
});

test("gunner darts pop a balloon tower and the radio calls it", () => {
  const {session, p2, pads} = flying(true);
  // Park the aim on the first balloon tower and hold A.
  run(session, pads, 0.2);
  const tower = session.mission.toys.find((t) => t.type === "balloon-tower");
  session.cam.x = tower.x;
  session.cam.z = tower.z;
  press(p2, 1); // SNES printed A = dart
  let saw = false;
  run(session, pads, 1.5, () => {
    if (session.events.some((e) => e.type === "pop" && e.toyType === "balloon-tower")) saw = true;
  });
  assert.equal(saw, true, "pop event for the view");
  assert.ok(session.mission.stats.pops >= 1);
  assert.ok(session.cam.shots > 0);
});

test("a water balloon on your own army man: ambulance, deadpan, no penalty", () => {
  const {session, p2, pads} = flying(true);
  run(session, pads, 0.2);
  const man = session.mission.toys.find((t) => t.type === "army-man");
  session.cam.x = man.x;
  session.cam.z = man.z;
  press(p2, 0); // SNES printed B = water balloon (held: the edge fires once)
  let splat = false;
  run(session, pads, 2, () => {
    if (session.events.some((e) => e.type === "friendly-splat")) splat = true;
  });
  assert.equal(splat, true);
  assert.ok(session.mission.stats.friendlySplats >= 1, "counted for laughs");
  assert.equal(session.mission.stats.points, 0, "never a penalty, never a prize");
  assert.equal(session.phase, "fly", "nothing fails");
});

test("confetti cannon: screen-filling pop, then a long reload", () => {
  const {session, p2, pads} = flying(true);
  run(session, pads, 0.2);
  press(p2, 3); // SNES printed X = confetti
  run(session, pads, 0.1);
  press(p2, 3, 0);
  assert.ok(session.cam.cool.confetti > GUNS.confetti.cooldownS - 0.5, "reloading");
  const shotsAfterOne = session.cam.shots;
  press(p2, 3);
  run(session, pads, 0.1);
  assert.equal(session.cam.shots, shotsAfterOne, "no second confetti yet");
});

test("solo: the toy camera minds itself so Dad can test-fly alone", () => {
  const {session, pads} = flying(false);
  assert.equal(session.split, false);
  run(session, pads, 20);
  assert.ok(session.mission.stats.pops >= 1, "auto-gunner popped something");
});

test("the pilot drops crates on the squad and the bay reloads", () => {
  const {session, p1, pads} = flying(true);
  run(session, pads, 0.2);
  press(p1, 0); // Xbox A = crate away
  run(session, pads, 0.1);
  press(p1, 0, 0);
  assert.equal(session.crates.length, 1);
  press(p1, 0);
  run(session, pads, 0.1);
  assert.equal(session.crates.length, 1, "bay still reloading");
  let landed = false;
  run(session, pads, 6, () => {
    if (session.events.some((e) => e.type.startsWith("crate-on") || e.type.startsWith("crate-off"))) landed = true;
  });
  assert.equal(landed, true);
  assert.equal(session.mission.stats.crates, 1);
});

test("getting caught by the searchlight washes the lens out, never fails", () => {
  const {session, pads} = flying(true);
  // Park the plane inside the beam by force.
  let spotted = false;
  run(session, pads, 30, () => {
    if (session.events.some((e) => e.type === "spotted")) spotted = true;
    if (session.light.caught) assert.ok(session.cam.washoutS > 0);
  });
  // The sweep crosses a default orbit within 30 s; if not, catch it directly.
  if (!spotted) {
    session.orbit.radius = 20;
    run(session, pads, 60, () => {
      if (session.events.some((e) => e.type === "spotted")) spotted = true;
    });
  }
  assert.equal(spotted, true);
  assert.equal(session.phase, "fly");
});

test("START pauses and resumes without ending anything", () => {
  const {session, p1, pads} = flying(true);
  press(p1, 9);
  run(session, pads, 0.1);
  assert.equal(session.phase, "pause");
  press(p1, 9, 0);
  run(session, pads, 0.1);
  press(p1, 9);
  run(session, pads, 0.1);
  assert.equal(session.phase, "fly");
});

test("a full solo mission reaches the result and feeds the shared campaign", () => {
  const {session, pads} = flying(false);
  run(session, pads, 400);
  assert.equal(session.phase, "result", `still ${session.phase} after ${Math.round(session.now)}s; `
    + `waveIndex ${session.mission?.waveIndex}, bad alive ${session.mission?.toys.filter((t) => t.team === "bad" && t.state === "alive").map((t) => t.type).join(",")}`);
  const {stars, telemetry} = session.result;
  assert.ok(stars.gunner >= 1);
  assert.ok(telemetry.pops > 5);
  // Stars land in the same campaign/sticker book as the chopper.
  const applied = applyResult(emptyProgress(), "toy-gunship", stars, telemetry);
  assert.ok(applied.progress.totalStars >= 2);
  assert.ok(applied.newStickers.some((s) => s.id === "first-pop"));
  leaveToTitle(session);
  assert.equal(session.phase, "title");
});
