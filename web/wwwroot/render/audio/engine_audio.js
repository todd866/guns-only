// Basic engine noise. Deliberately synthesised rather than sampled: no asset pipeline, no licence
// question, a few hundred bytes, and it can track the engine continuously instead of crossfading
// between clips.
//
// Two voices, because a turbojet is two sounds. A tonal component carries compressor whine and
// follows RPM; a filtered-noise component carries core roar and follows throttle. The mix between
// them is what makes the ram handover audible: as the turbine fades out past M1.9 and the ram takes
// over, the whine dies and what is left is broadband rush. That is the single most characteristic
// thing this aircraft does and it should be hearable, not just captioned.
//
// EVERYTHING here is failure-tolerant on purpose. Audio runs at boot, browsers block it until a
// gesture, and codec/context support varies. A thrown exception anywhere disables audio
// permanently and silently rather than taking the flight kernel down with it — a game that boots
// without sound is a minor disappointment; a game that does not boot is not a game.
let context = null;
let voices = null;
let disabled = false;

function build() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return false;
  context = new Ctor();

  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);

  // Compressor whine: a sawtooth an octave-ish above idle, low-passed so it is not piercing.
  const tone = context.createOscillator();
  tone.type = "sawtooth";
  tone.frequency.value = 90;
  const toneFilter = context.createBiquadFilter();
  toneFilter.type = "lowpass";
  toneFilter.frequency.value = 1400;
  const toneGain = context.createGain();
  toneGain.gain.value = 0;
  tone.connect(toneFilter).connect(toneGain).connect(master);

  // Core roar: two seconds of looping white noise through a band-pass that opens with throttle.
  const frames = context.sampleRate * 2;
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const channel = buffer.getChannelData(0);
  // Deterministic noise: a plain LCG rather than Math.random, so the same build sounds the same.
  let seed = 22695477;
  for (let i = 0; i < frames; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    channel[i] = (seed / 0x3fffffff) - 1;
  }
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 400;
  noiseFilter.Q.value = 0.7;
  const noiseGain = context.createGain();
  noiseGain.gain.value = 0;
  noise.connect(noiseFilter).connect(noiseGain).connect(master);

  tone.start();
  noise.start();
  voices = { master, tone, toneFilter, toneGain, noiseFilter, noiseGain };
  return true;
}

/// Drive the engine voices from the snapshot. Safe to call every frame, and safe to call before any
/// user gesture — the context simply stays suspended until the browser allows it.
export function updateEngineAudio(state, { muted = false } = {}) {
  if (disabled) return;
  try {
    if (!context && !build()) { disabled = true; return; }
    if (context.state === "suspended") { context.resume().catch(() => {}); return; }

    const throttle = clamp01(Number(state?.applied_throttle) || 0);
    const rpm = clamp01((Number(state?.engine_rpm_pct) || 0) / 100);
    const mach = Math.max(0, Number(state?.mach) || 0);
    // Ram share: nothing below M1.6, fully ram by M2.7, matching TurboRamjetPerformanceMap's
    // turbine fade. The turbine voice is what disappears across that band.
    const ram = clamp01((mach - 1.6) / (2.7 - 1.6));

    const now = context.currentTime;
    const ramp = (param, value) => param.setTargetAtTime(value, now, 0.08);

    // Whine climbs with RPM and dies as the turbine hands over.
    ramp(voices.tone.frequency, 80 + rpm * 260);
    ramp(voices.toneGain.gain, (0.05 + rpm * 0.16) * (1 - ram));
    ramp(voices.toneFilter.frequency, 900 + rpm * 2600);
    // Roar broadens and brightens with throttle, and keeps going on ram alone.
    ramp(voices.noiseFilter.frequency, 260 + throttle * 900 + ram * 700);
    ramp(voices.noiseGain.gain, 0.06 + throttle * 0.16 + ram * 0.12);
    ramp(voices.master.gain, muted ? 0 : 0.5);
  } catch {
    disabled = true;
  }
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
