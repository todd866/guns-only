// Shared mission-radio presentation. Authored WAV assets are the only production speech path:
// a missing clip fails silent instead of suddenly replacing a character with the device's robot
// voice. Equipment profiles locate a dry performance in a particular mask, microphone, and
// transceiver without crushing it.

import { resolveRadioEquipment } from "./radio_equipment_profiles.js";

const MANIFEST_URL = new URL("./samples/radio/manifest.json", import.meta.url);
const RADIO_SCENERY_LEVEL = 0.78;
const PROPULSION_NORMAL_MULTIPLIER = 1;
const RADIO_PRIORITY_DUCK_DB = Object.freeze({
  routine: Object.freeze({ propulsion: -2, world: -1.5 }),
  advisory: Object.freeze({ propulsion: -5, world: -3 }),
  urgent: Object.freeze({ propulsion: -8, world: -5 }),
});

function dbToMultiplier(decibels) {
  return 10 ** (Number(decibels) / 20);
}

/** Published mission priority becomes an explicit, bounded mix contract. */
export function radioPriorityMix(state = {}) {
  const raw = Number(radioValue(state, "priority"));
  const key = raw >= 2 ? "urgent" : raw >= 1 ? "advisory" : "routine";
  const duck = RADIO_PRIORITY_DUCK_DB[key];
  return Object.freeze({
    key,
    propulsionMultiplier: dbToMultiplier(duck.propulsion),
    worldMultiplier: dbToMultiplier(duck.world),
  });
}

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

export async function loadRadioManifest(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") return { clips: {} };
  const response = await fetchImpl(MANIFEST_URL);
  if (!response?.ok) throw new Error(`radio manifest ${response?.status ?? "unavailable"}`);
  const manifest = await response.json();
  return manifest && typeof manifest.clips === "object" ? manifest : { clips: {} };
}

