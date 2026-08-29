import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FirstRunWeaponsActionabilityLatch,
  firstRunCombatPresentationSuppressed,
  flightHudIsTerminal,
  flightMissionGuidance,
  missionGuidanceActionText,
  missionGuidanceLayout,
  recoveryGuidanceOwnsMissionCue,
  topGunControlQuicklookPresentation,
} from "../mission_guidance.js";

const FIRST_RUN = Object.freeze({
  visual_merge_evaluation: true,
  mission_definition_id: "mission.modern.visual-merge.first-run-valley.v1",
  weapons_inhibited: false,
});

const TOP_GUN = Object.freeze({
  visual_merge_evaluation: true,
  mission_definition_id: "mission.top-gun.acm.f14a-vs-mig28.v1",
  aim9_remaining: 2,
  aim9_in_flight: false,
  engagement_number: 1,
});

test("Top Gun quicklook reserves R for Fox Two and exposes O carrier RTB", () => {
  const quicklook = topGunControlQuicklookPresentation(TOP_GUN, {
    fireBinding: "F",
    rtbBinding: "O",
  });
  assert.deepEqual(quicklook, {
    weapons: "F GUNS · R FOX TWO ×2",
    foxTwo: "R FOX TWO ×2",
    returnToCarrier: "O RTB TO CARRIER",
  });
  assert.doesNotMatch(Object.values(quicklook).join(" · "), /RESTART|Z (?:MISSILE|SHORT-RANGE)/);
  assert.equal(topGunControlQuicklookPresentation({
    mission_definition_id: "mission.modern.visual-merge.endurance.v1",
  }), null, "ordinary sorties retain their own restart and missile vocabulary");
});

