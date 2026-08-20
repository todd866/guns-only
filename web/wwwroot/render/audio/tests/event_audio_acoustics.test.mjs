import assert from "node:assert/strict";
import test from "node:test";

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.targets = [];
  }

  setTargetAtTime(value, time, timeConstant) {
    this.targets.push({ value, time, timeConstant });
    this.value = value;
  }

  setValueAtTime(value, time) {
    this.targets.push({ value, time, timeConstant: 0 });
    this.value = value;
  }

  exponentialRampToValueAtTime(value, time) {
    this.targets.push({ value, time, timeConstant: 0 });
    this.value = value;
  }
}

class FakeNode {
  constructor() {
    this.connections = [];
  }

  connect(node) {
    this.connections.push(node);
    return node;
  }
}

class FakeGain extends FakeNode {
  constructor() {
    super();
    this.gain = new FakeAudioParam();
  }
}

class FakeStereoPanner extends FakeNode {
  constructor() {
    super();
    this.pan = new FakeAudioParam();
  }
}

class FakeOscillator extends FakeNode {
  constructor() {
    super();
    this.type = "sine";
    this.frequency = new FakeAudioParam();
    this.detune = new FakeAudioParam();
    this.started = false;
  }

  start() {
    this.started = true;
  }

  stop() {
    this.started = false;
  }
}

class FakeFilter extends FakeNode {
  constructor() {
    super();
    this.type = "lowpass";
    this.frequency = new FakeAudioParam();
    this.Q = new FakeAudioParam();
    // Shelf and peaking filters carry a gain param; the contact canopy model uses one.
    this.gain = new FakeAudioParam();
  }
}

class FakeSource extends FakeNode {
  constructor() {
    super();
    this.buffer = null;
    this.loop = false;
    this.started = false;
    this.playbackRate = new FakeAudioParam(1);
  }

  start() {
    this.started = true;
  }

  stop() {
    this.started = false;
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 1024;
    this.destination = new FakeNode();
    this.gains = [];
    this.oscillators = [];
    this.filters = [];
    this.sources = [];
    this.panners = [];
  }

  createGain() {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }

  createOscillator() {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new FakeFilter();
    this.filters.push(node);
    return node;
  }

  createStereoPanner() {
    const node = new FakeStereoPanner();
    this.panners.push(node);
    return node;
  }

  createBufferSource() {
    const node = new FakeSource();
    this.sources.push(node);
    return node;
  }

  createBuffer(_channels, frames) {
    const data = new Float32Array(frames);
    return { data, getChannelData: () => data };
  }
}

function latest(param) {
  return param.targets.at(-1)?.value ?? param.value;
}

async function freshEventAudio(label) {
  freshEventAudio.sequence = (freshEventAudio.sequence ?? 0) + 1;
  return import(`../event_audio.js?test=${label}-${freshEventAudio.sequence}`);
}

test("signed G separates positive suit load from negative/unload straps", async () => {
  const {
    createEventVoices,
    updateAirframeCueVoices,
  } = await freshEventAudio("signed-g");
  const audio = new FakeAudioContext();
  const voices = createEventVoices(audio, audio.destination);

  updateAirframeCueVoices(voices, audio, {
    pilot_gz: 1,
    pilot_gz_valid: true,
  });
  audio.currentTime = 0.2;
  updateAirframeCueVoices(voices, audio, {
    pilot_gz: 6.5,
    pilot_gz_valid: true,
    g_actual: -1.2,
    pilot_positive_onset_rate_g_per_second: 4.2,
  });
  assert.ok(latest(voices.gGain.gain) > 0.05, "positive structure cue");
  assert.ok(latest(voices.gSuitGain.gain) > 0.04, "positive pneumatic suit cue");
  assert.ok(latest(voices.gHarnessGain.gain) > 0.015, "positive harness load");
  assert.equal(latest(voices.gUnloadGain.gain), 0, "no unload bed during a pull");

  audio.currentTime = 0.4;
  updateAirframeCueVoices(voices, audio, {
    pilot_gz: 8,
    pilot_gz_valid: false,
    g_actual: -1.3,
    pilot_negative_onset_rate_g_per_second: 2.8,
  });
  assert.equal(latest(voices.gGain.gain), 0, "invalid pilot G falls back to signed Nz");
  assert.equal(latest(voices.gSuitGain.gain), 0, "negative G does not inflate the suit");
  assert.ok(latest(voices.gUnloadGain.gain) > 0.045, "negative/unload straps speak");

  audio.currentTime = 0.6;
  updateAirframeCueVoices(voices, audio, {
    pilot_gz: 7,
    pilot_gz_valid: true,
  }, { enabled: false });
  assert.equal(latest(voices.gGain.gain), 0);
  assert.equal(latest(voices.gSuitGain.gain), 0);
  assert.equal(latest(voices.gHarnessGain.gain), 0);
  assert.equal(latest(voices.gUnloadGain.gain), 0);
});

