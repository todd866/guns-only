import * as T from '../../vendor/three.module.js';
import {CHARACTERS, prepareCharacters, spawnCharacter, disposeCharacter} from './characters.js';
import {clampPitch, clampZoom, orbit} from './inspect.mjs';

// The book owns this viewer. No shared renderer state, scene assets or game controls are changed.
export function createDinoInspect({
  canvas,
  model,
  onReady,
  onClip,
  onError,
  makeRenderer = options => new T.WebGLRenderer(options)
}) {
  const def = CHARACTERS[model],
    length = def?.lengthM ?? 1.3,
    size = Math.max(length, (def?.spanM ?? 0) * 0.8),
    target = [0, length * 0.38, 0],
    scene = new T.Scene(),
    camera = new T.PerspectiveCamera(35, 4 / 3, size * 0.01, size * 20),
    events = new AbortController();
  let renderer,
    character,
    resize,
    frame = null,
    previous = null,
    disposed = false,
    auto = true,
    pointer = null,
    yaw = 1.15,
    pitch = 0.22,
    dist = size * 1.8,
    lastClip;
  scene.add(new T.HemisphereLight('#fff6e0', '#6b5a48', 2.2));
  const sun = new T.DirectionalLight('#ffffff', 2);
  sun.position.set(2, 4, 3);
  scene.add(sun);

  function releasePointer() {
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
    pointer = null;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    events.abort();
    for (const [type, fn] of listeners.splice(0)) canvas.removeEventListener(type, fn);
    releasePointer();
    resize?.disconnect();
    disposeCharacter(character);
    // Skeletons are per-instance; geometry, materials and textures belong to cached templates.
    character?.root.traverse(o => o.isSkinnedMesh && o.skeleton.dispose());
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  function fail(error) {
    if (disposed) return;
    dispose();
    console.warn('Dino Book view unavailable', error);
    onError?.();
  }
  function fit() {
    if (disposed) return;
    const {width, height} = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function tick(now) {
    if (disposed) return;
    try {
      const dt = previous === null ? 0 : Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (auto) yaw += dt * 0.22;
      character.update(dt);
      if (lastClip !== character.clip) {
        lastClip = character.clip;
        onClip?.(lastClip);
      }
      camera.position.set(...orbit({yaw, pitch, dist, target}));
      camera.lookAt(...target);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    } catch (error) {
      fail(error);
    }
  }
  // Listeners are removed explicitly on close, not left to the AbortSignal alone: Node's
  // EventTarget holds the signal's removal hook weakly, so a garbage collection at the wrong
  // moment could leave a listener registered (seen on Node 24.21 under test).
  const listeners = [];
  const listen = (type, fn) => {
    listeners.push([type, fn]);
    canvas.addEventListener(type, fn, {signal: events.signal});
  };
  listen('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    auto = false;
    canvas.focus({preventScroll: true});
    pointer = {id: e.pointerId, x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
  });
  listen('pointermove', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    yaw -= (e.clientX - pointer.x) * 0.012;
    pitch = clampPitch(pitch + (e.clientY - pointer.y) * 0.012);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    listen(type, e => {
      if (pointer?.id === e.pointerId) releasePointer();
    });
  listen('blur', releasePointer);
  listen('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowLeft':
        yaw -= 0.12;
        break;
      case 'ArrowRight':
        yaw += 0.12;
        break;
      case 'ArrowUp':
        pitch = clampPitch(pitch + 0.1);
        break;
      case 'ArrowDown':
        pitch = clampPitch(pitch - 0.1);
        break;
      case '+':
      case '=':
        dist = clampZoom(dist / 1.12, size, size * 3.5);
        break;
      case '-':
        dist = clampZoom(dist * 1.12, size, size * 3.5);
        break;
      default:
        return;
    }
    auto = false;
    e.preventDefault();
    e.stopPropagation();
  });
  listen('webglcontextlost', e => {
    e.preventDefault();
    fail(new Error('WebGL context lost'));
  });

  // Start asynchronously so the owner has the disposer even if setup fails immediately.
  Promise.resolve()
    .then(async () => {
      if (disposed) return;
      if (!def) throw new Error(`Unknown character: ${model}`);
      renderer = makeRenderer({canvas, antialias: true, alpha: true});
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      fit();
      resize = new ResizeObserver(fit);
      resize.observe(canvas);
      const ready = await prepareCharacters([model]);
      if (disposed) return;
      if (!ready) throw new Error(`Missing character: ${model}`);
      character = spawnCharacter(scene, model, {clip: 'idle', shadows: false});
      onReady?.();
      frame = requestAnimationFrame(tick);
    })
    .catch(fail);

  return {
    dispose,
    play(clip) {
      if (disposed || !character || !def.clips[clip]) return;
      auto = false;
      // The one Fly button alternates wing beats and gliding on successive presses.
      if (clip === 'flap' && character.clip === 'flap') clip = 'glide';
      character.play(clip, {restart: true, then: clip === 'jump' ? 'idle' : null});
      canvas.focus({preventScroll: true});
    }
  };
}
