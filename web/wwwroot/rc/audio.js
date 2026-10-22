// Area 51½ sound kit. Real CC0/CC-BY RC recordings (assets/audio/SOURCES.md) where present,
// with original WebAudio synthesis as the fallback for anything missing.
// ?audioQa=silent runs the whole graph with the master gain clamped to zero (house QA rule).
export class SoundKit {
  constructor() { this.ctx = null; this.silent = new URLSearchParams(location.search).get('audioQa') === 'silent'; }

  start() {
    try {
      if (!this.ctx) this.build();
      this.ctx.resume();
    } catch { /* audio is optional */ }
  }

  build() {
    const C = window.AudioContext || window.webkitAudioContext, ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.silent ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor(); this.master.connect(comp).connect(ctx.destination);
    // White noise, shared by squeal, impacts and splashes.
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // Electric motor: two detuned saws for body plus a sine whine an octave and a half up, all
    // through a lowpass that opens with speed. Throttle adds bite.
    this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0;
    this.motorFilter = ctx.createBiquadFilter(); this.motorFilter.type = 'lowpass'; this.motorFilter.Q.value = 3;
    this.motorFilter.connect(this.motorGain).connect(this.master);
    this.oscs = [['sawtooth', 1, 0.5], ['sawtooth', 1.007, 0.5], ['sine', 2.98, 0.6]].map(([type, ratio, level]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; g.gain.value = level;
      o.connect(g).connect(this.motorFilter); o.start(); return { o, ratio };
    });
    // Tyre squeal: band-passed noise, gated by how hard the tyres are sliding.
    this.squeal = this.loopNoise('bandpass', 2300, 6); this.squealGain = this.squeal.gain;
    this.samples = {}; this.loadSamples();
  }

