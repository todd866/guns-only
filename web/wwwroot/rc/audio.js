// RC Odyssey sound kit. Recordings in assets/audio/ (see SOURCES.md) play when decoded;
// synthesis is only the fallback for a missing file. The only continuous loop allowed is
// the player's own engine (one voice per split-screen seat). No gravel bed, tyre-squeal
// bed, grind bed, motor whine, or hum. ?audioQa=silent keeps the graph and clamps the
// master to zero. Levels, gaps, voice cap and pan live in audio-mix.mjs.
import {
  UI_TRIM,
  COMPRESSOR,
  CALLOUT,
  MIN_GAP,
  PRIORITY,
  VOICE_HOLD,
  busGain,
  masterGain,
  readStep,
  engineMix,
  slew,
  canRetrigger,
  admit,
  jittered,
  soften,
  allowsLoop
} from './audio-mix.mjs';

export class SoundKit {
  constructor() {
    this.ctx = null;
    this.silent = new URLSearchParams(location.search).get('audioQa') === 'silent';
    this.effectsStep = 'normal';
    this.engineStep = 'normal';
    this.engineVoices = [null, null];
    this.voices = [];
    this.samplesReady = false;
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
    this.master.gain.value = masterGain({silent: this.silent, muted: !!this.muted});
    this.engineBus = ctx.createGain();
    this.gameBus = ctx.createGain();
    this.uiBus = ctx.createGain();
    this.engineBus.gain.value = busGain(this.engineStep);
    this.gameBus.gain.value = busGain(this.effectsStep);
    this.uiBus.gain.value = busGain(this.effectsStep) * UI_TRIM;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = COMPRESSOR.threshold;
    comp.knee.value = COMPRESSOR.knee;
    comp.ratio.value = COMPRESSOR.ratio;
    comp.attack.value = COMPRESSOR.attack;
    comp.release.value = COMPRESSOR.release;
    this.engineBus.connect(this.master);
    this.gameBus.connect(this.master);
    this.uiBus.connect(this.master);
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2,
      buf = ctx.createBuffer(1, len, ctx.sampleRate),
      d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3.2);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.fx = ctx.createGain();
    this.fx.gain.value = 0.14;
    // The room sits on the UI bus, so Effects off/low scales the tail with the chime.
    this.fx.connect(this.verb).connect(this.uiBus);
    this.samples = {};
    this.loadSamples();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master)
      this.master.gain.setTargetAtTime(
        masterGain({silent: this.silent, muted: !!m}),
        this.ctx.currentTime,
        0.05
      );
  }

  setMix({effects, engine} = {}) {
    if (effects != null) this.effectsStep = readStep(effects);
    if (engine != null) this.engineStep = readStep(engine);
    this.applyBuses();
  }

  applyBuses() {
    if (!this.gameBus || !this.ctx) return;
    const t = this.ctx.currentTime,
      fx = busGain(this.effectsStep);
    this.gameBus.gain.setTargetAtTime(fx, t, 0.03);
    this.uiBus.gain.setTargetAtTime(fx * UI_TRIM, t, 0.03);
    this.engineBus.gain.setTargetAtTime(busGain(this.engineStep), t, 0.03);
  }

  busNode(which) {
    if (which === 'ui') return this.uiBus || this.master;
    return this.gameBus || this.master;
  }

  // Recorded clips. motor_loop is the engine. squeal_loop is played as a short slice, never looped.
  async loadSamples() {
    const ext = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
    await Promise.all(
      [
        'motor_loop',
        'squeal_loop',
        'bump',
        'landing',
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
    this.samplesReady = true;
  }

  ensureEngine(seat) {
    if (this.engineVoices[seat]) return this.engineVoices[seat];
    if (!this.samplesReady || !this.ctx || !allowsLoop('engine')) return null;
    const ctx = this.ctx,
      gain = ctx.createGain(),
      filter = ctx.createBiquadFilter(),
      pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    gain.gain.value = 0;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.5;
    const rec = this.samples?.motor_loop;
    let src, kind, rate;
    if (rec) {
      src = ctx.createBufferSource();
      src.buffer = rec;
      src.loop = true;
      src.playbackRate.value = 0.7;
      kind = 'rec';
      rate = 0.7;
    } else {
      src = ctx.createOscillator();
      src.type = 'sawtooth';
      src.frequency.value = 90;
      kind = 'synth';
      rate = 90;
    }
    src.connect(filter);
    filter.connect(gain);
    if (pan) {
      gain.connect(pan);
      pan.connect(this.engineBus || this.master);
    } else gain.connect(this.engineBus || this.master);
    src.start();
    const voice = {kind, src, gain, pan, filter, rate, level: 0};
    this.engineVoices[seat] = voice;
    if (seat === 0) this.motorLow = voice;
    return voice;
  }

  releaseEngine(seat) {
    const v = this.engineVoices[seat];
    if (!v) return;
    try {
      v.src.stop();
    } catch {
      /* already stopped */
    }
    try {
      v.src.disconnect();
    } catch {
      /* already disconnected */
    }
    this.engineVoices[seat] = null;
    if (seat === 0 && this.motorLow === v) this.motorLow = null;
  }

  // Per frame. `players` is one entry per split-screen seat; omitted means the single local car.
  update(state = {}) {
    if (!this.ctx) return;
    const players = state.players ?? [
      {
        speed: state.speed ?? 0,
        throttle: state.throttle ?? 0,
        slip: state.slip ?? 0,
        body: state.body ?? 'car',
        seat: 0,
        split: false
      }
    ];
    const mix = engineMix(players, {paused: !!state.paused}),
      live = new Set();
    mix.forEach((m, i) => {
      if (!this.engineVoices[m.seat] && m.level <= 0) return;
      const v = this.ensureEngine(m.seat);
      if (!v) return;
      live.add(m.seat);
      const targetRate = v.kind === 'synth' ? m.hz : m.playback;
      v.rate = slew(v.rate, targetRate, 0.08);
      v.level = slew(v.level, m.level, 0.18);
      if (v.kind === 'synth') v.src.frequency.value = v.rate;
      else v.src.playbackRate.value = v.rate;
      v.gain.gain.value = v.level;
      if (v.filter) v.filter.frequency.value = Math.min(1200, 480 + (players[i]?.speed ?? 0) * 28);
      if (v.pan) v.pan.pan.value = m.pan;
    });
    for (const seat of [0, 1]) {
      if (live.has(seat)) continue;
      const v = this.engineVoices[seat];
      if (!v) continue;
      v.level = slew(v.level, 0, 0.35);
      v.gain.gain.value = v.level;
      if (seat !== 0 && v.level < 0.001) this.releaseEngine(seat);
    }
    const speed = Math.max(
        0,
        ...players.map(p => (p.body === 'car' || p.body === 'board' ? p.speed ?? 0 : 0))
      ),
      slip = Math.max(0, ...players.map(p => p.slip ?? 0));
    if (!state.paused && slip > 0.55 && speed > 3) this.squealOnce();
  }

  squealOnce() {
    if (!this.ready('squeal', MIN_GAP.squeal)) return;
    if (this.playSample('squeal_loop', 0.16, 1, {dur: 0.26})) return;
    this.burst({type: 'bandpass', freq: 1400, dur: 0.12, level: 0.08, q: 0.7});
  }

  // A grind is a one-shot scrape on the way in, not a metallic loop while you hold it.
  grinding(on, speed = 0) {
    const edge = !!on && !this.grindOn;
    this.grindOn = !!on;
    if (!edge || !this.ctx) return;
    if (!this.ready('grind', MIN_GAP.grind)) return;
    if (this.playSample('bump', 0.1 + Math.min(0.08, speed * 0.01), 0.85, {dur: 0.12})) return;
    this.burst({type: 'bandpass', freq: 1200, dur: 0.08, level: 0.07, q: 0.6});
  }

  creature(kind = 'rex', what = 'step', strength = 1) {
    if (!this.ctx) return;
    (this.heard ??= {})[`${kind}:${what}`] = (this.heard[`${kind}:${what}`] ?? 0) + 1;
    const deep = {rex: 1, raptor: 1.25, longneck: 0.72, triceratops: 0.85, quetzal: 1.1, hen: 1.6}[kind] ?? 1;
    if (what === 'step') {
      if (!this.ready('dino-step', MIN_GAP['dino-step'])) return;
      this.playSample('dino_step', 0.16 + strength * 0.22, 1.12 * deep) || this.impact(1 + strength * 2);
    } else if (what === 'flap') {
      if (!this.ready('wing', MIN_GAP.wing)) return;
      this.playSample('wing_flap', 0.16 + strength * 0.18, 1.05) ||
        this.burst({freq: 280, dur: 0.12, level: 0.1});
    } else if (what === 'cluck') {
      if (!this.ready('cluck', MIN_GAP.cluck)) return;
      this.playSample('dino_chirp', 0.12, 1.85);
    } else if (what === 'snort') {
      if (!this.ready('snort', MIN_GAP.snort)) return;
      this.playSample('dino_snort', 0.16, 1.05 * deep);
    } else {
      if (!this.ready('call', MIN_GAP.call)) return;
      const voice =
        kind === 'raptor' || kind === 'quetzal' || kind === 'hen'
          ? 'dino_chirp'
          : kind === 'triceratops'
            ? 'dino_snort'
            : 'dino_roar';
      this.playSample(voice, voice === 'dino_roar' ? 0.26 : 0.22, (voice === 'dino_roar' ? 1.2 : 1) * deep);
    }
  }

  footstep(who = 'robot', strength = 1) {
    if (!this.ctx) return;
    (this.heard ??= {})[`foot:${who}`] = (this.heard[`foot:${who}`] ?? 0) + 1;
    const name = `foot-${who}`;
    if (!this.ready(name, MIN_GAP[name] ?? 0.14)) return;
    const s = Math.max(0, Math.min(1, strength)),
      level = 0.1 + s * 0.2;
    if (who === 'cowboy') {
      if (this.playSample('bump', level, 0.72)) return;
      this.burst({type: 'lowpass', freq: 160, dur: 0.06, level, q: 0.7});
      this.tone(110, 0, 0.05, {level: level * 0.7, glide: 70, attack: 0.002});
    } else {
      if (this.playSample('bump', level * 0.85, 1.35)) return;
      this.tone(880, 0, 0.03, {type: 'triangle', level: level * 0.6, cutoff: 2800, attack: 0.001});
      this.burst({type: 'bandpass', freq: 1800, dur: 0.03, level: level * 0.4, q: 0.8});
    }
  }

  playSample(name, level, rate = 1, {bus = 'game', dur = 0} = {}) {
    const b = this.samples?.[name];
    if (!b || !this.ctx) return false;
    const j = jittered(rate, level),
      src = this.ctx.createBufferSource(),
      g = this.ctx.createGain();
    src.buffer = b;
    src.loop = false;
    src.playbackRate.value = j.rate;
    g.gain.value = j.gain;
    src.connect(g).connect(this.busNode(bus));
    const t = this.ctx.currentTime;
    src.start(t);
    if (dur > 0) src.stop(t + dur + 0.02);
    return true;
  }

  burst({type = 'lowpass', freq = 400, dur = 0.15, level = 0.3, sweep = null, q = 0.7, attack = 0, wet = 0, bus = 'game'} = {}) {
    if (!this.ctx || !this.noiseBuf) return;
    const ctx = this.ctx,
      t = ctx.currentTime,
      src = ctx.createBufferSource(),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain(),
      j = jittered(1, 1);
    dur = Math.min(dur, 0.45);
    level = Math.min(level, 0.32) * j.gain;
    freq = Math.min(freq, type === 'lowpass' ? 2000 : 2600) * j.rate;
    src.buffer = this.noiseBuf;
    src.loop = false;
    f.type = type;
    f.Q.value = Math.min(q, 1.2);
    f.frequency.setValueAtTime(Math.max(40, freq), t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
    g.gain.setValueAtTime(attack ? 0.0001 : level, t);
    if (attack) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.busNode(bus));
    if (wet && this.fx) g.connect(this.fx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  tone(freq, start, dur, opts = {}) {
    if (!this.ctx) return;
    const type = opts.type ?? 'sine',
      soft = soften({type, dur, level: opts.level ?? 0.2, cutoff: opts.cutoff}),
      j = jittered(freq, soft.level),
      ctx = this.ctx,
      t0 = ctx.currentTime + start,
      o = ctx.createOscillator(),
      g = ctx.createGain(),
      attack = opts.attack ?? 0.008;
    dur = Math.max(0.03, soft.dur);
    o.type = type;
    o.frequency.setValueAtTime(Math.max(40, j.rate), t0);
    if (opts.glide) o.frequency.exponentialRampToValueAtTime(Math.max(40, opts.glide), t0 + dur);
    if (opts.vibrato) {
      const lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = j.rate * opts.vibrato;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, j.gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = soft.cutoff;
    f.Q.value = 0.5;
    o.connect(f).connect(g).connect(this.busNode(opts.bus));
    if (opts.wet && this.fx) g.connect(this.fx);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  bell(freq, at = 0, dur = 0.35, level = 0.08, bus = 'ui') {
    this.tone(freq, at, dur, {level, attack: 0.004, wet: 0.35, bus});
    this.tone(freq * 2.76, at, Math.min(0.1, dur * 0.3), {level: level * 0.18, attack: 0.002, wet: 0.35, bus});
  }

  ready(name, gap, dur) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    this.last ??= {};
    if (!canRetrigger({last: this.last[name], now, name, gap})) return false;
    const decision = admit(this.voices, {
      name,
      priority: PRIORITY[name] ?? 30,
      now,
      until: now + (VOICE_HOLD[name] ?? dur ?? 0.4)
    });
    this.voices = decision.active;
    if (!decision.ok) return false;
    this.last[name] = now;
    return true;
  }

  zap() {
    if (!this.ready('zap', MIN_GAP.zap)) return;
    this.burst({type: 'bandpass', freq: 1800, sweep: 500, dur: 0.1, level: 0.1, q: 0.8});
    this.tone(640, 0, 0.08, {type: 'triangle', glide: 180, level: 0.04, cutoff: 1800, attack: 0.003});
  }
  impact(strength) {
    if (!this.ready('impact', MIN_GAP.impact)) return;
    const s = Math.min(1, strength / 6);
    if (this.playSample('bump', 0.2 + s * 0.28)) return;
    this.burst({freq: 240, dur: 0.1 + s * 0.06, level: 0.12 + s * 0.16});
    this.tone(80, 0, 0.1, {level: 0.1 * s, glide: 48});
  }
  landing(strength) {
    if (!this.ready('landing', MIN_GAP.landing)) return;
    const s = Math.min(1, strength / 4);
    if (this.playSample('landing', 0.2 + s * 0.28)) return;
    this.tone(70, 0, 0.12, {level: 0.12 * s, glide: 42});
    this.burst({freq: 160, dur: 0.08, level: 0.12 * s});
  }
  gate() {
    if (!this.ready('gate', MIN_GAP.gate)) return;
    this.bell(880, 0, 0.28, 0.07);
    this.bell(1318.5, 0.06, 0.32, 0.06);
  }
  finish() {
    if (!this.ready('finish', MIN_GAP.finish)) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.bell(f, i * 0.08, i === 3 ? 0.55 : 0.28, 0.07));
  }
  pickup() {
    if (!this.ready('pickup', MIN_GAP.pickup)) return;
    [659.25, 880].forEach((f, i) => this.bell(f, i * 0.05, 0.22, 0.045));
  }
  coin() {
    if (!this.ready('coin', MIN_GAP.coin)) return;
    this.bell(1480, 0, 0.16, 0.05);
    this.bell(1976, 0.05, 0.26, 0.045);
  }
  fire() {
    if (!this.ready('fire', MIN_GAP.fire)) return;
    this.burst({type: 'bandpass', freq: 700, sweep: 240, dur: 0.16, level: 0.14, q: 0.8});
    this.tone(180, 0, 0.08, {type: 'triangle', level: 0.05, glide: 90});
  }
  // A flyover is a short whoosh. Not a looping rumble.
  jet({heavy = false, ships = 1} = {}) {
    if (!this.ready('jet', MIN_GAP.jet)) return;
    this.burst({
      type: 'lowpass',
      freq: heavy ? 300 : 560,
      sweep: heavy ? 140 : 220,
      dur: heavy ? 0.4 : 0.26,
      level: Math.min(0.14, 0.05 + (ships || 1) * 0.02),
      attack: 0.04,
      q: 0.6
    });
  }
  splat() {
    if (!this.ready('splat', MIN_GAP.splat)) return;
    this.tone(120, 0, 0.1, {level: 0.12, glide: 60, attack: 0.003});
    this.burst({type: 'lowpass', freq: 900, sweep: 200, dur: 0.18, level: 0.16, q: 0.7});
  }
  splash() {
    if (!this.ready('splash', MIN_GAP.splash)) return;
    this.burst({type: 'lowpass', freq: 1600, sweep: 400, dur: 0.32, level: 0.14, attack: 0.02, wet: 0.3});
  }
  boost() {
    if (!this.ready('boost', MIN_GAP.boost)) return;
    this.burst({type: 'bandpass', freq: 260, sweep: 900, dur: 0.32, level: 0.12, q: 0.6, attack: 0.06});
  }
  cloud() {
    if (!this.ready('cloud', MIN_GAP.cloud)) return;
    this.burst({type: 'lowpass', freq: 700, sweep: 280, dur: 0.35, level: 0.06, attack: 0.08});
  }
  radio() {
    if (!this.ready('radio', MIN_GAP.radio)) return;
    this.tone(CALLOUT.freq, 0, CALLOUT.dur, {
      level: CALLOUT.level,
      attack: 0.01,
      wet: 0.15,
      bus: 'ui',
      cutoff: 2400
    });
  }
  robot(mood = 'happy') {
    if (!this.ready('robot', MIN_GAP.robot)) return;
    const shapes = {
        happy: [
          [620, 880, 0.06],
          [880, 760, 0.05],
          [1040, 1320, 0.08]
        ],
        sad: [
          [640, 480, 0.12],
          [480, 320, 0.14]
        ],
        wow: [
          [420, 1200, 0.14],
          [1200, 980, 0.06]
        ],
        proud: [
          [523, 523, 0.06],
          [659, 659, 0.06],
          [784, 784, 0.06],
          [1047, 1047, 0.1]
        ],
        ask: [
          [640, 620, 0.07],
          [700, 980, 0.1]
        ]
      },
      notes = shapes[mood] ?? shapes.happy;
    let at = 0;
    for (const [from, to, dur] of notes) {
      this.tone(from, at, dur, {type: 'square', level: 0.035, glide: to, attack: 0.004, cutoff: 1400, wet: 0.15, bus: 'ui'});
      at += dur + 0.03;
    }
  }
  beep(go = false) {
    if (!this.ready(go ? 'go' : 'beep', go ? MIN_GAP.go : MIN_GAP.beep)) return;
    this.tone(go ? 880 : 523.25, 0, go ? 0.28 : 0.12, {type: 'triangle', level: 0.06, cutoff: 2000, wet: 0.2, bus: 'ui'});
  }
  bugle() {
    if (!this.ready('bugle', MIN_GAP.bugle)) return;
    [
      [392, 0.22],
      [523.25, 0.22],
      [659.25, 0.28],
      [523.25, 0.18],
      [783.99, 0.4]
    ].reduce(
      (at, [f, d]) => (
        this.tone(f, at, d, {type: 'triangle', level: 0.05, attack: 0.03, vibrato: 0.004, cutoff: 1600, wet: 0.4, bus: 'ui'}),
        at + d * 0.92
      ),
      0
    );
  }
}
