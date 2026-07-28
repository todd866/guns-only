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

  cancelScheduledValues(time) {
    this.cancelledAt = time;
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
    this.resumeCalls = 0;
    this.suspendCalls = 0;
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
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }

  suspend() {
    this.suspendCalls += 1;
    this.state = "suspended";
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

test("Rapier exo-atmospheric handover sheds roar but carries a descending turbine whine", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { createEngineVoices, updateEngineVoices } = await freshModule(
      "../engine_audio.js",
      "rapier-exo-spooldown",
    );
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const turbineFlight = {
      applied_throttle: 1.3,
      engine_spool_fraction: 1.3,
      engine_rpm_pct: 100,
      mach: 1.6,
      true_airspeed_kts: 980,
      air_density_kg_m3: 0.36,
      rapier_turbine_thrust_kn: 90,
      rapier_ramjet_thrust_kn: 0,
      player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
    };
    for (let step = 1; step <= 24; step++) {
      audio.currentTime = step * 0.25;
      updateEngineVoices(voices, audio, turbineFlight);
    }
    const atmosphericBody = latest(voices.jetBodyGain.gain);
    const atmosphericCabinCeiling = latest(voices.cabinLp.frequency);

    audio.currentTime += 0.25;
    updateEngineVoices(voices, audio, {
      ...turbineFlight,
      mach: 3.4,
      true_airspeed_kts: 2100,
      air_density_kg_m3: 0.2,
      rapier_turbine_thrust_kn: 0,
      rapier_ramjet_thrust_kn: 80,
    });
    const atmosphericRam = latest(voices.ramHowlGain.gain);

    const exoFlight = {
      ...turbineFlight,
      mach: 3.4,
      true_airspeed_kts: 3400,
      air_density_kg_m3: 0.00001,
      rapier_turbine_thrust_kn: 0,
      rapier_ramjet_thrust_kn: 0,
    };
    audio.currentTime += 0.25;
    updateEngineVoices(voices, audio, exoFlight);
    const coastStartHz = latest(voices.turbineCoastOsc.frequency);
    const coastStartGain = latest(voices.turbineCoastGain.gain);
    assert.ok(latest(voices.jetBodyGain.gain) < atmosphericBody * 0.01,
      "near-vacuum removes the broadband propulsion body");
    const exoRam = latest(voices.ramHowlGain.gain);
    assert.ok(exoRam < atmosphericRam * 0.02,
      `ram howl cannot survive without atmospheric mass flow (${exoRam}/${atmosphericRam})`);
    assert.ok(coastStartGain > 0,
      "airframe conduction preserves a quiet turbine coast cue after handover");
    assert.ok(coastStartGain > exoRam,
      "the conducted spool-down cue, not residual ram roar, owns the near-vacuum transition");
    assert.ok(latest(voices.cabinLp.frequency) < atmosphericCabinCeiling,
      "helmet, inserted hearing protection, and the pressure shell darken the exo cockpit mix");

    for (let step = 1; step <= 16; step++) {
      audio.currentTime += 0.25;
      updateEngineVoices(voices, audio, exoFlight);
    }
    const coastLaterHz = latest(voices.turbineCoastOsc.frequency);
    const coastLaterGain = latest(voices.turbineCoastGain.gain);
    assert.ok(coastLaterHz < coastStartHz,
      "the turbine coast pitch descends as the compressor unwinds");
    assert.ok(coastLaterGain > 0 && coastLaterGain < coastStartGain,
      "the conducted whine remains perceptible for several seconds while decaying");

    for (let step = 1; step <= 24; step++) {
      audio.currentTime += 0.25;
      updateEngineVoices(voices, audio, exoFlight);
    }
    assert.equal(latest(voices.turbineCoastGain.gain), 0,
      "the turbine coast eventually reaches silence instead of becoming an infinite loop");
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

test("gesture enable from a preference-disabled startup resumes and becomes audible", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = class extends FakeAudioContext {
      constructor() {
        super();
        this.state = "suspended";
      }
    };
    const {
      armFlightAudio,
      setFlightAudioEnabled,
      updateFlightAudio,
    } = await freshModule("../flight_audio.js", "disabled-lazy-build");

    setFlightAudioEnabled(false);
    updateFlightAudio({ engine_rpm_pct: 90 });
    assert.equal(FakeAudioContext.instances.length, 0,
      "the render loop must not build a graph while sound is disabled");

    // Mirrors commitAudioPreferenceFromGesture: enable first, then arm inside the same UI event.
    setFlightAudioEnabled(true);
    assert.equal(armFlightAudio(), true);
    assert.equal(FakeAudioContext.instances.length, 1,
      "the enabling gesture builds the graph immediately");
    const audio = FakeAudioContext.instances.at(-1);
    assert.equal(audio.resumeCalls, 1);
    assert.equal(audio.state, "running", "the user gesture owns AudioContext.resume()");

    updateFlightAudio({
      applied_throttle: 0.9,
      engine_spool_fraction: 0.9,
      engine_rpm_pct: 90,
      true_airspeed_kts: 420,
      air_density_kg_m3: 0.9,
      player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    });
    assert.equal(latest(audio.gains[0].gain), 0.55,
      "the next live frame reaches the audible shared-master target");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("non-gesture arming cannot poison the later user-activation resume", async () => {
  const previousAudio = globalThis.AudioContext;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const userActivation = { isActive: false };
  try {
    FakeAudioContext.instances.length = 0;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userActivation },
    });
    globalThis.AudioContext = class extends FakeAudioContext {
      constructor() {
        super();
        this.state = "suspended";
      }

      resume() {
        this.resumeCalls += 1;
        return new Promise(() => {});
      }
    };
    const { armFlightAudio } = await freshModule(
      "../flight_audio.js",
      "non-gesture-then-gesture",
    );

    assert.equal(armFlightAudio(), true);
    const audio = FakeAudioContext.instances.at(-1);
    assert.equal(audio.resumeCalls, 0,
      "automatic launch code may build, but cannot spend the resume attempt");

    userActivation.isActive = true;
    assert.equal(armFlightAudio(), true);
    assert.equal(audio.resumeCalls, 1,
      "the later trusted gesture owns the first and only pending resume");
  } finally {
    globalThis.AudioContext = previousAudio;
    if (navigatorDescriptor)
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

test("only gesture arming resumes a suspended flight graph and suspended updates stay muted", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = class extends FakeAudioContext {
      constructor() {
        super();
        this.state = "suspended";
      }

      resume() {
        this.resumeCalls += 1;
        return new Promise(() => {});
      }
    };
    const {
      armFlightAudio,
      updateFlightAudio,
    } = await freshModule("../flight_audio.js", "suspended-lifecycle");

    assert.equal(armFlightAudio(), true);
    assert.equal(armFlightAudio(), true);
    const audio = FakeAudioContext.instances.at(-1);
    assert.equal(audio.resumeCalls, 1, "one in-flight resume attempt per user gesture burst");

    audio.gains[0].gain.value = 0.8;
    updateFlightAudio({ engine_rpm_pct: 90 }, { muted: false });
    updateFlightAudio({ engine_rpm_pct: 90 }, { muted: true });
    assert.equal(audio.resumeCalls, 1, "animation frames never retry AudioContext.resume()");
    assert.equal(latest(audio.gains[0].gain), 0,
      "a suspended graph cannot retain a previously audible master gain");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("Safari interrupted flight audio resumes only from arming and stays muted meanwhile", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = class extends FakeAudioContext {
      constructor() {
        super();
        this.state = "interrupted";
      }

      resume() {
        this.resumeCalls += 1;
        return new Promise(() => {});
      }
    };
    const {
      armFlightAudio,
      updateFlightAudio,
    } = await freshModule("../flight_audio.js", "interrupted-lifecycle");

    assert.equal(armFlightAudio(), true);
    assert.equal(armFlightAudio(), true);
    const audio = FakeAudioContext.instances.at(-1);
    assert.equal(audio.resumeCalls, 1, "one user-gesture resume attempt is in flight");

    audio.gains[0].gain.value = 0.8;
    updateFlightAudio({ engine_rpm_pct: 90 }, { muted: false });
    assert.equal(audio.resumeCalls, 1, "animation frames cannot resume interrupted Safari audio");
    assert.equal(latest(audio.gains[0].gain), 0,
      "an interrupted graph cannot retain a previously audible master gain");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("silent QA runs the live graph without output and lifecycle events suspend it", async () => {
  const previousAudio = globalThis.AudioContext;
  const descriptors = new Map(
    ["document", "window", "location"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  class FakeEventTarget {
    constructor() {
      this.listeners = new Map();
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    dispatch(type) {
      for (const listener of this.listeners.get(type) ?? []) listener({ type });
    }
  }
  const fakeWindow = new FakeEventTarget();
  const attributes = new Map();
  const fakeDocument = new FakeEventTarget();
  fakeDocument.hidden = false;
  fakeDocument.documentElement = {
    setAttribute: (name, value) => attributes.set(name, String(value)),
  };

  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: fakeWindow,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: fakeDocument,
    });
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL("https://example.test/?audioQa=silent"),
    });

    const {
      armFlightAudio,
      flightAudioDiagnostics,
      updateFlightAudio,
    } = await freshModule("../flight_audio.js", "silent-qa-lifecycle");
    assert.equal(armFlightAudio(), true);
    updateFlightAudio({
      applied_throttle: 1,
      engine_rpm_pct: 90,
      true_airspeed_kts: 420,
      air_density_kg_m3: 0.9,
    });

    const audio = FakeAudioContext.instances.at(-1);
    const live = flightAudioDiagnostics();
    assert.equal(live.contextState, "running");
    assert.equal(live.signalActive, true,
      "the production graph still receives a live flight frame");
    assert.equal(live.silentQa, true);
    assert.equal(live.outputGainTarget, 0);
    assert.equal(live.audible, false);
    assert.equal(live.outputMode, "silent-qa");
    assert.ok(live.sessionId);
    assert.equal(attributes.get("data-audio-session-id"), live.sessionId);
    assert.equal(attributes.get("data-audio-signal-active"), "true");
    assert.equal(attributes.get("data-audio-output-gain"), "0");

    fakeDocument.hidden = true;
    fakeDocument.dispatch("visibilitychange");
    await Promise.resolve();
    const hidden = flightAudioDiagnostics();
    assert.equal(audio.suspendCalls, 1);
    assert.equal(audio.state, "suspended");
    assert.equal(audio.gains[0].gain.value, 0,
      "the lifecycle path cuts the master synchronously before suspend settles");
    assert.equal(hidden.pageState, "background");
    assert.equal(hidden.stopReason, "visibility-hidden");

    fakeDocument.hidden = false;
    fakeWindow.dispatch("pageshow");
    const shown = flightAudioDiagnostics();
    assert.equal(shown.pageState, "foreground");
    assert.equal(shown.contextState, "suspended",
      "foreground lifecycle events never resume outside a trusted pilot gesture");
  } finally {
    globalThis.AudioContext = previousAudio;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("flight façade re-projects recorded external replay instead of leaking final-live cues", async () => {
  const {
    projectFlightAudioState,
    projectSelectedContactAudioState,
  } = await freshModule("../flight_audio.js", "replay-projection");
  const finalLive = {
    replay_external: true,
    suppress_unrecorded_combat_transients: true,
    replay_camera: "CHASE",
    py: 1000,
    throttle: 0.72,
    engine: 0.62,
    applied_throttle: 1.35,
    engine_spool_fraction: 1.35,
    engine_rpm_pct: 100,
    indicated_airspeed_kts: 140,
    true_airspeed_kts: 610,
    air_density_kg_m3: 0.2,
    g_actual: 2.4,
    pilot_gz: 8,
    speed_brake: 1,
    rapier_rcs_authority: 1,
    auto_gcas_active: true,
    auto_gcas_warning: true,
    bandit_aircraft_id: "aircraft.su27s.public-data-surrogate.v1",
    bandit_entity_id: "entity.bandit.8",
    selected_player_gun_target_slot: 2,
    w2_present: 1,
    w2_alive: 1,
    w2x: 22,
    w2y: 33,
    w2z: 44,
    static_temperature_c: -12,
    opponent_body_present: false,
  };

  const projected = projectFlightAudioState(finalLive);
  assert.notEqual(projected, finalLive);
  assert.equal(projected.applied_throttle, 0.72);
  assert.equal(projected.engine_spool_fraction, 0.62);
  assert.equal(projected.engine_rpm_pct, 62);
  assert.ok(projected.true_airspeed_kts > 140 && projected.true_airspeed_kts < 170);
  assert.ok(projected.mach > 0.2 && projected.mach < 0.3);
  assert.equal(projected.pilot_gz, 2.4);
  assert.equal(projected.speed_brake, 0);
  assert.equal(projected.rapier_rcs_authority, 0);
  assert.equal(projected.auto_gcas_active, false);
  assert.equal(projected.auto_gcas_warning, false);

  const contact = projectSelectedContactAudioState(projected);
  assert.match(contact.bandit_aircraft_id, /entity\.bandit\.8:slot-2$/);
  assert.deepEqual([contact.bx, contact.by, contact.bz], [22, 33, 44],
    "selected wingman geometry replaces the primary bandit's pan position");
  assert.equal(contact.air_temperature_c, -12,
    "published static temperature reaches the contact propagation model");
  assert.equal(contact.bandit_audio_class, "silent",
    "the carrier recorder explicitly excludes unrecorded opponents");

  const ordinaryExternal = { replay_external: true, engine_rpm_pct: 93 };
  assert.equal(projectFlightAudioState(ordinaryExternal), ordinaryExternal,
    "an authored exterior state is not mistaken for compact incident replay");
});

test("recorded replay atmosphere remains physical through a 200k-ft ballistic apex", async () => {
  const { projectFlightAudioState } = await freshModule(
    "../flight_audio.js",
    "replay-high-atmosphere",
  );
  const projected = projectFlightAudioState({
    replay_external: true,
    suppress_unrecorded_combat_transients: true,
    py: 60_960,
    indicated_airspeed_kts: 10,
    throttle: 0.2,
    engine: 0.2,
    g_actual: 0.1,
  });
  assert.ok(
    projected.air_density_kg_m3 > 0.00027
      && projected.air_density_kg_m3 < 0.00028,
    "200k-ft replay uses the upper 1976 atmosphere instead of the old 32km clamp",
  );
  assert.ok(projected.true_airspeed_kts > 650 && projected.true_airspeed_kts < 700);
  assert.ok(projected.mach > 1 && projected.mach < 1.2);
});

test("flight façade derives bounded closure for unselected formation traffic", async () => {
  const {
    projectFormationContactAudioState,
    projectSelectedContactAudioState,
    projectSupplementalContactAudioState,
  } = await freshModule("../flight_audio.js", "formation-projection");
  const state = {
    px: 0,
    py: 1000,
    pz: 0,
    w1_present: 1,
    w1_alive: 1,
    w1x: 1000,
    w1y: 1000,
    w1z: 0,
    pfx: 0,
    pfy: 0,
    pfz: 1,
    plx: 0,
    ply: 1,
    plz: 0,
    static_temperature_c: -20,
    selected_player_gun_target_slot: 0,
    player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    player_entity_id: "entity.player.3",
    bandit_aircraft_id: "aircraft.su27s.public-data-surrogate.v1",
    bandit_entity_id: "entity.bandit.4",
  };

  const approaching = projectFormationContactAudioState(state, 1, {
    previousRangeM: 1100,
    elapsedSeconds: 1,
  });
  assert.equal(approaching.audible, true);
  assert.equal(approaching.rangeM, 1000);
  assert.ok(approaching.closureKts > 60 && approaching.closureKts < 65);
  assert.match(approaching.identity, /aircraft\.su27s.*entity\.bandit\.4:w1$/);
  assert.deepEqual(
    [approaching.state.px, approaching.state.py, approaching.state.pz],
    [0, 1000, 0],
  );
  assert.deepEqual(
    [approaching.state.bx, approaching.state.by, approaching.state.bz],
    [1000, 1000, 0],
  );
  assert.equal(approaching.state.air_temperature_c, -20);

  const selected = projectFormationContactAudioState({
    ...state,
    selected_player_gun_target_slot: 1,
  }, 1);
  assert.equal(selected.audible, false, "selected target is owned by the authoritative graph");
  assert.equal(projectFormationContactAudioState({ ...state, px: null }, 1).audible, false,
    "missing geometry is not coerced into a valid world-space zero");

  const selectedState = {
    ...state,
    selected_player_gun_target_slot: 1,
    bx: -800,
    by: 1100,
    bz: 250,
    bandit_alive: true,
    opponent_alive: true,
    opponent_body_present: true,
  };
  const authoritative = projectSelectedContactAudioState(selectedState);
  assert.deepEqual(
    [authoritative.bx, authoritative.by, authoritative.bz],
    [1000, 1000, 0],
    "the authoritative graph follows the selected wingman",
  );
  const displacedPrimary = projectSupplementalContactAudioState(selectedState, 1);
  assert.equal(displacedPrimary.audible, true);
  assert.match(displacedPrimary.identity, /:primary$/);
  assert.deepEqual(
    [displacedPrimary.state.bx, displacedPrimary.state.by, displacedPrimary.state.bz],
    [-800, 1100, 250],
    "the selected slot's supplemental graph retains the original primary",
  );

  const incompleteSelectedState = {
    ...selectedState,
    w1z: null,
  };
  const incompleteAuthoritative = projectSelectedContactAudioState(
    incompleteSelectedState,
  );
  assert.equal(incompleteAuthoritative.bandit_audio_class, "silent",
    "incomplete selected geometry fails quiet instead of reusing the primary position");
  assert.equal(incompleteAuthoritative.opponent_body_present, false);
  assert.deepEqual(
    [
      incompleteAuthoritative.bx,
      incompleteAuthoritative.by,
      incompleteAuthoritative.bz,
    ],
    [null, null, null],
    "the selected projection clears stale primary coordinates while it is incomplete",
  );
  const primaryDuringIncompleteSelection = projectSupplementalContactAudioState(
    incompleteSelectedState,
    1,
  );
  assert.equal(primaryDuringIncompleteSelection.audible, true,
    "the displaced primary remains on the supplemental graph during a partial selected frame");
  assert.match(primaryDuringIncompleteSelection.identity, /:primary$/);
  assert.deepEqual(
    [
      primaryDuringIncompleteSelection.state.bx,
      primaryDuringIncompleteSelection.state.by,
      primaryDuringIncompleteSelection.state.bz,
    ],
    [-800, 1100, 250],
  );

  const deadSelectedState = {
    ...selectedState,
    w1_alive: 0,
  };
  assert.equal(projectSelectedContactAudioState(deadSelectedState).opponent_alive, false,
    "the authoritative selected graph owns and silences the dead formation body");
  const primaryBesideDeadSelection = projectSupplementalContactAudioState(
    deadSelectedState,
    1,
  );
  assert.equal(primaryBesideDeadSelection.audible, true,
    "a dead-but-present selected body must not make the living primary disappear");
  assert.match(primaryBesideDeadSelection.identity, /:primary$/);

  const selectedAfterPrimarySettles = projectSelectedContactAudioState({
    ...selectedState,
    bandit_alive: false,
    opponent_body_present: false,
  });
  assert.equal(selectedAfterPrimarySettles.opponent_alive, true,
    "primary terminal state cannot silence a selected surviving wingman");
  assert.notEqual(selectedAfterPrimarySettles.bandit_audio_class, "silent");
  assert.equal(projectSupplementalContactAudioState({
    ...selectedState,
    bandit_alive: false,
    opponent_body_present: false,
  }, 1).audible, false, "the displaced primary stops when its own body is gone");

  const pattern = projectFormationContactAudioState({
    ...state,
    rapier_pattern_only: true,
    player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
  }, 1);
  assert.match(pattern.identity, /^aircraft\.rapier/,
    "friendly circuit traffic inherits the ownship type, not the staged target type");

  const replay = projectFormationContactAudioState({
    ...state,
    replay_external: true,
    suppress_unrecorded_combat_transients: true,
  }, 1);
  assert.equal(replay.audible, false, "unrecorded final-live formation state cannot enter replay");
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

test("Rapier cockpit-bed blend stays steady when flight state is steady", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createEngineVoices,
      updateEngineVoices,
      attachJetSampleBeds,
    } = await freshModule("../engine_audio.js", "rapier-steady-palette");
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const primary = audio.createBuffer(1, 64);
    const cockpit = audio.createBuffer(1, 96);
    attachJetSampleBeds(voices, audio, {
      idle: primary,
      mil: primary,
      grit: primary,
      idleVariants: [primary, cockpit],
      milVariants: [primary, cockpit],
      gritVariants: [primary, cockpit],
    }, { character: "rapier" });
    const state = {
      applied_throttle: 1,
      engine_spool_fraction: 1,
      max_thrust_fraction: 1.55,
      engine_rpm_pct: 100,
      mach: 0.9,
      true_airspeed_kts: 520,
      air_density_kg_m3: 0.9,
      player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
    };

    audio.currentTime = 4;
    updateEngineVoices(voices, audio, state, { snap: true });
    const early = voices.sampleMilVariants.map((variant) => latest(variant.gain.gain));
    audio.currentTime = 44;
    updateEngineVoices(voices, audio, state, { snap: true });
    const late = voices.sampleMilVariants.map((variant) => latest(variant.gain.gain));

    assert.deepEqual(late, early,
      "the supporting cockpit layer must not impose a time-based loudness cycle");
    assert.ok(early[0] > 0 && early[1] > 0, "both de-correlated beds mask short repetition");
    assert.ok(Math.abs(early[0] * early[0] + early[1] * early[1] - 1) < 1e-6,
      "the fixed mix remains equal-power");
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

test("deterministic long-noise beds are shared within an AudioContext", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      pinkNoiseBuffer,
      whiteNoiseBuffer,
    } = await freshModule("../engine_audio.js", "shared-noise-beds");
    const audio = new FakeAudioContext();
    const pink = pinkNoiseBuffer(audio, 0x1234);
    const white = whiteNoiseBuffer(audio, 0x5678);

    assert.equal(pinkNoiseBuffer(audio, 0x1234), pink);
    assert.equal(whiteNoiseBuffer(audio, 0x5678), white);
    assert.equal(audio.buffers.length, 2,
      "same-context consumers reuse immutable multi-second buffers");
    assert.notEqual(pinkNoiseBuffer(audio, 0x1235), pink,
      "different authored seeds retain distinct noise character");
    assert.equal(audio.buffers.length, 3);

    const otherAudio = new FakeAudioContext();
    assert.notEqual(pinkNoiseBuffer(otherAudio, 0x1234), pink,
      "AudioBuffers are never shared across contexts");
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

test("F-22 altitude mix sheds airborne bed and grit while retaining structure and ECS", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      attachJetSampleBeds,
      createEngineVoices,
      updateEngineVoices,
    } = await freshModule("../engine_audio.js", "f22-altitude");
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const bed = audio.createBuffer(1, 64);
    attachJetSampleBeds(
      voices,
      audio,
      { idle: bed, mil: bed, grit: bed },
      { character: "f22" },
    );
    const stateAtDensity = (density, altitudeM) => {
      const trueAirspeedMps = Math.sqrt(2 * 16_000 / density);
      return {
        applied_throttle: 0.8,
        engine_spool_fraction: 0.8,
        max_thrust_fraction: 1.35,
        engine_rpm_pct: 80,
        engine_running: true,
        altitude_m: altitudeM,
        air_density_kg_m3: density,
        true_airspeed_mps: trueAirspeedMps,
        true_airspeed_kts: trueAirspeedMps * 1.9438444924406,
        player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
      };
    };
    const low = stateAtDensity(1.055584657, 1_524);
    spoolToGoverned(
      (state) => updateEngineVoices(voices, audio, state),
      audio,
      low,
    );
    const lowAirborne = latest(voices.sampleAirborneGain.gain);
    const lowStructure = latest(voices.sampleStructureGain.gain);
    const lowGrit = latest(voices.sampleGritGain.gain);
    const lowCutoff = latest(voices.sampleLp.frequency);
    const lowEcs = latest(voices.ecsGain.gain);

    const high = stateAtDensity(0.147667759, 16_764);
    audio.currentTime += 0.25;
    updateEngineVoices(voices, audio, high, { snap: true });
    const highAirborne = latest(voices.sampleAirborneGain.gain);
    const highStructure = latest(voices.sampleStructureGain.gain);
    assert.ok(highAirborne < lowAirborne * 0.3,
      "55k-ft airborne bed falls much harder than its low-altitude reference");
    assert.ok(highStructure < lowStructure && highStructure > highAirborne,
      "low structure remains after airborne energy falls away");
    assert.ok(latest(voices.sampleGritGain.gain) < lowGrit * 0.4,
      "thin air removes composite-bed grit");
    assert.ok(latest(voices.sampleLp.frequency) < lowCutoff - 1_000,
      "the surviving bed becomes materially darker");
    assert.ok(latest(voices.ecsGain.gain) > lowEcs,
      "pressurized-cabin airflow becomes relatively more legible");

    audio.currentTime += 0.25;
    updateEngineVoices(voices, audio, {
      ...high,
      altitude_m: 60_960,
      air_density_kg_m3: undefined,
      true_airspeed_mps: 620,
      true_airspeed_kts: 1_205.183584,
    }, { snap: true });
    assert.ok(latest(voices.sampleAirborneGain.gain) < 0.01,
      "the 1976-atmosphere fallback nearly removes airborne bed at 200k ft");
    assert.ok(latest(voices.sampleStructureGain.gain) > 0.15,
      "mount/shell vibration retains a quiet floor");
    assert.equal(latest(voices.rushGain.gain), 0);
    assert.equal(latest(voices.canopyFlowGain.gain), 0);
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

test("F-22 augmentation stays independent from governed RPM and dynamic pressure", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      attachJetSampleBeds,
      createEngineVoices,
      updateEngineVoices,
    } = await freshModule("../engine_audio.js", "f22-augmentation-cue");
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const bed = audio.createBuffer(1, 64);
    attachJetSampleBeds(
      voices,
      audio,
      { idle: bed, mil: bed, grit: bed },
      { character: "f22" },
    );
    const fixedState = {
      max_thrust_fraction: 1.35,
      engine_rpm_pct: 100,
      mach: 0.72,
      true_airspeed_kts: 430,
      air_density_kg_m3: 0.9,
      player_aircraft_id: "aircraft.f22a.public-data-surrogate.v1",
    };

    updateEngineVoices(voices, audio, {
      ...fixedState,
      applied_throttle: 1,
      engine_spool_fraction: 1,
    }, { snap: true });
    const milBody = latest(voices.augmentationBodyGain.gain);
    const milPulse = latest(voices.augmentationPulseGain.gain);

    updateEngineVoices(voices, audio, {
      ...fixedState,
      applied_throttle: 1.35,
      engine_spool_fraction: 1.35,
    }, { snap: true });
    assert.equal(milBody, 0, "MIL has no false reheat body");
    assert.equal(milPulse, 0, "MIL has no false augmentation pulse");
    assert.ok(latest(voices.augmentationBodyGain.gain) > 0.04,
      "delivered augmentation adds a cockpit pressure/structure cue");
    assert.ok(latest(voices.augmentationPulseGain.gain) > 0.01,
      "delivered augmentation adds a restrained low pulse");
    assert.equal(latest(voices.sampleMil.playbackRate), 1,
      "augmentation does not pitch the broadband cockpit bed");
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

test("M61 report cadence warms a bounded short-noise pool instead of allocating forever", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createEventVoices,
      fireGunReports,
    } = await freshModule("../event_audio.js", "gun-noise-pool");
    const audio = new FakeAudioContext();
    const voices = createEventVoices(audio, audio.destination);
    const state = {
      gun_firing: true,
      player_gun_profile_id: "gun.m61a2.public-data-surrogate.v1",
      rounds_fired: 0,
    };

    audio.currentTime = 0.1;
    fireGunReports(voices, audio, state, { enabled: true, triggerHeld: true });
    audio.currentTime += 0.25;
    fireGunReports(voices, audio, state, { enabled: true, triggerHeld: true });
    audio.currentTime += 0.25;
    fireGunReports(voices, audio, state, { enabled: true, triggerHeld: true });
    const warmedBufferCount = audio.buffers.length;
    const warmedSourceCount = audio.sources.length;
    assert.equal(voices.gunReportNoiseBuffers.filter(Boolean).length, 12,
      "the bounded pool has one deterministic buffer per variation slot");

    for (let burst = 0; burst < 8; burst += 1) {
      audio.currentTime += 0.25;
      fireGunReports(voices, audio, state, { enabled: true, triggerHeld: true });
    }
    assert.equal(audio.buffers.length, warmedBufferCount,
      "sustained fire schedules reports without further AudioBuffer allocation");
    assert.ok(audio.sources.length > warmedSourceCount,
      "pooled sample data still feeds new one-shot source nodes");
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
