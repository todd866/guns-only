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
  }

  start() {
    this.started = true;
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
  }

  start() {
    this.started = true;
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

async function freshModule(label) {
  freshModule.sequence = (freshModule.sequence ?? 0) + 1;
  return import(`../engine_audio.js?test=${label}-${freshModule.sequence}`);
}

test("build creates a falling six-partial turbine stack and deterministic pink beds", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const firstModule = await freshModule("first");
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

    const secondModule = await freshModule("second");
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
    const { updateEngineAudio } = await freshModule("spool");
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

    // Gain creation order: master; compressor; six partials; core; ram; rush.
    const compressorGain = audio.gains[1].gain;
    const ramGain = audio.gains[9].gain;
    audio.currentTime += 0.25;
    updateEngineAudio({ ...state, mach: 2.7 });
    assert.ok(latest(compressorGain) < 1e-12);
    assert.ok(latest(ramGain) > 0.1, "broad ram pressure must own the fully handed-over mix");
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("airframe rush follows dynamic pressure, not throttle, and mute remains available", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const { updateEngineAudio } = await freshModule("rush");
    const flight = {
      engine_rpm_pct: 80,
      mach: 0.9,
      true_airspeed_kts: 600,
      air_density_kg_m3: 0.65,
    };
    updateEngineAudio({ ...flight, applied_throttle: 0 });
    const audio = FakeAudioContext.instances.at(-1);
    const rushGain = audio.gains[10].gain;
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

test("unsupported Web Audio disables the module permanently without throwing", async () => {
  const previous = globalThis.AudioContext;
  const previousWebkit = globalThis.webkitAudioContext;
  try {
    delete globalThis.AudioContext;
    delete globalThis.webkitAudioContext;
    const { updateEngineAudio } = await freshModule("unsupported");
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
