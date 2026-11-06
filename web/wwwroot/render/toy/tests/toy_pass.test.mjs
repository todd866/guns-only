import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSET_MAP,
  AUDIO_CUES,
  BAD_GUYS,
  FRIENDLY_SPLAT_CAPTION,
  GOOD_GUYS,
  GROUND_TARGETS,
  TEXT_CHANGES,
  TOY_GUN_BED,
  TOY_PALETTE,
  TOY_REJOIN_S,
  badGuyForId,
  downedToyPose,
  friendlySplatFrame,
  groundTargetDress,
  noteFriendlySplat,
  presentCaption,
  presentHudModel,
  presentText,
  toyAsset,
  toyAudioCue,
  toyModeEnabled,
} from "../toy_pass.js";

const BANNED = /\b(explosions?|explodes?|exploded|debris|gore|deaths?|dead|died|dying|kills?|killed|destroyed|destroy|guns?|gunfire|gunner|missiles?|bombs?|bandits?|smoke|fires?|shot down)\b/i;

const CORPUS = [
  "SPLASH",
  "FOX 2",
  "FOX TWO",
  "GUNS HOT · FOX TWO ×2",
  "GUNS SAFE",
  "GUNS ONLY",
  "FIRE GUNS ON SOLUTION",
  "FIRE MISSILE 1 OF 2",
  "FIRE GUNS",
  "Bandit gunfire destroyed the aircraft.",
  "All raiders destroyed.",
  "Bandit destroyed.",
  "Aircraft lost.",
  "Aircraft Lost",
  "Ownship lost.",
  "Kill the gun pit.",
  "DESTROY GUN PIT · FORD",
  "FORTIFIED GUN PIT",
  "GUN POSITION",
  "DShK AA SITE",
  "INFANTRY SQUAD",
  "SUPPLY TRUCK",
  "Friendly kills",
  "KILLS 03",
  "IMPACT PHYSICS RUNNING · KILLS 2",
  "explosion debris gore death smoke",
  "shot down",
  "Guns Only",
  "HEATERS",
  "Z  SHORT-RANGE MISSILE",
];

test("toy mode is on unless the setting is explicitly off", () => {
  assert.equal(toyModeEnabled(undefined), true);
  assert.equal(toyModeEnabled({}), true);
  assert.equal(toyModeEnabled({ toyMode: true }), true);
  assert.equal(toyModeEnabled({ toyMode: false }), false);
});

test("toy copy replaces weapons, death language and bandits", () => {
  for (const line of CORPUS) {
    const toy = presentText(line, true);
    assert.equal(BANNED.test(toy), false, `${JSON.stringify(line)} → ${JSON.stringify(toy)}`);
    assert.equal(presentText(line, false), line);
  }
  assert.equal(presentText("SPLASH", true), "Splat!");
  assert.equal(presentText("FOX TWO", true), "Pop!");
  assert.equal(presentText("Bandit destroyed.", true), "Got you!");
  assert.equal(presentText("Kill the gun pit.", true), "Splat the cardboard fort.");
  assert.equal(presentText("Guns Only", true), "Toys Only");
  assert.equal(presentText("KILLS", true), "SPLATS");
  assert.equal(presentText("kill", true), "splat");
  assert.equal(presentText("KILL", true), "SPLAT");
  assert.match(presentText("a hard bonk", true), /Bonk!/);
});

test("ordinary flight words survive the toy map", () => {
  assert.equal(presentText("throttle", true), "throttle");
  assert.equal(presentText("skill", true), "skill");
  assert.equal(presentText("RTB", true), "RTB");
  assert.equal(presentText("", true), "");
  assert.equal(presentText(null, true), null);
});

test("every listed text change is free of banned words", () => {
  assert.ok(TEXT_CHANGES.length > 20);
  for (const change of TEXT_CHANGES) {
    assert.equal(change.kind, "text");
    assert.equal(BANNED.test(change.to), false, change.from);
    assert.notEqual(change.from, change.to);
  }
});

