import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RemoteAssetResolutionPolicy } from "../remote_asset_policy.js";

const PACK = Object.freeze({ packId: "korea-1950s", profileId: "balanced" });

function policyHarness(presentationId, entityId, descriptorFor) {
  const policy = new RemoteAssetResolutionPolicy(presentationId, entityId);
  let activeKey = "";
  let descriptorAttempts = 0;
  let instantiations = 0;
  const resolve = () => {
    if (!policy.shouldAttemptDescriptor(PACK)) return;
    let descriptor;
    try {
      descriptorAttempts += 1;
      descriptor = descriptorFor(policy.presentationId);
    } catch {
      policy.rememberDescriptorFailure(PACK);
      return;
    }
    const key = policy.registryInstanceKey(PACK, descriptor.assetIdentity);
    if (key === activeKey) return;
    activeKey = key;
    instantiations += 1;
  };
  return {
    policy,
    resolve,
    counts: () => ({ descriptorAttempts, instantiations }),
  };
}

test("one presentation survives one hundred entity rotations without reallocating", () => {
  const harness = policyHarness(
    "presentation.vehicle.player.v1",
    "entity.initial",
    () => ({ assetIdentity: "models/player-lod1.glb" }),
  );
  harness.resolve();
  for (let index = 0; index < 100; index += 1) {
    const update = harness.policy.update(
      "presentation.vehicle.player.v1", `entity.rotated.${index}`,
    );
    assert.equal(update.presentationChanged, false);
    harness.resolve();
  }
  assert.deepEqual(harness.counts(), { descriptorAttempts: 101, instantiations: 1 });
});

test("an unknown normalized presentation throws one descriptor error, not one per entity", () => {
  const harness = policyHarness(
    " \u0000presentation.unknown.peer.v1\u0007 ",
    "entity.initial",
    () => { throw new Error("unbound presentation"); },
  );
  assert.equal(harness.policy.presentationId, "presentation.unknown.peer.v1");
  harness.resolve();
  for (let index = 0; index < 100; index += 1) {
    harness.policy.update("presentation.unknown.peer.v1", `entity.rotated.${index}`);
    harness.resolve();
  }
  assert.deepEqual(harness.counts(), { descriptorAttempts: 1, instantiations: 0 });
});

test("one real presentation change creates exactly one replacement instance", () => {
  const harness = policyHarness(
    "presentation.vehicle.player.v1",
    "entity.stable",
    (presentationId) => ({ assetIdentity: `${presentationId}.glb` }),
  );
  harness.resolve();
  const update = harness.policy.update(
    "presentation.vehicle.glider-strike.v1", "entity.stable",
  );
  assert.equal(update.presentationChanged, true);
  harness.resolve();
  harness.resolve();
  assert.deepEqual(harness.counts(), { descriptorAttempts: 3, instantiations: 2 });
});

test("production dynamic slots are wired through the tested remote allocation policy", async () => {
  const source = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
  assert.match(source, /new RemoteAssetResolutionPolicy\(presentationId, entityId\)/);
  assert.match(source, /slot\.remoteAssetPolicy\.update\(presentationId, entityId\)/);
  assert.match(source, /remoteAssetPolicy\.shouldAttemptDescriptor\(descriptorScope\)/);
  assert.match(source, /remoteAssetPolicy\.registryInstanceKey\(descriptorScope, assetIdentity\)/);
});
