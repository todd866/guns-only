import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const sessionUrl = new URL("../../../../../sim/SimulationSession.cs", import.meta.url);
const beatsUrl = new URL("../../../../../sim/Doctrine/Beats.cs", import.meta.url);

const [bridgeSource, sessionSource, beatsSource] = await Promise.all([
  readFile(bridgeUrl, "utf8"),
  readFile(sessionUrl, "utf8"),
  readFile(beatsUrl, "utf8"),
]);

test("stable beat eight selects the Korea 2030s staged drone raid without renumbering", () => {
  assert.match(sessionSource, /7 => Beats\.ModernVisualMerge,\s*8 => Beats\.DroneRaidDefense,/);
  assert.match(sessionSource, /index is < 1 or > 8/);
  assert.match(beatsSource,
    /mission\.korea-2030s\.drone-raid-defence\.prototype\.v1/);
  assert.match(beatsSource, /Era: "KOREA_2030S_PROXY"/);
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
    /mission\.korea-2030s\.drone-raid-defence\.prototype\.v1[\s\S]*?PublicDataSurrogate: true/,
    "the authoritative snapshot must identify Beat 8 as a public-data gameplay surrogate");
});
