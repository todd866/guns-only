import assert from "node:assert/strict";
import test from "node:test";

import { projectCasevacAudioState } from "../casevac_audio.js";

test("projects Medevac cabin audio only from authoritative flight facts", () => {
  assert.deepEqual(projectCasevacAudioState({
    casevac_applied_power_w: 975000,
    casevac_available_power_w: 1950000,
    casevac_lateral_speed_mps: 16,
    casevac_vertical_speed_mps: -1.5,
    casevac_vehicle_flyable: true,
  }), {
    power01: 0.5,
    groundspeed01: 0.5,
    verticalSpeed01: 0.5,
    flyable: true,
  });
});

test("fails finite and bounded for partial or broken observer state", () => {
  assert.deepEqual(projectCasevacAudioState({
    casevac_applied_power_w: Number.NaN,
    casevac_available_power_w: -4,
    casevac_lateral_speed_mps: 999,
    casevac_vertical_speed_mps: -999,
    casevac_vehicle_flyable: false,
  }), {
    power01: 0,
    groundspeed01: 1,
    verticalSpeed01: 1,
    flyable: false,
  });
});