export function createRadioVoice(context, destination, {
  propulsionDuck = null,
  worldDuck = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  // The microphone/mask stage is separate from the receive-radio stage. Speech goes through
  // both; RF keying and carrier noise enter after the microphone stage.
  const micHighpass = context.createBiquadFilter();
  micHighpass.type = "highpass";

  const micLowpass = context.createBiquadFilter();
  micLowpass.type = "lowpass";

  const micPresence = context.createBiquadFilter();
  micPresence.type = "peaking";

  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.Q.value = 0.64;

  const highpass2 = context.createBiquadFilter();
  highpass2.type = "highpass";
  highpass2.Q.value = 0.72;

  const presence = context.createBiquadFilter();
  presence.type = "peaking";

  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.Q.value = 0.64;

  const lowpass2 = context.createBiquadFilter();
  lowpass2.type = "lowpass";
  lowpass2.Q.value = 0.72;

  // The profile supplies firm radio AGC, short of limiter-like pumping.
  const compressor = context.createDynamicsCompressor();

  const output = context.createGain();
  micHighpass.connect(micLowpass).connect(micPresence).connect(highpass);
  highpass.connect(highpass2).connect(presence).connect(lowpass)
    .connect(lowpass2).connect(compressor).connect(output).connect(destination);

  const voice = {
    micHighpass,
    micLowpass,
    micPresence,
    highpass,
    lowpass,
    highpass2,
    lowpass2,
    presence,
    compressor,
    output,
    propulsionDuck,
    worldDuck,
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
    currentEquipment: null,
  };
  configureRadioEquipment(
    voice,
    context,
    resolveRadioEquipment({ role: "pilot", signalQuality: 1 }),
  );
  // Fetch the tiny manifest as soon as the flight graph exists so the first launch call does not
  // spend its opening syllable waiting on catalog discovery.
  void ensureManifest(voice);
  return voice;
}

export function configureRadioEquipment(voice, context, equipment) {
  const now = context.currentTime;
  const { talker, transceiver } = equipment;
  target(voice.micHighpass.frequency, talker.highpassHz, now);
  target(voice.micLowpass.frequency, talker.lowpassHz, now);
  target(voice.micPresence.frequency, talker.presenceHz, now);
  target(voice.micPresence.Q, talker.presenceQ, now);
  target(voice.micPresence.gain, talker.presenceDb, now);

  target(voice.highpass.frequency, equipment.receiveHighpassHz, now);
  target(voice.highpass2.frequency, equipment.receiveHighpassHz, now);
  target(voice.presence.frequency, transceiver.presenceHz, now);
  target(voice.presence.Q, transceiver.presenceQ, now);
  target(voice.presence.gain, transceiver.presenceDb, now);
  target(voice.lowpass.frequency, equipment.receiveLowpassHz, now);
  target(voice.lowpass2.frequency, equipment.receiveLowpassHz, now);

  target(voice.compressor.threshold, transceiver.compressor.thresholdDb, now);
  target(voice.compressor.knee, transceiver.compressor.kneeDb, now);
  target(voice.compressor.ratio, transceiver.compressor.ratio, now);
  target(voice.compressor.attack, transceiver.compressor.attackS, now);
  target(voice.compressor.release, transceiver.compressor.releaseS, now);
  target(
    voice.output.gain,
    equipment.receiveLevel * RADIO_SCENERY_LEVEL,
    now,
    0.015,
  );
  voice.currentEquipment = equipment;
  return equipment;
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
  const equipment = voice.currentEquipment
    ?? resolveRadioEquipment({ role: "pilot", signalQuality: 1 });
  const key = equipment.transceiver.key;
  const source = context.createBufferSource();
  const gain = context.createGain();
  const seconds = key.minimumS + key.variationS * hash01(sequence, 1);
  const level = key.level
    * (0.85 + 0.30 * hash01(sequence, 2))
    * (1 + 0.30 * (1 - equipment.signalQuality));
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
  const equipment = voice.currentEquipment
    ?? resolveRadioEquipment({ role: "pilot", signalQuality: 1 });
  const unkey = equipment.transceiver.unkey;
  const source = context.createBufferSource();
  const gain = context.createGain();
  const seconds = unkey.minimumS + unkey.variationS * hash01(sequence, 3);
  const level = unkey.level
    * (0.85 + 0.30 * hash01(sequence, 4))
    * (1 + 0.35 * (1 - equipment.signalQuality));
  source.buffer = noiseBuffer(context, seconds);
  gain.gain.setValueAtTime(level, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds + 0.01);
  source.connect(gain).connect(voice.highpass);
  source.start(context.currentTime);
  source.stop?.(context.currentTime + seconds + 0.015);
  voice.unkeyCount += 1;
}

function startCarrier(voice, context) {
  stopCarrier(voice);
  const equipment = voice.currentEquipment
    ?? resolveRadioEquipment({ role: "pilot", signalQuality: 1 });
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = carrierNoiseBuffer(context);
  source.loop = true;
  gain.gain.value = equipment.carrierNoise;
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

function equipmentFor(state, clip = null) {
  const role = radioValue(state, "voice") ?? clip?.role;
  return resolveRadioEquipment({
    role,
    talkerProfile: radioValue(state, "talker_profile") ?? clip?.talker_profile,
    transceiverProfile:
      radioValue(state, "transceiver_profile") ?? clip?.transceiver_profile,
    signalQuality: radioValue(state, "signal_quality"),
  });
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
  const transcript = radioValue(state, "text");
  // Clip ids are stable, phraseology is not. A legacy or stale manifest without an exact
  // transcript match must fail silent; scenery audio is optional, false R/T is not.
  if (typeof clip?.transcript !== "string" || clip.transcript !== transcript) {
    voice.missingClipCount += 1;
    return;
  }
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
    const equipment = configureRadioEquipment(
      voice,
      context,
      equipmentFor(state, clip),
    );
    const priorityMix = radioPriorityMix(state);
    if (voice.propulsionDuck?.gain)
      target(voice.propulsionDuck.gain,
        priorityMix.propulsionMultiplier, context.currentTime, 0.045);
    if (voice.worldDuck?.gain)
      target(voice.worldDuck.gain,
        priorityMix.worldMultiplier, context.currentTime, 0.045);
    playSquelch(voice, context, sequence);
    // Subtle station gain and rate drift keeps repeated takes alive without changing cadence.
    const level = equipment.receiveLevel
      * RADIO_SCENERY_LEVEL
      * (0.944 + 0.112 * hash01(sequence, 6));
    target(voice.output.gain, level, context.currentTime, 0.015);
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = 0.995 + 0.010 * hash01(sequence, 7);
    source.connect(voice.micHighpass);
    source.onended = () => {
      if (voice.source !== source) return;
      voice.source = null;
      stopCarrier(voice);
      restoreMix(voice, context);
      if (voice.enabled && generation === voice.generation)
        playUnkey(voice, context, sequence);
    };
    startCarrier(voice, context);
    source.start(context.currentTime);
    voice.source = source;
  } catch {
    voice.missingClipCount += 1;
  }
}

function restoreMix(voice, context) {
  if (voice.propulsionDuck?.gain)
    target(voice.propulsionDuck.gain,
      PROPULSION_NORMAL_MULTIPLIER, context.currentTime, 0.11);
  if (voice.worldDuck?.gain)
    target(voice.worldDuck.gain,
      PROPULSION_NORMAL_MULTIPLIER, context.currentTime, 0.11);
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
      restoreMix(voice, context);
    }
    return;
  }

  voice.enabled = true;
  if (sequence <= 0 || sequence === voice.lastSequence) return;

  const preempted = voice.source != null;
  voice.lastSequence = sequence;
  voice.generation += 1;
  const generation = voice.generation;
  stopSource(voice, context, { unkey: preempted });
  restoreMix(voice, context);
  configureRadioEquipment(voice, context, equipmentFor(state));
  void playTransmission(voice, context, state, generation, sequence);
}
