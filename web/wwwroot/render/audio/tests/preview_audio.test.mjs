import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CUE_GROUPS,
  CUE_PRESET_BY_ID,
  cueStateAt,
  dynamicPressurePa,
} from "../preview/cue_matrix.js";
import { resolveContactAcousticClass } from "../event_audio.js";

const previewUrl = new URL("../preview/jet_preview.html", import.meta.url);

test("cue matrix exposes every controlled F-22 and traffic comparison", () => {
  const ids = new Set(CUE_GROUPS.flatMap((group) => group.cues.map((cue) => cue.id)));
  for (const id of [
    "f22_power_60",
    "f22_power_80",
    "f22_power_100",
    "f22_power_augmented",
    "f22_q_low",
    "f22_q_high",
    "f22_altitude_5k",
    "f22_altitude_30k",
    "f22_altitude_55k",
    "f22_altitude_200k",
    "f22_altitude_sweep",
    "f22_g_3",
    "f22_g_6",
    "f22_g_negative_2",
    "fighter_close_pass",
    "bear_distant_pass",
    "f22_cockpit_100",
    "f22_external_100",
  ]) {
    assert.ok(ids.has(id), `missing cue ${id}`);
    assert.ok(CUE_PRESET_BY_ID[id]);
  }
});

test("power comparison holds q constant and makes RPM and power monotonic", () => {
  const states = [60, 80, 100].map((rpm) => cueStateAt(`f22_power_${rpm}`));
  assert.deepEqual(states.map(dynamicPressurePa), [
    dynamicPressurePa(states[0]),
    dynamicPressurePa(states[0]),
    dynamicPressurePa(states[0]),
  ]);
  assert.deepEqual(states.map((state) => state.engine_rpm_pct), [60, 80, 100]);
  assert.ok(states[0].applied_throttle < states[1].applied_throttle);
  assert.ok(states[1].applied_throttle < states[2].applied_throttle);
  assert.equal(states[2].max_thrust_fraction, 1.35);
  assert.deepEqual(
    states.map((state) => state.engine_spool_fraction),
    [0.6, 0.8, 1],
    "published spool fraction is the physical lever-scale state, not pre-normalized",
  );
  const augmented = cueStateAt("f22_power_augmented");
  assert.equal(augmented.engine_rpm_pct, 100);
  assert.equal(augmented.engine_spool_fraction, 1.35);
  assert.ok(augmented.engine_spool_fraction > states[2].engine_spool_fraction);
});

test("dynamic-pressure comparison holds F-22 engine controls constant", () => {
  const low = cueStateAt("f22_q_low");
  const high = cueStateAt("f22_q_high");
  assert.equal(low.applied_throttle, high.applied_throttle);
  assert.equal(low.engine_rpm_pct, high.engine_rpm_pct);
  assert.equal(low.engine_spool_fraction, high.engine_spool_fraction);
  assert.ok(dynamicPressurePa(high) > dynamicPressurePa(low) * 6);
});

test("altitude comparison isolates density before the ballistic-apex reference", () => {
  const controlled = ["5k", "30k", "55k"]
    .map((altitude) => cueStateAt(`f22_altitude_${altitude}`));
  const referenceQ = dynamicPressurePa(controlled[0]);
  for (const state of controlled) {
    assert.equal(state.applied_throttle, controlled[0].applied_throttle);
    assert.equal(state.engine_rpm_pct, controlled[0].engine_rpm_pct);
    assert.ok(Math.abs(dynamicPressurePa(state) - referenceQ) < 0.01);
  }
  assert.ok(controlled[0].air_density_kg_m3 > controlled[1].air_density_kg_m3);
  assert.ok(controlled[1].air_density_kg_m3 > controlled[2].air_density_kg_m3);

  const apex = cueStateAt("f22_altitude_200k");
  assert.equal(apex.altitude_m, 60_960);
  assert.ok(apex.air_density_kg_m3 < 0.0003);
  assert.ok(dynamicPressurePa(apex) < 100);
  assert.equal(cueStateAt("f22_altitude_sweep", 9).altitude_m, 60_960);
});

test("signed-G references hold engine and air state constant", () => {
  const one = cueStateAt("f22_g_1");
  const three = cueStateAt("f22_g_3");
  const six = cueStateAt("f22_g_6");
  const negative = cueStateAt("f22_g_negative_2");
  for (const state of [three, six, negative]) {
    assert.equal(state.applied_throttle, one.applied_throttle);
    assert.equal(state.engine_rpm_pct, one.engine_rpm_pct);
    assert.equal(dynamicPressurePa(state), dynamicPressurePa(one));
    assert.equal(state.pilot_gz_valid, true);
  }
  assert.deepEqual(
    [three.pilot_gz, six.pilot_gz, negative.pilot_gz],
    [3, 6, -2],
  );
  assert.ok(six.pilot_positive_onset_rate_g_per_second > 0);
  assert.ok(negative.pilot_negative_onset_rate_g_per_second > 0);
});

