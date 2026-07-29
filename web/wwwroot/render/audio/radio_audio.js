// Shared mission-radio presentation. Captions remain authoritative; generated WAV assets are
// preferred, with device speech used only when a catalog clip has not been built.

const MANIFEST_URL = new URL("./samples/radio/manifest.json", import.meta.url);

function target(param, value, now, timeConstant = 0.02) {
  param.setTargetAtTime(value, now, timeConstant);
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
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 300;
  highpass.Q.value = 0.72;

  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3_250;
  lowpass.Q.value = 0.68;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -27;
  compressor.knee.value = 4;
  compressor.ratio.value = 7;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.09;

  const output = context.createGain();
  output.gain.value = 0.82;
  highpass.connect(lowpass).connect(compressor).connect(output).connect(destination);

  return {
    highpass,
    lowpass,
    compressor,
    output,
    engineMaster,
    fetchImpl,
    manifest: null,
    manifestPromise: null,
    decoded: new Map(),
    lastSequence: 0,
    source: null,
    enabled: false,
    generation: 0,
    squelchCount: 0,
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

function playSquelch(voice, context) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = noiseBuffer(context);
  gain.gain.setValueAtTime(0.22, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.06);
  source.connect(gain).connect(voice.highpass);
  source.start(context.currentTime);
  source.stop?.(context.currentTime + 0.065);
  voice.squelchCount += 1;
}

function stopSource(voice) {
  try {
    voice.source?.stop?.();
  } catch {
    // An already-ended AudioBufferSource throws in some engines.
  }
  voice.source = null;
}

function radioValue(state, field) {
  return state?.[`radio_${field}`] ?? state?.[`rapier_radio_${field}`];
}

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

async function playTransmission(voice, context, state, generation) {
  const manifest = await ensureManifest(voice);
  if (!voice.enabled || generation !== voice.generation) return;
  const clip = manifest.clips?.[radioValue(state, "id")];
  if (!clip?.url) {
    deviceSpeech(voice, state, generation);
    return;
  }

  try {
    let decoded = voice.decoded.get(clip.url);
    if (!decoded) {
      const response = await voice.fetchImpl(clip.url);
      if (!response?.ok) throw new Error("radio clip unavailable");
      decoded = await context.decodeAudioData(await response.arrayBuffer());
      voice.decoded.set(clip.url, decoded);
    }
    if (!voice.enabled || generation !== voice.generation) return;
    stopSource(voice);
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.connect(voice.highpass);
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

  voice.lastSequence = sequence;
  voice.generation += 1;
  const generation = voice.generation;
  stopSource(voice);
  globalThis.speechSynthesis?.cancel?.();
  playSquelch(voice, context);
  void playTransmission(voice, context, state, generation);
}
