import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate} from 'node:timers/promises';
import {createDinoInspect} from './inspect.js';
import {MIN_PITCH, MAX_PITCH, clampPitch, clampZoom, orbit} from './inspect.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`);
const position = (yaw, pitch = 0, dist = 2, target = [0, 0, 0]) => orbit({yaw, pitch, dist, target});

test('orbit reaches the front, both sides and back of a model facing -z', () => {
  for (const [yaw, expected] of [
    [0, [0, 0, -2]],
    [Math.PI / 2, [2, 0, 0]],
    [Math.PI, [0, 0, 2]],
    [(3 * Math.PI) / 2, [-2, 0, 0]]
  ])
    position(yaw).forEach((v, i) => near(v, expected[i]));
});

test('yaw stays continuous through repeated full turns in either direction', () => {
  const expected = position(0.7, 0.4);
  for (const turns of [-100, -1, 0, 1, 100])
    position(0.7 + turns * 2 * Math.PI, 0.4).forEach((v, i) => near(v, expected[i]));
});

test('pitch stops at -10 and 70 degrees without reaching the orbit poles', () => {
  near(MIN_PITCH, (-10 * Math.PI) / 180);
  near(MAX_PITCH, (70 * Math.PI) / 180);
  assert.equal(clampPitch(-Infinity), MIN_PITCH);
  assert.equal(clampPitch(Infinity), MAX_PITCH);
  assert.equal(clampPitch(0.3), 0.3);
  assert.deepEqual(position(0, -100), position(0, MIN_PITCH));
  assert.deepEqual(position(0, 100), position(0, MAX_PITCH));
});

test('orbit stays the chosen distance from the model middle at every angle', () => {
  const target = Object.freeze([1.2, 0.6, -3]);
  for (const yaw of [-7, 0, 1.3, 8])
    for (const pitch of [MIN_PITCH, 0, 0.5, MAX_PITCH]) {
      const p = position(yaw, pitch, 4, target);
      near(Math.hypot(...p.map((v, i) => v - target[i])), 4);
      near(p[1], target[1] + 4 * Math.sin(pitch));
    }
});

test('zoom clamps to model-sized near and far limits, including repeated key presses', () => {
  for (const size of [0.99, 1.31, 2.4]) {
    const min = size,
      max = size * 3.5;
    assert.equal(clampZoom(-Infinity, min, max), min);
    assert.equal(clampZoom(Infinity, min, max), max);
    assert.equal(clampZoom(size * 1.8, min, max), size * 1.8);
    let dist = size * 1.8;
    for (let i = 0; i < 200; i++) dist = clampZoom(dist / 1.12, min, max);
    assert.equal(dist, min);
    for (let i = 0; i < 200; i++) dist = clampZoom(dist * 1.12, min, max);
    assert.equal(dist, max);
  }
});

// Real GLBs, skeletons and mixers, with a recording renderer and browser event/RAF stand-ins.
// These tests check ownership and input, not WebGL output or visual framing.
function viewerHarness(t, model, fetchFile = async url => new Response(await readFile(new URL(url)))) {
  const frames = new Map(),
    captured = new Set(),
    clips = [],
    ready = Promise.withResolvers(),
    canvas = new EventTarget();
  let next = 0,
    now = 0,
    disconnected = 0,
    failures = 0,
    made = 0;
  const renderer = {
    disposed: 0,
    lost: 0,
    positions: [],
    setPixelRatio() {},
    setClearColor() {},
    setSize() {},
    render(scene, camera) {
      this.scene = scene;
      this.positions.push(camera.position.toArray());
    },
    dispose() {
      this.disposed++;
    },
    forceContextLoss() {
      this.lost++;
    }
  };
  Object.assign(canvas, {
    getBoundingClientRect: () => ({width: 320, height: 240}),
    focus() {},
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id)
  });
  const globals = {
    ResizeObserver: class {
      observe() {}
      disconnect() {
        disconnected++;
      }
    },
    requestAnimationFrame: fn => {
      frames.set(++next, fn);
      return next;
    },
    cancelAnimationFrame: id => frames.delete(id)
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {value, configurable: true});
    t.after(() => (original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]));
  }
  t.mock.method(globalThis, 'fetch', fetchFile);
  t.mock.method(console, 'warn', () => {});
  const viewer = createDinoInspect({
    canvas,
    model,
    makeRenderer(options) {
      assert.deepEqual(options, {canvas, antialias: true, alpha: true});
      made++;
      return renderer;
    },
    onReady: () => ready.resolve(true),
    onError: () => {
      failures++;
      ready.resolve(false);
    },
    onClip: clip => clips.push(clip)
  });
  t.after(() => viewer.dispose());
  return {
    viewer,
    renderer,
    canvas,
    frames,
    clips,
    captured,
    ready: ready.promise,
    get disconnected() {
      return disconnected;
    },
    get failures() {
      return failures;
    },
    get made() {
      return made;
    },
    event(type, props = {}) {
      const e = new Event(type, {cancelable: true});
      Object.assign(e, props);
      canvas.dispatchEvent(e);
      return e;
    },
    tick() {
      assert.equal(frames.size, 1, 'exactly one viewer frame pending');
      const [id, fn] = frames.entries().next().value;
      frames.delete(id);
      fn((now += 50));
    }
  };
}

