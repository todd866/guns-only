import test from 'node:test';
import assert from 'node:assert/strict';
import {SoundKit} from './audio.js';

function stubKit() {
  globalThis.location = {search: ''};
  globalThis.window = globalThis;
  const gain = {value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}};
  const chain = {
    connect() {
      return chain;
    },
    gain
  };
  const kit = new SoundKit();
  kit.ctx = {
    currentTime: 0,
    createBufferSource() {
      return {
        buffer: null,
        playbackRate: {value: 1},
        loop: false,
        connect() {
          return chain;
        },
        start() {},
        stop() {}
      };
    },
    createGain() {
      return chain;
    },
    createBiquadFilter() {
      return {
        type: '',
        Q: {value: 1},
        frequency: {
          value: 0,
          setValueAtTime() {},
          setTargetAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {}
        },
        connect() {
          return chain;
        }
      };
    },
    createOscillator() {
      return {
        type: '',
        frequency: {setValueAtTime() {}, exponentialRampToValueAtTime() {}},
        connect() {
          return chain;
        },
        start() {},
        stop() {}
      };
    }
  };
  kit.master = chain;
  kit.noiseBuf = {};
  kit.samples = {};
  return kit;
}

test('footsteps are counted for QA per walker, robot and cowboy apart', () => {
  const kit = stubKit();
  assert.equal(typeof kit.footstep, 'function');
  kit.footstep('robot', 1);
  assert.equal(kit.heard['foot:robot'], 1);
  kit.ctx.currentTime = 0.05;
  kit.footstep('robot', 1);
  assert.equal(kit.heard['foot:robot'], 2);
  kit.ctx.currentTime = 0.2;
  kit.footstep('cowboy', 0.5);
  assert.equal(kit.heard['foot:cowboy'], 1);
  delete globalThis.location;
  delete globalThis.window;
});

test('grinding and a sliding car do not start a loop besides the engine', () => {
  const kit = stubKit();
  const chain = {
    connect() {
      return chain;
    },
    gain: {value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}}
  };
  const sources = [];
  kit.ctx.createBufferSource = () => {
    const src = {
      buffer: null,
      loop: false,
      playbackRate: {value: 1, setTargetAtTime() {}},
      connect() {
        return chain;
      },
      start() {},
      stop() {}
    };
    sources.push(src);
    return src;
  };
  kit.ctx.createStereoPanner = () => ({
    pan: {value: 0, setTargetAtTime() {}},
    connect() {
      return chain;
    }
  });
  kit.samplesReady = true;
  kit.samples = {motor_loop: {duration: 1}};
  kit.engineBus = chain;
  kit.gameBus = chain;
  kit.uiBus = chain;
  kit.grinding(true, 6);
  kit.grinding(true, 6);
  assert.equal(
    sources.filter(s => s.loop).length,
    0,
    'a grind must not loop'
  );
  const before = sources.length;
  kit.update({
    speed: 9,
    throttle: 0.8,
    slip: 1,
    paused: false,
    surface: 'gravel',
    body: 'car',
    players: [
      {speed: 9, throttle: 0.8, slip: 1, body: 'car', seat: 0, split: true},
      {speed: 4, throttle: 0.3, slip: 0.2, body: 'car', seat: 1, split: true}
    ]
  });
  const added = sources.slice(before);
  assert.equal(added.filter(s => s.loop).length, 2, 'one engine voice per split-screen player');
  assert.ok(added.filter(s => !s.loop).length <= 1, 'squeal is a one-shot, not a bed');
  delete globalThis.location;
  delete globalThis.window;
});