  // Recorded clips replace the synthesized motor/squeal/bumps once decoded.
  async loadSamples() {
    const ext = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
    await Promise.all(['motor_loop', 'motor_high_loop', 'squeal_loop', 'gravel_loop', 'bump', 'landing', 'servo'].map(async name => {
      try {
        const res = await fetch(`./assets/audio/${name}.${ext}`); if (!res.ok) return;
        this.samples[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch { /* keep the synthesized fallback */ }
    }));
    const loop = (name, level = 0) => {
      const b = this.samples[name]; if (!b) return null;
      const src = this.ctx.createBufferSource(), gain = this.ctx.createGain(); src.buffer = b; src.loop = true; gain.gain.value = level;
      src.connect(gain).connect(this.master); src.start(); return { src, gain };
    };
    this.motorLow = loop('motor_loop'); this.motorHigh = loop('motor_high_loop'); this.squealRec = loop('squeal_loop'); this.gravel = loop('gravel_loop');
    if (this.motorLow) this.motorGain.gain.value = 0;   // the recording takes over from the synth
  }
  playSample(name, level, rate = 1) {
    const b = this.samples?.[name]; if (!b) return false;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(); src.buffer = b; src.playbackRate.value = rate * (0.92 + Math.random() * 0.16);
    g.gain.value = level; src.connect(g).connect(this.master); src.start(); return true;
  }

  loopNoise(type, freq, q) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noiseBuf; src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; gain.gain.value = 0;
    src.connect(f).connect(gain).connect(this.master); src.start(); return { src, f, gain };
  }

  // Per frame: speed (m/s), throttle (−1..1), slip (0..1 share of wheels sliding), paused.
  update({ speed, throttle, slip, paused, surface }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, live = !paused;
    if (this.motorLow) {
      // Recorded motor: pitch follows speed, throttle adds load; a high-speed recording fades in above ~8 m/s.
      const rate = 0.55 + speed / 11 + Math.abs(throttle) * 0.12, hi = this.motorHigh ? Math.min(1, Math.max(0, (speed - 6) / 5)) : 0;
      const level = live ? 0.25 + Math.abs(throttle) * 0.35 + speed * 0.02 : 0;
      this.motorLow.src.playbackRate.setTargetAtTime(rate, t, 0.05); this.motorLow.gain.gain.setTargetAtTime(level * (1 - hi), t, 0.06);
      if (this.motorHigh) { this.motorHigh.src.playbackRate.setTargetAtTime(rate * 0.8, t, 0.05); this.motorHigh.gain.gain.setTargetAtTime(level * hi, t, 0.06); }
      if (this.squealRec) { this.squealRec.gain.gain.setTargetAtTime(live && speed > 2.5 ? slip * 0.5 : 0, t, 0.04); this.squealGain.gain.setTargetAtTime(0, t, 0.04); }
      if (this.gravel) this.gravel.gain.gain.setTargetAtTime(live && ['gravel', 'dirt', 'grass'].includes(surface) ? Math.min(0.5, speed * 0.05) : 0, t, 0.08);
      if (this.squealRec) return;
    }
    const rpm = 70 + speed * 34 + Math.abs(throttle) * 25;
    for (const { o, ratio } of this.oscs) o.frequency.setTargetAtTime(rpm * ratio, t, 0.05);
    this.motorFilter.frequency.setTargetAtTime(500 + speed * 160 + Math.abs(throttle) * 900, t, 0.06);
    this.motorGain.gain.setTargetAtTime(live && !this.motorLow ? 0.035 + Math.abs(throttle) * 0.05 + speed * 0.003 : 0, t, 0.06);
    this.squealGain.gain.setTargetAtTime(live && speed > 2.5 ? slip * 0.06 : 0, t, 0.04);
  }

  // One-shots.
  burst({ type = 'lowpass', freq = 400, dur = 0.15, level = 0.4, sweep = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  tone(freq, start, dur, { type = 'sine', level = 0.25, glide = null } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  impact(strength) { const s = Math.min(1, strength / 6); if (this.playSample('bump', 0.3 + s * 0.6)) return; this.burst({ freq: 300, dur: 0.12 + s * 0.1, level: 0.15 + s * 0.45 }); this.tone(90, 0, 0.15, { level: 0.2 * s, glide: 45 }); }
  landing(strength) { const s = Math.min(1, strength / 4); if (this.playSample('landing', 0.3 + s * 0.6)) return; this.tone(70, 0, 0.18, { level: 0.25 * s, glide: 40 }); this.burst({ freq: 180, dur: 0.1, level: 0.2 * s }); }
  gate() { this.tone(880, 0, 0.12, { type: 'triangle', level: 0.18 }); this.tone(1318, 0.07, 0.18, { type: 'triangle', level: 0.18 }); }
  finish() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i * 0.1, 0.25, { type: 'triangle', level: 0.2 })); }
  pickup() { [660, 880, 1175].forEach((f, i) => this.tone(f, i * 0.05, 0.12, { type: 'square', level: 0.06 })); }
  coin() { this.tone(1568, 0, 0.08, { type: 'square', level: 0.07 }); this.tone(2093, 0.07, 0.25, { type: 'square', level: 0.07 }); }
  fire() { this.burst({ type: 'bandpass', freq: 1200, sweep: 300, dur: 0.18, level: 0.25 }); }
  splash() { this.burst({ type: 'highpass', freq: 1500, sweep: 600, dur: 0.35, level: 0.35 }); }
  boost() { this.burst({ type: 'bandpass', freq: 400, sweep: 2400, dur: 0.6, level: 0.3 }); }
  radio() { this.burst({ type: 'bandpass', freq: 1800, dur: 0.08, level: 0.2 }); [740, 988].forEach((f, i) => this.tone(f, 0.05 + i * 0.09, 0.08, { type: 'square', level: 0.06 })); this.burst({ type: 'bandpass', freq: 1800, dur: 0.1, level: 0.15 }); }
  beep(go = false) { this.tone(go ? 880 : 440, 0, go ? 0.45 : 0.2, { type: 'square', level: 0.08 }); }
  // Retreat: a short bugle figure (original, on the bugle's natural notes).
  bugle() { [[392, 0.35], [523, 0.35], [659, 0.5], [523, 0.3], [784, 0.9]].reduce((at, [f, d]) => (this.tone(f, at, d, { type: 'triangle', level: 0.12 }), at + d * 0.9), 0); }
}
