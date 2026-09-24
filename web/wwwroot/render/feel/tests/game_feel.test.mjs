import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGameFeelToCamera,
  createGameFeelState,
  paintGameFeel,
  stepGameFeel,
} from "../game_feel.js";

test("gunfire and a near miss shake the view, and the toggle removes both", () => {
  const firing = stepGameFeel(createGameFeelState(), {
    gun_firing: true,
    rounds_fired: 4,
    mach: 0.4,
    g_actual: 1,
  }, 1 / 60);
  assert.ok(firing.shake > 0.2);

  const quiet = createGameFeelState();
  stepGameFeel(quiet, { opponent_rounds_fired: 0, range_m: 200, hits: 0 }, 0);
  const miss = stepGameFeel(quiet, {
    opponent_rounds_fired: 2,
    range_m: 180,
    hits: 0,
    mach: 0.5,
  }, 1 / 60);
  assert.ok(miss.nearMiss > 0.5);
  assert.ok(miss.shake > 0.4);

  const held = createGameFeelState();
  const off = stepGameFeel(held, { gun_firing: true, rounds_fired: 3 }, 1 / 60, {
    enabled: false,
  });
  assert.equal(off.shake, 0);
  assert.equal(off.speedLines, 0);
});

test("high Mach widens the lens and brings up speed lines", () => {
  const state = createGameFeelState();
  let frame = null;
  for (let i = 0; i < 30; i++) {
    frame = stepGameFeel(state, { mach: 1.25, true_airspeed_mps: 420, g_actual: 1 }, 1 / 30);
  }
  assert.ok(frame.fovKickDeg > 4);
  assert.ok(frame.speedLines > 0.8);
});

test("sustained G closes a vignette without inventing a kill flash", () => {
  const state = createGameFeelState();
  let frame = null;
  for (let i = 0; i < 20; i++)
    frame = stepGameFeel(state, { g_actual: 7.2, mach: 0.6 }, 1 / 30);
  assert.ok(frame.vignette > 0.55);
  assert.ok(frame.vignette < 0.7);
  assert.equal(frame.killFlash, 0);
});

test("a kill flashes and holds the lens, and the first snapshot does not", () => {
  const state = createGameFeelState();
  const armed = stepGameFeel(state, {
    bandit_alive: true,
    opponent_alive: true,
    range_m: 400,
  }, 1 / 60);
  assert.equal(armed.killFlash, 0);
  const splash = stepGameFeel(state, {
    bandit_alive: false,
    opponent_alive: false,
    fight: "Splash",
    range_m: 400,
  }, 1 / 60);
  assert.ok(splash.killFlash > 0.5);
  assert.ok(splash.hitStop > 0.5);
});

test("reduced motion keeps the G vignette and drops the shake", () => {
  const state = createGameFeelState();
  let frame = null;
  for (let i = 0; i < 20; i++) {
    frame = stepGameFeel(state, {
      gun_firing: true,
      g_actual: 6.5,
      mach: 1.1,
    }, 1 / 30, { reducedMotion: true });
  }
  assert.equal(frame.shake, 0);
  assert.equal(frame.speedLines, 0);
  assert.ok(frame.vignette > 0.4);
});

test("the camera receives the FOV kick and the overlay publishes the frame", () => {
  const camera = { fov: 66, position: { add() {} }, quaternion: { multiply() { return this; }, normalize() {} }, updateProjectionMatrix() { this.updated = true; } };
  applyGameFeelToCamera(null, camera, { fovKickDeg: 4, shakeX: 0, shakeY: 0, shakeRoll: 0 }, 66);
  assert.equal(camera.fov, 70);
  assert.equal(camera.updated, true);

  const props = {};
  const root = {
    hidden: true,
    setAttribute() {},
    style: { setProperty(name, value) { props[name] = value; } },
  };
  paintGameFeel(root, { active: true, vignette: 0.5, speedLines: 0.25, killFlash: 1, shake: 0.2, desaturate: 0.4, hitStop: 0.1 });
  assert.equal(root.hidden, false);
  assert.equal(props["--feel-flash"], "1.0000");
  assert.equal(props["--feel-lines"], "0.2500");
});