test('closing during a model load disposes once and late completion cannot start a loop', async t => {
  const fetchStarted = Promise.withResolvers(),
    gate = Promise.withResolvers();
  const h = viewerHarness(t, 'dino', async url => {
    fetchStarted.resolve();
    await gate.promise;
    return new Response(await readFile(new URL(url)));
  });
  await fetchStarted.promise;
  h.viewer.dispose();
  h.viewer.dispose();
  gate.resolve();
  // Await the shared preparation, including GLTF parsing, without a browser or network.
  const {prepareCharacters} = await import('./characters.js');
  await prepareCharacters(['dino']);
  await setImmediate();
  assert.equal(h.renderer.disposed, 1);
  assert.equal(h.renderer.lost, 1);
  assert.equal(h.disconnected, 1);
  assert.equal(h.frames.size, 0);
  assert.equal(h.renderer.positions.length, 0);
  assert.equal(h.failures, 0);
});

test('viewer turns, stops auto-spin on input, plays real clips and releases its character', async t => {
  const h = viewerHarness(t, 'quetzal');
  assert.equal(await h.ready, true);
  h.tick();
  h.tick();
  assert.notDeepEqual(h.renderer.positions[0], h.renderer.positions[1]);
  const key = key => h.event('keydown', {key});
  assert.equal(key('ArrowRight').defaultPrevented, true);
  h.tick();
  const stopped = h.renderer.positions.at(-1);
  h.tick();
  assert.deepEqual(h.renderer.positions.at(-1), stopped);
  assert.equal(key('Tab').defaultPrevented, false);
  key('+');
  h.tick();
  const target = [0, 1.14 * 0.38, 0];
  const distance = p => Math.hypot(...p.map((v, i) => v - target[i]));
  assert.ok(distance(h.renderer.positions.at(-1)) < distance(stopped));
  h.event('pointerdown', {isPrimary: true, button: 0, pointerId: 1, clientX: 0, clientY: 0});
  h.event('pointermove', {pointerId: 1, clientX: 80, clientY: 40});
  h.tick();
  assert.notDeepEqual(h.renderer.positions.at(-1), stopped);
  h.event('pointercancel', {pointerId: 1});
  assert.equal(h.captured.size, 0);
  for (const clip of ['walk', 'run', 'jump']) {
    h.viewer.play(clip);
    h.tick();
    assert.equal(h.clips.at(-1), clip);
  }
  for (let i = 0; i < 25; i++) h.tick();
  assert.equal(h.clips.at(-1), 'idle');
  h.viewer.play('flap');
  h.tick();
  assert.equal(h.clips.at(-1), 'flap');
  h.viewer.play('flap');
  h.tick();
  assert.equal(h.clips.at(-1), 'glide');
  const root = h.renderer.scene.getObjectByName('Character_quetzal');
  assert.ok(root);
  let sharedDisposals = 0;
  root.traverse(o => {
    if (o.isMesh) {
      o.geometry.addEventListener('dispose', () => sharedDisposals++);
      o.material.addEventListener('dispose', () => sharedDisposals++);
    }
  });
  h.viewer.dispose();
  assert.equal(root.parent, null);
  assert.equal(sharedDisposals, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.renderer.disposed, 1);
  assert.equal(h.renderer.lost, 1);
  assert.equal(key('ArrowLeft').defaultPrevented, false, 'listeners removed');
});

test('context loss stops the viewer and reports a retryable failure', async t => {
  const h = viewerHarness(t, 'dino');
  assert.equal(await h.ready, true);
  h.tick();
  assert.equal(h.event('webglcontextlost').defaultPrevented, true);
  assert.equal(h.frames.size, 0);
  assert.equal(h.failures, 1);
  assert.equal(h.renderer.disposed, 1);
  assert.equal(h.renderer.lost, 1);
});

test('a bad model uses the error path without allocating a renderer', async t => {
  const h = viewerHarness(t, 'missing');
  assert.equal(await h.ready, false);
  assert.equal(h.made, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.failures, 1);
});
