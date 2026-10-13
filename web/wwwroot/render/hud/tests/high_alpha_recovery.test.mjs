import assert from "node:assert/strict";
import test from "node:test";

import { highAlphaRecoveryPresentation } from "../high_alpha_recovery.js";

const f22 = "aircraft.f22a.public-data-surrogate.v1";

test("F-22 high-alpha recovery presents the compact centre-stick cue", () => {
  assert.deepEqual(highAlphaRecoveryPresentation({
    player_aircraft_id: f22,
    high_alpha_recovery: true,
  }), {
    active: true,
    symbol: "→⊙←",
    label: "Centre pitch stick to re-arm high-alpha recovery",
  });
});

test("the cue is off when high-alpha recovery is not active", () => {
  assert.equal(highAlphaRecoveryPresentation({
    player_aircraft_id: f22,
    high_alpha_recovery: false,
  }).active, false);
  assert.equal(highAlphaRecoveryPresentation({ player_aircraft_id: f22 }).symbol, "");
});

test("other airframes stay frozen even if they publish the recovery flag", () => {
  const presentation = highAlphaRecoveryPresentation({
    player_aircraft_id: "aircraft.f14a.tomcat.v1",
    high_alpha_recovery: true,
  });
  assert.equal(presentation.active, false);
  assert.equal(presentation.symbol, "");
});
