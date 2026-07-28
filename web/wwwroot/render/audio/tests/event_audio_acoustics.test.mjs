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
  assert.ok(first.fighterPresence > 0.5);
  assert.ok(latest(voices.fighterGain.gain) > 0.08);
  assert.equal(latest(voices.propNoiseGain.gain), 0);
  assert.equal(latest(voices.contactOcclusionFilter.frequency), 920, "sealed F-22 canopy");

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
  assert.equal(latest(voices.contactOutput.gain), 1.35);

  audio.currentTime = 0.5;
  updateContactAcousticVoices(voices, audio, {
    ...approaching,
    replay_external: true,
  });
  assert.equal(latest(voices.contactOcclusionFilter.frequency), 12_000,
    "external replay opens other-aircraft sound without a separate camera token");
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
