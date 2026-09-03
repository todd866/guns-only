import assert from "node:assert/strict";
import test from "node:test";

import {
  controlsOnboardingKeyAction,
  createControlsOnboarding,
  createNudgeScheduler,
  firstRunPending,
  markFirstRunSeen,
  onboardingStorageKey,
  resolveTouchControls,
  selectControlsContent,
} from "../first_run_controls.js";
import {
  COBRA_ONBOARDING_CONTENT,
  WEEKEND_RIDE_ONBOARDING_CONTENT,
} from "../controls_content.js";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

class FakeElement {
  constructor(doc, tagName) {
    this.ownerDocument = doc;
    this.tagName = String(tagName).toUpperCase();
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.hidden = false;
    this.inert = false;
    this.disabled = false;
    this.isConnected = false;
    this.id = "";
    this.className = "";
    this.textContent = "";
    this._listeners = new Map();
  }

  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentNode = this;
      child.setConnected(this.isConnected);
      this.children.push(child);
    }
  }

  setConnected(connected) {
    this.isConnected = connected;
    for (const child of this.children) child.setConnected(connected);
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  addEventListener(type, handler) {
    const handlers = this._listeners.get(type) ?? new Set();
    handlers.add(handler);
    this._listeners.set(type, handlers);
  }

  dispatchEvent(event) {
    for (const handler of this._listeners.get(event?.type) ?? []) {
      handler.call(this, event);
    }
    return true;
  }

  click() {
    this.dispatchEvent({ type: "click", target: this, stopPropagation() {} });
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
    this.setConnected(false);
  }

  closest(selector) {
    if (selector !== "[hidden], [inert]") return null;
    for (let node = this; node; node = node.parentNode) {
      if (node.hidden || node.inert) return node;
    }
    return null;
  }
}

class FakeDocument {
  constructor() {
    this._listeners = new Map();
    this.head = new FakeElement(this, "head");
    this.body = new FakeElement(this, "body");
    this.head.setConnected(true);
    this.body.setConnected(true);
    this.activeElement = this.body;
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  getElementById(id) {
    const visit = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(this.head) ?? visit(this.body);
  }

  addEventListener(type, handler) {
    const handlers = this._listeners.get(type) ?? new Set();
    handlers.add(handler);
    this._listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this._listeners.get(type)?.delete(handler);
  }

  dispatchEvent(event) {
    for (const handler of this._listeners.get(event?.type) ?? []) {
      handler.call(this, event);
    }
    return true;
  }
}

function createTestOnboarding(storage, doc = new FakeDocument(), overrides = {}) {
  return {
    doc,
    onboarding: createControlsOnboarding({
      modeId: WEEKEND_RIDE_ONBOARDING_CONTENT.modeId,
      content: WEEKEND_RIDE_ONBOARDING_CONTENT,
      storage,
      doc,
      touch: false,
      ...overrides,
    }),
  };
}

test("first run is pending exactly until the mode is marked seen", () => {
  const storage = memoryStorage();
  assert.equal(firstRunPending(storage, "cobra-hold-the-bridge"), true);
  markFirstRunSeen(storage, "cobra-hold-the-bridge");
  assert.equal(firstRunPending(storage, "cobra-hold-the-bridge"), false);
  // Another mode keeps its own flag: seeing the Cobra overlay must not eat the bike's.
  assert.equal(firstRunPending(storage, "weekend-ride"), true);
});

test("show then abort or reload leaves the controls lesson pending", () => {
  const storage = memoryStorage();
  const first = createTestOnboarding(storage);

  assert.equal(first.onboarding.maybeShowFirstRun(), true);
  assert.equal(first.onboarding.isOpen(), true);
  assert.equal(firstRunPending(storage, WEEKEND_RIDE_ONBOARDING_CONTENT.modeId), true);
  first.onboarding.dispose();

  const reload = createTestOnboarding(storage);
  assert.equal(reload.onboarding.maybeShowFirstRun(), true);
  assert.equal(reload.onboarding.isOpen(), true);
  reload.onboarding.dispose();
});

test("intentional acknowledgement suppresses the lesson on the next launch", () => {
  const storage = memoryStorage();
  const first = createTestOnboarding(storage);

  assert.equal(first.onboarding.maybeShowFirstRun(), true);
  first.doc.getElementById("controls-onboarding-dismiss").click();
  assert.equal(firstRunPending(storage, WEEKEND_RIDE_ONBOARDING_CONTENT.modeId), false);
  first.onboarding.dispose();

  const reload = createTestOnboarding(storage);
  assert.equal(reload.onboarding.maybeShowFirstRun(), false);
  assert.equal(reload.onboarding.isOpen(), false);
  reload.onboarding.dispose();
});

test("storage keys are namespaced per mode", () => {
  assert.equal(
    onboardingStorageKey("weekend-ride"),
    "guns-only.onboarding.weekend-ride",
  );
  assert.notEqual(
    onboardingStorageKey("cobra-hold-the-bridge"),
    onboardingStorageKey("weekend-ride"),
  );
});

test("a throwing storage (private mode) never crashes and stays pending", () => {
  const broken = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
  };
  assert.equal(firstRunPending(broken, "weekend-ride"), true);
  assert.doesNotThrow(() => markFirstRunSeen(broken, "weekend-ride"));
  // Absent storage entirely behaves the same.
  assert.equal(firstRunPending(null, "weekend-ride"), true);
  assert.doesNotThrow(() => markFirstRunSeen(null, "weekend-ride"));
});