test("fighter equipment cues require a fixed-wing capability instead of leaking by default", async () => {
  const {
    createEventVoices,
    updateAirframeCueVoices,
  } = await freshEventAudio("g-equipment-capability");
  const identities = [
    ["audio.ah1g.t53-b540.v1", "aircraft.ah-1g.cobra.v1"],
    ["audio.fireboss.pt6a-67f.v1", "aircraft.at-802f-fireboss.v1"],
    ["audio.yzf-r1.crossplane.v1", "vehicle.yzf-r1.track-day.v1"],
  ];
  for (const [audioProfile, vehicleId] of identities) {
    const audio = new FakeAudioContext();
    const voices = createEventVoices(audio, audio.destination);
    updateAirframeCueVoices(voices, audio, {
      audio_profile_id: audioProfile,
      player_aircraft_id: vehicleId,
      pilot_gz: 7.5,
      pilot_gz_valid: true,
      pilot_positive_onset_rate_g_per_second: 6,
    });
    assert.equal(latest(voices.gGain.gain), 0, `${audioProfile} has no fighter strain bed`);
    assert.equal(latest(voices.gSuitGain.gain), 0, `${audioProfile} has no fighter G-suit`);
    assert.equal(latest(voices.gHarnessGain.gain), 0, `${audioProfile} has no fighter harness`);
    assert.equal(latest(voices.gUnloadGain.gain), 0, `${audioProfile} has no fighter unload kit`);
  }
});

test("AIM-9 authority edges fire one rail-and-ignition cue and muted launches are consumed", async () => {
  const {
    createEventVoices,
    updateCombatCueVoices,
  } = await freshEventAudio("aim9-launch");
  const audio = new FakeAudioContext();
  const voices = createEventVoices(audio, audio.destination);

  updateCombatCueVoices(voices, audio, {
    aim9_remaining: 2,
    aim9_in_flight: false,
    aim9_state_code: 0,
  });
  const beforeLaunchSources = audio.sources.length;
  const beforeLaunchOscillators = audio.oscillators.length;
  audio.currentTime = 0.1;
  updateCombatCueVoices(voices, audio, {
    // Retained/hot projections may expose seeker state one presentation frame before the
    // magazine field. That is still one physical missile and must produce one onset.
    aim9_remaining: 2,
    aim9_in_flight: true,
    aim9_state_code: 1,
  });
  assert.equal(voices.aim9LaunchCount, 1);
  assert.ok(audio.sources.length > beforeLaunchSources, "ignition rush is scheduled");
  assert.ok(audio.oscillators.length > beforeLaunchOscillators, "rail thump is scheduled");

  const afterFirstLaunchSources = audio.sources.length;
  audio.currentTime = 0.15;
  updateCombatCueVoices(voices, audio, {
    aim9_remaining: 1,
    aim9_in_flight: true,
    aim9_state_code: 1,
  });
  assert.equal(voices.aim9LaunchCount, 1,
    "a later magazine decrement cannot double-trigger the same flight");
  assert.equal(audio.sources.length, afterFirstLaunchSources,
    "split seeker/magazine authority still schedules one onset");

  audio.currentTime = 0.2;
  updateCombatCueVoices(voices, audio, {
    aim9_remaining: 1,
    aim9_in_flight: true,
    aim9_state_code: 2,
  });
  assert.equal(audio.sources.length, afterFirstLaunchSources, "tracking frames do not retrigger");

  audio.currentTime = 1;
  updateCombatCueVoices(voices, audio, {
    aim9_remaining: 1,
    aim9_in_flight: false,
    aim9_state_code: 4,
  });
  audio.currentTime = 1.1;
  updateCombatCueVoices(voices, audio, {
    aim9_remaining: 0,
    aim9_in_flight: true,
    aim9_state_code: 1,
  });
  assert.equal(voices.aim9LaunchCount, 2,
    "clearing in-flight authority rearms exactly one cue for the next missile");

  const mutedAudio = new FakeAudioContext();
  const mutedVoices = createEventVoices(mutedAudio, mutedAudio.destination);
  updateCombatCueVoices(mutedVoices, mutedAudio, {
    aim9_remaining: 1,
    aim9_in_flight: false,
    aim9_state_code: 0,
  });
  mutedAudio.currentTime = 0.1;
  updateCombatCueVoices(mutedVoices, mutedAudio, {
    aim9_remaining: 0,
    aim9_in_flight: true,
    aim9_state_code: 1,
  }, { enabled: false });
  assert.equal(mutedVoices.aim9LaunchCount, 0, "muted launch schedules no sound");
  const afterMutedLaunchSources = mutedAudio.sources.length;
  mutedAudio.currentTime = 0.2;
  updateCombatCueVoices(mutedVoices, mutedAudio, {
    aim9_remaining: 0,
    aim9_in_flight: true,
    aim9_state_code: 2,
  });
  assert.equal(mutedAudio.sources.length, afterMutedLaunchSources,
    "unmuting does not replay a consumed launch");
});

