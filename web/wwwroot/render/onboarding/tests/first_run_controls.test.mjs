import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("first run is pending exactly until the mode is marked seen", () => {
  const storage = memoryStorage();
  assert.equal(firstRunPending(storage, "cobra-hold-the-bridge"), true);
  markFirstRunSeen(storage, "cobra-hold-the-bridge");
  assert.equal(firstRunPending(storage, "cobra-hold-the-bridge"), false);
  // Another mode keeps its own flag: seeing the Cobra overlay must not eat the bike's.
  assert.equal(firstRunPending(storage, "weekend-ride"), true);
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
    ["BREAK", "Kill the garrison and clear the point"],
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
  assert.match(flat, /Tab/);
  assert.match(flat, /F/);
  assert.match(flat, /E Shut down a damaged bird · start the spare/);
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
