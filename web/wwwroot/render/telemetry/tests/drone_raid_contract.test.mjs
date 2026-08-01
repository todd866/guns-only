import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const projectionUrl = new URL("../../../../SnapshotProjection.cs", import.meta.url);
// The flat-snapshot projection moved from the browser-only WebBridge into the plain, linkable
// SnapshotProjection; the contract scan reads both so a field is found wherever it now lives.
const readBridgeContract = () =>
  Promise.all([readFile(bridgeUrl, "utf8"), readFile(projectionUrl, "utf8")])
    .then((parts) => parts.join("\n"));
const sessionUrl = new URL("../../../../../sim/SimulationSession.cs", import.meta.url);
const beatsUrl = new URL("../../../../../sim/Doctrine/Beats.cs", import.meta.url);

const [bridgeSource, sessionSource, beatsSource] = await Promise.all([
  readBridgeContract(),
  readFile(sessionUrl, "utf8"),
  readFile(beatsUrl, "utf8"),
]);

test("stable beat eight selects the fictional Ukraine low-level staged raid without renumbering", () => {
  assert.match(sessionSource, /_beatFactory = \(\) => Beats\.BuiltIn\(index, deckConfiguration\);/);
  assert.match(beatsSource, /7 => ModernVisualMerge\(\),\s*8 => DroneRaidDefense\(\),/);
  // The catalogue ceiling can grow, but beat EIGHT must remain the drone raid and the validator
  // must admit the new Medevac entry instead of silently falling back to the first beat.
  assert.match(sessionSource,
    /if \(!Beats\.IsBuiltInIndex\(index\)\) index = Beats\.FirstBuiltInIndex;/);
  // The comment above already says the ceiling can grow, so do not hard-pin it -- pinning 13 is
  // what broke this test the moment a fourteenth beat landed. Beat EIGHT staying the drone raid
  // is the property; the ceiling is just the catalogue getting bigger.
  const ceiling = Number(
    /public const int LastBuiltInIndex = (\d+);/.exec(beatsSource)?.[1] ?? NaN);
  assert.ok(ceiling >= 13, `built-in catalogue shrank below the drone raid: ${ceiling}`);
  assert.match(beatsSource,
    /index is >= FirstBuiltInIndex and <= LastBuiltInIndex;/);
  assert.match(beatsSource, /13 => Medevac\(\),/);
  assert.match(beatsSource,
    /mission\.ukraine-training\.low-level-drone-intercept\.prototype\.v1/);
  assert.match(beatsSource, /Era: "UKRAINE_FICTIONAL_TRAINING_SECTOR"/);
  assert.match(beatsSource, /RulesOfEngagement: "GUNS_ONLY_DEFENSIVE_INTERCEPT"/);
  assert.match(beatsSource, /DroneRaid: raid/);
});

test("snapshot exposes decision score components and the honest staged-stream mode", () => {
  for (const field of [
    "drone_raid_mode",
    "drone_raid_score",
    "drone_raid_containment_score",
    "drone_raid_time_score",
    "drone_raid_fire_discipline_score",
    "drone_raid_targets_total",
    "drone_raid_targets_resolved",
    "drone_raid_active_target",
    "drone_raid_kills",
    "drone_raid_leakers",
    "drone_raid_average_ttn_s",
    "drone_raid_rounds_per_kill",
    "drone_raid_time_to_leak_s",
    "drone_raid_tail_chase",
    "drone_raid_cue",
    "mission_era",
  ]) {
    assert.match(bridgeSource, new RegExp(`\\\\\"${field}\\\\\"`),
      `${field} must be observable in authoritative browser state`);
  }
  assert.match(bridgeSource, /DroneRaidScenarioDefinition\.ResolutionMode/);
  assert.match(bridgeSource,
    /SessionEventType\.RaidTargetLeaked => "RAID_TARGET_LEAKED"/);
  assert.match(bridgeSource,
    /bool modernSurrogate = mission\.ContentFamily[\s\S]*?\|\| player\.Id == AircraftCapability\.F22ASurrogate\.Id/,
    "the drone-defence F-22 must use the modern surrogate presentation contract, not the balloon profile");
  assert.match(beatsSource,
    /mission\.ukraine-training\.low-level-drone-intercept\.prototype\.v1[\s\S]*?PublicDataSurrogate: true/,
    "the authoritative snapshot must identify Beat 8 as a public-data gameplay surrogate");
});