test("F-14 pull-G and unload do not add synthetic suit, harness, strain, or swoosh", async () => {
  const {
    createEventVoices,
    updateAirframeCueVoices,
  } = await freshEventAudio("f14-no-synthetic-g");
  const audio = new FakeAudioContext();
  const voices = createEventVoices(audio, audio.destination);
  const identity = {
    player_aircraft_id: "aircraft.f14a.public-data-surrogate.v1",
    audio_profile_id: "audio.f14a.tf30-twin.v1",
  };

  updateAirframeCueVoices(voices, audio, {
    ...identity,
    pilot_gz: 1,
    pilot_gz_valid: true,
  });
  audio.currentTime = 0.2;
  updateAirframeCueVoices(voices, audio, {
    ...identity,
    pilot_gz: 10.8,
    pilot_gz_valid: true,
    pilot_positive_onset_rate_g_per_second: 7,
  });
  assert.equal(latest(voices.gGain.gain), 0);
  assert.equal(latest(voices.gSuitGain.gain), 0);
  assert.equal(latest(voices.gHarnessGain.gain), 0);
  assert.equal(latest(voices.gUnloadGain.gain), 0);

  audio.currentTime = 0.4;
  updateAirframeCueVoices(voices, audio, {
    ...identity,
    pilot_gz: -1.2,
    pilot_gz_valid: true,
    pilot_negative_onset_rate_g_per_second: 5,
  });
  assert.equal(latest(voices.gGain.gain), 0);
  assert.equal(latest(voices.gSuitGain.gain), 0);
  assert.equal(latest(voices.gHarnessGain.gain), 0);
  assert.equal(latest(voices.gUnloadGain.gain), 0);
});

test("boolean buffet is a floor while angular disturbance supplies progression", async () => {
  const {
    createEventVoices,
    updateBuffetVoice,
  } = await freshEventAudio("buffet");
  const audio = new FakeAudioContext();
  const voices = createEventVoices(audio, audio.destination);

  updateBuffetVoice(voices, audio, {
    buffet: true,
    buffet_pitch_deg: 0,
    buffet_roll_deg: 0,
    buffet_yaw_deg: 0,
    aoa_deg: 5,
  });
  const booleanFloor = latest(voices.buffetGain.gain);
  assert.ok(booleanFloor > 0 && booleanFloor < 0.015, "boolean does not become full buffet");

  audio.currentTime = 0.1;
  updateBuffetVoice(voices, audio, {
    buffet: true,
    buffet_pitch_deg: 1.2,
    buffet_roll_deg: 0.9,
    buffet_yaw_deg: 0.7,
    aoa_deg: 13,
  });
  const workingBuffet = latest(voices.buffetGain.gain);
  assert.ok(workingBuffet > booleanFloor * 3, "measured disturbance raises the rumble");
  assert.ok(workingBuffet < 0.09, "moderate disturbance preserves headroom");

  audio.currentTime = 0.2;
  updateBuffetVoice(voices, audio, { buffet: 1 });
  assert.equal(latest(voices.buffetGain.gain), 0.09, "numeric profiles may request full scale");
});

test("thin-air RCS authority is silent until the thrusters actually fire", async () => {
  const {
    createEventVoices,
    updateRcsVoice,
  } = await freshEventAudio("rcs-duty");
  const audio = new FakeAudioContext();
  const voices = createEventVoices(audio, audio.destination);

  const sourcesBeforeCoast = audio.sources.length;
  const straightCoast = [
    // Recorded zoom corridor endpoints. RCS availability rises as q falls, but a centred
    // controller commands no gas at either end.
    {
      altitude_m: 38_709.6,
      air_density_kg_m3: 0.00482955,
      true_airspeed_mps: 969.95,
      mach: 3.08,
      rapier_rcs_authority: 0.913,
    },
    {
      altitude_m: 43_586.4,
      air_density_kg_m3: 0.00239329,
      true_airspeed_mps: 921.71,
      mach: 2.85,
      rapier_rcs_authority: 1,
    },
  ];
  for (const state of straightCoast) {
    updateRcsVoice(voices, audio, {
      ...state,
      rapier_rcs_firing_frac: 0,
      rapier_rcs_gas_frac: 0.94,
      audio_perspective: "cockpit",
    });
    assert.equal(latest(voices.rcsGain.gain), 0);
    audio.currentTime += 0.4;
  }
  assert.equal(audio.sources.length, sourcesBeforeCoast,
    "availability alone must not schedule repeating RCS ticks");

  updateRcsVoice(voices, audio, {
    rapier_rcs_authority: 1,
    rapier_rcs_firing_frac: 0.65,
    rapier_rcs_gas_frac: 0.94,
    air_density_kg_m3: 0.00239,
    mach: 2.85,
    audio_perspective: "cockpit",
  });
  assert.ok(latest(voices.rcsGain.gain) > 0,
    "measured RCS firing retains a restrained structure-borne cockpit cue");
  assert.ok(audio.sources.length > sourcesBeforeCoast,
    "actual firing schedules a thruster tick");
});

