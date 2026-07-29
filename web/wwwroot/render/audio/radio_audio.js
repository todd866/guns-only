// Shared mission-radio presentation. Captions remain authoritative; generated WAV assets are
// preferred, with device speech used only when a catalog clip has not been built. The clip path
// runs a military-UHF voice chain: steep band-pass with a presence bark, limiter-grade
// compression, a carrier-noise floor under the voice, and key/unkey squelch artifacts — all
// jittered per transmission (deterministically, from the kernel sequence) so no two calls are
// bit-identical even when they reuse one recorded take.

const MANIFEST_URL = new URL("./samples/radio/manifest.json", import.meta.url);

function target(param, value, now, timeConstant = 0.02) {
  param.setTargetAtTime(value, now, timeConstant);
}

/// Deterministic per-transmission variation: same sequence, same jitter, every replay.
function hash01(sequence, salt = 0) {
  let hash = (BigInt(Math.max(0, Math.floor(sequence))) + BigInt(salt) * 7919n)
    * 0x9E3779B97F4A7C15n;
  hash &= 0xFFFFFFFFFFFFFFFFn;
  hash ^= hash >> 29n;
  return Number(hash & 0xFFFFFFn) / 0x1000000;
}

function noiseBuffer(context, seconds = 0.055) {
  const frames = Math.max(32, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x7f4a7c15;
  for (let i = 0; i < frames; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 0x80000000 - 1) * (1 - i / frames);
  }
  return buffer;
}

function carrierNoiseBuffer(context, seconds = 1.5) {
  const frames = Math.max(256, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2545f491;
  for (let i = 0; i < frames; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = (seed >>> 0) / 0x80000000 - 1;
  }
  return buffer;
}

/// Per-station color: output trim and how much carrier hiss sits under the voice. Airborne and
/// deck stations read noisier than the tower's ground installation.
const ROLE_PRESETS = {
  tower: { level: 0.90, noise: 0.015 },
  controller: { level: 0.85, noise: 0.020 },
  launch: { level: 0.95, noise: 0.030 },
  lso: { level: 0.95, noise: 0.030 },
  pilot: { level: 0.80, noise: 0.035 },
  "traffic-two": { level: 0.78, noise: 0.040 },
  "traffic-three": { level: 0.76, noise: 0.045 },
  "traffic-four": { level: 0.77, noise: 0.042 },
  traffic: { level: 0.78, noise: 0.040 },
};

export async function loadRadioManifest(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") return { clips: {} };
  const response = await fetchImpl(MANIFEST_URL);
  if (!response?.ok) throw new Error(`radio manifest ${response?.status ?? "unavailable"}`);
  const manifest = await response.json();
  return manifest && typeof manifest.clips === "object" ? manifest : { clips: {} };
}

export function createRadioVoice(context, destination, {
  engineMaster = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  // Two cascaded biquads per band edge give radio-steep 4th-order skirts; the peaking stage
  // between them is the 2 kHz presence bark that makes a channel read as "radio".
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 320;
  highpass.Q.value = 0.54;

  const highpass2 = context.createBiquadFilter();
  highpass2.type = "highpass";
  highpass2.frequency.value = 320;
  highpass2.Q.value = 1.31;

  const presence = context.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 2_000;
  presence.Q.value = 1.2;
  presence.gain.value = 5;

  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3_100;
  lowpass.Q.value = 0.54;

  const lowpass2 = context.createBiquadFilter();
  lowpass2.type = "lowpass";
  lowpass2.frequency.value = 3_100;
  lowpass2.Q.value = 1.31;

  // Limiter territory, not bus glue: hard knee, high ratio, audible AGC pumping on release.
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 2;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const output = context.createGain();
  output.gain.value = 0.82;
  highpass.connect(highpass2).connect(presence).connect(lowpass)
    .connect(lowpass2).connect(compressor).connect(output).connect(destination);

  return {
    highpass,
    lowpass,
    highpass2,
    lowpass2,
    presence,
    compressor,
    output,
    engineMaster,
    fetchImpl,
    manifest: null,
    manifestPromise: null,
    decoded: new Map(),
    lastSequence: 0,
    source: null,
    carrier: null,
    carrierGain: null,
    enabled: false,
    generation: 0,
    squelchCount: 0,
    unkeyCount: 0,
  };
}

function ensureManifest(voice) {
  if (voice.manifest) return Promise.resolve(voice.manifest);
  if (!voice.manifestPromise) {
    voice.manifestPromise = loadRadioManifest(voice.fetchImpl)
      .then((manifest) => {
        voice.manifest = manifest;
        return manifest;
      })
      .catch(() => {
        voice.manifest = { clips: {} };
        return voice.manifest;
      });
  }
  return voice.manifestPromise;
}

function playSquelch(voice, context, sequence) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const seconds = 0.040 + 0.030 * hash01(sequence, 1);
  const level = 0.16 + 0.10 * hash01(sequence, 2);
  source.buffer = noiseBuffer(context, seconds);
  gain.gain.setValueAtTime(level, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds + 0.01);
  source.connect(gain).connect(voice.highpass);
  source.start(context.currentTime);
  source.stop?.(context.currentTime + seconds + 0.015);
  voice.squelchCount += 1;
}

/// Real RF produces its loudest noise burst when the transmitter unkeys.
function playUnkey(voice, context, sequence) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const seconds = 0.055 + 0.030 * hash01(sequence, 3);
  const level = 0.22 + 0.10 * hash01(sequence, 4);
  source.buffer = noiseBuffer(context, seconds);
  gain.gain.setValueAtTime(level, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds + 0.01);
  source.connect(gain).connect(voice.highpass);
  source.start(context.currentTime);
  source.stop?.(context.currentTime + seconds + 0.015);
  voice.unkeyCount += 1;
}