test("HUD quicklook consumes the mission-aware Top Gun presentation", async () => {
  const hud = await readFile(new URL("../../../hud.js", import.meta.url), "utf8");
  assert.match(hud,
    /const topGunQuicklook = topGunControlQuicklookPresentation\(frame\.state,[\s\S]*?const restartOrRtbQuicklook = topGunQuicklook\?\.returnToCarrier \?\? "R  RESTART";/);
  assert.match(hud,
    /topGunQuicklook[\s\S]*?TOP GUN · \$\{topGunQuicklook\.weapons\} · \$\{topGunQuicklook\.returnToCarrier\}[\s\S]*?: "P  RAPIER MISSION AUTOMATION   ·   Z  SHORT-RANGE MISSILE"/,
    "Top Gun must branch around the generic Z missile legend");
  assert.match(hud,
    /foxTwoBinding: "R"/,
    "the objective strip must render the same fixed Top Gun Fox Two binding as input authority");
});

test("Top Gun objective strip owns engage, replacement choice, continuing fight, and RTB", () => {
  const engage = flightMissionGuidance(TOP_GUN);
  assert.equal(engage.id, "top-gun-engage");
  assert.equal(engage.objective, "ENGAGE THE BANDIT");
  assert.equal(engage.status, "GUNS HOT · FOX TWO ×2");
  assert.equal(missionGuidanceActionText(engage.primaryAction),
    "F · FIRE GUNS ON SOLUTION");
  assert.equal(missionGuidanceActionText(engage.secondaryAction),
    "R · LAUNCH FOX TWO");

  const missile = flightMissionGuidance({ ...TOP_GUN, aim9_in_flight: true });
  assert.equal(missile.id, "top-gun-fox-two-in-flight");
  assert.equal(missile.status, "FOX TWO IN FLIGHT");

  const replacement = flightMissionGuidance({
    ...TOP_GUN,
    opponent_replacement_pending: true,
    opponent_replacement_s: 2.34,
    rtb_available: true,
  });
  assert.equal(replacement.id, "top-gun-replacement");
  assert.equal(replacement.status, "NEXT BANDIT IN 2.3 SEC");
  assert.equal(replacement.primaryAction.label, "STAY FOR NEXT ENGAGEMENT");
  assert.equal(missionGuidanceActionText(replacement.secondaryAction),
    "O · RTB TO CARRIER");

  const continuing = flightMissionGuidance({
    ...TOP_GUN,
    engagement_number: 3,
    rtb_available: true,
  });
  assert.equal(continuing.id, "top-gun-continue");
  assert.equal(continuing.status, "ENGAGEMENT 3 · BANDIT LIVE");
  assert.equal(continuing.primaryAction.label, "CONTINUE THE FIGHT");
  assert.equal(missionGuidanceActionText(continuing.secondaryAction),
    "O · RTB TO CARRIER");

  const rtb = flightMissionGuidance({ ...TOP_GUN, player_rtb_active: true });
  assert.equal(rtb.id, "top-gun-rtb");
  assert.equal(rtb.objective, "RETURN TO THE CARRIER");
  assert.equal(rtb.primaryAction.label, "FOLLOW NAV TO THE INITIAL");
});

test("weapons-cold valley ingress suppresses combat presentation until the pop-out", () => {
  assert.equal(firstRunCombatPresentationSuppressed({
    ...FIRST_RUN,
    first_run_weapons_cold: true,
  }), true);
  assert.equal(firstRunCombatPresentationSuppressed({
    ...FIRST_RUN,
    first_run_weapons_cold: false,
  }), false, "contacts and firing cues return as soon as authority releases weapons");
  assert.equal(firstRunCombatPresentationSuppressed({
    mission_definition_id: "mission.modern.visual-merge.endurance.v1",
    first_run_weapons_cold: true,
  }), false, "the lesson gate must not hide contacts in other missions");
  assert.equal(firstRunCombatPresentationSuppressed(FIRST_RUN), false,
    "old recordings without durable valley authority keep their prior presentation");
});

test("cold-valley combat suppression keeps the non-combat lesson card visible", async () => {
  const hud = await readFile(new URL("../../../hud.js", import.meta.url), "utf8");
  assert.match(hud,
    /if \(!combatPresentationSuppressed\) \{[\s\S]*?drawGunSight[\s\S]*?drawBandit[\s\S]*?\}[\s\S]*?this\.drawVisualMergeWeaponsCue\(frame\);/,
    "contacts may hide on ingress, but FOLLOW VALLEY is still the pilot's next-action owner");
  assert.doesNotMatch(hud,
    /if \(!combatPresentationSuppressed\) this\.drawVisualMergeWeaponsCue/);
  assert.match(hud,
    /drawMobileTacticalState\(frame, display, \{ combatPresentationSuppressed \}\)/,
    "the phone rail must not leak target range, closure, gun state, or corner cues while cold");
});

test("Enter-valley stays FOLLOW VALLEY until an explicit authority promotion", () => {
  const cue = flightMissionGuidance({
    ...FIRST_RUN,
    aim9_remaining: 2,
    aim9_in_flight: false,
  });

  assert.equal(cue.id, "first-run-ingress");
  assert.equal(cue.objective, "REACH THE POP-OUT");
  assert.equal(cue.status, "WEAPONS SAFE · ARM AT POP-OUT");
  assert.equal(cue.primaryAction.label, "FOLLOW VALLEY NORTH");
  assert.equal(cue.interactive, false,
    "the valley interlock cannot be released by selecting the generic SAFE card");
  assert.doesNotMatch(`${cue.status} ${cue.primaryAction.label}`, /FIRE|MISSILE/);
});

test("the short WEAPONS HOT edge promotes once, persists, and resets per sortie", () => {
  const latch = new FirstRunWeaponsActionabilityLatch();
  const opening = {
    ...FIRST_RUN,
    player_entity_id: "player-1",
    aim9_remaining: 2,
    aim9_in_flight: false,
  };
  assert.equal(latch.update(opening), false);
  assert.equal(latch.update({
    ...opening,
    transition_cue: "WEAPONS HOT · FOX TWO",
  }), true);
  assert.equal(latch.update(opening), true,
    "the persistent card must not fall back when the short transition expires");
  assert.equal(latch.update({
    ...opening,
    player_entity_id: "player-2",
  }), false, "a new player entity starts back at FOLLOW VALLEY");

  assert.equal(latch.update({
    ...opening,
    player_entity_id: "player-2",
    aim9_remaining: 1,
  }), true, "a depleted magazine recovers actionability for a late HUD mount");
  assert.equal(latch.update({
    ...opening,
    player_entity_id: "player-2",
    aim9_remaining: 2,
    player_rtb_active: true,
  }), false, "a refilled legacy magazine is a new-sortie reset");
  assert.equal(latch.update({
    ...opening,
    player_entity_id: "player-2",
    player_rtb_active: true,
  }), false, "RTB presentation cannot arm a full-magazine valley latch");
  assert.equal(latch.update({
    ...opening,
    player_entity_id: "player-2",
    player_rtb_active: false,
  }), false, "clearing RTB without a release edge returns to FOLLOW VALLEY");
});

test("durable valley authority survives a missed transition cue and overrides stale edges", () => {
  const latch = new FirstRunWeaponsActionabilityLatch();
  const opening = {
    ...FIRST_RUN,
    player_entity_id: "player-authority",
    aim9_remaining: 2,
    aim9_in_flight: false,
    first_run_weapons_cold: true,
  };
  assert.equal(latch.update({
    ...opening,
    transition_cue: "WEAPONS HOT · FOX TWO",
  }), false, "persistent cold authority wins over a stale announcement");
  assert.equal(latch.update({
    ...opening,
    first_run_weapons_cold: false,
    transition_cue: "",
  }), true, "a late HUD mount still sees that the pop-out gate is open");
});

test("one Fire action advances through two sequential missiles and then guns", () => {
  const actionable = { firstRunWeaponsActionable: true };
  const firstMissile = flightMissionGuidance({
    ...FIRST_RUN,
    aim9_remaining: 2,
    aim9_in_flight: false,
  }, actionable);
  assert.equal(firstMissile.id, "first-run-missile-1");
  assert.equal(firstMissile.status, "FOX 2 SELECTED");
  assert.equal(firstMissile.primaryAction.control, "fire");
  assert.equal(firstMissile.primaryAction.label, "FIRE MISSILE 1 OF 2");

  const tracking = flightMissionGuidance({
    ...FIRST_RUN,
    aim9_remaining: 1,
    aim9_in_flight: true,
  }, actionable);
  assert.equal(tracking.id, "first-run-missile-in-flight");
  assert.equal(tracking.primaryAction.control, null);
  assert.equal(tracking.primaryAction.label, "TRACK · WAIT FOR CLEAR");

  const secondMissile = flightMissionGuidance({
    ...FIRST_RUN,
    aim9_remaining: 1,
    aim9_in_flight: false,
  }, actionable);
  assert.equal(secondMissile.id, "first-run-missile-2");
  assert.equal(secondMissile.primaryAction.control, "fire");
  assert.equal(secondMissile.primaryAction.label, "FIRE MISSILE 2 OF 2");

  const guns = flightMissionGuidance({
    ...FIRST_RUN,
    aim9_remaining: 0,
    aim9_in_flight: true,
  }, actionable);
  assert.equal(guns.id, "first-run-guns");
  assert.equal(guns.status, "GUNS SELECTED · MISSILE 2 AWAY");
  assert.equal(guns.primaryAction.control, "fire");
  assert.equal(guns.primaryAction.label, "FIRE GUNS",
    "the same Fire control becomes guns immediately after the second launch");
});

test("desktop and touch wording preserve one primary action and demote optional RTB", () => {
  const cue = flightMissionGuidance({
    ...FIRST_RUN,
    aim9_remaining: 0,
    rtb_available: true,
  }, { firstRunWeaponsActionable: true });

  assert.equal(
    missionGuidanceActionText(cue.primaryAction, { fireBinding: "SPACE" }),
    "SPACE · FIRE GUNS",
  );
  assert.equal(
    missionGuidanceActionText(cue.secondaryAction, { rtbBinding: "O" }),
    "O · RTB AVAILABLE",
  );
  assert.equal(
    missionGuidanceActionText(cue.primaryAction, { touchMode: true }),
    "FIRE GUNS",
  );
  assert.equal(
    missionGuidanceActionText(cue.secondaryAction, { touchMode: true }),
    "RTB AVAILABLE IN PAUSE",
  );
});

test("accepted RTB replaces combat actions and yields to recovery or terminal presentation", () => {
  const active = flightMissionGuidance({
    ...FIRST_RUN,
    aim9_remaining: 0,
    player_rtb_active: true,
  });
  assert.equal(active.phase, "rtb");
  assert.equal(active.objective, "RETURN TO BASE");
  assert.equal(active.primaryAction.label, "FOLLOW ROUTE TO RECOVERY");

  const approach = {
    ...FIRST_RUN,
    player_rtb_active: true,
    approach_guidance_active: true,
    approach_valid: true,
  };
  assert.equal(recoveryGuidanceOwnsMissionCue(approach), true);
  assert.equal(flightMissionGuidance(approach), null,
    "the approach director must be the sole next-action owner");

  for (const terminal of [
    { terminal_phase_active: true },
    { finished: true },
    { mode: "TERMINAL" },
  ]) {
    const state = { ...FIRST_RUN, player_rtb_active: true, ...terminal };
    assert.equal(flightHudIsTerminal(state), true);
    assert.equal(flightMissionGuidance(state), null,
      "terminal/debrief cannot inherit a stale RTB or weapon action");
  }
});

test("generic first-pass SAFE remains the only selectable mission strip", () => {
  const generic = flightMissionGuidance({
    visual_merge_evaluation: true,
    weapons_inhibited: true,
  });
  assert.equal(generic.id, "visual-merge-safe");
  assert.equal(generic.interactive, true);
  assert.equal(missionGuidanceActionText(generic.primaryAction), "CLICK CUE TO ARM");
  assert.equal(missionGuidanceActionText(generic.primaryAction, { touchMode: true }),
    "TAP CUE TO ARM");

  const valley = flightMissionGuidance({
    ...FIRST_RUN,
    weapons_inhibited: true,
    aim9_remaining: 2,
  });
  assert.equal(valley.id, "first-run-ingress");
  assert.equal(valley.interactive, false);
});

test("responsive card geometry respects safe insets and collapses on short landscape", () => {
  const desktop = missionGuidanceLayout({
    width: 1280,
    height: 720,
    secondaryBottom: 702,
  });
  assert.equal(desktop.showDetail, true);
  assert.equal(desktop.height, 56);
  assert.ok(desktop.width <= 520);
  assert.equal(desktop.y + desktop.height, 702);

  const portrait = missionGuidanceLayout({
    width: 390,
    height: 844,
    touchMode: true,
    safeInsets: { top: 47, right: 8, bottom: 34, left: 8 },
    secondaryBottom: 702,
  });
  assert.equal(portrait.compact, true);
  assert.equal(portrait.showDetail, false);
  assert.ok(portrait.x >= 8);
  assert.ok(portrait.x + portrait.width <= 390 - 8);
  assert.equal(portrait.y + portrait.height, 702);

  const shortLandscape = missionGuidanceLayout({
    width: 667,
    height: 375,
    touchMode: true,
    safeInsets: { top: 0, right: 44, bottom: 21, left: 44 },
    secondaryBottom: 246,
  });
  assert.equal(shortLandscape.dense, true);
  assert.equal(shortLandscape.showDetail, false);
  assert.equal(shortLandscape.height, 38);
  assert.ok(shortLandscape.x >= 44);
  assert.ok(shortLandscape.x + shortLandscape.width <= 667 - 44);
  assert.equal(shortLandscape.y + shortLandscape.height, 246);
});
