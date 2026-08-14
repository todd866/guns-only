import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  async decodeAudioData() { return {}; }
}

const silentManifest = async () => ({
  ok: true,
  json: async () => ({ clips: {} }),
});

const authoredClip = (id, transcript, role = "pilot") => async (input) => {
  if (String(input).endsWith("manifest.json")) {
    return {
      ok: true,
      json: async () => ({
        clips: {
          [id]: {
            url: `./${id}.wav`,
            role,
            transcript,
          },
        },
      }),
    };
  }
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
};

test("checked-in radio clips are bound to the exact current catalog transcript", () => {
  const manifest = JSON.parse(readFileSync(
    new URL("../samples/radio/manifest.json", import.meta.url),
    "utf8",
  ));
  const catalog = JSON.parse(readFileSync(
    new URL("../../../../../audio/radio/mission/lines.json", import.meta.url),
    "utf8",
  ));

  const mismatches = catalog.lines
    .filter((line) => manifest.clips?.[line.id]?.transcript !== line.text)
    .map((line) => line.id);
  assert.deepEqual(
    mismatches,
    [],
    `missing or stale checked-in radio clips: ${mismatches.join(", ")}`,
  );
  const rightsPending = Object.entries(manifest.clips)
    .filter(([, clip]) => !String(clip.source_casting_status)
      .includes("production rights approved by project owner"))
    .map(([id]) => id);
  assert.deepEqual(rightsPending, [],
    `radio clips without recorded production-rights approval: ${rightsPending.join(", ")}`);
  assert.doesNotMatch(JSON.stringify({ manifest, catalog }), /rights review pending/i,
    "an approved production corpus must not retain a false pending-rights label");
  assert.match(catalog.quality_note, /project owner approved production rights on 2026-08-01/i);
});

test("equipment profiles keep Rapier, modern mask, and Korean ARC-1 distinct", async () => {
  const { resolveRadioEquipment } = await import(
    "../radio_equipment_profiles.js?radio=equipment-contract"
  );
  const rapier = resolveRadioEquipment({ role: "pilot" });
  const modern = resolveRadioEquipment({
    role: "pilot",
    talkerProfile: "modern.fast-jet.oxygen-mask",
    transceiverProfile: "modern.uhf-am.airborne",
  });
  const korea = resolveRadioEquipment({
    role: "pilot",
    talkerProfile: "korea.f9f.a13a-mask",
    transceiverProfile: "korea.arc-1.vhf-airborne",
  });

  assert.equal(
    "rapier.pressure-vessel.emergency-mask",
    rapier.talkerId,
  );
  assert.equal("modern.fast-jet.oxygen-mask", modern.talkerId);
  assert.equal("korea.f9f.a13a-mask", korea.talkerId);
  assert.ok(rapier.talker.lowpassHz > modern.talker.lowpassHz);
  assert.ok(modern.talker.lowpassHz > korea.talker.lowpassHz);
  assert.ok(korea.receiveLowpassHz < rapier.receiveLowpassHz);
  assert.ok(korea.carrierNoise > rapier.carrierNoise);
});

test("link quality degrades bandwidth and noise rather than acting as a volume knob", async () => {
  const { resolveRadioEquipment } = await import(
    "../radio_equipment_profiles.js?radio=link-quality"
  );
  const strong = resolveRadioEquipment({
    role: "pilot",
    transceiverProfile: "korea.arc-1.vhf-airborne",
    signalQuality: 1,
  });
  const marginal = resolveRadioEquipment({
    role: "pilot",
    transceiverProfile: "korea.arc-1.vhf-airborne",
    signalQuality: 0.25,
  });

  assert.ok(marginal.carrierNoise > strong.carrierNoise * 4);
  assert.ok(marginal.receiveHighpassHz > strong.receiveHighpassHz);
  assert.ok(marginal.receiveLowpassHz < strong.receiveLowpassHz);
  assert.ok(marginal.receiveLevel > strong.receiveLevel * 0.85);
});

