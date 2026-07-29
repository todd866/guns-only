import assert from "node:assert/strict";
import test from "node:test";

class Param {
  constructor(value = 0) { this.value = value; this.targets = []; }
  setTargetAtTime(value, time, timeConstant) {
    this.value = value;
    this.targets.push({ value, time, timeConstant });
  }
  setValueAtTime(value, time) { this.value = value; this.targets.push({ value, time }); }
  exponentialRampToValueAtTime(value, time) {
    this.value = value;
    this.targets.push({ value, time });
  }
}

class Node {
  constructor() { this.connections = []; }
  connect(destination) { this.connections.push(destination); return destination; }
}

class Gain extends Node { constructor() { super(); this.gain = new Param(); } }
class Filter extends Node {
  constructor() {
    super();
    this.type = "lowpass";
    this.frequency = new Param();
    this.Q = new Param();
    this.gain = new Param();
  }
}
class Compressor extends Node {
  constructor() {
    super();
    this.threshold = new Param();
    this.knee = new Param();
    this.ratio = new Param();
    this.attack = new Param();
    this.release = new Param();
  }
}
class Source extends Node {
  constructor() {
    super();
    this.started = 0;
    this.stopped = 0;
    this.buffer = null;
    this.loop = false;
    this.playbackRate = new Param(1);
    this.onended = null;
  }
  start() { this.started += 1; }
  stop() { this.stopped += 1; }
}
class Context {
  constructor() {
    this.currentTime = 3;
    this.sampleRate = 24_000;
    this.destination = new Node();
    this.sources = [];
  }
  createGain() { return new Gain(); }
  createBiquadFilter() { return new Filter(); }
  createDynamicsCompressor() { return new Compressor(); }
  createBufferSource() {
    const source = new Source();
    this.sources.push(source);
    return source;
  }
  createBuffer(_channels, frames) {
    const data = new Float32Array(frames);
    return { getChannelData: () => data };
  }
}

const silentManifest = async () => ({
  ok: true,
  json: async () => ({ clips: {} }),
});

test("new radio sequence opens squelch once and ducks propulsion", async () => {
  const { createRadioVoice, updateRadioVoice } = await import("../radio_audio.js?radio=sequence");
  const context = new Context();
  const engineMaster = new Gain();
  engineMaster.gain.value = 0.58;
  const voice = createRadioVoice(context, context.destination, {
    engineMaster,
    fetchImpl: silentManifest,
  });
  const state = {
    radio_active: true,
    radio_sequence: 4,
    radio_id: "tower-continue",
    radio_text: "Continue.",
    radio_voice: "tower",
  };

  updateRadioVoice(voice, context, state);
  updateRadioVoice(voice, context, state);

  assert.equal(voice.squelchCount, 1);
  assert.equal(engineMaster.gain.targets.at(-1).value, 0.16);
  assert.equal(voice.highpass.type, "highpass");
  assert.equal(voice.lowpass.type, "lowpass");
});

test("mute stops a transmission and restores propulsion", async () => {
  const { createRadioVoice, updateRadioVoice } = await import("../radio_audio.js?radio=mute");
  const context = new Context();
  const engineMaster = new Gain();
  const voice = createRadioVoice(context, context.destination, {
    engineMaster,
    fetchImpl: silentManifest,
  });
  const state = {
    radio_active: true,
    radio_sequence: 1,
    radio_id: "pilot-base",
    radio_text: "Base.",
  };

  updateRadioVoice(voice, context, state);
  updateRadioVoice(voice, context, state, { enabled: false });

  assert.equal(voice.enabled, false);
  assert.equal(engineMaster.gain.targets.at(-1).value, 0.58);
});

test("mission reset lets sequence one play again", async () => {
  const { createRadioVoice, updateRadioVoice } = await import("../radio_audio.js?radio=reset");
  const context = new Context();
  const voice = createRadioVoice(context, context.destination, {
    fetchImpl: silentManifest,
  });
  const call = {
    radio_active: true,
    radio_sequence: 1,
    radio_id: "launch-cleared",
    radio_text: "Ghost Eleven, cleared for launch.",
  };

  updateRadioVoice(voice, context, call);
  updateRadioVoice(voice, context, { radio_active: false, radio_sequence: 0 });
  updateRadioVoice(voice, context, call);

  assert.equal(voice.squelchCount, 2);
});

test("tactical radio is not restricted to the Circuits mission", async () => {
  const { createRadioVoice, updateRadioVoice } = await import("../radio_audio.js?radio=tactical");
  const context = new Context();
  const voice = createRadioVoice(context, context.destination, {
    fetchImpl: silentManifest,
  });

  updateRadioVoice(voice, context, {
    rapier_pattern_only: false,
    radio_active: true,
    radio_sequence: 8,
    radio_id: "pilot-guns",
    radio_text: "Ghost Eleven, guns.",
    radio_voice: "pilot",
  });

  assert.equal(voice.squelchCount, 1);
});
