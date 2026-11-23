import test from "node:test";
import assert from "node:assert/strict";
import {createMenuPad} from "../../pad/gamepad_menu.js";
import {shellMenuSurface, startIntent} from "../shell_menu_pad.js";

function button(x, y, {disabled = false} = {}) {
  const classes = new Set();
  return {
    tagName: "BUTTON",
    offsetParent: {},
    disabled,
    hidden: false,
    focused: 0,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    focus() {
      this.focused += 1;
    },
    click() {
      this.clicked = true;
    },
    getBoundingClientRect: () => ({left: x - 10, width: 20, top: y - 10, height: 20}),
  };
}

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

test("requirePad never steals focus when zero gamepads are connected and clears .pad-focus on disconnect", () => {
  const card = button(0, 0);
  const start = button(100, 100);
  const root = {querySelectorAll: () => [card, start]};
  const poll = createMenuPad({root: () => root, back() {}, initial: () => start, requirePad: true});

  assert.equal(poll([], 0), false);
  assert.equal(card.focused, 0);
  assert.equal(start.focused, 0);
  assert.equal(card.classList.contains("pad-focus"), false);
  assert.equal(start.classList.contains("pad-focus"), false);

  poll([{connected: true, axes: [0, 0], buttons: []}], 16);
  assert.equal(start.classList.contains("pad-focus"), true);
  assert.equal(start.focused, 1);

  assert.equal(poll([], 32), false);
  assert.equal(start.classList.contains("pad-focus"), false);
});