test("the cast is green army men against a distinct rogue gallery", () => {
  assert.equal(GOOD_GUYS.length, 1);
  assert.equal(GOOD_GUYS[0].id, "green-army-man");
  assert.match(GOOD_GUYS[0].look, /green plastic/i);
  const ids = BAD_GUYS.map((guy) => guy.id);
  assert.deepEqual(ids, [
    "wind-up-robot",
    "jack-in-the-box",
    "rubber-band-sniper",
    "evil-teddy",
    "plastic-dinosaur",
    "rc-car-gang",
    "balloon-animal-blimp",
    "tin-soldier-wrong-colour",
    "spinning-top-swarm",
    "toy-chest-boss",
  ]);
  const beats = new Set();
  const looks = new Set();
  for (const guy of BAD_GUYS) {
    assert.ok(guy.look.length > 12, guy.id);
    assert.ok(guy.behaviour.length > 12, guy.id);
    assert.ok(guy.beat.length > 12, guy.id);
    assert.equal(Number.isInteger(guy.color), true, guy.id);
    beats.add(guy.beat);
    looks.add(guy.look);
    assert.equal(/\b(kill|dead|destroy|explosion|gore)\b/i.test(guy.beat), false);
  }
  assert.equal(beats.size, BAD_GUYS.length);
  assert.equal(looks.size, BAD_GUYS.length);
  assert.equal(badGuyForId("same-toy"), badGuyForId("same-toy").id ? badGuyForId("same-toy") : null);
  assert.equal(badGuyForId("alpha").id, badGuyForId("alpha").id);
  assert.notEqual(badGuyForId("alpha").id, badGuyForId("zzzz-other").id);
});

test("ground targets become blocks, forts, balloon towers and army men", () => {
  const friend = groundTargetDress("infantry", "friendly", "squad-1");
  assert.equal(friend.id, "green-army-man");
  assert.equal(friend.label, "Green army men");
  const foe = groundTargetDress("infantry", "hostile", "squad-9");
  assert.ok(BAD_GUYS.some((guy) => guy.id === foe.id));
  assert.equal(groundTargetDress("soft-vehicle", "hostile", "truck").id, GROUND_TARGETS.blocks.id);
  assert.equal(groundTargetDress("hard-point", "hostile", "pit").id, GROUND_TARGETS.fort.id);
  assert.equal(groundTargetDress("dshk-site", "hostile", "aa").id, GROUND_TARGETS.balloonTower.id);
  assert.equal(friend.windUpKey, false);
  assert.equal(foe.face, true);
});

test("a downed toy tumbles, bounces, stands up and rejoins at 3s without a score change", () => {
  assert.equal(TOY_REJOIN_S, 3);
  assert.equal(downedToyPose(0).phase, "tumble");
  assert.equal(downedToyPose(1).phase, "bounce");
  assert.ok(downedToyPose(1).y > 0);
  assert.equal(downedToyPose(2.2).phase, "upright");
  const back = downedToyPose(3);
  assert.equal(back.phase, "rejoined");
  assert.equal(back.rejoined, true);
  assert.equal(back.roll, 0);
  assert.equal(back.pitch, 0);
  assert.equal(back.yaw, 0);
  assert.equal(back.y, 0);
  assert.equal(back.scoreDelta, 0);
  assert.equal(downedToyPose(9).scoreDelta, 0);
});

