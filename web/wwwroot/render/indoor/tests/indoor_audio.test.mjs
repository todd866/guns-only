import assert from "node:assert/strict";
import test from "node:test";

import {
  IndoorAudio,
  indoorAudioQaSilent,
} from "../../../indoor/audio.js";

class FakeAudioParam {
  constructor(value = 0) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}

class FakeAudioNode {
  constructor() {
    this.gain = new FakeAudioParam();
    this.frequency = new FakeAudioParam();
    this.Q = new FakeAudioParam();
    this.threshold = new FakeAudioParam();
    this.knee = new FakeAudioParam();
    this.ratio = new FakeAudioParam();
    this.attack = new FakeAudioParam();
    this.release = new FakeAudioParam();
  }
  connect() { return this; }
  start() {}
  stop() {}
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = new FakeAudioNode();
    this.sampleRate = 100;
    this.state = "running";
  }
  createGain() { return new FakeAudioNode(); }
  createDynamicsCompressor() { return new FakeAudioNode(); }
  createOscillator() { return new FakeAudioNode(); }
  createBiquadFilter() { return new FakeAudioNode(); }
  createBufferSource() { return new FakeAudioNode(); }
  createBuffer(_channels, length) {
    return { getChannelData: () => new Float32Array(length) };
  }
  async resume() { this.state = "running"; }
  async close() { this.state = "closed"; }
}

test("Indoor silent QA is explicit and keeps the real graph muted at destination", async () => {
  assert.equal(indoorAudioQaSilent({ search: "?preview=1&audioQa=silent" }), true);
  assert.equal(indoorAudioQaSilent({ search: "?audioQa=audible" }), false);

  const previousAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = FakeAudioContext;
  try {
    const audio = new IndoorAudio(true, { silentQa: true });
    assert.equal(await audio.start(), true);
    assert.deepEqual(audio.diagnostics(), {
      enabled: true,
      silentQa: true,
      contextState: "running",
      masterGain: 0,
    });
    audio.setEnabled(false);
    audio.setEnabled(true);
    assert.equal(audio.diagnostics().masterGain, 0,
      "re-enabling audio must not bypass the QA destination clamp");
    audio.dispose();
  } finally {
    if (previousAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousAudioContext;
  }
});
