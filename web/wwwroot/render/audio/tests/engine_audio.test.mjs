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
    this.started = false;
    this.stopped = false;
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
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
    this.stopped = false;
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
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

test("build creates a falling six-partial turbine stack and deterministic pink beds", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const firstModule = await freshModule("../engine_audio.js", "first");
    firstModule.updateEngineAudio({
      applied_throttle: 1.55,
      engine_rpm_pct: 100,
      mach: 0.8,
      true_airspeed_kts: 500,
      air_density_kg_m3: 0.7,
    });
    const first = FakeAudioContext.instances.at(-1);

    assert.equal(first.oscillators.length, 6);
    assert.ok(first.oscillators.every((oscillator) =>
      oscillator.type === "sine" && oscillator.started));
    const partialLevels = first.gains.slice(2, 8).map((gain) => gain.gain.value);
    assert.deepEqual(partialLevels, [1, 0.46, 0.27, 0.16, 0.095, 0.055]);
    assert.equal(first.sources.length, 2, "engine and airframe pressure fields stay separate");
    assert.ok(first.sources.every((source) => source.loop && source.started));
    // Filters: compressor LP, core BP, ram BP, jet LP, fan BP, rush HP, rush LP.
    assert.equal(first.filters.length, 7);

    const secondModule = await freshModule("../engine_audio.js", "second");
    secondModule.updateEngineAudio({});
    const second = FakeAudioContext.instances.at(-1);
    assert.deepEqual(first.buffers[0].data, second.buffers[0].data,
      "the seeded core bed must be bit-identical between builds");
    assert.deepEqual(first.buffers[1].data, second.buffers[1].data,
      "the seeded airframe bed must be bit-identical between builds");

    const pink = first.buffers[0].data;
    let signalEnergy = 0;
    let differenceEnergy = 0;
    for (let i = 1; i < pink.length; i++) {
      signalEnergy += pink[i] * pink[i];
      const difference = pink[i] - pink[i - 1];
      differenceEnergy += difference * difference;
    }
    assert.ok(differenceEnergy < signalEnergy,
      "pink noise must retain low-frequency correlation rather than read as white hiss");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("audio-clock RPM is rate-limited and the turbine-to-ram handover completes", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { updateEngineAudio } = await freshModule("../engine_audio.js", "spool");
    const state = {
      applied_throttle: 1.55,
      engine_rpm_pct: 100,
      mach: 1.6,
      true_airspeed_kts: 800,
      air_density_kg_m3: 0.3,
    };
    updateEngineAudio(state);
    const audio = FakeAudioContext.instances.at(-1);
    const fundamental = audio.oscillators[0].frequency;

    audio.currentTime = 1;
    updateEngineAudio(state);
    assert.equal(latest(fundamental), 64 + 0.05 * 250,
      "a long frame is capped to a quarter-second of spool travel");
    for (let step = 2; step <= 20; step++) {
      audio.currentTime = step * 0.25;
      updateEngineAudio(state);
    }
    assert.ok(latest(fundamental) < 314,
      "the compressor may not teleport to governed RPM");

    // Gain order: master; compressor; six partials; core; ram; jet; fan; rush.
    const compressorGain = audio.gains[1].gain;
    const ramGain = audio.gains[9].gain;
    const jetGain = audio.gains[10].gain;
    audio.currentTime += 0.25;
    updateEngineAudio({ ...state, mach: 2.7 });
    assert.ok(latest(compressorGain) < 1e-12);
    assert.ok(latest(ramGain) > 0.08, "broad ram pressure must own the fully handed-over mix");
    assert.ok(latest(jetGain) > 0, "exhaust roar remains as a supporting body under ram");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("airframe rush follows dynamic pressure, not throttle, and mute remains available", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { updateEngineAudio } = await freshModule("../engine_audio.js", "rush");
    const flight = {
      engine_rpm_pct: 80,
      mach: 0.9,
      true_airspeed_kts: 600,
      air_density_kg_m3: 0.65,
    };
    updateEngineAudio({ ...flight, applied_throttle: 0 });
    const audio = FakeAudioContext.instances.at(-1);
    const rushGain = audio.gains[12].gain;
    const masterGain = audio.gains[0].gain;
    const idleRush = latest(rushGain);

    audio.currentTime = 0.1;
    updateEngineAudio({ ...flight, applied_throttle: 1.55 });
    assert.equal(latest(rushGain), idleRush);

    audio.currentTime = 0.2;
    updateEngineAudio({
      ...flight,
      applied_throttle: 0,
      true_airspeed_kts: 200,
    }, { muted: true });
    assert.ok(latest(rushGain) < idleRush);
    assert.equal(latest(masterGain), 0);
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("thin air and collapsed thrust near-silence the propulsion stack", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { updateEngineAudio } = await freshModule("../engine_audio.js", "coast");
    const dense = {
      applied_throttle: 1.55,
      engine_rpm_pct: 100,
      mach: 0.9,
      true_airspeed_kts: 450,
      air_density_kg_m3: 1.1,
      rapier_turbine_thrust_kn: 90,
      rapier_ramjet_thrust_kn: 0,
    };
    updateEngineAudio(dense);
    const audio = FakeAudioContext.instances.at(-1);
    for (let step = 1; step <= 24; step++) {
      audio.currentTime = step * 0.25;
      updateEngineAudio(dense);
    }
    const compressorGain = audio.gains[1].gain;
    const jetGain = audio.gains[10].gain;
    const denseCompressor = latest(compressorGain);
    const denseJet = latest(jetGain);

    audio.currentTime += 0.25;
    updateEngineAudio({
      applied_throttle: 0.05,
      engine_rpm_pct: 20,
      mach: 2.2,
      true_airspeed_kts: 900,
      air_density_kg_m3: 0.04,
      rapier_turbine_thrust_kn: 0,
      rapier_ramjet_thrust_kn: 0,
      rapier_rcs_authority: 0.8,
    });
    assert.ok(latest(compressorGain) < denseCompressor * 0.2,
      "exo / coast must drop the turbine stack");
    assert.ok(latest(jetGain) < denseJet * 0.2,
      "exo / coast must drop the exhaust roar");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("power changes move jet exhaust gain while fan whine tracks turbine share", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { updateEngineAudio } = await freshModule("../engine_audio.js", "power");
    const base = {
      engine_rpm_pct: 100,
      mach: 0.7,
      true_airspeed_kts: 400,
      air_density_kg_m3: 1.0,
    };
    updateEngineAudio({ ...base, applied_throttle: 0.2 });
    const audio = FakeAudioContext.instances.at(-1);
    for (let step = 1; step <= 24; step++) {
      audio.currentTime = step * 0.25;
      updateEngineAudio({ ...base, applied_throttle: 0.2 });
    }
    const jetGain = audio.gains[10].gain;
    const fanGain = audio.gains[11].gain;
    const idleJet = latest(jetGain);
    const idleFan = latest(fanGain);

    audio.currentTime += 0.25;
    updateEngineAudio({ ...base, applied_throttle: 1.55 });
    assert.ok(latest(jetGain) > idleJet * 1.5, "MIL must open the exhaust roar");
    assert.ok(latest(fanGain) >= idleFan * 0.9, "fan whine stays present under turbine share");
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
    assert.equal(audio.compressors.length, 1, "Indoor-style dynamics sit on the shared bus");
    const master = audio.gains[0].gain;
    assert.ok(latest(master) > 0);

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
    assert.ok(audio.oscillators.length > oscillatorsBefore,
      "firing must schedule discrete gun-report oscillators");

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
    assert.equal(latest(master), 0, "settings mute must silence the shared master");

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
