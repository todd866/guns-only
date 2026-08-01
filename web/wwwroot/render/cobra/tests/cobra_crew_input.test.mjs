import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cobraCrewInputIntent } from "../cobra_crew_input.js";

const sensitivity = Object.freeze({
  yawRadiansPerPixel: 0.0027,
  pitchRadiansPerPixel: 0.00245,
});

test("trackpad motion always remains rear-seat pilot look", () => {
  const intent = cobraCrewInputIntent({
    ...sensitivity,
    deltaX: 10,
    deltaY: -10,
    selectedTargetId: "truck-2",
    padlockActive: true,
  });

  assert.deepEqual(intent.crew, {
    playerSeat: "rear-pilot",
    aiSeat: "front-copilot-gunner",
  });
  assert.ok(Math.abs(intent.pilot.look.yawDeltaRad - 0.027) < 1e-12);
  assert.ok(Math.abs(intent.pilot.look.pitchDeltaRad - 0.0245) < 1e-12);
  assert.equal(intent.pilot.selectedTargetId, "truck-2");
  assert.equal(intent.pilot.padlockActive, true);
  assert.equal("sightSlew" in intent.aiGunner, false);
  assert.equal("turretYaw" in intent.aiGunner, false);
  assert.equal("turretPitch" in intent.aiGunner, false);
});

test("the normal held fire action asks the AI gunner to engage the selected target", () => {
  const intent = cobraCrewInputIntent({
    ...sensitivity,
    selectedTargetId: 17,
    engageHeld: true,
  });

  assert.equal(intent.aiGunner.assignedTargetId, 17);
  assert.equal(intent.aiGunner.engagementConsent, true);
  assert.equal(intent.aiGunner.mayAttemptEngagement, true);
  assert.equal("fireCommand" in intent.aiGunner, false);
  assert.equal("trigger" in intent.aiGunner, false);
});

test("releasing F is an unambiguous cease-fire request", () => {
  const intent = cobraCrewInputIntent({
    ...sensitivity,
    selectedTargetId: "bunker-east",
    engageHeld: false,
  });

  assert.equal(intent.aiGunner.assignedTargetId, "bunker-east");
  assert.equal(intent.aiGunner.engagementConsent, false);
  assert.equal(intent.aiGunner.mayAttemptEngagement, false);
});

test("F without a selected target cannot authorize an invented engagement", () => {
  const intent = cobraCrewInputIntent({
    ...sensitivity,
    selectedTargetId: null,
    engageHeld: true,
  });

  assert.equal(intent.aiGunner.assignedTargetId, null);
  assert.equal(intent.aiGunner.engagementConsent, true);
  assert.equal(intent.aiGunner.mayAttemptEngagement, false);
});

test("padlock view is presentation state and does not change AI engagement authority", () => {
  const freeLook = cobraCrewInputIntent({
    ...sensitivity,
    selectedTargetId: "aaa-1",
    engageHeld: true,
  });
  const padlocked = cobraCrewInputIntent({
    ...sensitivity,
    selectedTargetId: "aaa-1",
    padlockActive: true,
    engageHeld: true,
  });

  assert.equal(freeLook.pilot.padlockActive, false);
  assert.equal(padlocked.pilot.padlockActive, true);
  assert.deepEqual(freeLook.aiGunner, padlocked.aiGunner);
});

test("vertical inversion changes look ergonomics without changing crew authority", () => {
  const normal = cobraCrewInputIntent({
    ...sensitivity,
    deltaY: 6,
    selectedTargetId: 42,
    engageHeld: true,
  });
  const inverted = cobraCrewInputIntent({
    ...sensitivity,
    deltaY: 6,
    invertY: true,
    selectedTargetId: 42,
    engageHeld: true,
  });

  assert.equal(normal.pilot.look.pitchDeltaRad, -inverted.pilot.look.pitchDeltaRad);
  assert.deepEqual(normal.aiGunner, inverted.aiGunner);
});

test("crew input validates explicit sensitivity, target IDs and transient booleans", () => {
  assert.throws(() => cobraCrewInputIntent(), /yawRadiansPerPixel/);
  assert.throws(() => cobraCrewInputIntent({
    ...sensitivity,
    deltaX: Number.NaN,
  }), /deltaX/);
  assert.throws(() => cobraCrewInputIntent({
    ...sensitivity,
    yawRadiansPerPixel: 0,
  }), /yawRadiansPerPixel/);
  assert.throws(() => cobraCrewInputIntent({
    ...sensitivity,
    selectedTargetId: 0,
  }), /selectedTargetId/);
  assert.throws(() => cobraCrewInputIntent({
    ...sensitivity,
    engageHeld: 1,
  }), /engageHeld/);
});

test("crew intent and every nested authority record are immutable", () => {
  const intent = cobraCrewInputIntent({ ...sensitivity });

  assert.equal(Object.isFrozen(intent), true);
  assert.equal(Object.isFrozen(intent.crew), true);
  assert.equal(Object.isFrozen(intent.pilot), true);
  assert.equal(Object.isFrozen(intent.pilot.look), true);
  assert.equal(Object.isFrozen(intent.aiGunner), true);
});

test("the crew-input contract remains quarantined from every browser runtime", async () => {
  const [productionSource, labSource] = await Promise.all([
    readFile(new URL("../../../app.js", import.meta.url), "utf8"),
    readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(productionSource, /cobra_crew_input\.js/);
  assert.doesNotMatch(labSource, /cobra_crew_input\.js/);
});