test("touch resolution follows the F-22 shell contract", () => {
  // Genuine coarse pointer is touch regardless of viewport.
  assert.equal(resolveTouchControls({
    coarsePointer: true, touchCapable: true, smallViewport: false, touchPreview: false,
  }), true);
  // Touch-capable laptop with a large viewport stays on keyboard content.
  assert.equal(resolveTouchControls({
    coarsePointer: false, touchCapable: true, smallViewport: false, touchPreview: false,
  }), false);
  // Touch-capable small viewport is touch.
  assert.equal(resolveTouchControls({
    coarsePointer: false, touchCapable: true, smallViewport: true, touchPreview: false,
  }), true);
  // The localhost ?input=touch QA seam forces touch, same as app.js.
  assert.equal(resolveTouchControls({
    coarsePointer: false, touchCapable: false, smallViewport: false, touchPreview: true,
  }), true);
  // Plain desktop is keyboard.
  assert.equal(resolveTouchControls({
    coarsePointer: false, touchCapable: false, smallViewport: false, touchPreview: false,
  }), false);
});

test("the controls dialog owns keys until an explicit acknowledgement", () => {
  assert.equal(controlsOnboardingKeyAction({ open: false, code: "KeyW" }), "ignore");
  assert.equal(controlsOnboardingKeyAction({ open: false, code: "KeyH" }), "toggle");
  assert.equal(controlsOnboardingKeyAction({
    open: false,
    code: "KeyH",
    reopenKeyCode: "KeyQ",
  }), "ignore");
  assert.equal(controlsOnboardingKeyAction({
    open: false,
    code: "KeyQ",
    reopenKeyCode: "KeyQ",
  }), "toggle");
  assert.equal(controlsOnboardingKeyAction({ open: true, code: "KeyH" }), "toggle");
  assert.equal(controlsOnboardingKeyAction({ open: true, code: "Escape" }), "dismiss");
  assert.equal(controlsOnboardingKeyAction({ open: true, code: "Tab" }), "trap-focus");
  assert.equal(controlsOnboardingKeyAction({ open: true, code: "KeyW" }), "block");
  assert.equal(controlsOnboardingKeyAction({ open: true, code: "Space" }), "block");
  assert.equal(controlsOnboardingKeyAction({
    open: true,
    code: "Space",
    onDismissAction: true,
  }), "acknowledge");
  assert.equal(controlsOnboardingKeyAction({
    open: true,
    code: "Enter",
    onDismissAction: true,
  }), "acknowledge");
});

test("a route-owned modal blocks both H and the controls chip until it releases ownership", () => {
  const storage = memoryStorage();
  const lock = { active: true };
  const fixture = createTestOnboarding(storage, new FakeDocument(), {
    canOpen: () => !lock.active,
  });
  let prevented = 0;
  let stopped = 0;
  const h = {
    type: "keydown",
    code: "KeyH",
    target: fixture.doc.body,
    preventDefault() { prevented += 1; },
    stopImmediatePropagation() { stopped += 1; },
  };

  fixture.doc.dispatchEvent(h);
  assert.equal(fixture.onboarding.isOpen(), false,
    "H must not stack controls over a route-owned modal");
  assert.deepEqual([prevented, stopped], [0, 0],
    "a refused controls shortcut must leave input ownership with the route modal");
  fixture.doc.getElementById("controls-onboarding-reopen").click();
  assert.equal(fixture.onboarding.isOpen(), false,
    "the persistent chip must obey the same modal lock");
  assert.equal(fixture.onboarding.maybeShowFirstRun(), false,
    "first-run wiring must not report a card that the route lock refused to show");
  assert.equal(firstRunPending(storage, WEEKEND_RIDE_ONBOARDING_CONTENT.modeId), true,
    "a refused first-run card must remain pending for a later deliberate acknowledgement");

  lock.active = false;
  fixture.doc.dispatchEvent(h);
  assert.equal(fixture.onboarding.isOpen(), true,
    "the controls reference must reopen once the route releases ownership");
  assert.deepEqual([prevented, stopped], [1, 1],
    "an accepted controls shortcut must own the input event");
  fixture.onboarding.dispose();
});

