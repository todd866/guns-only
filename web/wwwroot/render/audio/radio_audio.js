// Shared mission-radio presentation. Authored WAV assets are the only production speech path:
// a missing clip fails silent instead of suddenly replacing a character with the device's robot
// voice. A restrained UHF chain supplies station colour without crushing the performance.

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
  tower: { level: 0.72, noise: 0.009 },
  controller: { level: 0.69, noise: 0.011 },
  launch: { level: 0.76, noise: 0.017 },
  lso: { level: 0.78, noise: 0.018 },
  pilot: { level: 0.67, noise: 0.020 },
  "traffic-two": { level: 0.64, noise: 0.022 },
  "traffic-three": { level: 0.62, noise: 0.024 },
  "traffic-four": { level: 0.63, noise: 0.023 },
  traffic: { level: 0.64, noise: 0.022 },
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
  // The second-order skirts retain consonants and human texture. Character should come from the
  // take; the processing only locates it on a UHF net.
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 260;
  highpass.Q.value = 0.64;

  const highpass2 = context.createBiquadFilter();
  highpass2.type = "highpass";
  highpass2.frequency.value = 260;
  highpass2.Q.value = 0.72;

  const presence = context.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 1_900;
  presence.Q.value = 0.9;
  presence.gain.value = 2;

  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3_850;
  lowpass.Q.value = 0.64;

  const lowpass2 = context.createBiquadFilter();
  lowpass2.type = "lowpass";
  lowpass2.frequency.value = 3_850;
  lowpass2.Q.value = 0.72;

  // Firm radio AGC, short of the limiter-like pumping that flattened the source performances.
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 5;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.14;

  const output = context.createGain();
  output.gain.value = 0.68;
  highpass.connect(highpass2).connect(presence).connect(lowpass)
    .connect(lowpass2).connect(compressor).connect(output).connect(destination);

  const voice = {
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
    missingClipCount: 0,
  };
  // Fetch the tiny manifest as soon as the flight graph exists so the first launch call does not
  // spend its opening syllable waiting on catalog discovery.
  void ensureManifest(voice);
  return voice;
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
    voice.missingClipCount += 1;
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
    // Subtle station gain and rate drift keeps repeated takes alive without changing cadence.
    const level = preset.level * (0.944 + 0.112 * hash01(sequence, 6));
    target(voice.output.gain, level, context.currentTime, 0.015);
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = 0.995 + 0.010 * hash01(sequence, 7);
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
    voice.missingClipCount += 1;
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
      restoreEngine(voice, context);
    }
    return;
  }

  voice.enabled = true;
  if (voice.engineMaster?.gain)
    target(voice.engineMaster.gain, 0.38, context.currentTime, 0.045);
  if (sequence <= 0 || sequence === voice.lastSequence) return;

  const preempted = voice.source != null;
  voice.lastSequence = sequence;
  voice.generation += 1;
  const generation = voice.generation;
  stopSource(voice, context, { unkey: preempted });
  playSquelch(voice, context, sequence);
  void playTransmission(voice, context, state, generation, sequence);
}