test("gear-down bay air speaks on approach and stays quiet gear-up", async () => {
  const {
    createEventVoices,
    updateConfigurationVoices,
  } = await freshEventAudio("gear-bay-approach");
  const audio = new FakeAudioContext();
  const voices = createEventVoices(audio, audio.destination);
  const f22Id = "aircraft.f22a.public-data-surrogate.v1";
  assert.ok(voices.gearBayGain, "gear-bay voice is part of the event graph");

  updateConfigurationVoices(voices, audio, {
    player_aircraft_id: f22Id,
    gear_nose: 0,
    gear_left: 0,
    gear_right: 0,
    true_airspeed_kts: 145,
    air_density_kg_m3: 1.225,
  });
  assert.equal(latest(voices.gearBayGain.gain), 0, "gear-up has no bay air");

  audio.currentTime = 0.1;
  updateConfigurationVoices(voices, audio, {
    player_aircraft_id: f22Id,
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
    true_airspeed_kts: 145,
    air_density_kg_m3: 1.225,
  });
  const approachBay = latest(voices.gearBayGain.gain);
  assert.ok(approachBay > 0.015, "threshold with gear down has dirty-config bay air");

  audio.currentTime = 0.15;
  updateConfigurationVoices(voices, audio, {
    player_aircraft_id: "aircraft.f86f.public-data-surrogate.v1",
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
    true_airspeed_kts: 145,
    air_density_kg_m3: 1.225,
  });
  assert.equal(latest(voices.gearBayGain.gain), 0,
    "F-22 approach tuning does not add bay air to other aircraft");

  audio.currentTime = 0.2;
  updateConfigurationVoices(voices, audio, {
    player_aircraft_id: f22Id,
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
    true_airspeed_kts: 40,
    air_density_kg_m3: 1.225,
  });
  assert.ok(latest(voices.gearBayGain.gain) < approachBay * 0.35,
    "taxi q keeps bay air quieter than approach");

  audio.currentTime = 0.3;
  updateConfigurationVoices(voices, audio, {
    player_aircraft_id: f22Id,
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
    true_airspeed_kts: 661,
    air_density_kg_m3: 1.225,
  });
  assert.ok(latest(voices.gearBayGain.gain) < approachBay,
    "dash q ducks gear bay under the louder air-load mix");
});

test("speedbrake roar follows dynamic pressure and edge mechanisms remain audible", async () => {
  const {
    createEventVoices,
    updateAirframeCueVoices,
  } = await freshEventAudio("speedbrake-q");
  const audio = new FakeAudioContext();
  const voices = createEventVoices(audio, audio.destination);
  const base = {
    has_speed_brake: true,
    true_airspeed_kts: 650,
    pilot_gz: 1,
  };

  updateAirframeCueVoices(voices, audio, {
    ...base,
    speed_brake: 0,
    air_density_kg_m3: 1,
  });
  const sourcesBeforeEdge = audio.sources.length;

  audio.currentTime = 0.1;
  updateAirframeCueVoices(voices, audio, {
    ...base,
    speed_brake: 1,
    air_density_kg_m3: 0.002,
  });
  assert.equal(latest(voices.brakeGain.gain), 0, "high TAS alone cannot make board roar");
  assert.equal(latest(voices.brakeFlutterDepth.gain), 0, "no aerodynamic flutter without q");
  assert.ok(audio.sources.length > sourcesBeforeEdge, "extension still has a mechanism edge");

  audio.currentTime = 0.2;
  updateAirframeCueVoices(voices, audio, {
    ...base,
    speed_brake: 0,
    air_density_kg_m3: 1,
  });
  audio.currentTime = 0.3;
  updateAirframeCueVoices(voices, audio, {
    ...base,
    speed_brake: 1,
    air_density_kg_m3: 1,
  });
  assert.ok(latest(voices.brakeGain.gain) > 0.08, "real dynamic pressure drives board roar");
  assert.ok(latest(voices.brakeFlutterDepth.gain) > 0.01, "q drives shallow flutter");

  audio.currentTime = 0.4;
  updateAirframeCueVoices(voices, audio, {
    ...base,
    player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    speed_brake: 1,
    true_airspeed_kts: 145,
    air_density_kg_m3: 1.225,
  });
  const f22ApproachBrake = latest(voices.brakeGain.gain);
  assert.ok(f22ApproachBrake > 0.03,
    "approach boards remain audible after the sealed-bed duck");

  audio.currentTime = 0.5;
  updateAirframeCueVoices(voices, audio, {
    ...base,
    player_aircraft_id: "aircraft.rapier.fiction.v1",
    speed_brake: 1,
    true_airspeed_kts: 145,
    air_density_kg_m3: 1.225,
  });
  assert.ok(latest(voices.brakeGain.gain) < f22ApproachBrake * 0.1,
    "F-22 approach board lift does not alter another airframe's q response");
});

test("F-22 pull-G and unload do not invent suit, harness, strain, or canopy sounds", async () => {
  const {
    createEventVoices,
    updateAirframeCueVoices,
  } = await freshEventAudio("f22-g-silence");
  const audio = new FakeAudioContext();
  const voices = createEventVoices(audio, audio.destination);
  const base = {
    player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    pilot_gz: 6.5,
    true_airspeed_kts: 1_200,
  };

  updateAirframeCueVoices(voices, audio, {
    ...base,
    air_density_kg_m3: 0.5,
  });
  assert.equal(latest(voices.gGain.gain), 0);
  assert.equal(latest(voices.gSuitGain.gain), 0);
  assert.equal(latest(voices.gHarnessGain.gain), 0);
  assert.equal(latest(voices.gUnloadGain.gain), 0);
  assert.equal("canopyGain" in voices, false);
  assert.equal("canopy2Gain" in voices, false);

  audio.currentTime = 0.1;
  updateAirframeCueVoices(voices, audio, {
    ...base,
    pilot_gz: -1.3,
    pilot_negative_onset_rate_g_per_second: 3.2,
    air_density_kg_m3: 0.5,
  });
  assert.equal(latest(voices.gGain.gain), 0);
  assert.equal(latest(voices.gSuitGain.gain), 0);
  assert.equal(latest(voices.gHarnessGain.gain), 0);
  assert.equal(latest(voices.gUnloadGain.gain), 0);
  assert.equal("canopyGain" in voices, false);
  assert.equal("canopy2Gain" in voices, false);
});

