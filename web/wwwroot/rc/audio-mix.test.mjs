import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTER_GAIN,
  UI_TRIM,
  MAX_VOICES,
  COMPRESSOR,
  CALLOUT,
  MIN_GAP,
  nextStep,
  readStep,
  busGain,
  masterGain,
  engineLevel,
  enginePlayback,
  engineMix,
  slew,
  canRetrigger,
  admit,
  jittered,
  soften,
  allowsLoop
} from './audio-mix.mjs';

test('volume steps cycle off, low, normal and unknown storage reads as normal', () => {
  assert.equal(nextStep('off'), 'low');
  assert.equal(nextStep('low'), 'normal');
  assert.equal(nextStep('normal'), 'off');
  assert.equal(nextStep('nope'), 'low');
  assert.equal(readStep('low'), 'low');
  assert.equal(readStep('off'), 'off');
  assert.equal(readStep(null), 'normal');
  assert.equal(readStep('loud'), 'normal');
  assert.equal(busGain('off'), 0);
  assert.ok(busGain('low') > 0 && busGain('low') < busGain('normal'));
  assert.equal(busGain('normal'), 1);
});

test('master default sits under the old 0.45 and silent or mute clamps it to zero', () => {
  assert.ok(MASTER_GAIN < 0.4 && MASTER_GAIN > 0.15);
  assert.equal(masterGain({silent: true, muted: false}), 0);
  assert.equal(masterGain({silent: false, muted: true}), 0);
  assert.equal(masterGain({silent: false, muted: false}), MASTER_GAIN);
});

test('UI trim is quieter than gameplay and a callout is one short soft chime', () => {
  assert.ok(UI_TRIM < 0.6 && UI_TRIM > 0.2);
  assert.equal(CALLOUT.voices, 1);
  assert.ok(CALLOUT.dur <= 0.28 && CALLOUT.dur >= 0.08);
  assert.ok(CALLOUT.level <= 0.06 && CALLOUT.level > 0);
});

test('limiter only catches peaks and does not pump', () => {
  assert.ok(COMPRESSOR.threshold >= -14 && COMPRESSOR.threshold <= -6);
  assert.ok(COMPRESSOR.ratio >= 2 && COMPRESSOR.ratio <= 4);
  assert.ok(COMPRESSOR.attack >= 0.015);
  assert.ok(COMPRESSOR.release >= 0.3);
  assert.ok(COMPRESSOR.knee >= 6);
});

test('engine ducks to silence when idle, paused, or not on wheels', () => {
  assert.equal(engineLevel({speed: 0, throttle: 0, paused: false, wheels: true}), 0);
  assert.equal(engineLevel({speed: 0.2, throttle: 0, paused: false, wheels: true}), 0);
  assert.equal(engineLevel({speed: 10, throttle: 1, paused: true, wheels: true}), 0);
  assert.equal(engineLevel({speed: 10, throttle: 1, paused: false, wheels: false}), 0);
  const moving = engineLevel({speed: 8, throttle: 0.6, paused: false, wheels: true});
  assert.ok(moving > 0 && moving <= 0.2, `moving level ${moving}`);
});

test('engine pitch target is deterministic and a slew cannot jump the whole gap', () => {
  const slow = enginePlayback({speed: 2, throttle: 0.2});
  const fast = enginePlayback({speed: 14, throttle: 1});
  assert.equal(enginePlayback({speed: 7, throttle: 0.4}), enginePlayback({speed: 7, throttle: 0.4}));
  assert.ok(fast > slow && fast - slow < 1);
  const stepped = slew(slow, fast, 0.12);
  assert.ok(stepped > slow && stepped < slow + (fast - slow) * 0.2);
});

test('split screen assigns one panned engine voice per player', () => {
  const voices = engineMix(
    [
      {speed: 8, throttle: 0.5, body: 'car', seat: 0, split: true},
      {speed: 3, throttle: 0.2, body: 'board', seat: 1, split: true}
    ],
    {paused: false}
  );
  assert.equal(voices.length, 2);
  assert.notEqual(voices[0].seat, voices[1].seat);
  assert.ok(voices[0].pan < -0.15 && voices[1].pan > 0.15);
  assert.equal(voices[0].pan, -voices[1].pan);
  assert.ok(voices[0].level > 0 && voices[1].level > 0);
  const solo = engineMix([{speed: 8, throttle: 1, body: 'car', seat: 0, split: false}]);
  assert.equal(solo.length, 1);
  assert.equal(solo[0].pan, 0);
  assert.equal(engineMix([{speed: 4, throttle: 1, body: 'robot', seat: 0, split: false}])[0].level, 0);
  assert.equal(engineMix([{speed: 4, throttle: 1, body: 'dino', seat: 1, split: true}])[0].level, 0);
});

test('repeats inside the minimum gap are refused', () => {
  assert.equal(canRetrigger({last: 0, now: 0.05, name: 'impact'}), false);
  assert.equal(canRetrigger({last: 0, now: MIN_GAP.impact, name: 'impact'}), true);
  assert.equal(canRetrigger({last: 1, now: 1.05, name: 'radio', gap: 0.01}), false);
  assert.ok(MIN_GAP.radio >= 1.2);
  assert.ok(MIN_GAP.impact >= 0.12);
});

test('a seventh simultaneous voice loses unless it outranks someone', () => {
  let active = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const d = admit(active, {name: 'coin', priority: 40, now: 0, until: 1});
    assert.equal(d.ok, true);
    active = d.active;
  }
  assert.equal(active.length, MAX_VOICES);
  const low = admit(active, {name: 'radio', priority: 10, now: 0, until: 1});
  assert.equal(low.ok, false);
  assert.equal(low.active.length, MAX_VOICES);
  const high = admit(active, {name: 'impact', priority: 90, now: 0, until: 1});
  assert.equal(high.ok, true);
  assert.equal(high.active.length, MAX_VOICES);
  assert.ok(high.active.some(v => v.name === 'impact'));
  assert.equal(high.active.filter(v => v.name === 'coin').length, MAX_VOICES - 1);
  const later = admit(high.active, {name: 'splash', priority: 70, now: 2, until: 3});
  assert.equal(later.ok, true);
  assert.equal(later.active.length, 1);
});

test('pitch and gain jitter stay inside a small band', () => {
  for (let i = 0; i < 20; i++) {
    const j = jittered(2, 0.5, () => i / 19);
    assert.ok(j.rate >= 2 * 0.96 && j.rate <= 2 * 1.04);
    assert.ok(j.gain >= 0.5 * 0.88 && j.gain <= 0.5 * 1.04);
  }
});

test('harsh synth tones are low-passed and shortened', () => {
  const square = soften({type: 'square', dur: 0.4, level: 0.1, cutoff: 4000});
  assert.ok(square.dur <= 0.16);
  assert.ok(square.cutoff <= 1600);
  assert.ok(square.level < 0.1);
  const sine = soften({type: 'sine', dur: 0.3, level: 0.08});
  assert.equal(sine.dur, 0.3);
  assert.ok(sine.cutoff <= 3200);
});

test('the only permitted continuous loop is the player engine', () => {
  assert.equal(allowsLoop('engine'), true);
  for (const name of ['gravel', 'squeal', 'hum', 'whine', 'grind', 'jet', 'motor-high'])
    assert.equal(allowsLoop(name), false, name);
});
