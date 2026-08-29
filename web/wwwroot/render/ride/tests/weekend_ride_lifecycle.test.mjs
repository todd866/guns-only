import assert from "node:assert/strict";
import test from "node:test";

import { weekendRideEscapeAction } from "../weekend_ride_lifecycle.js";

test("Escape toggles a live ride between active and paused", () => {
  assert.equal(weekendRideEscapeAction(), "pause");
  assert.equal(weekendRideEscapeAction({ paused: true }), "resume");
});

test("Escape peels onboarding before it can pause the ride", () => {
  assert.equal(weekendRideEscapeAction({ onboardingOpen: true }), "dismiss-onboarding");
  assert.equal(weekendRideEscapeAction({ onboardingOpen: true, paused: true }),
    "dismiss-onboarding");
});

test("a terminal debrief cannot become a fake live pause", () => {
  assert.equal(weekendRideEscapeAction({ terminal: true }), "noop");
  assert.equal(weekendRideEscapeAction({ terminal: true, paused: true }), "noop");
});
