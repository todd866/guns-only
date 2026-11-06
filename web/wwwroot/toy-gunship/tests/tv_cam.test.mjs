import test from "node:test";
import assert from "node:assert/strict";
import {
  GUNS, YARD_HALF, ZOOMS, createTvCam, cycleZoom, faceIndexX, fireGun,
  readTvPad, resetRoundIds, softLock, stepRounds, stepTvAim, zoomMag,
} from "../tv_cam.mjs";

function pad(id = "Xbox 360 (standard)") {
  return {
    connected: true, index: 0, id, mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({length: 17}, () => ({pressed: false, value: 0})),
  };
}

test("aim stays inside the yard and zoom slows the sweep", () => {
  const cam = createTvCam();
  for (let i = 0; i < 2000; i += 1) stepTvAim(cam, {x: 1, y: 1}, 0.05);
  assert.equal(cam.x, YARD_HALF);
  assert.equal(cam.z, YARD_HALF);
  const wide = createTvCam();
  stepTvAim(wide, {x: 1, y: 0}, 0.05);
  const close = createTvCam();
  close.zoom = 2;
  stepTvAim(close, {x: 1, y: 0}, 0.05);
  assert.ok(close.x - (-0) < wide.x, "close zoom moves the aim slower");
});

test("zoom cycles through the three levels and wraps", () => {
  const cam = createTvCam();
  const seen = [zoomMag(cam)];
  cycleZoom(cam); seen.push(zoomMag(cam));
  cycleZoom(cam); seen.push(zoomMag(cam));
  cycleZoom(cam);
  assert.deepEqual(seen, ZOOMS.map((z) => z.mag));
  assert.equal(cam.zoom, 0);
});

test("soft lock glues to the nearest bad toy and never a friendly", () => {
  const cam = createTvCam();
  cam.x = 0; cam.z = 0;
  const friendly = {id: "f", team: "good", state: "alive", x: 0.5, z: 0};
  const bad = {id: "b", team: "bad", state: "alive", x: 2, z: 0};
  const far = {id: "c", team: "bad", state: "alive", x: 30, z: 0};
  assert.equal(softLock(cam, [friendly, bad, far])?.id, "b");
  assert.equal(softLock(cam, [friendly, far]), null);
});

test("guns respect their own cooldowns; darts snap to the lock", () => {
  resetRoundIds();
  const cam = createTvCam();
  cam.x = 0; cam.z = 0;
  const bad = {id: "b", team: "bad", state: "alive", x: 1.5, z: 0.5};
  const round = fireGun(cam, "dart", [bad], 0);
  assert.equal(round.x, 1.5, "dart aims where the lock is");
  assert.equal(fireGun(cam, "dart", [bad], 0.01), null, "dart still cooling");
  const balloon = fireGun(cam, "balloon", [bad], 0.02);
  assert.ok(balloon, "the balloon has its own cooldown");
  assert.ok(balloon.impactAt - balloon.firedAt >= GUNS.balloon.delayS, "arc delay");
  const confetti = fireGun(cam, "confetti", [], 0.03);
  assert.ok(confetti);
  assert.equal(fireGun(cam, "confetti", [], 3), null, "big slow reload");
  assert.equal(cam.shots, 3);
});

test("rounds land exactly when their delay elapses", () => {
  resetRoundIds();
  const cam = createTvCam();
  const rounds = [fireGun(cam, "balloon", [], 10)];
  assert.equal(stepRounds(rounds, 10.5).length, 0);
  const impacts = stepRounds(rounds, 10 + GUNS.balloon.delayS);
  assert.equal(impacts.length, 1);
  assert.equal(rounds.length, 0);
});

test("printed X maps per pad family: SNES 3, Xbox 2", () => {
  assert.equal(faceIndexX("8Bitdo SN30 Pro"), 3);
  assert.equal(faceIndexX("Xbox Wireless Controller"), 2);
});

test("readTvPad raises one-frame edges for all three weapons and zoom", () => {
  const p = pad("8Bitdo SN30 Pro");
  p.buttons[1] = {pressed: true, value: 1};  // SNES printed A
  p.buttons[0] = {pressed: true, value: 1};  // SNES printed B
  p.buttons[3] = {pressed: true, value: 1};  // SNES printed X
  p.buttons[5] = {pressed: true, value: 1};  // RB zoom
  const first = readTvPad(p, {});
  assert.deepEqual(
    [first.dartEdge, first.balloonEdge, first.confettiEdge, first.zoomEdge],
    [true, true, true, true],
  );
  const second = readTvPad(p, first);
  assert.deepEqual(
    [second.dartEdge, second.balloonEdge, second.confettiEdge, second.zoomEdge],
    [false, false, false, false],
  );
});