test("contact classifier recognizes fighter, AWACS, Tu-95, and silent airframes", async () => {
  const { resolveContactAcousticClass } = await freshEventAudio("classification");
  assert.equal(resolveContactAcousticClass({
    bandit_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
  }), "fighter_jet");
  assert.equal(resolveContactAcousticClass({
    bandit_aircraft_id: "aircraft.awacs.kj-500.v1",
  }), "heavy_turboprop");
  assert.equal(resolveContactAcousticClass({
    bandit_aircraft_id: "aircraft.tu-95ms.bear.v1",
  }), "heavy_contra_prop");
  assert.equal(resolveContactAcousticClass({
    bandit_audio_class: "heavy_contra_prop",
  }), "heavy_contra_prop");
  assert.equal(resolveContactAcousticClass({
    bandit_aircraft_id: "aircraft.weather-balloon.v1",
  }), "silent");
});

test("nearby fighter is canopy-occluded and closure sign crossing fires one pass", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("fighter-pass");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const approaching = {
    bandit_aircraft_id: "aircraft.su27.v1",
    player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    range_m: 620,
    closure_kts: 180,
  };

  const first = updateContactAcousticVoices(voices, audio, approaching);
  assert.equal(first.acousticClass, "fighter_jet");
  assert.ok(first.fighterPresence > 0, "a fighter inside a kilometre is audible");
  assert.ok(latest(voices.fighterGain.gain) > 0);
  assert.equal(latest(voices.propNoiseGain.gain), 0);
  assert.equal(latest(voices.contactOcclusionFilter.frequency), 920, "sealed F-22 canopy");
  assert.ok(latest(voices.contactOcclusionFilter.gain) < -15,
    "the sealed canopy is a deep high shelf, not a brick-wall lowpass");

  audio.currentTime = 0.1;
  updateContactAcousticVoices(voices, audio, {
    ...approaching,
    range_m: 180,
    closure_kts: 0,
  });
  audio.currentTime = 0.2;
  const pass = updateContactAcousticVoices(voices, audio, {
    ...approaching,
    range_m: 210,
    closure_kts: -160,
  });
  assert.equal(pass.crossedPass, true);
  assert.equal(voices.passTransientCount, 1);

  audio.currentTime = 0.3;
  updateContactAcousticVoices(voices, audio, {
    ...approaching,
    range_m: 300,
    closure_kts: -220,
  });
  assert.equal(voices.passTransientCount, 1, "receding frames do not retrigger");

  audio.currentTime = 0.4;
  updateContactAcousticVoices(voices, audio, approaching, { cockpit: false });
  assert.equal(latest(voices.contactOcclusionFilter.frequency), 12_000);
  assert.equal(latest(voices.contactOcclusionFilter.gain), 0,
    "an exterior listener has no canopy between him and the contact");
  assert.equal(latest(voices.contactOutput.gain), 1.35);

  audio.currentTime = 0.5;
  updateContactAcousticVoices(voices, audio, {
    ...approaching,
    replay_external: true,
  });
  assert.equal(latest(voices.contactOcclusionFilter.frequency), 12_000,
    "external replay opens other-aircraft sound without a separate camera token");
});

test("distance removes upper-band detail independently of canopy occlusion", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("atmospheric-loss");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const state = {
    bandit_aircraft_id: "aircraft.f16c.v1",
    player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    closure_kts: 0,
    audio_perspective: "external",
  };

  const near = updateContactAcousticVoices(voices, audio, {
    ...state,
    range_m: 180,
  });
  const nearCutoff = latest(voices.contactAirFilter.frequency);
  assert.equal(latest(voices.contactOcclusionFilter.frequency), 12_000);
  assert.ok(nearCutoff > 12_000, "near external contact retains broadband detail");

  audio.currentTime = 0.2;
  const far = updateContactAcousticVoices(voices, audio, {
    ...state,
    range_m: 2400,
  });
  assert.ok(far.airCutoffHz < near.airCutoffHz * 0.55,
    "kilometres of propagation remove high-frequency energy");
  assert.equal(latest(voices.contactAirFilter.frequency), far.airCutoffHz);
  assert.equal(latest(voices.contactOcclusionFilter.frequency), 12_000,
    "atmosphere changes without pretending an external canopy exists");

  audio.currentTime = 0.4;
  updateContactAcousticVoices(voices, audio, {
    ...state,
    range_m: 180,
    audio_perspective: "cockpit",
  });
  assert.equal(latest(voices.contactOcclusionFilter.frequency), 920,
    "F-22 canopy remains a second, stronger near-field obstruction");
});

