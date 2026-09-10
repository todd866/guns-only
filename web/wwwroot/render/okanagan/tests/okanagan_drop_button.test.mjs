import test from "node:test";
import assert from "node:assert/strict";
import { bindOkanaganDropButton } from "../okanagan_drop_button.js";

// Route pointer events through capture, as the DOM does. An outside release deliberately
// misses the button unless the production binding has actually requested capture.
function pointerSurface() {
  const captures = new Map();
  const button = new EventTarget();
  const outside = new EventTarget();
  const pointerEvent = (type, pointerId) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    return event;
  };
  button.setPointerCapture = (id) => captures.set(id, button);
  button.releasePointerCapture = (id) => {
    if (captures.get(id) !== button) return;
    captures.delete(id);
    button.dispatchEvent(pointerEvent("lostpointercapture", id));
  };
  return {
    button, outside, captures,
    send(type, pointerId = 7, target = button) {
      const event = pointerEvent(type, pointerId);
      (captures.get(pointerId) ?? target).dispatchEvent(event);
      return event;
    },
    loseCapture(pointerId = 7) { button.releasePointerCapture(pointerId); },
  };
}

test("press, drag outside, and release ends the water-drop hold", () => {
  const surface = pointerSurface();
  const changes = [];
  bindOkanaganDropButton(surface.button, { canPress: () => true, onChange: value => changes.push(value) });
  assert.equal(surface.send("pointerdown").defaultPrevented, true);
  assert.equal(surface.captures.get(7), surface.button);
  surface.send("pointermove", 7, surface.outside);
  surface.send("pointerup", 7, surface.outside);
  assert.deepEqual(changes, [true, false]);
  assert.equal(surface.captures.size, 0);
});

test("pointer cancellation and lost capture each release once", () => {
  for (const end of [surface => surface.send("pointercancel"), surface => surface.loseCapture()]) {
    const surface = pointerSurface();
    const changes = [];
    bindOkanaganDropButton(surface.button, { canPress: () => true, onChange: value => changes.push(value) });
    surface.send("pointerdown");
    end(surface);
    surface.send("pointerup");
    assert.deepEqual(changes, [true, false], "a later up/capture event cannot repeat the release");
    assert.equal(surface.captures.size, 0);
  }
});

test("paused, inactive, and terminal mission states cannot begin a drop", () => {
  for (const state of [
    { running: true, paused: true, terminal: false },
    { running: false, paused: false, terminal: false },
    { running: true, paused: false, terminal: true },
  ]) {
    const surface = pointerSurface();
    const changes = [];
    bindOkanaganDropButton(surface.button, {
      canPress: () => state.running && !state.paused && !state.terminal,
      onChange: value => changes.push(value),
    });
    surface.send("pointerdown");
    assert.deepEqual(changes, []);
    assert.equal(surface.captures.size, 0);
  }
});

test("a second finger cannot steal or release the first pointer's hold", () => {
  const surface = pointerSurface();
  const changes = [];
  bindOkanaganDropButton(surface.button, { canPress: () => true, onChange: value => changes.push(value) });
  surface.send("pointerdown", 7);
  surface.send("pointerdown", 9);
  surface.send("pointerup", 9);
  assert.deepEqual(changes, [true]);
  assert.equal(surface.captures.has(9), false);
  surface.send("pointerup", 7, surface.outside);
  assert.deepEqual(changes, [true, false]);
});

test("focus/pause/restart release clears capture and permits a fresh press", () => {
  const surface = pointerSurface();
  const changes = [];
  const control = bindOkanaganDropButton(surface.button, {
    canPress: () => true, onChange: value => changes.push(value),
  });
  surface.send("pointerdown");
  control.release();
  control.release();
  surface.send("pointerup", 7, surface.outside);
  assert.deepEqual(changes, [true, false]);
  assert.equal(surface.captures.size, 0);
  surface.send("pointerdown", 11);
  control.dispose();
  surface.send("pointerdown", 12);
  assert.deepEqual(changes, [true, false, true, false]);
  assert.equal(surface.captures.size, 0);
});
