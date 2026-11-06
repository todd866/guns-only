import test from "node:test";
import assert from "node:assert/strict";
import {shellMenuSurface, startIntent} from "../shell_menu_pad.js";

test("the pad drives whichever shell menu is open, and stands down for the toy fight", () => {
  assert.equal(shellMenuSurface({toyFightOpen: false, settingsOpen: false, readyOpen: true}), "ready");
  assert.equal(shellMenuSurface({toyFightOpen: false, settingsOpen: true, readyOpen: true}), "settings",
    "settings covers the ready screen, so the pad must drive settings");
  assert.equal(shellMenuSurface({toyFightOpen: false, settingsOpen: false, readyOpen: false}), null,
    "no menu open means the flight mapping owns the pad");
  assert.equal(shellMenuSurface({toyFightOpen: true, settingsOpen: true, readyOpen: true}), null,
    "the toy fight overlay reads its own pads");
});

test("on the picker only a second pad's Start does anything: it joins 2P", () => {
  assert.equal(startIntent({surface: "ready", readyMode: "program", secondPad: true}), "join2p");
  assert.equal(startIntent({surface: "ready", readyMode: "program", secondPad: false}), null,
    "player one launches missions with A, not Start");
});

test("everywhere else Start is the Escape key", () => {
  assert.equal(startIntent({surface: null, readyMode: "", secondPad: false}), "escape", "in flight: pause");
  assert.equal(startIntent({surface: "ready", readyMode: "pause", secondPad: false}), "escape", "paused: resume");
  assert.equal(startIntent({surface: "ready", readyMode: "pause", secondPad: true}), "escape",
    "the second pad resumes too; joining happens from the picker or the toy fight's own card");
  assert.equal(startIntent({surface: "settings", readyMode: "program", secondPad: false}), "escape", "settings: close");
});