test("content selection returns the touch variant only for touch", () => {
  for (const content of [COBRA_ONBOARDING_CONTENT, WEEKEND_RIDE_ONBOARDING_CONTENT]) {
    const desktop = selectControlsContent(content, { touch: false });
    const touch = selectControlsContent(content, { touch: true });
    assert.equal(desktop.title, content.title);
    assert.equal(touch.title, content.title);
    assert.notDeepEqual(desktop.groups, touch.groups);
    for (const variant of [desktop, touch]) {
      assert.ok(Array.isArray(variant.groups) && variant.groups.length > 0);
      for (const group of variant.groups) {
        assert.ok(group.label.length > 0);
        assert.ok(group.rows.length > 0);
        for (const [keys, meaning] of group.rows) {
          assert.ok(keys.length > 0);
          assert.ok(meaning.length > 0);
        }
      }
    }
  }
});

test("cobra desktop content teaches the mission loop before the controls", () => {
  const { groups } = selectControlsContent(COBRA_ONBOARDING_CONTENT, { touch: false });
  const labels = groups.map((group) => group.label);
  assert.deepEqual(labels, ["MISSION", "FLY", "FIGHT", "SYSTEM"]);
  assert.deepEqual(groups[0].rows, [
    ["BREAK", "Destroy the gun pit and clear the point"],
    ["COVER", "Protect the inbound squad while it captures"],
    ["HOLD", "A point majority drains enemy tickets"],
    ["RECOVER", "After the ticket result, land stable at Camp Ember"],
    ["M · MAP", "Score and captures — the fight keeps running"],
  ]);
  const flat = groups.flatMap((group) => group.rows.map((row) => row.join(" "))).join("\n");
  // W collective up is the owner-ruled game convention (Build 264+).
  assert.match(flat, /W \/ S/);
  assert.match(flat, /[Cc]ollective up/);
  assert.match(flat, /[Cc]yclic/);
  assert.match(flat, /[Pp]edals/);
  assert.match(flat, /Tab \/ LB/);
  assert.match(flat, /hold F \/ RB/);
  assert.match(flat, /E Shut down a damaged bird · start the spare/);
  assert.match(flat, /LB target · hold RB gunner/);
  assert.doesNotMatch(flat, /Flight controls only/);
});

test("weekend ride desktop content covers ride, gearbox and system", () => {
  const { groups } = selectControlsContent(WEEKEND_RIDE_ONBOARDING_CONTENT, { touch: false });
  const labels = groups.map((group) => group.label);
  assert.deepEqual(labels, ["RIDE", "GEARBOX", "SYSTEM"]);
  const flat = groups.flatMap((group) => group.rows.map((row) => row.join(" "))).join("\n");
  assert.match(flat, /[Tt]hrottle/);
  assert.match(flat, /[Bb]rake/);
  assert.match(flat, /Q \/ E/);
  assert.match(flat, /Esc/);
});

test("touch variants are honest: no bare keyboard keys sold as touch controls", () => {
  for (const content of [COBRA_ONBOARDING_CONTENT, WEEKEND_RIDE_ONBOARDING_CONTENT]) {
    const { groups } = selectControlsContent(content, { touch: true });
    const keyCells = groups.flatMap((group) => group.rows.map((row) => row[0]));
    // These missions have no touch control surface today; the touch card must say
    // keyboard/gamepad, not pretend W is a button on the glass.
    assert.ok(keyCells.some((cell) => /keyboard/i.test(cell)));
    assert.ok(keyCells.some((cell) => /gamepad/i.test(cell)));
  }
});

test("nudge scheduler fires after the hold time, once, and retires on clear", () => {
  const scheduler = createNudgeScheduler([
    { id: "lift", text: "HOLD W — COLLECTIVE UP", when: (s) => s.groundedIdle, afterSeconds: 3 },
  ]);
  // Held for less than the threshold: silent.
  assert.equal(scheduler.advance({ groundedIdle: true }, 2.9), null);
  // Condition breaks: accumulation resets.
  assert.equal(scheduler.advance({ groundedIdle: false }, 1), null);
  assert.equal(scheduler.advance({ groundedIdle: true }, 2.9), null);
  // Crossing the threshold fires.
  const active = scheduler.advance({ groundedIdle: true }, 0.2);
  assert.equal(active?.id, "lift");
  // Stays up while the condition holds.
  assert.equal(scheduler.advance({ groundedIdle: true }, 5)?.id, "lift");
  // Player acts, condition clears: the nudge retires and never nags again.
  assert.equal(scheduler.advance({ groundedIdle: false }, 0.1), null);
  assert.equal(scheduler.advance({ groundedIdle: true }, 60), null);
});

test("nudges are prioritised in definition order and one shows at a time", () => {
  const scheduler = createNudgeScheduler([
    { id: "first", text: "A", when: (s) => s.a, afterSeconds: 1 },
    { id: "second", text: "B", when: (s) => s.b, afterSeconds: 1 },
  ]);
  const active = scheduler.advance({ a: true, b: true }, 1.5);
  assert.equal(active?.id, "first");
  // Retire the first; the second may then surface on its own accumulated hold.
  assert.equal(scheduler.advance({ a: false, b: true }, 0.1)?.id, "second");
});

test("nudge definitions validate their shape", () => {
  assert.throws(() => createNudgeScheduler([{ id: "x", text: "" }]), /when/);
  assert.throws(() => createNudgeScheduler("nope"), /array/);
});
