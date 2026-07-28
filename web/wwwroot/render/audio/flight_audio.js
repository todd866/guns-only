// Presentation audio façade: one AudioContext, one master, one compressor bus.
// Engine, buffet, airframe cues, gun reports, and GCAS all share mute. Fail-silent — never
// throw into the flight kernel. Prefer this over updateEngineAudio in production.

import {
  attachJetSampleBeds,
  createEngineVoices,
  loadJetSampleBeds,
  replaceJetSampleBeds,
  updateEngineVoices,
} from "./engine_audio.js";
import { resolvePropulsionCharacter } from "./audio_character.js";
import {
  createContactAcousticVoices,
  createEventVoices,
  fireGunReports,
  updateAirframeCueVoices,
  updateBuffetVoice,
  updateCatapultVoice,
  updateCombatCueVoices,
  updateConfigurationVoices,
  updateContactAcousticVoices,
  updateRcsVoice,
  updateTrapVoice,
} from "./event_audio.js";
import { createWarningVoices, updateWarningVoices } from "./warning_audio.js";

let context = null;
let master = null;
let bus = null;
let engineVoices = null;
let eventVoices = null;
let contactVoices = null;
let warningVoices = null;
let disabled = false;
let enabled = true;
let sampleLoad = null;
let lastCharacter = null;
let sampleLoadGeneration = 0;
const sampleBedCache = new Map();

function build() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return false;
  context = new Ctor();

  master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 4.5;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.18;
  compressor.connect(master);
  bus = compressor;

  // Keep propulsion behind its authored trim before it reaches the shared compressor. Sample
  // beds otherwise hit the limiter directly and flatten the RPM/power/G distinctions.
  engineVoices = createEngineVoices(context, bus, { includeMaster: true });
  eventVoices = createEventVoices(context, bus);
  contactVoices = createContactAcousticVoices(context, bus);
  warningVoices = createWarningVoices(context, bus);
  return true;
}

function ensureJetSamples(state) {
  const character = resolvePropulsionCharacter(state);
  if (character !== lastCharacter) {
    lastCharacter = character;
    sampleLoadGeneration += 1;
  }
  if (character !== "rapier" && character !== "f22") return;
  if (!context || !engineVoices) return;
  // Beds already attached for this character.
  if (engineVoices.hasSampleBeds
    && engineVoices.sampleBedCharacter === character) return;
  const cached = sampleBedCache.get(character);
  if (cached) {
    replaceJetSampleBeds(engineVoices, context, cached, { character });
    return;
  }
  if (sampleLoad?.character === character) return;

  const generation = sampleLoadGeneration;
  const promise = loadJetSampleBeds(context, { character });
  sampleLoad = { character, promise };
  promise
    .then((beds) => {
      if (beds?.mil) sampleBedCache.set(character, beds);
      if (generation !== sampleLoadGeneration || lastCharacter !== character) return;
      if (engineVoices.hasSampleBeds) {
        replaceJetSampleBeds(engineVoices, context, beds, { character });
      } else {
        attachJetSampleBeds(engineVoices, context, beds, { character });
      }
    })
    .catch(() => {})
    .finally(() => {
      if (sampleLoad?.promise === promise) sampleLoad = null;
    });
}

/// User-gesture unlock. Safe to call repeatedly; no-ops when audio is disabled or unsupported.
export function armFlightAudio(state = null) {
  if (disabled || !enabled) return false;
  try {
    if (!context && !build()) {
      disabled = true;
      return false;
    }
    if (context.state === "suspended") {
      context.resume()?.catch?.(() => {});
    }
    ensureJetSamples(state);
    return true;
  } catch {
    disabled = true;
    return false;
  }
}

export function setFlightAudioEnabled(nextEnabled) {
  enabled = Boolean(nextEnabled);
  if (!master || !context) return enabled;
  try {
    master.gain.setTargetAtTime(enabled ? 0.55 : 0, context.currentTime, 0.02);
  } catch {
    disabled = true;
  }
  return enabled;
}

export function isFlightAudioEnabled() {
  return enabled;
}

/// Drive every continuous voice from the flat snapshot. `triggerHeld` gates gun reports.
export function updateFlightAudio(state, {
  muted = false,
  triggerHeld = false,
  nowSeconds = 0,
} = {}) {
  if (disabled) return;
  try {
    if (!context && !build()) {
      disabled = true;
      return;
    }
    if (context.state === "suspended") {
      context.resume()?.catch?.(() => {});
      return;
    }

    ensureJetSamples(state);

    const live = enabled && !muted;
    // Collapse continuous gains on mute/pause (view loop still ticks while paused).
    updateEngineVoices(engineVoices, context, state, { muted: !live });
    updateBuffetVoice(eventVoices, context, state, { enabled: live });
    updateAirframeCueVoices(eventVoices, context, state, { enabled: live });
    updateConfigurationVoices(eventVoices, context, state, { enabled: live });
    updateContactAcousticVoices(contactVoices, context, state, { enabled: live });
    updateCatapultVoice(eventVoices, context, state, { enabled: live });
    updateRcsVoice(eventVoices, context, state, { enabled: live });
    updateTrapVoice(eventVoices, context, state, { enabled: live });
    updateCombatCueVoices(eventVoices, context, state, { enabled: live });
    fireGunReports(eventVoices, context, state, { enabled: live, triggerHeld });
    updateWarningVoices(warningVoices, context, state, {
      enabled: live,
      nowSeconds,
    });
    master.gain.setTargetAtTime(live ? 0.55 : 0, context.currentTime, live ? 0.18 : 0.02);
  } catch {
    disabled = true;
  }
}
