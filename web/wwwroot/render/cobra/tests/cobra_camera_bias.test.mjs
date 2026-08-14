import test from "node:test";
import assert from "node:assert/strict";
import {
  COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD,
  COBRA_PADLOCK_LOS_GRACE_MS,
  acquireAuthorityVisualLockTarget,
  advancePadlockLosGrace,
  clampInducedLookRotation,
  lookOffsetFromAngles,
  nextHostileTargetId,
  resolveAuthorityLookAtPoint,
} from "../cobra_camera_bias.js";

test("production east-heading forward look is exactly body-aligned", () => {
  const distanceM = 140;
  const offset = lookOffsetFromAngles(Math.PI / 2, 0, distanceM);
  assert.ok(Math.abs(offset.x - distanceM) < 1e-9);
  assert.ok(Math.abs(offset.y) < 1e-9);
  assert.ok(Math.abs(offset.z) < 1e-9);
});

test("soft cueing stays inside the windshield bias cap", () => {
  assert.equal(COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD, 0.05);
  const clamped = clampInducedLookRotation(
    { yawRad: 0, pitchRad: 0 },
    { yawRad: 0.4, pitchRad: -0.3 },
  );
  assert.ok(Math.abs(clamped.yawRad) <= COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD + 1e-9);
  assert.ok(Math.abs(clamped.pitchRad) <= COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD + 1e-9);
});

test("soft cueing takes the short yaw wrap across ±π", () => {
  const baseYaw = Math.PI - 0.01;
  const clamped = clampInducedLookRotation(
    { yawRad: baseYaw, pitchRad: 0 },
    { yawRad: -Math.PI + 0.2, pitchRad: 0 },
  );
  const applied = Math.atan2(
    Math.sin(clamped.yawRad - baseYaw),
    Math.cos(clamped.yawRad - baseYaw),
  );
  assert.ok(applied > 0, "short-way wrap must advance toward -π from +π");
  assert.ok(applied <= COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD + 1e-9);
});

test("soft cueing is a no-op when already on the desired look", () => {
  const clamped = clampInducedLookRotation(
    { yawRad: 0.1, pitchRad: -0.05 },
    { yawRad: 0.1, pitchRad: -0.05 },
  );
  assert.equal(clamped.yawRad, 0.1);
  assert.equal(clamped.pitchRad, -0.05);
});

test("Tab cycles hostiles like the F-22 gun-target list", () => {
  const ids = ["seam", "near", "far"];
  assert.equal(nextHostileTargetId(ids, null), "seam");
  assert.equal(nextHostileTargetId(ids, "seam"), "near");
  assert.equal(nextHostileTargetId(ids, "far"), "seam");
  assert.equal(nextHostileTargetId([], "seam"), null);
});

test("V skips an occluded mark and atomically assigns the first authority-visible hostile", () => {
  const calls = [];
  let gunnerTargetId = null;
  const acquired = acquireAuthorityVisualLockTarget({
    selectedTargetId: "masked",
    hostileTargetIds: ["near", "masked", "visible"],
    tryAcquire(targetId) {
      calls.push(targetId);
      if (targetId !== "visible") return false;
      gunnerTargetId = targetId;
      return true;
    },
  });

  assert.equal(acquired, "visible");
  assert.equal(gunnerTargetId, acquired, "visual lock and AI gunner must share one entity ID");
  assert.deepEqual(calls, ["masked", "visible"]);
});

test("V cannot acquire an occluded, dead, or friendly candidate", () => {
  const calls = [];
  const acquired = acquireAuthorityVisualLockTarget({
    selectedTargetId: "friendly-not-in-hostile-list",
    // Production builds this list from living hostiles only; authority still fails closed.
    hostileTargetIds: ["dead-stale", "occluded"],
    tryAcquire(targetId) {
      calls.push(targetId);
      return false;
    },
  });

  assert.equal(acquired, null);
  assert.deepEqual(calls, ["dead-stale", "occluded"]);
});

test("a sustained authority LOS loss breaks padlock after the short grace", () => {
  const maskedGunner = {
    selected_target_id: "hostile-1",
    state: "masked",
    reason: "Masked",
    target_has_line_of_sight: false,
  };
  const first = advancePadlockLosGrace({
    padlockActive: true,
    lockedTargetId: "hostile-1",
    gunner: maskedGunner,
    nowMs: 1_000,
  });
  assert.equal(first.padlockActive, true);
  assert.equal(first.maskedSinceMs, 1_000);

  const withinGrace = advancePadlockLosGrace({
    padlockActive: true,
    lockedTargetId: "hostile-1",
    gunner: maskedGunner,
    maskedSinceMs: first.maskedSinceMs,
    nowMs: 1_000 + COBRA_PADLOCK_LOS_GRACE_MS - 1,
  });
  assert.equal(withinGrace.padlockActive, true);

  const expired = advancePadlockLosGrace({
    padlockActive: true,
    lockedTargetId: "hostile-1",
    gunner: maskedGunner,
    maskedSinceMs: withinGrace.maskedSinceMs,
    nowMs: 1_000 + COBRA_PADLOCK_LOS_GRACE_MS,
  });
  assert.deepEqual(expired, { padlockActive: false, maskedSinceMs: null });
});

test("clear LOS resets the grace and a stale pre-acquisition snapshot cannot break a new lock", () => {
  const clear = advancePadlockLosGrace({
    padlockActive: true,
    lockedTargetId: "hostile-1",
    gunner: {
      selected_target_id: "hostile-1",
      state: "tracking",
      target_has_line_of_sight: true,
    },
    maskedSinceMs: 100,
    nowMs: 300,
  });
  assert.deepEqual(clear, { padlockActive: true, maskedSinceMs: null });

  const stale = advancePadlockLosGrace({
    padlockActive: true,
    lockedTargetId: "new-hostile",
    gunner: { selected_target_id: "old-hostile", state: "masked" },
    nowMs: 400,
  });
  assert.deepEqual(stale, { padlockActive: true, maskedSinceMs: null });
});

test("padlock look-at owns the eye; forward view stays nose-forward", () => {
  const forward = { x: 1, y: 2, z: 3 };
  const unit = { x_m: 100, y_m: 40, z_m: -50 };
  assert.deepEqual(
    resolveAuthorityLookAtPoint({ padlockActive: false, selectedUnit: unit, forwardLook: forward }),
    { x: 1, y: 2, z: 3, mode: "forward" },
  );
  assert.deepEqual(
    resolveAuthorityLookAtPoint({ padlockActive: true, selectedUnit: unit, forwardLook: forward }),
    { x: 100, y: 41.2, z: 50, mode: "padlock" },
  );
  assert.equal(
    resolveAuthorityLookAtPoint({ padlockActive: true, selectedUnit: null, forwardLook: forward }).mode,
    "forward",
  );
});
