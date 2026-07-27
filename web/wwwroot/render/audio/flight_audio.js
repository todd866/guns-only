// Presentation audio façade: one AudioContext, one master, one compressor bus.
// Engine, buffet, gun reports, and GCAS all share mute. Fail-silent — never throw into the
// flight kernel. Prefer this over updateEngineAudio in production.

import { createEngineVoices, updateEngineVoices } from "./engine_audio.js";
import {
  createEventVoices,
  fireGunReports,
  updateBuffetVoice,
} from "./event_audio.js";
import { createWarningVoices, updateWarningVoices } from "./warning_audio.js";

let context = null;
let master = null;
let bus = null;
let engineVoices = null;
let eventVoices = null;
let warningVoices = null;
let disabled = false;
let enabled = true;

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

  engineVoices = createEngineVoices(context, bus, { includeMaster: false });
  eventVoices = createEventVoices(context, bus);
  warningVoices = createWarningVoices(context, bus);
  return true;
}

/// User-gesture unlock. Safe to call repeatedly; no-ops when audio is disabled or unsupported.
export function armFlightAudio() {
  if (disabled || !enabled) return false;
  try {
    if (!context && !build()) {
      disabled = true;
      return false;
    }
    if (context.state === "suspended") {
      context.resume()?.catch?.(() => {});
    }
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

    const live = enabled && !muted;
    updateEngineVoices(engineVoices, context, state, { muted: false });
    updateBuffetVoice(eventVoices, context, state, { enabled: live });
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