test("runtime retunes both microphone and receiver stages per installation", async () => {
  const { createRadioVoice, configureRadioEquipment } = await import(
    "../radio_audio.js?radio=retune"
  );
  const { resolveRadioEquipment } = await import(
    "../radio_equipment_profiles.js?radio=retune"
  );
  const context = new Context();
  const voice = createRadioVoice(context, context.destination, {
    fetchImpl: silentManifest,
  });

  configureRadioEquipment(voice, context, resolveRadioEquipment({
    role: "pilot",
    talkerProfile: "korea.f9f.a13a-mask",
    transceiverProfile: "korea.arc-1.vhf-airborne",
  }));

  assert.equal(310, voice.micHighpass.frequency.value);
  assert.equal(3_300, voice.micLowpass.frequency.value);
  assert.equal(335, voice.highpass.frequency.value);
  assert.equal(2_900, voice.lowpass.frequency.value);
  assert.equal(7, voice.compressor.ratio.value);
  assert.equal("korea.arc-1.vhf-airborne", voice.currentEquipment.transceiverId);
});

test("snapshot equipment and link quality override role defaults", async () => {
  const { createRadioVoice, updateRadioVoice } = await import(
    "../radio_audio.js?radio=snapshot-equipment"
  );
  const context = new Context();
  const voice = createRadioVoice(context, context.destination, {
    fetchImpl: silentManifest,
  });

  updateRadioVoice(voice, context, {
    radio_active: true,
    radio_sequence: 1,
    radio_id: "korea-test",
    radio_voice: "pilot",
    radio_talker_profile: "korea.f9f.a13a-mask",
    radio_transceiver_profile: "korea.arc-1.vhf-airborne",
    radio_signal_quality: 0.2,
  });

  assert.equal("korea.f9f.a13a-mask", voice.currentEquipment.talkerId);
  assert.equal("korea.arc-1.vhf-airborne", voice.currentEquipment.transceiverId);
  assert.equal(0.2, voice.currentEquipment.signalQuality);
  assert.ok(voice.lowpass.frequency.value < 2_300);
});

