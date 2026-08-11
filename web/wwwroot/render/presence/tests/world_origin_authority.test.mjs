import assert from "node:assert/strict";
import test from "node:test";

import { applyStableWorldOrigin } from "../world_origin_authority.js";

const online = Object.freeze({
  phase: "online",
  worldEpoch: "world.test",
  spawnOrigin: Object.freeze([1200, 0, -3400]),
});

test("a rejected custom mission origin is retried after production restage without reconnect", () => {
  let sharedMission = false;
  let calls = 0;
  const setWorldOrigin = (eastM, northM) => {
    calls += 1;
    assert.equal(eastM, 1200);
    assert.equal(northM, -3400);
    return sharedMission;
  };

  const topGun = applyStableWorldOrigin({ status: online, setWorldOrigin });
  assert.deepEqual(topGun, { applied: false, called: true, appliedKey: "" });

  sharedMission = true;
  const production = applyStableWorldOrigin({
    status: online,
    setWorldOrigin,
    // Mission restaging invalidates application even though the welcome itself is unchanged.
    appliedKey: "",
  });
  assert.equal(production.applied, true);
  assert.equal(production.called, true);
  assert.equal(production.appliedKey, "world.test|1200,0,-3400");
  assert.equal(calls, 2);

  const stable = applyStableWorldOrigin({
    status: online,
    setWorldOrigin,
    appliedKey: production.appliedKey,
  });
  assert.deepEqual(stable, { ...production, called: false });
  assert.equal(calls, 2);
});

test("non-online and malformed origins never cross the bridge", () => {
  let calls = 0;
  const setWorldOrigin = () => { calls += 1; return true; };
  for (const status of [
    null,
    { ...online, phase: "connecting" },
    { ...online, spawnOrigin: [0, null, 0] },
  ]) {
    assert.equal(applyStableWorldOrigin({ status, setWorldOrigin }).called, false);
  }
  assert.equal(calls, 0);
});
