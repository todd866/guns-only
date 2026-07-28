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

  linearRampToValueAtTime(value, time) {
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

class FakeWaveShaper extends FakeNode {
  constructor() {
    super();
    this.curve = null;
    this.oversample = "none";
  }
}

class FakeDelay extends FakeNode {
  constructor() {
    super();
    this.delayTime = new FakeAudioParam(0);
  }
}

class FakeConstantSource extends FakeNode {
  constructor() {
    super();
    this.offset = new FakeAudioParam(1);
    this.started = false;
  }

  start() {
    this.started = true;
  }
}

class FakeCompressor extends FakeNode {
  constructor() {
    super();
    this.threshold = new FakeAudioParam(-24);
    this.knee = new FakeAudioParam(30);
    this.ratio = new FakeAudioParam(12);
    this.attack = new FakeAudioParam(0.003);
    this.release = new FakeAudioParam(0.25);
  }
}

class FakeAudioContext {
  static instances = [];

  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.sampleRate = 1024;
    this.destination = new FakeNode();
    this.gains = [];
    this.oscillators = [];
    this.filters = [];
    this.sources = [];
    this.buffers = [];
    this.compressors = [];
    this.waveShapers = [];
    this.delays = [];
    this.constants = [];
    FakeAudioContext.instances.push(this);
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

  createDynamicsCompressor() {
    const node = new FakeCompressor();
    this.compressors.push(node);
    return node;
  }

  createWaveShaper() {
    const node = new FakeWaveShaper();
    this.waveShapers.push(node);
    return node;
  }

  createDelay(_maxDelayTime = 1) {
    const node = new FakeDelay();
    this.delays.push(node);
    return node;
  }

  createConstantSource() {
    const node = new FakeConstantSource();
    this.constants.push(node);
    return node;
  }

  createBuffer(_channels, frames) {
    const data = new Float32Array(frames);
    const buffer = { getChannelData: () => data, data };
    this.buffers.push(buffer);
    return buffer;
  }

  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

function latest(param) {
  return param.targets.at(-1)?.value;
}

async function freshModule(path, label) {
  freshModule.sequence = (freshModule.sequence ?? 0) + 1;
  return import(`${path}?test=${label}-${freshModule.sequence}`);
}

function spoolToGoverned(update, audio, state) {
  for (let step = 1; step <= 24; step++) {
    audio.currentTime = step * 0.25;
    update(state);
  }
}

test("build creates living jet stack: orders, shaft, grit, crackle, breath mods", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { createEngineVoices, updateEngineVoices } = await freshModule(
      "../engine_audio.js",
      "build",
    );
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    updateEngineVoices(voices, audio, {
      applied_throttle: 1.55,
      engine_rpm_pct: 100,
      mach: 0.8,
      true_airspeed_kts: 500,
      air_density_kg_m3: 0.7,
    });

    assert.equal(voices.fanOrders.length, 8, "dense fan-order comb");
    assert.ok(voices.fanOrders.every((order) =>
      order.oscillator.type === "sawtooth" && order.oscillator.started));
    assert.ok(voices.shaftOsc.started, "shaft growl");
    assert.ok(voices.flutterLfo.started, "detune flutter");
    assert.ok(voices.crackleLfo.started, "grit LFO");
    assert.ok(voices.crackleImpulseGain, "impulse crackle path");
    assert.ok(voices.breathDepth, "irregular breath mod");
    assert.ok(voices.shimmerDepth, "tonal shimmer mod");
    assert.ok(voices.jetGritHiPre, "high grit band");
    assert.ok(voices.cabinLp, "cabin ceiling filter");
    assert.ok(audio.waveShapers.length >= 2, "abs-mod + exhaust saturation");
    assert.ok(audio.sources.length >= 5, "pink/white/mod/crackle/airframe beds");
    assert.ok(audio.delays.length >= 1);

    // Seeded beds stay deterministic across builds.
    const second = createEngineVoices(audio, audio.destination, { includeMaster: true });
    assert.ok(second.fanOrders.length === 8);
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("fan order fundamental sits in hundreds of Hz, not organ sub-bass", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { createEngineVoices, updateEngineVoices } = await freshModule(
      "../engine_audio.js",
      "orders",
    );
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const state = {
      applied_throttle: 1.0,
      engine_rpm_pct: 100,
      mach: 0.7,
      true_airspeed_kts: 400,
      air_density_kg_m3: 1.0,
    };
    for (let step = 1; step <= 24; step++) {
      audio.currentTime = step * 0.25;
      updateEngineVoices(voices, audio, state);
    }
    const fundamental = latest(voices.fanOrders[0].oscillator.frequency);
    assert.ok(fundamental > 400, `got ${fundamental}`);
    assert.ok(fundamental < 1200, `got ${fundamental}`);
    const shaft = latest(voices.shaftOsc.frequency);
    assert.ok(shaft > 60 && shaft < 250, `shaft growl in cockpit band, got ${shaft}`);
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("audio-clock RPM is rate-limited and turbine-to-ram handover completes", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { createEngineVoices, updateEngineVoices } = await freshModule(
      "../engine_audio.js",
      "spool",
    );
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const state = {
      applied_throttle: 1.55,
      engine_rpm_pct: 100,
      mach: 1.9,
      true_airspeed_kts: 800,
      air_density_kg_m3: 0.3,
      player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
    };
    updateEngineVoices(voices, audio, state);
    audio.currentTime = 1;
    updateEngineVoices(voices, audio, state);
    const expected = 185 + 0.055 * 480 + 90;
    assert.ok(Math.abs(latest(voices.fanOrders[0].oscillator.frequency) - expected) < 1e-6);

    for (let step = 1; step <= 24; step++) {
      audio.currentTime = 1 + step * 0.25;
      updateEngineVoices(voices, audio, state);
    }
    audio.currentTime += 0.25;
    updateEngineVoices(voices, audio, { ...state, mach: 2.8 });
    assert.ok(latest(voices.fanOrderGain.gain) < 1e-12, "fan orders mute when ram owns");
    assert.ok(latest(voices.ramGain.gain) > 0.08, "ram broadband owns handed-over mix");
    assert.ok(latest(voices.ramHowlGain.gain) > 0.04, "ram howl carries tonal shift");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("airframe rush follows dynamic pressure, not throttle, and mute remains available", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { createEngineVoices, updateEngineVoices } = await freshModule(
      "../engine_audio.js",
      "rush",
    );
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const flight = {
      engine_rpm_pct: 80,
      mach: 0.9,
      true_airspeed_kts: 600,
      air_density_kg_m3: 0.65,
    };
    updateEngineVoices(voices, audio, { ...flight, applied_throttle: 0 });
    const idleRush = latest(voices.rushGain.gain);
    const highQCanopy = latest(voices.canopyFlowGain.gain);

    audio.currentTime = 0.1;
    updateEngineVoices(voices, audio, { ...flight, applied_throttle: 1.55 });
    assert.equal(latest(voices.rushGain.gain), idleRush);
    assert.equal(latest(voices.canopyFlowGain.gain), highQCanopy,
      "canopy flow is independent of throttle");

    audio.currentTime = 0.2;
    updateEngineVoices(voices, audio, {
      ...flight,
      applied_throttle: 0,
      true_airspeed_kts: 200,
    }, { muted: true });
    assert.ok(latest(voices.rushGain.gain) < idleRush);
    assert.ok(latest(voices.canopyFlowGain.gain) < highQCanopy);
    assert.equal(latest(voices.master.gain), 0);
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("thin air and collapsed thrust near-silence the propulsion stack", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { createEngineVoices, updateEngineVoices } = await freshModule(
      "../engine_audio.js",
      "coast",
    );
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const dense = {
      applied_throttle: 1.55,
      engine_rpm_pct: 100,
      mach: 0.9,
      true_airspeed_kts: 450,
      air_density_kg_m3: 1.1,
      rapier_turbine_thrust_kn: 90,
      rapier_ramjet_thrust_kn: 0,
    };
    for (let step = 1; step <= 24; step++) {
      audio.currentTime = step * 0.25;
      updateEngineVoices(voices, audio, dense);
    }
    const denseJet = latest(voices.jetBodyGain.gain);
    const denseFan = latest(voices.fanOrderGain.gain);

    audio.currentTime += 0.25;
    updateEngineVoices(voices, audio, {
      applied_throttle: 0.05,
      engine_rpm_pct: 20,
      mach: 2.2,
      true_airspeed_kts: 900,
      air_density_kg_m3: 0.04,
      rapier_turbine_thrust_kn: 0,
      rapier_ramjet_thrust_kn: 0,
      rapier_rcs_authority: 0.8,
    });
    assert.ok(latest(voices.fanOrderGain.gain) < denseFan * 0.2);
    assert.ok(latest(voices.jetBodyGain.gain) < denseJet * 0.2);
    assert.ok(latest(voices.crackleImpulseGain.gain) < 0.02);
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("power opens grit and impulse crackle harder than idle", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { createEngineVoices, updateEngineVoices } = await freshModule(
      "../engine_audio.js",
      "power",
    );
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const base = {
      engine_rpm_pct: 100,
      mach: 0.7,
      true_airspeed_kts: 400,
      air_density_kg_m3: 1.0,
    };
    for (let step = 1; step <= 24; step++) {
      audio.currentTime = step * 0.25;
      updateEngineVoices(voices, audio, { ...base, applied_throttle: 0.2 });
    }
    const idleGrit = latest(voices.jetGritPre.gain);
    const idleCrackle = latest(voices.crackleImpulseGain.gain);
    const idleBreath = latest(voices.breathDepth.gain);

    audio.currentTime += 0.25;
    updateEngineVoices(voices, audio, { ...base, applied_throttle: 1.55 });
    assert.ok(latest(voices.jetGritPre.gain) > idleGrit * 1.8);
    assert.ok(latest(voices.crackleImpulseGain.gain) > idleCrackle * 2);
    assert.ok(latest(voices.breathDepth.gain) > idleBreath * 1.4,
      "MIL must breathe harder — anti-static");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("unsupported Web Audio disables the module permanently without throwing", async () => {
  const previous = globalThis.AudioContext;
  const previousWebkit = globalThis.webkitAudioContext;
  try {
    delete globalThis.AudioContext;
    delete globalThis.webkitAudioContext;
    const { updateEngineAudio } = await freshModule("../engine_audio.js", "unsupported");
    assert.doesNotThrow(() => updateEngineAudio({}));

    let constructed = false;
    globalThis.AudioContext = class extends FakeAudioContext {
      constructor() {
        super();
        constructed = true;
      }
    };
    assert.doesNotThrow(() => updateEngineAudio({ engine_rpm_pct: 100 }));
    assert.equal(constructed, false);
  } finally {
    globalThis.AudioContext = previous;
    globalThis.webkitAudioContext = previousWebkit;
  }
});

test("flight façade shares one compressor bus, honors mute, and schedules gun reports", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      updateFlightAudio,
      setFlightAudioEnabled,
    } = await freshModule("../flight_audio.js", "facade");

    updateFlightAudio({
      applied_throttle: 1.0,
      engine_rpm_pct: 90,
      mach: 0.8,
      true_airspeed_kts: 420,
      air_density_kg_m3: 1.0,
      gun_firing: true,
      buffet: true,
      buffet_pitch_deg: 1.2,
    }, { muted: false, triggerHeld: true, nowSeconds: 1.0 });

    const audio = FakeAudioContext.instances.at(-1);
    assert.equal(audio.compressors.length, 1);
    const master = audio.gains[0].gain;
    assert.ok(latest(master) > 0);
    assert.ok(latest(audio.gains[1].gain) > 0,
      "propulsion retains its authored submix trim ahead of the shared compressor");

    const oscillatorsBefore = audio.oscillators.length;
    audio.currentTime = 0.12;
    updateFlightAudio({
      applied_throttle: 1.0,
      engine_rpm_pct: 90,
      mach: 0.8,
      true_airspeed_kts: 420,
      air_density_kg_m3: 1.0,
      gun_firing: true,
    }, { muted: false, triggerHeld: true, nowSeconds: 1.12 });
    assert.ok(audio.oscillators.length > oscillatorsBefore);

    audio.currentTime = 0.2;
    updateFlightAudio({
      applied_throttle: 1.0,
      engine_rpm_pct: 90,
      mach: 0.8,
      true_airspeed_kts: 420,
      air_density_kg_m3: 1.0,
      auto_gcas_warning: true,
      pilot_conscious: true,
    }, { muted: true, triggerHeld: false, nowSeconds: 1.2 });
    assert.equal(latest(master), 0);

    setFlightAudioEnabled(false);
    assert.equal(latest(master), 0);
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("flight façade disables permanently when Web Audio is missing", async () => {
  const previous = globalThis.AudioContext;
  const previousWebkit = globalThis.webkitAudioContext;
  try {
    delete globalThis.AudioContext;
    delete globalThis.webkitAudioContext;
    const { updateFlightAudio } = await freshModule("../flight_audio.js", "noaudio");
    assert.doesNotThrow(() => updateFlightAudio({}));
  } finally {
    globalThis.AudioContext = previous;
    globalThis.webkitAudioContext = previousWebkit;
  }
});

test("attachJetSampleBeds ducks synth and opens mil bed under power", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createEngineVoices,
      updateEngineVoices,
      attachJetSampleBeds,
    } = await freshModule("../engine_audio.js", "samples");
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const bed = audio.createBuffer(1, 64);
    assert.equal(attachJetSampleBeds(voices, audio, { mil: bed, idle: bed, grit: bed }), true);
    assert.equal(voices.hasSampleBeds, true);
    assert.ok(voices.sampleMil?.started);

    const state = {
      applied_throttle: 1.55,
      engine_rpm_pct: 100,
      mach: 0.8,
      true_airspeed_kts: 500,
      air_density_kg_m3: 1.0,
      player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
    };
    for (let step = 1; step <= 24; step++) {
      audio.currentTime = step * 0.25;
      updateEngineVoices(voices, audio, state);
    }
    assert.ok(latest(voices.sampleMilGain.gain) > 0.4, "MIL sample owns power");
    assert.ok(latest(voices.jetBodyGain.gain) < 0.15, "synth body ducked under samples");
    assert.equal(latest(voices.shaftGain.gain), 0, "shaft saw muted under beds");
    assert.equal(latest(voices.fanOrderGain.gain), 0, "fan orders muted under beds");
    assert.equal(latest(voices.breathDepth.gain), 0, "breath AM muted under beds");
    assert.ok(Math.abs(latest(voices.sampleMil.playbackRate) - 1) < 1e-6, "bed pitch locked");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("replaceJetSampleBeds retires the previous aircraft palette", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      attachJetSampleBeds,
      createEngineVoices,
      replaceJetSampleBeds,
    } = await freshModule("../engine_audio.js", "sample-replacement");
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const rapier = audio.createBuffer(1, 64);
    const f22 = audio.createBuffer(1, 96);
    attachJetSampleBeds(
      voices,
      audio,
      { idle: rapier, mil: rapier, grit: rapier },
      { character: "rapier" },
    );
    const retiring = [
      ...voices.sampleIdleVariants,
      ...voices.sampleMilVariants,
      ...voices.sampleGritVariants,
    ];

    audio.currentTime = 3;
    assert.equal(replaceJetSampleBeds(
      voices,
      audio,
      { idle: f22, mil: f22, grit: f22 },
      { character: "f22" },
    ), true);
    assert.equal(voices.sampleBedCharacter, "f22");
    assert.ok(voices.sampleMil?.started);
    assert.ok(retiring.every((variant) => variant.source.started === false));
    assert.ok(retiring.every((variant) => latest(variant.gain.gain) === 0));
    assert.equal(latest(voices.sampleMilVariants[0].gain.gain), 1);
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("alternate F-22 beds equal-power crossfade and cockpit equipment remains alive", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createEngineVoices,
      updateEngineVoices,
      attachJetSampleBeds,
    } = await freshModule("../engine_audio.js", "sample-palette");
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const primary = audio.createBuffer(1, 64);
    const alternate = audio.createBuffer(1, 96);
    attachJetSampleBeds(voices, audio, {
      idle: primary,
      mil: primary,
      grit: primary,
      idleVariants: [primary, alternate],
      milVariants: [primary, alternate],
      gritVariants: [primary, alternate],
    }, { character: "f22" });

    audio.currentTime = 12;
    updateEngineVoices(voices, audio, {
      applied_throttle: 1.3,
      engine_rpm_pct: 100,
      mach: 0.9,
      true_airspeed_kts: 500,
      air_density_kg_m3: 0.9,
      pilot_gz: 4.2,
      audio_profile_id: "audio.f22a.aged-twin-fan.v1",
    }, { snap: true });

    assert.equal(voices.sampleMilVariants.length, 2);
    const a = latest(voices.sampleMilVariants[0].gain.gain);
    const b = latest(voices.sampleMilVariants[1].gain.gain);
    assert.ok(a > 0 && b > 0, "both independent beds contribute");
    assert.ok(Math.abs(a * a + b * b - 1) < 1e-6, "equal-power crossfade");
    assert.ok(latest(voices.ecsGain.gain) > 0, "ECS cabin floor");
    assert.ok(latest(voices.inverterGain.gain) > 0, "400 Hz electrical floor");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("throttle slam accents grit then decays", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { createEngineVoices, updateEngineVoices } = await freshModule(
      "../engine_audio.js",
      "accent",
    );
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const base = {
      engine_rpm_pct: 100,
      mach: 0.7,
      true_airspeed_kts: 420,
      air_density_kg_m3: 1.0,
    };
    for (let step = 1; step <= 20; step++) {
      audio.currentTime = step * 0.25;
      updateEngineVoices(voices, audio, { ...base, applied_throttle: 0.2 });
    }
    const idleGrit = latest(voices.jetGritPre.gain);
    audio.currentTime += 0.05;
    updateEngineVoices(voices, audio, { ...base, applied_throttle: 1.55 });
    assert.ok(voices.throttleAccent > 0.3, "slam raises accent");
    assert.ok(latest(voices.jetGritPre.gain) > idleGrit, "grit jumps on slam");
    for (let step = 1; step <= 20; step++) {
      audio.currentTime += 0.25;
      updateEngineVoices(voices, audio, { ...base, applied_throttle: 1.55 });
    }
    assert.ok(voices.throttleAccent < 0.05, "accent decays while held");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("sample beds duck and ram howl owns Mach handover", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createEngineVoices,
      updateEngineVoices,
      attachJetSampleBeds,
    } = await freshModule("../engine_audio.js", "handover-beds");
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const bed = audio.createBuffer(1, 64);
    attachJetSampleBeds(voices, audio, { mil: bed, idle: bed, grit: bed });
    const milState = {
      applied_throttle: 1.55,
      engine_rpm_pct: 100,
      mach: 0.85,
      true_airspeed_kts: 520,
      air_density_kg_m3: 0.9,
      player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
    };
    for (let step = 1; step <= 24; step++) {
      audio.currentTime = step * 0.25;
      updateEngineVoices(voices, audio, milState);
    }
    const milBed = latest(voices.sampleMilGain.gain);
    audio.currentTime += 0.25;
    updateEngineVoices(voices, audio, {
      ...milState,
      mach: 2.8,
      true_airspeed_kts: 1500,
      air_density_kg_m3: 0.22,
      rapier_turbine_thrust_kn: 2,
      rapier_ramjet_thrust_kn: 80,
    });
    assert.ok(latest(voices.sampleMilGain.gain) < milBed * 0.15, "turbine beds fade at ram");
    assert.ok(latest(voices.ramHowlGain.gain) > 0.05, "ram howl present under beds");
    assert.ok(latest(voices.sampleHp.frequency) > 300, "bed HP rises into duct character");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("crackle impulse buffer is sparse and seeded", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { crackleImpulseBuffer } = await freshModule("../engine_audio.js", "crackle");
    const audio = new FakeAudioContext();
    const a = crackleImpulseBuffer(audio, 0xC2AC1E);
    const b = crackleImpulseBuffer(audio, 0xC2AC1E);
    assert.deepEqual(a.data, b.data);
    const nonzero = a.data.filter((v) => v !== 0).length;
    assert.ok(nonzero > 20 && nonzero < a.data.length * 0.15, "sparse impulses");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("F-22 sealed cockpit: dark body, muted tip whine, no ram", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { createEngineVoices, updateEngineVoices } = await freshModule(
      "../engine_audio.js",
      "f22-engine",
    );
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const state = {
      applied_throttle: 1.55,
      engine_rpm_pct: 100,
      mach: 1.8,
      true_airspeed_kts: 1050,
      air_density_kg_m3: 0.45,
      player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    };
    for (let step = 1; step <= 24; step++) {
      audio.currentTime = step * 0.25;
      updateEngineVoices(voices, audio, state);
    }
    assert.ok(latest(voices.jetBodyGain.gain) > 0.3, "F-22 cockpit body rumble");
    assert.ok(latest(voices.fanWhineGain.gain) < 0.02, "tip whine ducked in cockpit");
    assert.ok(latest(voices.cabinLp.frequency) < 1600, "sealed cabin ceiling");
    assert.ok(latest(voices.compressorTraceGain.gain) > 0.008,
      "structure-borne RPM trace survives the sealed cabin");
    assert.ok(latest(voices.ramGain.gain) < 1e-6, "no ram duct on F-22");
    assert.ok(latest(voices.ramHowlGain.gain) < 1e-6, "no ram howl on F-22");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("F-22 power uses its published lever stop and RPM remains audible under beds", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      attachJetSampleBeds,
      createEngineVoices,
      updateEngineVoices,
    } = await freshModule("../engine_audio.js", "f22-rpm-cue");
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const bed = audio.createBuffer(1, 64);
    attachJetSampleBeds(voices, audio, {
      idle: bed,
      mil: bed,
      grit: bed,
    }, { character: "f22" });
    const base = {
      applied_throttle: 0.8,
      engine_spool_fraction: 0.8,
      max_thrust_fraction: 1.35,
      engine_rpm_pct: 60,
      mach: 0.7,
      true_airspeed_kts: 420,
      air_density_kg_m3: 0.9,
      player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    };
    spoolToGoverned(
      (state) => updateEngineVoices(voices, audio, state),
      audio,
      base,
    );
    const lowRpmHz = latest(voices.compressorTraceOsc.frequency);
    assert.ok(latest(voices.compressorTraceGain.gain) > 0,
      "RPM trace remains live while fixed-pitch beds own the body");

    for (let step = 1; step <= 12; step++) {
      audio.currentTime += 0.25;
      updateEngineVoices(voices, audio, {
        ...base,
        applied_throttle: 1.35,
        engine_spool_fraction: 1.35,
        engine_rpm_pct: 100,
      });
    }
    assert.ok(latest(voices.compressorTraceOsc.frequency) > lowRpmHz + 80);
    assert.equal(latest(voices.sampleMil.playbackRate), 1,
      "broadband cockpit bed itself stays fixed-pitch");

    audio.currentTime += 0.25;
    updateEngineVoices(voices, audio, {
      ...base,
      applied_throttle: 1.35,
      engine_spool_fraction: 1.35,
      engine_rpm_pct: 100,
    }, { snap: true });
    assert.ok(voices.powerSlew > 0.99,
      "F-22's published 1.35 lever stop maps full augmentation to full audio power");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("external F-22 perspective drops cockpit beds and opens the propulsion spectrum", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      attachJetSampleBeds,
      createEngineVoices,
      updateEngineVoices,
    } = await freshModule("../engine_audio.js", "f22-exterior");
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const bed = audio.createBuffer(1, 64);
    attachJetSampleBeds(
      voices,
      audio,
      { idle: bed, mil: bed, grit: bed },
      { character: "f22" },
    );
    const state = {
      applied_throttle: 1.35,
      engine_spool_fraction: 1.35,
      max_thrust_fraction: 1.35,
      engine_rpm_pct: 100,
      mach: 0.9,
      true_airspeed_kts: 560,
      air_density_kg_m3: 0.9,
      player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
      audio_perspective: "external",
    };
    spoolToGoverned(
      (next) => updateEngineVoices(voices, audio, next),
      audio,
      state,
    );
    assert.equal(latest(voices.sampleMilGain.gain), 0,
      "sealed-cockpit reference beds cannot leak into an exterior camera");
    assert.ok(latest(voices.cabinLp.frequency) > 5000, "exterior spectrum opens");
    assert.ok(latest(voices.fanWhineGain.gain) > 0.02, "external fan trace is restored");
    assert.ok(latest(voices.ecsGain.gain) < 0.01, "ECS stays inside the aircraft");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("speed brake, G-on, and aged canopy cues respond to snapshot", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createEventVoices,
      updateAirframeCueVoices,
    } = await freshModule("../event_audio.js", "cues");
    const audio = new FakeAudioContext();
    const voices = createEventVoices(audio, audio.destination);

    updateAirframeCueVoices(voices, audio, {
      has_speed_brake: true,
      speed_brake: 1,
      true_airspeed_kts: 420,
      air_density_kg_m3: 1.0,
      g_actual: 1.0,
      player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    });
    assert.ok(latest(voices.brakeGain.gain) > 0.08, "boards out make roar");
    assert.ok(latest(voices.canopyGain.gain) < 0.005, "canopy quiet at 1G");

    audio.currentTime = 0.2;
    updateAirframeCueVoices(voices, audio, {
      has_speed_brake: true,
      speed_brake: 0,
      true_airspeed_kts: 420,
      air_density_kg_m3: 1.0,
      pilot_gz: 6.5,
      player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    });
    assert.ok(latest(voices.brakeGain.gain) < 0.01, "boards in quiet");
    assert.ok(latest(voices.gGain.gain) > 0.05, "G-on strain under load");
    assert.ok(latest(voices.canopyGain.gain) > 0.015, "canopy seal whine under high G");

    audio.currentTime = 0.4;
    updateAirframeCueVoices(voices, audio, {
      has_speed_brake: true,
      speed_brake: 1,
      true_airspeed_kts: 420,
      air_density_kg_m3: 1.0,
      g_actual: 6,
      player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
    }, { enabled: false });
    assert.equal(latest(voices.brakeGain.gain), 0);
    assert.equal(latest(voices.gGain.gain), 0);
    assert.equal(latest(voices.canopyGain.gain), 0);
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("gun voice follows the published weapon cadence and varies clustered reports", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createEventVoices,
      fireGunReports,
    } = await freshModule("../event_audio.js", "gun-cadence");
    const audio = new FakeAudioContext();
    const voices = createEventVoices(audio, audio.destination);

    audio.currentTime = 0.2;
    fireGunReports(voices, audio, {
      gun_firing: true,
      player_gun_profile_id: "gun.m61a2.public-data-surrogate.v1",
      rounds_fired: 11,
    }, { enabled: true, triggerHeld: true });
    assert.equal(latest(voices.gunBodyOsc.frequency), 100, "M61 cyclic body is 100 Hz");
    assert.ok(latest(voices.gunBodyGain.gain) > 0);
    assert.ok(latest(voices.gunGasGain.gain) > 0);
    assert.ok(voices.gunShotIndex > 11, "cluster report scheduled");

    audio.currentTime = 0.3;
    fireGunReports(voices, audio, {
      gun_firing: true,
      player_gun_profile_id: "gun.gsh301.public-data-surrogate.v1",
      rounds_fired: 12,
    }, { enabled: true, triggerHeld: true });
    assert.equal(latest(voices.gunBodyOsc.frequency), 25, "GSh-301 cyclic body is 25 Hz");

    audio.currentTime = 0.4;
    fireGunReports(voices, audio, {
      gun_firing: true,
      player_gun_profile_id: "gun.six-m3-50cal.v1",
      rounds_fired: 13,
    }, { enabled: true, triggerHeld: true });
    assert.equal(latest(voices.gunBodyOsc.frequency), 15, "six-M3 cyclic body is 15 Hz");

    audio.currentTime = 0.5;
    fireGunReports(voices, audio, {
      gun_firing: false,
      player_gun_profile_id: "gun.m61a2.public-data-surrogate.v1",
    }, { enabled: true, triggerHeld: false });
    assert.equal(latest(voices.gunBodyGain.gain), 0, "gun body releases");
    assert.equal(latest(voices.gunGasGain.gain), 0, "gas tail releases");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("gear and flap movement drive mechanisms with start and stop clunks", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createEventVoices,
      updateConfigurationVoices,
    } = await freshModule("../event_audio.js", "configuration-audio");
    const audio = new FakeAudioContext();
    const voices = createEventVoices(audio, audio.destination);
    const up = {
      gear_nose: 0,
      gear_left: 0,
      gear_right: 0,
      flap_left_deg: 0,
      flap_right_deg: 0,
    };
    updateConfigurationVoices(voices, audio, up);
    const oscillatorsBefore = audio.oscillators.length;

    audio.currentTime = 0.1;
    updateConfigurationVoices(voices, audio, {
      ...up,
      gear_nose: 0.08,
      gear_left: 0.08,
      gear_right: 0.08,
    });
    assert.ok(latest(voices.mechanismGain.gain) > 0.04, "gear bay/track rumble");
    assert.ok(latest(voices.hydraulicGain.gain) > 0.01, "hydraulic pump");
    assert.ok(audio.oscillators.length > oscillatorsBefore, "gear-start body clunk");

    const afterStart = audio.oscillators.length;
    audio.currentTime = 0.3;
    updateConfigurationVoices(voices, audio, {
      ...up,
      gear_nose: 0.08,
      gear_left: 0.08,
      gear_right: 0.08,
    });
    assert.equal(latest(voices.mechanismGain.gain), 0, "mechanism stops with surfaces");
    assert.ok(audio.oscillators.length > afterStart, "gear-stop body clunk");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("maglev catshot rises with stroke and portal exit fires once", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createEventVoices,
      updateCatapultVoice,
    } = await freshModule("../event_audio.js", "catshot");
    const audio = new FakeAudioContext();
    const voices = createEventVoices(audio, audio.destination);
    const oscillatorsBefore = audio.oscillators.length;

    updateCatapultVoice(voices, audio, {
      catapult_active: true,
      catapult_progress: 0.15,
      catapult_speed_kts: 40,
      catapult_end_speed_kts: 214,
      carrier: false,
      recovery_platform: true,
      player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
    });
    assert.ok(voices.catapultWasActive);
    assert.ok(audio.oscillators.length > oscillatorsBefore, "energize thunk on shot start");
    const earlyTunnel = latest(voices.tunnelGain.gain);
    const earlyEm = latest(voices.emOsc.frequency);

    audio.currentTime = 0.2;
    updateCatapultVoice(voices, audio, {
      catapult_active: true,
      catapult_progress: 0.92,
      catapult_speed_kts: 200,
      catapult_end_speed_kts: 214,
      carrier: false,
      recovery_platform: true,
      player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
    });
    assert.ok(latest(voices.tunnelGain.gain) > earlyTunnel * 1.5, "tunnel builds");
    assert.ok(latest(voices.emOsc.frequency) > earlyEm * 2, "EM whine climbs");
    assert.ok(latest(voices.sparkGain.gain) > 0.04, "rail spark late stroke");

    const oscMid = audio.oscillators.length;
    audio.currentTime = 0.4;
    updateCatapultVoice(voices, audio, {
      catapult_active: false,
      catapult_progress: 1,
      catapult_speed_kts: 214,
      carrier: false,
      recovery_platform: true,
      player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
    });
    assert.equal(voices.catapultWasActive, false);
    assert.ok(audio.oscillators.length > oscMid, "portal exit one-shot");
    assert.ok(latest(voices.tunnelGain.gain) < 0.01, "tunnel dies after exit");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("RCS ticks, trap snatch, and combat hit/destroy edges fire", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createContactAcousticVoices,
      createEventVoices,
      updateContactAcousticVoices,
      updateRcsVoice,
      updateTrapVoice,
      updateCombatCueVoices,
    } = await freshModule("../event_audio.js", "regime-cues");
    const audio = new FakeAudioContext();
    const voices = createEventVoices(audio, audio.destination);

    updateRcsVoice(voices, audio, {
      rapier_rcs_authority: 0.9,
      rapier_rcs_gas_frac: 0.8,
    });
    assert.ok(latest(voices.rcsGain.gain) > 0.02, "RCS hiss under authority");

    audio.currentTime = 0.7;
    const beforeSnatch = audio.oscillators.length;
    updateTrapVoice(voices, audio, {
      arrest_phase: "ARRESTED",
      arrest_decel_g: 2.5,
      wire_tension_kn: 180,
    });
    assert.ok(audio.oscillators.length > beforeSnatch, "wire snatch on catch");
    assert.ok(latest(voices.wireGain.gain) > 0.05, "stretch groan while arrested");

    audio.currentTime = 0.9;
    const beforeStop = audio.oscillators.length;
    updateTrapVoice(voices, audio, { arrest_phase: "STOPPED" });
    assert.ok(audio.oscillators.length > beforeStop, "stop thud");
    assert.ok(latest(voices.wireGain.gain) < 0.01, "wire quiet after stop");

    audio.currentTime = 1.1;
    const beforeHit = audio.sources.length;
    const beforeFalseBoom = audio.oscillators.length;
    updateCombatCueVoices(voices, audio, {
      hits: 1,
      opponent_alive: true,
      bandit_alive: false,
    });
    assert.ok(audio.sources.length > beforeHit, "hit impact");
    assert.equal(audio.oscillators.length, beforeFalseBoom,
      "a dead primary must not boom while the selected formation survivor is alive");
    const beforeBoom = audio.oscillators.length;
    updateCombatCueVoices(voices, audio, {
      hits: 1,
      opponent_alive: false,
      bandit_alive: true,
    });
    assert.ok(audio.oscillators.length > beforeBoom, "destroy boom");

    const contacts = createContactAcousticVoices(audio, audio.destination);
    const selectedSurvivor = updateContactAcousticVoices(contacts, audio, {
      bandit_aircraft_id: "aircraft.su27.v1",
      opponent_alive: true,
      bandit_alive: false,
      range_m: 620,
      closure_kts: 80,
    });
    assert.ok(selectedSurvivor.fighterPresence > 0.5,
      "a selected survivor remains audible while the primary presentation is terminal");
    const selectedDestroyed = updateContactAcousticVoices(contacts, audio, {
      bandit_aircraft_id: "aircraft.su27.v1",
      opponent_alive: false,
      bandit_alive: true,
      range_m: 620,
      closure_kts: 80,
    });
    assert.equal(selectedDestroyed.fighterPresence, 0,
      "selected-target death, not primary liveness, silences the contact");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("flight façade mutes master and airframe cues when paused/muted", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { updateFlightAudio } = await freshModule("../flight_audio.js", "pause-mute");

    updateFlightAudio({
      applied_throttle: 1.2,
      engine_rpm_pct: 95,
      mach: 0.7,
      true_airspeed_kts: 380,
      air_density_kg_m3: 1.0,
      has_speed_brake: true,
      speed_brake: 1,
      g_actual: 5,
      player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    }, { muted: false });

    const audio = FakeAudioContext.instances.at(-1);
    const master = audio.gains[0].gain;
    assert.ok(latest(master) > 0);

    audio.currentTime = 0.15;
    updateFlightAudio({
      applied_throttle: 1.2,
      engine_rpm_pct: 95,
      mach: 0.7,
      true_airspeed_kts: 380,
      air_density_kg_m3: 1.0,
      paused: true,
      has_speed_brake: true,
      speed_brake: 1,
      g_actual: 5,
      player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    }, { muted: true });
    assert.equal(latest(master), 0);
  } finally {
    globalThis.AudioContext = previous;
  }
});