test("new manifest clip metadata selects equipment while old manifests retain role fallback", async () => {
  const { createRadioVoice, updateRadioVoice } = await import(
    "../radio_audio.js?radio=manifest-equipment"
  );
  const context = new Context();
  const fetchImpl = async (input) => {
    if (String(input).endsWith("manifest.json")) {
      return {
        ok: true,
        json: async () => ({
          clips: {
            "korea-test": {
              url: "./korea-test.wav",
              role: "pilot",
              transcript: "Korea test.",
              talker_profile: "korea.f9f.a13a-mask",
              transceiver_profile: "korea.arc-1.vhf-airborne",
            },
          },
        }),
      };
    }
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const voice = createRadioVoice(context, context.destination, { fetchImpl });
  await new Promise((resolve) => setImmediate(resolve));

  updateRadioVoice(voice, context, {
    radio_active: true,
    radio_sequence: 1,
    radio_id: "korea-test",
    radio_text: "Korea test.",
    radio_voice: "pilot",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal("korea.f9f.a13a-mask", voice.currentEquipment.talkerId);
  assert.equal("korea.arc-1.vhf-airborne", voice.currentEquipment.transceiverId);
  assert.equal(voice.micHighpass, voice.source.connections[0]);
});

test("a stale clip id with different words fails silent", async () => {
  const { createRadioVoice, updateRadioVoice } = await import(
    "../radio_audio.js?radio=stale-transcript"
  );
  const context = new Context();
  let clipFetches = 0;
  const fetchImpl = async (input) => {
    if (String(input).endsWith("manifest.json")) {
      return {
        ok: true,
        json: async () => ({
          clips: {
            "pilot-base": {
              url: "./pilot-base.wav",
              role: "pilot",
              transcript: "Ghost One One, base, gear down, full stop.",
            },
          },
        }),
      };
    }
    clipFetches += 1;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const voice = createRadioVoice(context, context.destination, { fetchImpl });
  await new Promise((resolve) => setImmediate(resolve));

  updateRadioVoice(voice, context, {
    radio_active: true,
    radio_sequence: 1,
    radio_id: "pilot-base",
    radio_text: "Ghost One One, base, three greens.",
    radio_voice: "pilot",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(voice.missingClipCount, 1);
  assert.equal(clipFetches, 0);
  assert.equal(voice.source, null);
});

test("new radio sequence opens squelch once and only lightly ducks propulsion", async () => {
  const { createRadioVoice, updateRadioVoice } = await import("../radio_audio.js?radio=sequence");
  const context = new Context();
  const propulsionDuck = new Gain();
  propulsionDuck.gain.value = 1;
  const voice = createRadioVoice(context, context.destination, {
    propulsionDuck,
    fetchImpl: authoredClip("tower-continue", "Continue.", "tower"),
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
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(voice.squelchCount, 1);
  assert.ok(Math.abs(propulsionDuck.gain.targets.at(-1).value - 0.52 / 0.58) < 1e-12);
  assert.equal(voice.highpass.type, "highpass");
  assert.equal(voice.lowpass.type, "lowpass");
  assert.equal("ground.controller.close-mic", voice.currentEquipment.talkerId);
  assert.equal("modern.uhf-am.ground", voice.currentEquipment.transceiverId);
  assert.ok(
    voice.output.gain.targets.at(-1).value < voice.currentEquipment.receiveLevel,
  );
});

test("mute stops a transmission and restores propulsion", async () => {
  const { createRadioVoice, updateRadioVoice } = await import("../radio_audio.js?radio=mute");
  const context = new Context();
  const propulsionDuck = new Gain();
  const voice = createRadioVoice(context, context.destination, {
    propulsionDuck,
    fetchImpl: authoredClip(
      "pilot-initial",
      "Ghost One One, initial.",
      "pilot",
    ),
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
  assert.equal(propulsionDuck.gain.targets.at(-1).value, 1);
});

test("mission reset lets sequence one play again", async () => {
  const { createRadioVoice, updateRadioVoice } = await import("../radio_audio.js?radio=reset");
  const context = new Context();
  const propulsionDuck = new Gain();
  const voice = createRadioVoice(context, context.destination, {
    propulsionDuck,
    fetchImpl: authoredClip(
      "pilot-initial",
      "Ghost One One, initial.",
      "pilot",
    ),
  });
  const call = {
    radio_active: true,
    radio_sequence: 1,
    radio_id: "pilot-initial",
    radio_text: "Ghost One One, initial.",
  };

  updateRadioVoice(voice, context, call);
  await new Promise((resolve) => setImmediate(resolve));
  updateRadioVoice(voice, context, { radio_active: false, radio_sequence: 0 });
  updateRadioVoice(voice, context, call);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(voice.squelchCount, 2);
});

test("tactical radio is not restricted to the Circuits mission", async () => {
  const { createRadioVoice, updateRadioVoice } = await import("../radio_audio.js?radio=tactical");
  const context = new Context();
  const voice = createRadioVoice(context, context.destination, {
    fetchImpl: authoredClip("control-commit-short", "Ghost, commit.", "controller"),
  });

  updateRadioVoice(voice, context, {
    rapier_pattern_only: false,
    radio_active: true,
    radio_sequence: 8,
    radio_id: "control-commit-short",
    radio_text: "Ghost, commit.",
    radio_voice: "controller",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(voice.squelchCount, 1);
});

test("a missing authored clip fails silent instead of invoking device TTS", async () => {
  const { createRadioVoice, updateRadioVoice } = await import("../radio_audio.js?radio=missing");
  const context = new Context();
  const propulsionDuck = new Gain();
  const voice = createRadioVoice(context, context.destination, {
    propulsionDuck,
    fetchImpl: silentManifest,
  });
  let spoken = 0;
  const previousSynth = globalThis.speechSynthesis;
  const previousUtterance = globalThis.SpeechSynthesisUtterance;
  globalThis.speechSynthesis = { speak() { spoken += 1; }, cancel() {} };
  globalThis.SpeechSynthesisUtterance = class {};
  try {
    const state = {
      radio_active: true,
      radio_sequence: 9,
      radio_id: "not-in-the-catalog",
      radio_text: "This must never use the system voice.",
      radio_voice: "controller",
    };
    const original = structuredClone(state);
    updateRadioVoice(voice, context, state);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(voice.missingClipCount, 1);
    assert.equal(spoken, 0);
    assert.equal(voice.squelchCount, 0);
    assert.deepEqual(state, original);
    updateRadioVoice(voice, context, {
      radio_active: false,
      radio_sequence: 9,
    });
    assert.equal(propulsionDuck.gain.targets.at(-1).value, 1);
  } finally {
    if (previousSynth === undefined) delete globalThis.speechSynthesis;
    else globalThis.speechSynthesis = previousSynth;
    if (previousUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = previousUtterance;
  }
});
