import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const projectionUrl = new URL("../../../../SnapshotProjection.cs", import.meta.url);
const sourcePackUrl = new URL(
  "../../../../../content/packs/korea-1950s/pack.json",
  import.meta.url,
);
const browserPackUrl = new URL(
  "../../../content/packs/korea-1950s/pack.json",
  import.meta.url,
);
// The flat-snapshot projection moved from the browser-only WebBridge into the plain, linkable
// SnapshotProjection; the contract scan reads both so a field is found wherever it now lives.
const readBridgeContract = () =>
  Promise.all([readFile(bridgeUrl, "utf8"), readFile(projectionUrl, "utf8")])
    .then((parts) => parts.join("\n"));

test("snapshot 1.19 projects the authoritative pilot physiology contract", async () => {
  const source = await readBridgeContract();

  assert.match(source, /const string SnapshotSchemaVersion = "1\.19\.0";/);
  assert.match(source,
    /PilotPhysiologyState pilotPhysiology = Session\.PilotPhysiologyState;/);
  assert.match(source,
    /Session\.PilotPhysiology\.Profile\.Id/);

  const requiredFields = [
    "pilot_physiology_profile_id",
    "pilot_state",
    "pilot_gz",
    "pilot_gz_valid",
    "pilot_positive_onset_rate_g_per_second",
    "pilot_negative_onset_rate_g_per_second",
    "pilot_positive_exposure_g_seconds",
    "pilot_negative_exposure_g_seconds",
    "pilot_effective_retinal_reserve_01",
    "pilot_effective_cerebral_reserve_01",
    "pilot_peripheral_vision_01",
    "pilot_central_vision_01",
    "pilot_redout_01",
    "pilot_consciousness_01",
    "pilot_conscious",
    "pilot_cognitive_capacity_01",
    "pilot_control_authority_01",
    "pilot_additional_control_delay_seconds",
    "pilot_incapacitation_remaining_seconds",
    "pilot_agsm_engagement_01",
    "pilot_push_pull_penalty_g",
    "pilot_effective_peripheral_loss_g",
    "pilot_effective_blackout_g",
    "pilot_effective_loc_g",
    "pilot_effective_negative_redout_magnitude_g",
    "pilot_effective_negative_loc_magnitude_g",
    "pilot_control_interlocked",
    "pilot_trigger_interlocked",
    "pilot_g_loc_count",
    "pilot_peak_positive_g",
    "pilot_peak_negative_g",
  ];

  for (const field of requiredFields) {
    assert.equal(source.includes(`\\\"${field}\\\"`), true,
      `missing physiology snapshot field ${field}`);
  }
});

test("snapshot schema 1.19 is mirrored in source and browser pack manifests", async () => {
  const [sourcePack, browserPack] = await Promise.all([
    readFile(sourcePackUrl, "utf8").then(JSON.parse),
    readFile(browserPackUrl, "utf8").then(JSON.parse),
  ]);

  assert.equal(sourcePack.compatibility?.snapshotSchemaVersion, "1.19.0");
  assert.equal(browserPack.compatibility?.snapshotSchemaVersion, "1.19.0");
  assert.deepEqual(browserPack, sourcePack);
});

test("bridge keeps pilot intent distinct from physiology-impaired actuator truth", async () => {
  const source = await readBridgeContract();

  assert.match(source, /PilotCommand requestedCommand = _detents\.Command;/);
  assert.match(source, /PilotCommand appliedCommand = _player\.LastAppliedCommand;/);
  assert.equal(source.includes("\\\"requested_g_cmd\\\""), true);
  assert.equal(source.includes("\\\"g_cmd\\\""), true);
});

test("pilot state is a closed token set and profile IDs use JSON escaping", async () => {
  const source = await readBridgeContract();

  for (const token of [
    "NORMAL",
    "STRAINING",
    "GRAYOUT",
    "BLACKOUT",
    "G_LOC",
    "RECOVERING",
    "REDOUT",
  ]) {
    assert.match(source, new RegExp(`=> "${token}"|_ => "${token}"`));
  }
  assert.match(source,
    /pilotPhysiologyProfileIdJson = JsonString\([\s\S]*?Profile\.Id\);/);
});