test("a friendly splat falls stiff, the ambulance fetches him, and nothing is failed", () => {
  assert.equal(FRIENDLY_SPLAT_CAPTION, "Medic! ...He's fine.");
  const fallen = friendlySplatFrame(0.1);
  assert.equal(fallen.phase, "fall-stiff");
  assert.equal(fallen.fallen, true);
  assert.equal(fallen.pose, "plastic-flat");
  const drive = friendlySplatFrame(0.6);
  assert.equal(drive.phase, "ambulance-out");
  assert.equal(drive.siren, true);
  assert.equal(drive.flash, true);
  assert.equal(drive.wobble, true);
  assert.equal(drive.reinforcements, true);
  const load = friendlySplatFrame(1.4);
  assert.equal(load.phase, "stretcher-load");
  assert.equal(load.stretcher, true);
  assert.equal(load.travel, 1);
  const home = friendlySplatFrame(2.1);
  assert.equal(home.phase, "trundle-home");
  assert.ok(home.travel < 1);
  const hop = friendlySplatFrame(2.85);
  assert.equal(hop.phase, "hop-out");
  assert.equal(hop.healed, true);
  const done = friendlySplatFrame(3);
  assert.equal(done.phase, "good-as-new");
  assert.equal(done.healed, true);
  assert.equal(done.reinforcements, false);
  const once = noteFriendlySplat({ friendlySplats: 2, penalty: true, scoreDelta: -5 });
  assert.equal(once.friendlySplats, 3);
  assert.equal(once.penalty, false);
  assert.equal(once.scoreDelta, 0);
  assert.equal(once.lastCaption, FRIENDLY_SPLAT_CAPTION);
});

test("audio and assets map onto toys and keep the realistic ids", () => {
  assert.equal(toyAsset("event.vehicle.destroyed.v1", false), "event.vehicle.destroyed.v1");
  assert.equal(toyAsset("wreck.fire", true), "toy.none");
  assert.equal(toyAsset("wreck.smoke", true), "toy.paint-puff");
  assert.equal(toyAsset("tracer.gun", true), "toy.foam-dart");
  assert.equal(ASSET_MAP["ordnance.bomb"], "toy.paint-blob");
  for (const [id, cue] of Object.entries(AUDIO_CUES)) {
    assert.equal(BANNED.test(cue.id), false, id);
    assert.equal(BANNED.test(cue.label), false, id);
    assert.ok(cue.toneHz >= 100, id);
    if (id !== "siren") assert.ok(cue.durationS <= 0.15, id);
  }
  assert.equal(toyAudioCue("gun").id, "foam-dart-thup");
  assert.equal(toyAudioCue("gun").label, "thup");
  assert.equal(toyAudioCue("destroy").label, "pop");
  assert.equal(toyAudioCue("hit").label, "splat");
  assert.equal(toyAudioCue("bomb").id, "paint-blob");
  assert.ok(TOY_GUN_BED.reportRate <= 8);
  assert.ok(TOY_GUN_BED.bodyLevel < 0.03);
  assert.equal(toyAudioCue("nope"), null);
});

test("the kids palette is bright and the hud model is mapped in place", () => {
  assert.equal(TOY_PALETTE.id, "kids-bright");
  assert.ok(TOY_PALETTE.sky.startsWith("#"));
  const model = presentHudModel({
    designation: { label: "GUN PIT" },
    gunner: { line: "GUNS", detail: "TGT FORTIFIED GUN PIT" },
    formation: { radio: { speaker: "LEAD", text: "Bandit destroyed." } },
    mission: { task: { name: "GUN PIT", symbol: "⨯" } },
    tactical: { target: { label: "AA" }, threats: [{ label: "DShK AA SITE" }] },
    warnings: [{ text: "ENGINE OUT", level: "warning" }],
  }, true);
  assert.equal(model.designation.label, "CARDBOARD FORT");
  assert.equal(model.gunner.detail, "TGT CARDBOARD FORT");
  assert.equal(model.formation.radio.text, "Got you!");
  assert.equal(model.tactical.threats[0].label, "BALLOON TOWER");
  assert.equal(model.warnings[0].text, "ENGINE OUT");
  assert.equal(model.mission.task.symbol, "⨯");
  const same = { designation: { label: "GUN PIT" } };
  assert.equal(presentHudModel(same, false), same);
  assert.equal(presentCaption({ line: "DESTROY GUN PIT", detail: "Kill it" }, true).line,
    "SPLAT THE CARDBOARD FORT");
  assert.equal(presentCaption(null, true), null);
});
