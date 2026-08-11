import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  foxTwoLaunchEligible,
  MISSION_AUTHORITY_KIND,
  productionMissionAuthority,
  resolveInitialProgramSelection,
  sameMissionAuthority,
  topGunOwnsFoxTwoInput,
  topGunMissionAuthority,
} from "../mission_authority.js";

const appUrl = new URL("../../../app.js", import.meta.url);

const firstMerge = Object.freeze({ id: "first-merge", mission: 7 });
const topGun = Object.freeze({ id: "top-gun", mission: null });

for (const viewport of ["desktop", "portrait"]) {
  test(`${viewport}: blocked Top Gun deep link retains production selection and staging`, () => {
    const resolved = resolveInitialProgramSelection({
      requestedProgramNode: topGun,
      requestedExperience: topGun,
      requestedAccess: { allowed: false, preview: false },
      defaultProgramNode: firstMerge,
    });

    assert.equal(resolved.selectedProgramNode, firstMerge);
    assert.equal(resolved.blockedExperience, topGun);
    assert.deepEqual(productionMissionAuthority(
      resolved.selectedProgramNode.mission, 1), {
      kind: MISSION_AUTHORITY_KIND.PRODUCTION,
      beat: 7,
      deckConfiguration: 1,
    });
  });

  test(`${viewport}: acknowledged preview can stage Top Gun but leaving it forces production restage`, () => {
    const resolved = resolveInitialProgramSelection({
      requestedProgramNode: topGun,
      requestedExperience: topGun,
      requestedAccess: { allowed: true, preview: true },
      defaultProgramNode: firstMerge,
    });
    assert.equal(resolved.selectedProgramNode, topGun);
    assert.equal(resolved.blockedExperience, null);

    const staged = topGunMissionAuthority(1);
    const selectedProduction = productionMissionAuthority(7, 1);
    assert.equal(sameMissionAuthority(staged, selectedProduction), false,
      "a production card must not reuse Top Gun authority even when its beat is the old default");
    assert.equal(sameMissionAuthority(staged, topGunMissionAuthority(1)), true);
    assert.equal(sameMissionAuthority(staged, topGunMissionAuthority(0)), false);
  });
}

test("blocked deep-link boot crosses only production staging while preview boot is gated", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source,
    /let selectedProgramNodeId = initialProgramNode\.id;/,
    "the blocked requested preview may not become selected authority");
  assert.match(source,
    /bridge\.StartBeat\(selectedBeat\);[\s\S]*?stagedMissionAuthority = selectedProductionMissionAuthority\(\);[\s\S]*?if \(isTopGunProgram\(\)[\s\S]*?!blockedProgramExperience[\s\S]*?experienceAccess\(TOP_GUN_PROGRAM_ID, window\.location\)\.allowed\)[\s\S]*?stageTopGunOnBridge\(\)/,
    "boot must establish production first and cross StartTopGun only after fail-closed access");
});

for (const sessionPhase of ["READY", "PAUSED", "ACTIVE", "FINISHED"]) {
  test(`${sessionPhase}: staged Top Gun retains exclusive R ownership`, () => {
    assert.equal(topGunOwnsFoxTwoInput({
      selectedProgramId: "top-gun",
      stagedAuthority: topGunMissionAuthority(0),
      // Deliberately outside the helper contract: session phase must not affect routing ownership.
      sessionPhase,
    }), true);
  });
}

test("executable R route separates phase-independent ownership from launch eligibility", () => {
  for (const sessionPhase of ["READY", "PAUSED", "ACTIVE", "FINISHED"]) {
    const owns = topGunOwnsFoxTwoInput({
      selectedProgramId: "top-gun",
      stagedAuthority: topGunMissionAuthority(0),
    });
    const launches = foxTwoLaunchEligible({
      bridgeAvailable: true,
      snapshotIsTopGun: true,
      pauseCount: 0,
      snapshotFrozen: false,
      replayActive: false,
      sessionPhase,
    });
    assert.equal(owns, true, `${sessionPhase} may never route R to restart`);
    assert.equal(launches, sessionPhase === "ACTIVE",
      `${sessionPhase} launch eligibility`);
  }
  assert.equal(foxTwoLaunchEligible({
    bridgeAvailable: true,
    snapshotIsTopGun: true,
    sessionPhase: "ACTIVE",
    snapshotFrozen: true,
  }), false);
  assert.equal(foxTwoLaunchEligible({
    bridgeAvailable: true,
    snapshotIsTopGun: true,
    sessionPhase: "ACTIVE",
    replayActive: true,
  }), false);
  assert.equal(topGunOwnsFoxTwoInput({
    selectedProgramId: "top-gun",
    stagedAuthority: topGunMissionAuthority(0),
    snapshotIsTopGun: false,
  }), true, "a transient stale snapshot may reject launch but cannot reassign R to restart");
});
