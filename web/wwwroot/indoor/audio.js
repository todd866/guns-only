function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function indoorAudioQaSilent(locationLike = globalThis.location) {
  try {
    return new URLSearchParams(locationLike?.search ?? "").get("audioQa") === "silent";
  } catch {
    return false;
  }
}

export function loadIndoorPreferences(storage = globalThis.localStorage) {
  let source = {};
  try {
    source = JSON.parse(storage?.getItem?.("guns-only.player-settings.v1") || "{}");
  } catch {
    source = {};
  }
  return Object.freeze({
    audio: source.audio !== false,
    highContrast: source.highContrast === true,
    reducedMotion: source.reducedMotion === true
      || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true,
    largeText: source.largeText === true,
    sensitivity: Math.max(0.45, Math.min(1.8, finite(source.indoorSensitivity, 1))),
    invertLook: source.indoorInvertLook === true,
  });
}

function noiseBuffer(context, seconds = 1) {
  const length = Math.max(1, Math.round(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    // A deterministic low-passed noise bed is easier on headphones than Math.random white noise.
    const impulse = ((index * 16807) % 2147483647) / 1073741823.5 - 1;
    value = value * 0.84 + impulse * 0.16;
    channel[index] = value;
  }
  return buffer;
}

export class IndoorAudio {
  constructor(enabled = true, { silentQa = indoorAudioQaSilent() } = {}) {
    this.enabled = enabled;
    this.silentQa = silentQa === true;
    this.context = null;
    this.master = null;
    this.motor = null;
    this.motorGain = null;
    this.reelGain = null;
    this.lastAlarmAt = -Infinity;
  }

  async start() {
    if (!this.context) {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      // Silent QA exercises the real oscillator/filter/compressor graph while clamping only the
      // destination gain. That proves browser audio wiring without leaking sound from shared CI
      // or a developer's machine.
      this.master.gain.value = this.enabled && !this.silentQa ? 0.22 : 0;
      this.master.connect(this.context.destination);

      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.16;
      compressor.connect(this.master);
      this.bus = compressor;

      this.motor = this.context.createOscillator();
      this.motor.type = "sawtooth";
      this.motor.frequency.value = 76;
      const motorFilter = this.context.createBiquadFilter();
      motorFilter.type = "lowpass";
      motorFilter.frequency.value = 320;
      motorFilter.Q.value = 1.6;
      this.motorGain = this.context.createGain();
      this.motorGain.gain.value = 0.055;
      this.motor.connect(motorFilter).connect(this.motorGain).connect(this.bus);
      this.motor.start();

      const reel = this.context.createBufferSource();
      reel.buffer = noiseBuffer(this.context, 1.2);
      reel.loop = true;
      const reelFilter = this.context.createBiquadFilter();
      reelFilter.type = "bandpass";
      reelFilter.frequency.value = 1850;
      reelFilter.Q.value = 2.2;
      this.reelGain = this.context.createGain();
      this.reelGain.gain.value = 0;
      reel.connect(reelFilter).connect(this.reelGain).connect(this.bus);
      reel.start();
      this.reel = reel;
    }
    if (this.context.state === "suspended") await this.context.resume();
    return true;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(
      enabled && !this.silentQa ? 0.22 : 0,
      this.context.currentTime,
      0.025,
    );
  }

  diagnostics() {
    return Object.freeze({
      enabled: this.enabled,
      silentQa: this.silentQa,
      contextState: this.context?.state ?? "uninitialized",
      masterGain: Number(this.master?.gain?.value ?? 0),
    });
  }

  tone(frequency, duration = 0.08, gain = 0.12, type = "sine", offset = 0) {
    if (!this.context || !this.bus || !this.enabled) return;
    const at = this.context.currentTime + offset;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope).connect(this.bus);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.015);
  }

  burst(duration = 0.055, gain = 0.08, frequency = 1100) {
    if (!this.context || !this.bus || !this.enabled) return;
    const source = this.context.createBufferSource();
    source.buffer = noiseBuffer(this.context, duration + 0.02);
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.75;
    const envelope = this.context.createGain();
    const at = this.context.currentTime;
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(envelope).connect(this.bus);
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  shot(hostile = false) {
    if (hostile) {
      this.tone(156, 0.075, 0.085, "square");
      this.burst(0.055, 0.04, 620);
    } else {
      this.tone(92, 0.045, 0.13, "square");
      this.burst(0.04, 0.095, 1550);
    }
  }

  impact() {
    this.burst(0.09, 0.12, 820);
    this.tone(64, 0.11, 0.065, "triangle");
  }

  snag() {
    this.tone(470, 0.09, 0.05, "square");
    this.tone(560, 0.08, 0.045, "square", 0.08);
  }

  handoff() {
    this.tone(720, 0.1, 0.085, "sine");
    this.tone(980, 0.13, 0.095, "sine", 0.16);
  }

  objective() {
    this.tone(410, 0.13, 0.08, "triangle");
    this.tone(610, 0.18, 0.09, "triangle", 0.1);
  }

  success() {
    this.tone(330, 0.16, 0.08, "triangle");
    this.tone(495, 0.18, 0.08, "triangle", 0.14);
    this.tone(660, 0.25, 0.09, "triangle", 0.3);
  }

  failure() {
    this.tone(220, 0.18, 0.09, "sawtooth");
    this.tone(146, 0.34, 0.1, "sawtooth", 0.17);
  }

  update(snapshot, input = {}) {
    if (!this.context || !this.motorGain || !this.reelGain) return;
    const now = this.context.currentTime;
    const velocity = snapshot.drone.velocity;
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const controlLoad = Math.min(
      1,
      Math.hypot(input.forward || 0, input.right || 0, input.up || 0),
    );
    this.motor.frequency.setTargetAtTime(74 + speed * 12 + controlLoad * 28, now, 0.035);
    this.motorGain.gain.setTargetAtTime(
      this.enabled ? 0.036 + controlLoad * 0.038 : 0,
      now,
      0.04,
    );
    const fiberActive = snapshot.link.mode === "fiber";
    this.reelGain.gain.setTargetAtTime(
      this.enabled && fiberActive ? 0.004 + speed * 0.0045 : 0,
      now,
      0.04,
    );

    if (snapshot.link.mode === "rf"
      && snapshot.link.rf.survivalTimer < 10
      && now - this.lastAlarmAt >= 1.15) {
      this.lastAlarmAt = now;
      this.tone(snapshot.link.rf.survivalTimer < 5 ? 690 : 520, 0.11, 0.065, "square");
    }
  }

  dispose() {
    try {
      this.motor?.stop?.();
      this.reel?.stop?.();
      this.context?.close?.();
    } catch {
      // Closing a suspended or already-closed context is harmless.
    }
    this.context = null;
  }
}
