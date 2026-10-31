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