function startCarrier(voice, context, role) {
  stopCarrier(voice);
  const preset = ROLE_PRESETS[role] ?? ROLE_PRESETS.traffic;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = carrierNoiseBuffer(context);
  source.loop = true;
  gain.gain.value = preset.noise;
  source.connect(gain).connect(voice.highpass);
  source.start(context.currentTime);
  voice.carrier = source;
  voice.carrierGain = gain;
}

function stopCarrier(voice) {
  try {
    voice.carrier?.stop?.();
  } catch {
    // An already-ended source throws in some engines.
  }
  voice.carrier = null;
  voice.carrierGain = null;
}

function stopSource(voice, context = null, { unkey = false } = {}) {
  try {
    voice.source?.stop?.();
  } catch {
    // An already-ended AudioBufferSource throws in some engines.
  }
  if (voice.source) voice.source.onended = null;
  voice.source = null;
  stopCarrier(voice);
  if (unkey && context) playUnkey(voice, context, voice.lastSequence);
}

function radioValue(state, field) {
  return state?.[`radio_${field}`] ?? state?.[`rapier_radio_${field}`];
}

// speechSynthesis renders straight to the device output: it CANNOT be routed through the
// WebAudio chain above, so the fallback voice is intentionally unprocessed. Real clips are the
// production path; this exists so a missing clip degrades to speech rather than silence.
function deviceSpeech(voice, state, generation) {
  const synth = globalThis.speechSynthesis;
  const Utterance = globalThis.SpeechSynthesisUtterance;
  if (!voice.enabled || generation !== voice.generation
    || !synth || typeof Utterance !== "function") return;
  synth.cancel?.();
  const utterance = new Utterance(String(radioValue(state, "text") ?? ""));
  utterance.lang = "en-US";
  const role = radioValue(state, "voice");
  utterance.rate = role === "tower" || role === "controller" ? 0.91 : 0.96;
  utterance.pitch = role === "launch" ? 0.82 : 0.96;
  utterance.volume = 0.78;
  const english = synth.getVoices?.().find((candidate) =>
    /^en([-_]|$)/i.test(candidate.lang ?? ""));
  if (english) utterance.voice = english;
  synth.speak(utterance);
}

function clipUrl(clip, sequence) {
  const takes = Array.isArray(clip?.takes) && clip.takes.length > 0
    ? clip.takes
    : clip?.url ? [clip.url] : [];
  if (takes.length === 0) return null;
  const pick = Math.min(takes.length - 1, Math.floor(hash01(sequence, 5) * takes.length));
  const take = takes[pick];
  return typeof take === "string" ? take : take?.url ?? null;
}

async function playTransmission(voice, context, state, generation, sequence) {
  const manifest = await ensureManifest(voice);
  if (!voice.enabled || generation !== voice.generation) return;
  const clip = manifest.clips?.[radioValue(state, "id")];
  const url = clipUrl(clip, sequence);
  if (!url) {
    deviceSpeech(voice, state, generation);
    return;
  }

  try {
    let decoded = voice.decoded.get(url);
    if (!decoded) {
      const response = await voice.fetchImpl(new URL(url, MANIFEST_URL));
      if (!response?.ok) throw new Error("radio clip unavailable");
      decoded = await context.decodeAudioData(await response.arrayBuffer());
      voice.decoded.set(url, decoded);
    }
    if (!voice.enabled || generation !== voice.generation) return;
    stopSource(voice);
    const role = radioValue(state, "voice");
    const preset = ROLE_PRESETS[role] ?? ROLE_PRESETS.traffic;
    // ±1 dB level and ±1.5% rate jitter: inaudible as such, but no replay is sample-identical.
    const level = preset.level * (0.891 + 0.218 * hash01(sequence, 6));
    target(voice.output.gain, level, context.currentTime, 0.015);
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = 0.985 + 0.030 * hash01(sequence, 7);
    source.connect(voice.highpass);
    source.onended = () => {
      if (voice.source !== source) return;
      voice.source = null;
      stopCarrier(voice);
      if (voice.enabled && generation === voice.generation)
        playUnkey(voice, context, sequence);
    };
    startCarrier(voice, context, role);
    source.start(context.currentTime);
    voice.source = source;
  } catch {
    deviceSpeech(voice, state, generation);
  }
}

function restoreEngine(voice, context) {
  if (voice.engineMaster?.gain)
    target(voice.engineMaster.gain, 0.58, context.currentTime, 0.11);
}

export function updateRadioVoice(voice, context, state, { enabled = true } = {}) {
  if (!voice) return;
  const active = enabled
    && radioValue(state, "active") === true;
  const sequence = Math.max(0, Math.floor(Number(radioValue(state, "sequence")) || 0));
  if (sequence === 0) voice.lastSequence = 0;

  if (!active) {
    if (voice.enabled) {
      voice.enabled = false;
      voice.generation += 1;
      stopSource(voice);
      globalThis.speechSynthesis?.cancel?.();
      restoreEngine(voice, context);
    }
    return;
  }

  voice.enabled = true;
  if (voice.engineMaster?.gain)
    target(voice.engineMaster.gain, 0.16, context.currentTime, 0.025);
  if (sequence <= 0 || sequence === voice.lastSequence) return;

  const preempted = voice.source != null;
  voice.lastSequence = sequence;
  voice.generation += 1;
  const generation = voice.generation;
  stopSource(voice, context, { unkey: preempted });
  globalThis.speechSynthesis?.cancel?.();
  playSquelch(voice, context, sequence);
  void playTransmission(voice, context, state, generation, sequence);
}
