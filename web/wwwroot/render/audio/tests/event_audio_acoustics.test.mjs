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
  assert.ok(approach.doppler > 1.3 && approach.doppler <= 1.55);

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
  assert.ok(departure.doppler < 0.8 && departure.doppler >= 0.72);
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
  assert.ok(Math.abs(cockpitRight.pan - 0.28) < 1e-9);
  assert.equal(latest(voices.contactPanner.pan), cockpitRight.pan);

  audio.currentTime = 0.1;
  const cockpitLeft = updateContactAcousticVoices(voices, audio, {
    ...geometry,
    bx: 0, by: 0, bz: 100,
  });
  assert.ok(Math.abs(cockpitLeft.pan + 0.28) < 1e-9);

  audio.currentTime = 0.2;
  const externalLeft = updateContactAcousticVoices(voices, audio, {
    ...geometry,
    bx: 0, by: 0, bz: 100,
  }, { cockpit: false });
  assert.ok(Math.abs(externalLeft.pan + 0.78) < 1e-9);

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
