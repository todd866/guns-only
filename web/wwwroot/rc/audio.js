// Area 51½ sound kit. Real CC0/CC-BY RC recordings (assets/audio/SOURCES.md) where present,
// with original WebAudio synthesis as the fallback for anything missing.
// ?audioQa=silent runs the whole graph with the master gain clamped to zero (house QA rule).
export class SoundKit {
  constructor() {
    this.ctx = null;
    this.silent = new URLSearchParams(location.search).get('audioQa') === 'silent';
  }

  start() {
    try {
      if (!this.ctx) this.build();
      this.ctx.resume();
    } catch {
      /* audio is optional */
    }
  }

  build() {
    const C = window.AudioContext || window.webkitAudioContext,
      ctx = (this.ctx = new C());
    this.master = ctx.createGain();
    this.master.gain.value = this.silent || this.muted ? 0 : 0.45;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    // White noise, shared by squeal, impacts and splashes.
    const len = ctx.sampleRate * 2,
      buf = ctx.createBuffer(1, len, ctx.sampleRate),
      d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // A small room for the UI sounds (owner, 31 Oct: the sounds were "way too primitive and
    // annoying"): a generated 1.1 s decaying impulse, so chimes ring instead of clicking dry.
    const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.1), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3.2);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.fx = ctx.createGain();
    this.fx.gain.value = 0.22;
    this.fx.connect(this.verb).connect(this.master);

    // Electric motor: two detuned saws for body plus a sine whine an octave and a half up, all
    // through a lowpass that opens with speed. Throttle adds bite.
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    this.motorFilter = ctx.createBiquadFilter();
    this.motorFilter.type = 'lowpass';
    this.motorFilter.Q.value = 3;
    this.motorFilter.connect(this.motorGain).connect(this.master);
    this.oscs = [
      ['sawtooth', 1, 0.5],
      ['sawtooth', 1.007, 0.5],
      ['sine', 2.98, 0.6]
    ].map(([type, ratio, level]) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = type;
      g.gain.value = level;
      o.connect(g).connect(this.motorFilter);
      o.start();
      return {o, ratio};
    });
    // Tyre squeal: band-passed noise, gated by how hard the tyres are sliding.
    this.squeal = this.loopNoise('bandpass', 2300, 6);
    this.squealGain = this.squeal.gain;
    this.samples = {};
    this.loadSamples();
  }

  // Recorded clips replace the synthesized motor/squeal/bumps once decoded.
  async loadSamples() {
    const ext = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
    await Promise.all(
      [
        'motor_loop',
        'motor_high_loop',
        'squeal_loop',
        'gravel_loop',
        'bump',
        'landing',
        'servo',
        // The dark world's creatures (SOURCES.md): footfalls, calls, wingbeats.
        'dino_step',
        'dino_roar',
        'dino_chirp',
        'dino_snort',
        'wing_flap'
      ].map(async name => {
        try {
          const res = await fetch(`./assets/audio/${name}.${ext}`);
          if (!res.ok) return;
          this.samples[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          /* keep the synthesized fallback */
        }
      })
    );
    const loop = (name, level = 0) => {
      const b = this.samples[name];
      if (!b) return null;
      const src = this.ctx.createBufferSource(),
        gain = this.ctx.createGain();
      src.buffer = b;
      src.loop = true;
      gain.gain.value = level;
      src.connect(gain).connect(this.master);
      src.start();
      return {src, gain};
    };
    this.motorLow = loop('motor_loop');
    this.motorHigh = loop('motor_high_loop');
    this.squealRec = loop('squeal_loop');
    this.gravel = loop('gravel_loop');
    if (this.motorLow) this.motorGain.gain.value = 0; // the recording takes over from the synth
  }
  // A creature in the dark world. kind: rex, raptor, longneck, triceratops, quetzal. what: step
  // (a footfall; strength 0..1 with speed), call (its voice: the T. rex roars, the raptor chirps,
  // the long-neck's roar is low and slow, the triceratops snorts, the quetzalcoatlus cries), snort
  // (an idle breath), flap (a wingbeat). Toy-sized: the recordings are pitched up a little.
  creature(kind = 'rex', what = 'step', strength = 1) {
    if (!this.ctx) return;
    (this.heard ??= {})[`${kind}:${what}`] = (this.heard[`${kind}:${what}`] ?? 0) + 1; // QA: what played
    const deep = {rex: 1, raptor: 1.25, longneck: 0.72, triceratops: 0.85, quetzal: 1.1}[kind] ?? 1;
    if (what === 'step') {
      if (!this.ready('dino-step', 0.08)) return;
      this.playSample('dino_step', 0.18 + strength * 0.32, 1.15 * deep) || this.impact(1 + strength * 2);
    } else if (what === 'flap') {
      if (!this.ready('wing', 0.25)) return;
      this.playSample('wing_flap', 0.22 + strength * 0.25, 1.05) ||
        this.burst({freq: 300, dur: 0.18, level: 0.15});
    } else if (what === 'snort') {
      if (!this.ready('snort', 1.5)) return;
      this.playSample('dino_snort', 0.22, 1.1 * deep);
    } else {
      if (!this.ready('call', 1.2)) return;
      const voice =
        kind === 'raptor' || kind === 'quetzal'
          ? 'dino_chirp'
          : kind === 'triceratops'
            ? 'dino_snort'
            : 'dino_roar';
      this.playSample(voice, voice === 'dino_roar' ? 0.32 : 0.3, (voice === 'dino_roar' ? 1.25 : 1) * deep);
    }
  }
  playSample(name, level, rate = 1) {
    const b = this.samples?.[name];
    if (!b) return false;
    const src = this.ctx.createBufferSource(),
      g = this.ctx.createGain();
    src.buffer = b;
    src.playbackRate.value = rate * (0.92 + Math.random() * 0.16);
    g.gain.value = level;
    src.connect(g).connect(this.master);
    src.start();
    return true;
  }

  loopNoise(type, freq, q) {
    const ctx = this.ctx,
      src = ctx.createBufferSource(),
      f = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    src.buffer = this.noiseBuf;
    src.loop = true;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    gain.gain.value = 0;
    src.connect(f).connect(gain).connect(this.master);
    src.start();
    return {src, f, gain};
  }

  // Per frame: speed (m/s), throttle (−1..1), slip (0..1 share of wheels sliding), paused.
  setMuted(m) {
    this.muted = m;
    if (this.master)
      this.master.gain.setTargetAtTime(this.silent || m ? 0 : 0.45, this.ctx.currentTime, 0.05);
  }

  // body: what you're in. 'car' and 'board' roll on wheels; a dinosaur ('dino'), the flier and the
  // robot never play the motor, tyres or gravel: their sounds are footfalls and calls (creature()).
  update({speed, throttle, slip, paused, surface, body = 'car'}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime,
      wheels = body === 'car' || body === 'board',
      live = !paused && wheels;
    // Slow random pitch drift so the short motor loop never repeats exactly.
    this.drift = Math.max(-0.05, Math.min(0.05, (this.drift || 0) + (Math.random() - 0.5) * 0.004));
    if (this.motorLow) {
      // Recorded motor: pitch follows speed, throttle adds load; a high-speed recording fades in above ~8 m/s.
      const rate = (0.55 + speed / 11 + Math.abs(throttle) * 0.12) * (1 + this.drift),
        hi = this.motorHigh ? Math.min(1, Math.max(0, (speed - 6) / 5)) : 0;
      // Quieter overall, near-silent when parked.
      const level = live
        ? speed < 0.3 && !throttle
          ? 0.02
          : 0.08 + Math.abs(throttle) * 0.16 + speed * 0.01
        : 0;
      this.motorLow.src.playbackRate.setTargetAtTime(rate, t, 0.05);
      this.motorLow.gain.gain.setTargetAtTime(level * (1 - hi), t, 0.06);
      if (this.motorHigh) {
        this.motorHigh.src.playbackRate.setTargetAtTime(rate * 0.8, t, 0.05);
        this.motorHigh.gain.gain.setTargetAtTime(level * hi, t, 0.06);
      }
      if (this.squealRec) {
        this.squealRec.gain.gain.setTargetAtTime(live && speed > 2.5 ? slip * 0.5 : 0, t, 0.04);
        this.squealGain.gain.setTargetAtTime(0, t, 0.04);
      }
      if (this.gravel)
        this.gravel.gain.gain.setTargetAtTime(
          live && ['gravel', 'dirt', 'grass'].includes(surface) ? Math.min(0.5, speed * 0.05) : 0,
          t,
          0.08
        );
      if (this.squealRec) return;
    }
    const rpm = 70 + speed * 34 + Math.abs(throttle) * 25;
    for (const {o, ratio} of this.oscs) o.frequency.setTargetAtTime(rpm * ratio, t, 0.05);
    this.motorFilter.frequency.setTargetAtTime(500 + speed * 160 + Math.abs(throttle) * 900, t, 0.06);
    this.motorGain.gain.setTargetAtTime(
      live && !this.motorLow ? 0.035 + Math.abs(throttle) * 0.05 + speed * 0.003 : 0,
      t,
      0.06
    );
    this.squealGain.gain.setTargetAtTime(live && speed > 2.5 ? slip * 0.06 : 0, t, 0.04);
  }

  // Grinding a rail or curb: a metallic scrape that rises with speed, while the board is on it.
  grinding(on, speed = 0) {
    if (!this.ctx || !this.noiseBuf) return;
    this.grindLoop ??= this.loopNoise('bandpass', 2400, 4);
    const t = this.ctx.currentTime;
    this.grindLoop.f.frequency.setTargetAtTime(1700 + speed * 160, t, 0.05);
    this.grindLoop.gain.gain.setTargetAtTime(
      on ? Math.min(0.32, 0.12 + speed * 0.025) : 0,
      t,
      on ? 0.02 : 0.06
    );
  }

  // One-shots.
  burst({type = 'lowpass', freq = 400, dur = 0.15, level = 0.4, sweep = null, q = 1, attack = 0, wet = 0}) {
    if (!this.ctx) return;
    const ctx = this.ctx,
      t = ctx.currentTime,
      src = ctx.createBufferSource(),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    src.buffer = this.noiseBuf;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    g.gain.setValueAtTime(attack ? 0.0001 : level, t);
    if (attack) g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    if (wet) g.connect(this.fx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
  tone(
    freq,
    start,
    dur,
    {type = 'sine', level = 0.25, glide = null, attack = 0.01, wet = 0, vibrato = 0, cutoff = null} = {}
  ) {
    if (!this.ctx) return;
    const ctx = this.ctx,
      t = ctx.currentTime + start,
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = freq * vibrato;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      o.connect(f);
      out = f;
    }
    out.connect(g).connect(this.master);
    if (wet) g.connect(this.fx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  // A struck bar (marimba / glockenspiel): a sine with a quieter inharmonic partial, quick decay,
  // a touch of room. Gentler than the old square-wave chirps.
  bell(freq, at = 0, dur = 0.45, level = 0.14) {
    this.tone(freq, at, dur, {level, attack: 0.004, wet: 0.6});
    this.tone(freq * 3.93, at, dur * 0.35, {level: level * 0.28, attack: 0.002, wet: 0.6});
  }
  // Each one-shot has a cooldown so a burst of events (a row of pumpkins, a stack of callouts)
  // can't machine-gun the same sound, and a little pitch spread so repeats don't sound identical.
  ready(name, gap) {
    const now = this.ctx?.currentTime ?? 0;
    this.last ??= {};
    if (now - (this.last[name] ?? -1e9) < gap) return false;
    this.last[name] = now;
    return true;
  }
  spread(f) {
    return f * (0.97 + Math.random() * 0.06);
  }
  zap() {
    if (!this.ready('zap', 0.1)) return;
    this.burst({type: 'bandpass', freq: 3800, sweep: 700, dur: 0.13, level: 0.12, q: 2, wet: 0.15});
    this.tone(950, 0, 0.1, {type: 'sawtooth', glide: 180, level: 0.045, cutoff: 2400, attack: 0.003});
  }
  impact(strength) {
    if (!this.ready('impact', 0.06)) return;
    const s = Math.min(1, strength / 6);
    if (this.playSample('bump', 0.3 + s * 0.6)) return;
    this.burst({freq: 300, dur: 0.12 + s * 0.1, level: 0.15 + s * 0.45});
    this.tone(90, 0, 0.15, {level: 0.2 * s, glide: 45});
  }
  landing(strength) {
    if (!this.ready('landing', 0.1)) return;
    const s = Math.min(1, strength / 4);
    if (this.playSample('landing', 0.3 + s * 0.6)) return;
    this.tone(70, 0, 0.18, {level: 0.25 * s, glide: 40});
    this.burst({freq: 180, dur: 0.1, level: 0.2 * s});
  }
  gate() {
    if (!this.ready('gate', 0.15)) return;
    this.bell(880, 0, 0.35, 0.12);
    this.bell(1318.5, 0.07, 0.45, 0.12);
  }
  // A little marimba run that lands on the octave.
  finish() {
    if (!this.ready('finish', 0.8)) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.bell(f, i * 0.085, i === 3 ? 0.9 : 0.4, 0.13));
  }
  pickup() {
    if (!this.ready('pickup', 0.1)) return;
    [659.25, 880, 1174.7].forEach((f, i) => this.bell(f, i * 0.045, 0.3, 0.055));
  }
  coin() {
    if (!this.ready('coin', 0.07)) return;
    const f = this.spread(1568);
    this.bell(f, 0, 0.18, 0.08);
    this.bell(f * 1.335, 0.06, 0.4, 0.08);
  }
  fire() {
    if (!this.ready('fire', 0.08)) return;
    this.burst({type: 'bandpass', freq: 900, sweep: 260, dur: 0.2, level: 0.18, q: 1.5});
    this.tone(220, 0, 0.12, {type: 'triangle', level: 0.08, glide: 110});
  }
  // A flight passing overhead: a long low rumble swelling in, and a tearing edge for fighters.
  jet({heavy = false, ships = 1} = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx,
      t = ctx.currentTime,
      dur = heavy ? 7 : 4.2,
      peak = Math.min(0.5, 0.2 + ships * 0.06);
    for (const [type, from, to, share] of heavy
      ? [['lowpass', 140, 220, 1]]
      : [
          ['lowpass', 260, 420, 1],
          ['bandpass', 1400, 2600, 0.45]
        ]) {
      const src = ctx.createBufferSource(),
        f = ctx.createBiquadFilter(),
        g = ctx.createGain();
      src.buffer = this.noiseBuf;
      src.loop = true;
      f.type = type;
      // Doppler-ish: the pitch climbs while it approaches, then drops away after the pass.
      f.frequency.setValueAtTime(from, t);
      f.frequency.linearRampToValueAtTime(to, t + dur * 0.4);
      f.frequency.exponentialRampToValueAtTime(from * 0.5, t + dur);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(peak * share, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t, Math.random());
      src.stop(t + dur + 0.05);
    }
  }
  // Pumpkin splat: a soft thump and a wet squish, a little different every time.
  splat() {
    if (!this.ready('splat', 0.05)) return;
    const p = this.spread(1);
    this.tone(130 * p, 0, 0.14, {level: 0.22, glide: 55, attack: 0.003});
    this.burst({type: 'lowpass', freq: 1400 * p, sweep: 220, dur: 0.26, level: 0.3, q: 2});
    this.burst({type: 'bandpass', freq: 3200 * p, sweep: 900, dur: 0.12, level: 0.08, q: 3});
  }
  splash() {
    if (!this.ready('splash', 0.2)) return;
    this.burst({type: 'lowpass', freq: 2400, sweep: 500, dur: 0.5, level: 0.22, attack: 0.02, wet: 0.4});
    this.burst({type: 'bandpass', freq: 5000, sweep: 1800, dur: 0.25, level: 0.07, q: 2});
  }
  // Boost / whoosh: a soft swell of air rising in pitch, not a hiss.
  boost() {
    if (!this.ready('boost', 0.3)) return;
    this.burst({type: 'bandpass', freq: 280, sweep: 1300, dur: 0.55, level: 0.2, q: 1.2, attack: 0.08});
    this.tone(110, 0, 0.5, {type: 'triangle', level: 0.05, glide: 220, attack: 0.08});
  }
  cloud() {
    if (!this.ready('cloud', 1.5)) return;
    this.burst({type: 'lowpass', freq: 900, sweep: 350, dur: 0.8, level: 0.08, attack: 0.2});
  }
  // A radio call: a soft two-note chime, at most once a second and a half (it marks many callouts).
  radio() {
    if (!this.ready('radio', 1.5)) return;
    this.bell(987.8, 0, 0.3, 0.07);
    this.bell(1318.5, 0.09, 0.45, 0.06);
  }
  // The hero's voice (docs/design/adventure: "The hero beeps; the words are for reading"): he never
  // speaks words, only robot chirps whose shape carries the feeling. Square-wave blips, filtered
  // soft, a little room. mood: happy (rising), sad (falling), wow (a big swoop up), proud (a little
  // arpeggio), ask (up at the end).
  robot(mood = 'happy') {
    if (!this.ready('robot', 0.35)) return;
    const shapes = {
        happy: [
          [620, 880, 0.07],
          [880, 760, 0.06],
          [1050, 1400, 0.09]
        ],
        sad: [
          [700, 520, 0.16],
          [520, 330, 0.24]
        ],
        wow: [
          [480, 1500, 0.22],
          [1500, 1250, 0.08]
        ],
        proud: [
          [523, 523, 0.07],
          [659, 659, 0.07],
          [784, 784, 0.07],
          [1047, 1100, 0.14]
        ],
        ask: [
          [640, 620, 0.08],
          [700, 1050, 0.14]
        ]
      },
      notes = shapes[mood] ?? shapes.happy;
    let at = 0;
    for (const [from, to, dur] of notes) {
      this.tone(from, at, dur, {
        type: 'square',
        level: 0.05,
        glide: to,
        attack: 0.005,
        cutoff: 2200,
        wet: 0.2
      });
      at += dur + 0.035;
    }
  }
  beep(go = false) {
    if (!this.ready(go ? 'go' : 'beep', 0.2)) return;
    this.tone(go ? 880 : 440, 0, go ? 0.5 : 0.22, {type: 'triangle', level: 0.12, cutoff: 2500, wet: 0.3});
  }
  // Retreat and Reveille: a bugle figure on the bugle's natural notes, brassy (a filtered saw with a
  // soft attack and a little vibrato) instead of a chiptune triangle.
  bugle() {
    if (!this.ready('bugle', 4)) return;
    [
      [392, 0.35],
      [523.25, 0.35],
      [659.25, 0.5],
      [523.25, 0.3],
      [783.99, 0.95]
    ].reduce(
      (at, [f, d]) => (
        this.tone(f, at, d, {
          type: 'sawtooth',
          level: 0.07,
          attack: 0.05,
          vibrato: 0.006,
          cutoff: 1800,
          wet: 0.7
        }),
        at + d * 0.9
      ),
      0
    );
  }
}