test("bounded Doppler distinguishes approach and departure and pass completion is latched", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("doppler-pass-hysteresis");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const base = {
    bandit_aircraft_id: "aircraft.mig29.v1",
    range_m: 720,
    outside_air_temperature_c: -20,
  };

  const approach = updateContactAcousticVoices(voices, audio, {
    ...base,
    closure_kts: 220,
  }, { cockpit: false });
  assert.equal(approach.passPhase, "approach");
  assert.ok(approach.doppler > 1.3 && approach.doppler <= 1.85);

  audio.currentTime = 0.1;
  const closest = updateContactAcousticVoices(voices, audio, {
    ...base,
    range_m: 180,
    closure_kts: 0,
  }, { cockpit: false });
  assert.equal(closest.passPhase, "closest");
  assert.equal(closest.crossedPass, false);

  audio.currentTime = 0.2;
  const departure = updateContactAcousticVoices(voices, audio, {
    ...base,
    range_m: 230,
    closure_kts: -220,
  }, { cockpit: false });
  assert.equal(departure.passPhase, "departure");
  assert.ok(departure.doppler < 0.8 && departure.doppler >= 0.66);
  assert.equal(departure.crossedPass, true);
  assert.equal(voices.passTransientCount, 1);

  // A noisy closure estimate cannot manufacture another pass for the same encounter.
  audio.currentTime = 0.3;
  updateContactAcousticVoices(voices, audio, {
    ...base,
    range_m: 250,
    closure_kts: 90,
  }, { cockpit: false });
  audio.currentTime = 0.4;
  const noisyRecross = updateContactAcousticVoices(voices, audio, {
    ...base,
    range_m: 260,
    closure_kts: -90,
  }, { cockpit: false });
  assert.equal(noisyRecross.crossedPass, false);
  assert.equal(voices.passTransientCount, 1);
});

test("relative geometry pans subtly in cockpit and strongly outside with neutral fallback", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("contact-pan");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const geometry = {
    bandit_aircraft_id: "aircraft.su27.v1",
    player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    range_m: 100,
    closure_kts: 0,
    px: 0, py: 0, pz: 0,
    pfx: 1, pfy: 0, pfz: 0,
    plx: 0, ply: 1, plz: 0,
  };

  const cockpitRight = updateContactAcousticVoices(voices, audio, {
    ...geometry,
    bx: 0, by: 0, bz: -100,
  });
  assert.ok(Math.abs(cockpitRight.pan - 0.5) < 1e-9);
  assert.equal(latest(voices.contactPanner.pan), cockpitRight.pan);

  audio.currentTime = 0.1;
  const cockpitLeft = updateContactAcousticVoices(voices, audio, {
    ...geometry,
    bx: 0, by: 0, bz: 100,
  });
  assert.ok(Math.abs(cockpitLeft.pan + 0.5) < 1e-9);

  audio.currentTime = 0.2;
  const externalLeft = updateContactAcousticVoices(voices, audio, {
    ...geometry,
    bx: 0, by: 0, bz: 100,
  }, { cockpit: false });
  assert.ok(Math.abs(externalLeft.pan + 0.92) < 1e-9);

  audio.currentTime = 0.3;
  const missingAxes = updateContactAcousticVoices(voices, audio, {
    bandit_aircraft_id: "aircraft.su27.v1",
    range_m: 100,
    closure_kts: 0,
  }, { cockpit: false });
  assert.equal(missingAxes.pan, 0);
  assert.equal(latest(voices.contactPanner.pan), 0);
});

test("contact identity adds stable bounded character without frame-to-frame randomness", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("stable-contact-character");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const common = { range_m: 500, closure_kts: 80 };

  const first = updateContactAcousticVoices(voices, audio, {
    ...common,
    bandit_aircraft_id: "aircraft.f16c.tail-a.v1",
  });
  const firstFrequency = latest(voices.fighterBp.frequency);
  audio.currentTime = 0.1;
  const same = updateContactAcousticVoices(voices, audio, {
    ...common,
    bandit_aircraft_id: "aircraft.f16c.tail-a.v1",
  });
  assert.equal(same.variation, first.variation);
  assert.equal(latest(voices.fighterBp.frequency), firstFrequency);
  assert.ok(Math.abs(first.variation) <= 1);

  audio.currentTime = 0.2;
  const other = updateContactAcousticVoices(voices, audio, {
    ...common,
    bandit_aircraft_id: "aircraft.f16c.tail-b.v1",
  });
  assert.notEqual(other.variation, first.variation);
  assert.notEqual(latest(voices.fighterBp.frequency), firstFrequency);
  assert.ok(Math.abs(other.variation) <= 1);
});

test("Tu-95 contra-prop branch remains present at long range", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("tu95-range");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);

  const result = updateContactAcousticVoices(voices, audio, {
    bandit_aircraft_id: "aircraft.tu95ms.bear.v1",
    player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    range_m: 50_000,
    closure_kts: 90,
  });
  assert.equal(result.acousticClass, "heavy_contra_prop");
  assert.ok(result.propPresence > 0.1, "low-frequency aircraft remains audible far away");
  assert.ok(latest(voices.propNoiseGain.gain) > 0.01);
  assert.ok(latest(voices.propBladeOsc.frequency) > 50, "closure applies bounded Doppler");
  assert.ok(result.airCutoffHz < 1000,
    "long-range atmosphere leaves the Bear's low-frequency signature");
  assert.equal(latest(voices.fighterGain.gain), 0);

  audio.currentTime = 0.2;
  const beyond = updateContactAcousticVoices(voices, audio, {
    bandit_aircraft_id: "aircraft.tu95ms.bear.v1",
    range_m: 90_000,
    closure_kts: 0,
  });
  assert.equal(beyond.propPresence, 0, "long range is finite, not omnipresent");
  assert.equal(latest(voices.propNoiseGain.gain), 0);
});

