import assert from "node:assert/strict";
import test from "node:test";

import {
  FIRST_RUN_VALLEY_STORAGE_KEY,
  firstRunValleyPending,
  markFirstRunValleySeen,
  shouldAutoStartFirstRunValley,
  touchFireAriaLabel,
  touchFireVisibleLabel,
} from "../first_run_valley.js";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

test("storage key sits in the guns-only onboarding family without colliding with mode overlays", () => {
  assert.equal(FIRST_RUN_VALLEY_STORAGE_KEY, "guns-only.first-run-valley");
  assert.match(FIRST_RUN_VALLEY_STORAGE_KEY, /^guns-only\./);
  assert.notEqual(FIRST_RUN_VALLEY_STORAGE_KEY, "guns-only.onboarding.first-run-valley");
});

test("first-run valley is pending until the visit is stamped seen", () => {
  const storage = memoryStorage();
  assert.equal(firstRunValleyPending(storage), true);
  markFirstRunValleySeen(storage);
  assert.equal(firstRunValleyPending(storage), false);
  assert.equal(storage.getItem(FIRST_RUN_VALLEY_STORAGE_KEY), "seen");
});

test("a throwing storage never crashes and stays pending", () => {
  const broken = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
  };
  assert.equal(firstRunValleyPending(broken), true);
  assert.doesNotThrow(() => markFirstRunValleySeen(broken));
  assert.equal(firstRunValleyPending(null), true);
  assert.doesNotThrow(() => markFirstRunValleySeen(null));
});

test("first pending visit with no other programme query stages the guided valley", () => {
  assert.equal(shouldAutoStartFirstRunValley({
    firstRunPending: true,
    programQuery: null,
    menuQuery: null,
    firstRunQuery: null,
    webdriver: false,
  }), true);
  assert.equal(shouldAutoStartFirstRunValley({
    firstRunPending: true,
    programQuery: "first-merge",
    webdriver: false,
  }), true);
});

test("return visits and explicit menu keep the six-tile picker", () => {
  assert.equal(shouldAutoStartFirstRunValley({
    firstRunPending: false,
    webdriver: false,
  }), false);
  assert.equal(shouldAutoStartFirstRunValley({
    firstRunPending: true,
    menuQuery: "1",
    webdriver: false,
  }), false);
});

test("Playwright keeps the picker unless firstRun=1", () => {
  assert.equal(shouldAutoStartFirstRunValley({
    firstRunPending: true,
    webdriver: true,
  }), false);
  assert.equal(shouldAutoStartFirstRunValley({
    firstRunPending: false,
    firstRunQuery: "1",
    webdriver: true,
  }), true, "QA replay must still skip Ready even when already seen");
  assert.equal(shouldAutoStartFirstRunValley({
    firstRunPending: false,
    firstRunQuery: "1",
    webdriver: false,
  }), true);
});

test("other programme deep links never steal the first-run valley", () => {
  for (const programQuery of ["top-gun", "rapier-intercept", "cobra-lab", "casevac"]) {
    assert.equal(shouldAutoStartFirstRunValley({
      firstRunPending: true,
      programQuery,
      webdriver: false,
    }), false, programQuery);
  }
});

test("menu=1 wins over an unseen first visit, but firstRun=1 wins over menu", () => {
  assert.equal(shouldAutoStartFirstRunValley({
    firstRunPending: true,
    menuQuery: "1",
    firstRunQuery: "1",
    webdriver: false,
  }), false, "explicit picker request is the stronger product door");
});

test("touch Fire names the weapon that the overloaded control will actually release", () => {
  assert.equal(touchFireAriaLabel({
    mission_definition_id: "mission.modern.visual-merge.first-run-valley.v1",
    aim9_remaining: 2,
  }), "Fire missile");
  assert.equal(touchFireAriaLabel({
    mission_definition_id: "mission.modern.visual-merge.first-run-valley.v1",
    aim9_remaining: 0,
  }), "Fire guns");
  assert.equal(touchFireAriaLabel({
    mission_definition_id: "mission.modern.visual-merge.v1",
    aim9_remaining: null,
  }), "Fire guns");
  assert.equal(touchFireAriaLabel({
    presentation_theme: "top-gun-anime-1986",
    aim9_remaining: 2,
  }), "Fire guns", "Top Gun keeps F/FIRE as guns; R is Fox-2");
  assert.equal(touchFireVisibleLabel({
    mission_definition_id: "mission.modern.visual-merge.first-run-valley.v1",
    aim9_remaining: 2,
  }), "FOX 2");
  assert.equal(touchFireVisibleLabel({
    mission_definition_id: "mission.modern.visual-merge.first-run-valley.v1",
    aim9_remaining: 0,
  }), "GUNS");
  assert.equal(touchFireVisibleLabel({
    mission_definition_id: "mission.top-gun.dact.v1",
    aim9_remaining: 2,
  }), "FIRE");
});
