import * as T from '../../vendor/three.module.js';
import {CANYON, CANYON_LENGTH, CENTRELINE, RIVER, canyonPoint, canyonStrata} from './canyon.mjs';
import {SIZE} from './stream.mjs';

// The world's 64 m underlay cannot resolve a 44 m gorge. Keep it below the floor, including
// neighbouring vertices, and cover this area with the canyon's own streamed far tiles below.
export function canyonFarGround(ground, x, z) {
  const b = CANYON.bounds;
  return (
    ground(x, z) - (x >= b[0] - 64 && x <= b[2] + 64 && z >= b[1] - 64 && z <= b[3] + 64 ? CANYON.depth : 0)
  );
}

/** One river ribbon, with centreline floorY sampled from the actual carved terrain. Visual only:
 * the shared water physics has no per-point level. The river and terrain exist in both eras. */
export function createCanyonView(scene, ground) {
  const root = new T.Group(),
    far = new Map();
  root.name = 'GreatCanyon';
  scene.add(root);
  const rock = new T.MeshLambertMaterial({color: '#bfaa86', vertexColors: true, fog: false});
  // A 128 m collar covers the lowered coarse underlay's boundary triangles. Loaded 4 m tiles
  // replace these 16 m patches, so a coarse face never bridges the gorge during low flight.
  const b = CANYON.bounds,
    step = 16,
    n = SIZE / step + 1;
  for (let iz = Math.floor((b[1] - 128) / SIZE); iz <= Math.floor((b[3] + 128) / SIZE); iz++) {
    for (let ix = Math.floor((b[0] - 128) / SIZE); ix <= Math.floor((b[2] + 128) / SIZE); ix++) {
      const positions = [],
        colors = [],
        indices = [];
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = ix * SIZE + i * step,
            z = iz * SIZE + j * step,
            y = ground(x, z),
            shade = canyonStrata(y);
          positions.push(x, y - 1.5, z);
          colors.push(shade, shade, shade);
        }
      for (let j = 0; j < n - 1; j++)
        for (let i = 0; i < n - 1; i++) {
          const a = j * n + i;
          indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
        }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, rock),
        key = `${ix},${iz}`;
      mesh.name = `CanyonFar_${key}`;
      root.add(mesh);
      far.set(key, mesh);
    }
  }

  const samples = CENTRELINE.filter(
    p => p.along > CANYON.endFade && p.along < CANYON_LENGTH - CANYON.endFade
  ).map(p => ({...canyonPoint(p.along), floorY: ground(p.x, p.z)}));
  const positions = [],
    indices = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i],
      taper = Math.min(1, (p.along - samples[0].along) / 32, (samples.at(-1).along - p.along) / 32),
      width = RIVER.halfWidth * taper;
    for (const sign of [-1, 1])
      positions.push(p.x + sign * p.nx * width, p.floorY + RIVER.height, p.z + sign * p.nz * width);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const water = new T.MeshLambertMaterial({
      color: '#468d9a',
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: T.DoubleSide
    }),
    mesh = new T.Mesh(geometry, water);
  mesh.name = 'CanyonRiver';
  root.add(mesh);
  return {
    tileLoaded(key, loaded) {
      const tile = far.get(key);
      if (tile) tile.visible = !loaded;
    },
    update(day) {
      const light = 0.15 + 0.85 * day;
      rock.color.set('#bfaa86').multiplyScalar(light);
      water.color.set('#468d9a').multiplyScalar(light);
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      rock.dispose();
      water.dispose();
    }
  };
}