test("fighter sequence crosses close and changes closure sign", () => {
  const approaching = cueStateAt("fighter_close_pass", 1);
  const crossing = cueStateAt("fighter_close_pass", 4);
  const receding = cueStateAt("fighter_close_pass", 5);
  assert.equal(approaching.bandit_audio_class, "fighter_jet");
  assert.ok(approaching.closure_kts > 0);
  assert.ok(crossing.range_m <= 140);
  assert.ok(receding.closure_kts < 0);
  assert.ok(receding.range_m > crossing.range_m);
  assert.ok(approaching.bx > 0, "contact begins ahead");
  assert.ok(Math.abs(crossing.bx) < 1, "closest approach is abeam");
  assert.ok(receding.bx < 0, "contact departs behind");
  assert.ok([approaching, crossing, receding].every((state) => state.bz > 0),
    "straight pass remains on one side of the canopy");
});

test("Bear sequence remains distant and identifies contra-rotating propulsion", () => {
  const far = cueStateAt("bear_distant_pass", 0);
  const nearest = cueStateAt("bear_distant_pass", 8);
  const receding = cueStateAt("bear_distant_pass", 10);
  assert.match(far.bandit_aircraft_id, /tu95/);
  assert.equal(far.bandit_audio_class, "heavy_contra_prop");
  assert.equal(resolveContactAcousticClass(far), "heavy_contra_prop");
  assert.ok(far.range_m >= 60_000);
  assert.ok(nearest.range_m >= 10_000);
  assert.ok(nearest.range_m < far.range_m);
  assert.ok(receding.closure_kts < 0);
});

test("external comparison changes perspective without changing engine or air state", () => {
  const cockpit = cueStateAt("f22_cockpit_100");
  const external = cueStateAt("f22_external_100");
  assert.equal(external.applied_throttle, cockpit.applied_throttle);
  assert.equal(external.engine_rpm_pct, cockpit.engine_rpm_pct);
  assert.equal(dynamicPressurePa(external), dynamicPressurePa(cockpit));
  assert.equal(cockpit.audio_perspective, "cockpit");
  assert.equal(external.audio_perspective, "external");
  assert.equal(external.replay_external, true);
  assert.equal(external.replay_camera, "CHASE");
});

test("preview keeps one graph and uses the production-shaped dynamics chain", async () => {
  const source = await readFile(previewUrl, "utf8");
  assert.equal(
    source.match(/createEngineVoices\(context, previewBus/g)?.length,
    1,
    "the preview must not allocate a new running graph for each aircraft",
  );
  assert.match(source, /createEngineVoices\(context, previewBus, \{ includeMaster: true \}\)/);
  assert.match(source, /replaceJetSampleBeds\(voices, context, beds, \{ character \}\)/);
  assert.match(source, /generation !== bedLoadGeneration \|\| character !== bedCharacter/);
  assert.match(source, /createDynamicsCompressor\(\)/);
  assert.match(source, /previewCompressor\.threshold\.value = -18/);
  assert.match(source, /previewCompressor\.knee\.value = 12/);
  assert.match(source, /previewCompressor\.ratio\.value = 4\.5/);
  assert.match(source, /previewCompressor\.attack\.value = 0\.005/);
  assert.match(source, /previewCompressor\.release\.value = 0\.18/);
  assert.doesNotMatch(source, /createEngineVoices\(context, context\.destination/);
});

test("preview drives every production airframe and contact cue path", async () => {
  const source = await readFile(previewUrl, "utf8");
  for (const updater of [
    "updateBuffetVoice",
    "updateAirframeCueVoices",
    "updateConfigurationVoices",
    "updateCatapultVoice",
    "updateRcsVoice",
    "updateTrapVoice",
    "updateCombatCueVoices",
    "fireGunReports",
  ]) {
    assert.match(source, new RegExp(`${updater}\\(events, context,`));
  }
  assert.match(source, /contacts = createContactAcousticVoices\(context, previewBus\)/);
  assert.match(
    source,
    /updateContactAcousticVoices\(contacts, context, nextState, \{ enabled \}\)/,
  );
});

test("preview Stop mutes the shared engine and every event path", async () => {
  const source = await readFile(previewUrl, "utf8");
  const stopBranch = source.match(/function stop\(\) \{([\s\S]*?)\n    \}/)?.[1] ?? "";
  assert.match(stopBranch, /previewMaster\.gain\.setTargetAtTime\(0,/);
  assert.match(stopBranch, /updateEngineVoices\([^;]+\{ muted: true \}/);
  assert.match(stopBranch, /updateProductionEvents\(\{\}, false\)/);
});
