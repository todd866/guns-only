import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {finishSkateparkSurface} from './skatepark-materials.js';

test('exported painted faces have two-dimensional UVs and retain them at attachment', async () => {
  const bytes = await readFile(new URL('../assets/districts/skatepark.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ''
  );
  const texture = new T.Texture();
  let checked = 0;
  try {
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(mesh => {
      if (!mesh.isMesh || mesh.material.name !== 'paint') return;
      const source = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),
        g = source.index ? source.toNonIndexed() : source;
      try {
        const uv = g.attributes.uv,
          p = g.attributes.position;
        assert.ok(uv, 'paint UVs are authored in the asset');
        finishSkateparkSurface(g, mesh.material, texture);
        assert.equal(g.attributes.uv, uv, 'attachment preserves the authored coordinates');
        for (let i = 0; i < p.count; i += 3) {
          const a = new T.Vector3().fromBufferAttribute(p, i),
            b = new T.Vector3().fromBufferAttribute(p, i + 1),
            c = new T.Vector3().fromBufferAttribute(p, i + 2);
          if (Math.max(a.y, b.y, c.y) < 0.18) continue; // Hidden base faces below the slab.
          const area = b.clone().sub(a).cross(c.clone().sub(a)).length();
          if (area < 1e-7) continue;
          const determinant =
            (uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) -
            (uv.getX(i + 2) - uv.getX(i)) * (uv.getY(i + 1) - uv.getY(i));
          assert.ok(Math.abs(determinant) > 1e-10, `paint triangle ${i / 3} collapses to a stripe`);
          checked++;
        }
      } finally {
        if (g !== source) g.dispose();
        source.dispose();
      }
    });
    assert.ok(checked > 1000, 'the exported ramps, ledges and end caps were inspected');
  } finally {
    gltf.scene.traverse(o => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    texture.dispose();
  }
});