test("fighter level follows inverse-distance spreading instead of a linear cliff", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("contact-spreading");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const base = {
    bandit_aircraft_id: "aircraft.su27.v1",
    closure_kts: 0,
    audio_perspective: "external",
  };

  const sample = (rangeM) => {
    audio.currentTime += 0.1;
    return updateContactAcousticVoices(voices, audio, { ...base, range_m: rangeM });
  };

  // Sound pressure goes as 1/r, so every doubling of range is half the amplitude (-6 dB).
  const near = sample(250);
  const far = sample(500);
  const ratio = near.fighterPresence / far.fighterPresence;
  assert.ok(ratio > 1.85 && ratio < 2.15,
    `doubling range should roughly halve pressure, got ${ratio.toFixed(3)}`);

  // Inside the near-field reference the level stops climbing rather than going singular.
  const veryNear = sample(20);
  const atReference = sample(110);
  assert.ok(veryNear.fighterPresence / atReference.fighterPresence < 1.001,
    "an airframe-sized source is not a point source at 20 m: level stops climbing inside the "
    + "near-field reference instead of going singular");

  // The old linear law switched a fighter off completely at 2.6 km. Distant contacts must fade,
  // not vanish, and must still be gone by the horizon.
  assert.ok(sample(4_000).fighterPresence > 0, "a fighter at 4 km is quiet, not absent");
  assert.equal(sample(14_000).fighterPresence, 0, "the horizon is finite");
});

test("a jet sounds different coming at you than going away", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("contact-aspect");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const geometry = {
    bandit_aircraft_id: "aircraft.su27.v1",
    range_m: 400,
    closure_kts: 0,
    audio_perspective: "external",
    px: 0, py: 0, pz: 0,
    pfx: 1, pfy: 0, pfz: 0,
    plx: 0, ply: 1, plz: 0,
    bx: 400, by: 0, bz: 0,
  };

  // Contact 400 m ahead, pointed straight at the listener: nose-on, inlet arc.
  const noseOn = updateContactAcousticVoices(voices, audio, {
    ...geometry,
    bfx: -1, bfy: 0, bfz: 0,
  });
  const noseOnPlume = latest(voices.fighterGain.gain);
  const noseOnFan = latest(voices.fighterFanGain.gain);

  // Same position and range, now pointed away: tail-on, looking up the tailpipe.
  audio.currentTime = 0.1;
  const tailOn = updateContactAcousticVoices(voices, audio, {
    ...geometry,
    bfx: 1, bfy: 0, bfz: 0,
  });
  const tailOnPlume = latest(voices.fighterGain.gain);
  const tailOnFan = latest(voices.fighterFanGain.gain);

  assert.ok(noseOn.exhaustAspect < -0.99, "listener is dead ahead of the contact");
  assert.ok(tailOn.exhaustAspect > 0.99, "listener is dead astern of the contact");
  assert.ok(tailOnPlume > noseOnPlume * 2.5,
    "plume mixing noise is thrown backwards, so the rear arc is far louder");
  assert.ok(noseOnFan > tailOnFan * 2.5,
    "inlet-radiated fan tone dominates the forward arc instead");

  // With no published contact axis the closure sign carries the aspect: closing is nose-on.
  audio.currentTime = 0.2;
  const closingProxy = updateContactAcousticVoices(voices, audio, {
    bandit_aircraft_id: "aircraft.su27.v1",
    range_m: 400,
    closure_kts: 400,
  });
  audio.currentTime = 0.3;
  const openingProxy = updateContactAcousticVoices(voices, audio, {
    bandit_aircraft_id: "aircraft.su27.v1",
    range_m: 400,
    closure_kts: -400,
  });
  assert.ok(closingProxy.exhaustAspect < -0.9);
  assert.ok(openingProxy.exhaustAspect > 0.9);
});

test("the fan tone sweeps with Doppler through a pass", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("contact-fan-sweep");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const base = {
    bandit_aircraft_id: "aircraft.su27.v1",
    audio_perspective: "external",
    range_m: 600,
  };

  const approach = updateContactAcousticVoices(voices, audio, { ...base, closure_kts: 600 });
  const approachHz = latest(voices.fighterFanOsc.frequency);
  assert.equal(latest(voices.fighterFanFilter.frequency), approachHz,
    "the bandpass tracks the tone rather than sitting still while it moves");

  audio.currentTime = 0.5;
  const depart = updateContactAcousticVoices(voices, audio, { ...base, closure_kts: -600 });
  const departHz = latest(voices.fighterFanOsc.frequency);

  assert.ok(approach.doppler > 1.4 && depart.doppler < 0.75);
  assert.ok(approachHz / departHz > 2,
    `the pass must sweep more than an octave, got ${(approachHz / departHz).toFixed(2)}x`);
});

