import * as T from '../../vendor/three.module.js';
import {prepareCharacters, spawnCharacter, disposeCharacter, hasCharacter, CHARACTERS} from './characters.js';

// Dino Book portraits (dex.mjs): each kind drawn once from its own model, side on in its idle pose,
// into a small picture the book shows (a black silhouette until you've seen one, by CSS). Rendered
// with the game's renderer into a render target, so no second WebGL context; cached per kind.
const SIZE = 128;
export function createPortraits(renderer) {
  const cache = new Map(),
    pending = new Map(),
    scene = new T.Scene(),
    camera = new T.PerspectiveCamera(30, 1, 0.05, 50),
    target = new T.WebGLRenderTarget(SIZE, SIZE, {samples: 4}),
    pixels = new Uint8Array(SIZE * SIZE * 4);
  scene.add(new T.HemisphereLight('#fff6e0', '#6b5a48', 2.2));
  const sun = new T.DirectionalLight('#ffffff', 2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  function draw(model) {
    const d = spawnCharacter(scene, model, {clip: 'idle'});
    d.update(0.4);
    // Framed from the kind's own size (characters.js lengthM / spanM; the origin is on the ground
    // between the feet, facing -z): a skinned mesh's bounding box doesn't follow its bones.
    const def = CHARACTERS[model] ?? {},
      L = Math.max(def.lengthM ?? 1.3, (def.spanM ?? 0) * 0.8),
      mid = new T.Vector3(0, L * 0.38, 0),
      dist = L * 1.25;
    camera.position.set(dist * 0.9, mid.y + dist * 0.22, -dist * 0.42);
    camera.lookAt(mid);
    const was = renderer.getRenderTarget(),
      clear = renderer.getClearAlpha(),
      colour = renderer.getClearColor(new T.Color());
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
    renderer.setRenderTarget(was);
    renderer.setClearColor(colour, clear);
    disposeCharacter(d);
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const img = c.getContext('2d').createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++)
      img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4); // WebGL rows are bottom-up
    c.getContext('2d').putImageData(img, 0, 0);
    return c.toDataURL();
  }
  return {
    /** The picture for a model, or null while it loads (onReady fires when it's there). */
    get(model, onReady = () => {}) {
      if (cache.has(model)) return cache.get(model);
      if (hasCharacter(model)) {
        try {
          cache.set(model, draw(model));
        } catch {
          cache.set(model, null);
        }
        return cache.get(model);
      }
      if (!pending.has(model))
        pending.set(
          model,
          prepareCharacters([model])
            .then(ok => {
              if (ok) onReady();
            })
            .catch(() => {})
        );
      return null;
    },
    dispose() {
      target.dispose();
    }
  };
}
