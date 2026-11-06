import test from "node:test";
import assert from "node:assert/strict";
import {HOLD_MS, TV_HOME, attachHold, goHome, startDown} from "./return.mjs";

function pad(down) {
  const buttons = Array.from({length: 16}, () => ({value: 0, pressed: false}));
  if (down) buttons[9] = {value: 1, pressed: true};
  return {connected: true, buttons};
}

test("Start counts as held only while the button is down", () => {
  assert.equal(startDown(null), false);
  assert.equal(startDown([null, {buttons: []}]), false);
  assert.equal(startDown([pad(false)]), false);
  assert.equal(startDown([pad(false), pad(true)]), true);
  const half = pad(false);
  half.buttons[9] = {value: 0.4, pressed: false};
  assert.equal(startDown([half]), false);
});

test("holding Start for 1.5s returns home once, and a tap does not", () => {
  assert.equal(HOLD_MS, 1500);
  assert.equal(TV_HOME, "/tv/");
  let now = 0;
  let pads = [pad(true)];
  const gone = [];
  const tick = attachHold(() => pads, {
    now: () => now,
    go: () => gone.push(TV_HOME),
  });
  assert.equal(tick(), false);
  now = 1499;
  assert.equal(tick(), false);
  assert.deepEqual(gone, []);
  now = 1500;
  assert.equal(tick(), true);
  assert.deepEqual(gone, ["/tv/"]);
  now = 2000;
  assert.equal(tick(), false, "a hold that already tripped does not repeat");
  pads = [];
  now = 2100;
  assert.equal(tick(), false);
  pads = [pad(true)];
  now = 2100;
  assert.equal(tick(), false);
  now = 3600;
  assert.equal(tick(), true);
  assert.deepEqual(gone, ["/tv/", "/tv/"]);
});

test("letting go before 1.5s never leaves", () => {
  let now = 0;
  let pads = [pad(true)];
  const gone = [];
  const tick = attachHold(() => pads, {now: () => now, go: () => gone.push("x")});
  tick();
  now = 1400;
  tick();
  pads = [];
  now = 4000;
  tick();
  assert.deepEqual(gone, []);
});

test("goHome assigns /tv/", () => {
  let href = "";
  goHome({location: {assign(url) { href = url; }}});
  assert.equal(href, "/tv/");
});