test("Doppler charges listener motion to the listener, not to the source", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("contact-doppler-split");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const geometry = {
    bandit_aircraft_id: "aircraft.su27.v1",
    range_m: 1_000,
    closure_kts: 400,
    air_temperature_c: 15,
    px: 0, py: 0, pz: 0,
    pfx: 1, pfy: 0, pfz: 0,
    plx: 0, ply: 1, plz: 0,
    bx: 1_000, by: 0, bz: 0,
  };

  // All 400 kt of closure belongs to a stationary listener's target.
  const allSource = updateContactAcousticVoices(voices, audio, {
    ...geometry,
    true_airspeed_kts: 0,
  }, { cockpit: false });

  // The same 400 kt of closure, now produced entirely by the listener's own speed.
  audio.currentTime = 0.1;
  const allListener = updateContactAcousticVoices(voices, audio, {
    ...geometry,
    true_airspeed_kts: 400,
  }, { cockpit: false });

  assert.ok(allSource.doppler > allListener.doppler,
    "a source running at you shifts more than you running at it — the source term is hyperbolic "
    + "and the listener term is linear, which is exactly why the split matters");
  assert.ok(allListener.doppler > 1, "closing still raises the pitch either way");
});

test("every merge of a dogfight cracks, not just the first", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("contact-pass-rearm");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const bandit = { bandit_aircraft_id: "aircraft.su27.v1" };
  let clock = 0;
  const frame = (range_m, closure_kts) => {
    clock += 0.1;
    audio.currentTime = clock;
    return updateContactAcousticVoices(voices, audio, { ...bandit, range_m, closure_kts });
  };

  const merge = () => {
    frame(2_000, 600);
    frame(400, 600);
    frame(200, 0);
    return frame(300, -600);
  };

  assert.equal(merge().crossedPass, true);
  assert.equal(voices.passTransientCount, 1);

  // Separate for a re-attack. This is a turning fight, not a BVR reset: the aircraft never leave
  // a couple of kilometres of each other, and the fix has to cover that or it covers nothing.
  frame(700, -600);
  frame(900, -400);
  assert.equal(merge().crossedPass, true, "the second merge of a turning fight must be heard too");
  assert.equal(voices.passTransientCount, 2);

  // Noise around zero closure inside the same encounter still cannot manufacture one.
  frame(320, 90);
  assert.equal(frame(330, -90).crossedPass, false);
  assert.equal(voices.passTransientCount, 2);
});

test("a contact behind the listener is shaded darker than the same contact ahead", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("contact-rear-shade");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const geometry = {
    bandit_aircraft_id: "aircraft.su27.v1",
    range_m: 300,
    closure_kts: 0,
    player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    px: 0, py: 0, pz: 0,
    pfx: 1, pfy: 0, pfz: 0,
    plx: 0, ply: 1, plz: 0,
  };

  const ahead = updateContactAcousticVoices(voices, audio, {
    ...geometry, bx: 300, by: 0, bz: 0,
  });
  const aheadCorner = latest(voices.contactOcclusionFilter.frequency);
  const aheadDb = latest(voices.contactOcclusionFilter.gain);

  audio.currentTime = 0.1;
  const behind = updateContactAcousticVoices(voices, audio, {
    ...geometry, bx: -300, by: 0, bz: 0,
  });
  const behindCorner = latest(voices.contactOcclusionFilter.frequency);
  const behindDb = latest(voices.contactOcclusionFilter.gain);

  assert.ok(ahead.foreAft > 0.99 && behind.foreAft < -0.99);
  assert.ok(behindCorner < aheadCorner, "the shelf reaches further down behind the listener");
  assert.ok(behindDb < aheadDb, "and takes more out of the band it reaches");
});

test("the pass crack sweeps from the approach Doppler, not the departing one", async () => {
  const {
    createContactAcousticVoices,
    updateContactAcousticVoices,
  } = await freshEventAudio("contact-pass-sweep-latch");
  const audio = new FakeAudioContext();
  const voices = createContactAcousticVoices(audio, audio.destination);
  const bandit = { bandit_aircraft_id: "aircraft.su27.v1" };
  let clock = 0;
  const frame = (range_m, closure_kts) => {
    clock += 0.1;
    audio.currentTime = clock;
    return updateContactAcousticVoices(voices, audio, { ...bandit, range_m, closure_kts });
  };

  frame(2_000, 700);
  frame(600, 700);
  const approaching = frame(220, 400);
  // A crossing is detected only once closure has already gone negative, so the ratio on that frame
  // is the DEPARTING one. Handing it to the transient would clamp the sweep to unity and the crack
  // would sweep nowhere.
  assert.ok(voices.approachDoppler >= approaching.doppler);
  assert.ok(voices.approachDoppler > 1.3, "the approach ratio is latched while the pass is armed");

  const before = audio.filters.length;
  const crossing = frame(260, -700);
  assert.equal(crossing.crossedPass, true);
  assert.ok(crossing.doppler < 1, "the crossing frame itself is already receding");
  const passFilter = audio.filters.at(-1);
  assert.ok(audio.filters.length > before, "the transient allocated its own sweep filter");
  const [start, end] = passFilter.frequency.targets.map((entry) => entry.value);
  assert.ok(start / end > 5,
    `the crack must sweep down hard, got ${(start / end).toFixed(2)}x`);
  assert.ok(start > 1850, "and start above the un-shifted band because it arrived shifted up");
});
