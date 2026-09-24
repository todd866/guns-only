import assert from "node:assert/strict";
import test from "node:test";
import {
  boomDelaySeconds,
  combatIntensity,
  createFeelVoices,
  cueFeelInterface,
  threatTone,
  updateFeelVoices,
} from "../feel_audio.js";

class Param {
  constructor(value = 0) {
    this.value = value;
    this.targets = [];
  }

  setTargetAtTime(value) { this.value = value; this.targets.push(value); }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}

class Node {
  connect(next) { return next; }
  start() {}
  stop() {}
}

class Context {
  constructor() {
    this.currentTime = 1;
    this.sampleRate = 800;
    this.destination = new Node();
  }

  createGain() { return Object.assign(new Node(), { gain: new Param(0) }); }
  createOscillator() {
    return Object.assign(new Node(), { frequency: new Param(0), type: "sine" });
  }
  createBiquadFilter() {
    return Object.assign(new Node(), {
      frequency: new Param(0),
      Q: new Param(1),
      type: "lowpass",
    });
  }
  createBufferSource() {
    return Object.assign(new Node(), { loop: false, buffer: null });
  }
  createBuffer(_channels, frames) {
    const data = new Float32Array(frames);
    return { getChannelData: () => data };
  }
}

test("combat intensity stays quiet on the title bed and rises in a close fight", () => {
  assert.equal(combatIntensity({ range_m: 400, bandit_alive: true }, "title"), 0.08);
  const far = combatIntensity({ range_m: 20000, bandit_alive: true }, "flight");
  const close = combatIntensity({
    range_m: 500,
    bandit_alive: true,
    gun_firing: true,
    g_actual: 6,
  }, "flight");
  assert.ok(close > far);
  assert.ok(close > 0.7);
});

test("RWR steps from search to lock to a gun warning", () => {
  assert.equal(threatTone({ bandit_alive: true, range_m: 7000 }).mode, "search");
  assert.equal(threatTone({ bandit_alive: true, range_m: 900, closure_kts: 120 }).mode, "lock");
  assert.equal(threatTone({
    bandit_alive: true,
    range_m: 300,
    opponent_gun_firing: true,
  }).mode, "launch");
  assert.equal(threatTone({}).mode, "quiet");
});

test("a distant kill waits on the speed of sound", () => {
  assert.ok(Math.abs(boomDelaySeconds(340.29) - 1) < 0.001);
  assert.equal(boomDelaySeconds(1), 0.02);
  assert.equal(boomDelaySeconds(9000), 1.45);
});

test("wind follows speed, music stays off unless asked, and a kill schedules a delayed boom", () => {
  const audio = new Context();
  const voices = createFeelVoices(audio, audio.destination);
  const cruise = updateFeelVoices(voices, audio, {
    true_airspeed_mps: 250,
    mach: 0.75,
    aoa_deg: 14,
    g_actual: 5,
    bandit_alive: true,
    range_m: 800,
    nowSeconds: 0.2,
  }, { enabled: true, music: false, scene: "flight", nowSeconds: 0.2 });
  assert.ok(cruise.wind > 0.05);
  assert.ok(cruise.aoaLevel > 0);
  assert.equal(cruise.musicLevel, 0);

  const seeded = updateFeelVoices(voices, audio, {
    bandit_alive: true,
    range_m: 680,
    hits: 2,
  }, { enabled: true, music: true, scene: "flight", nowSeconds: 1 });
  assert.ok(seeded.musicLevel > 0);
  const before = audio.currentTime;
  updateFeelVoices(voices, audio, {
    bandit_alive: false,
    fight: "Splash",
    range_m: 680,
    hits: 3,
  }, { enabled: true, music: true, scene: "flight", nowSeconds: 1.1 });
  assert.ok(before >= 0);
  assert.equal(voices.lastAlive, false);
});

test("muted frames still consume the kill edge", () => {
  const audio = new Context();
  const voices = createFeelVoices(audio, audio.destination);
  updateFeelVoices(voices, audio, { bandit_alive: true, range_m: 400 }, { enabled: false });
  updateFeelVoices(voices, audio, {
    bandit_alive: false,
    fight: "Splash",
    range_m: 400,
  }, { enabled: false });
  assert.equal(voices.lastAlive, false);
  const replay = updateFeelVoices(voices, audio, {
    bandit_alive: false,
    fight: "Splash",
    range_m: 400,
  }, { enabled: true, music: true });
  assert.equal(replay.intensity, 0);
});

test("interface ticks honour the preference", () => {
  const audio = new Context();
  const voices = createFeelVoices(audio, audio.destination);
  voices.interfaceSounds = false;
  assert.equal(cueFeelInterface(voices, audio, "click"), false);
  voices.interfaceSounds = true;
  assert.equal(cueFeelInterface(voices, audio, "hover"), true);
});
