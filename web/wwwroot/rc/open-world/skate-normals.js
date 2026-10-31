import * as T from '../../vendor/three.module.js';
import {mergeVertices} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Only a curved material batch is welded; decks, coping and skirts stay separate.
export function smoothBowlNormals(geometry, lip, heightAt) {
  const shared = mergeVertices(geometry);
  shared.computeVertexNormals();
  const smooth = shared.toNonIndexed(),
    p = smooth.attributes.position,
    n = smooth.attributes.normal;
  // Sample the authored curve inside the bowl. At the vertical lip the outer grid
  // vertices use a wider horizontal slope, keeping rim lighting continuous.
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      edge = Math.abs(p.getY(i) - lip) < 0.001,
      e = edge ? 0.4 : 0.001;
    const normal = new T.Vector3(
      heightAt(x - e, z) - heightAt(x + e, z),
      edge ? 0 : 2 * e,
      heightAt(x, z - e) - heightAt(x, z + e)
    ).normalize();
    if (normal.lengthSq()) n.setXYZ(i, normal.x, normal.y, normal.z);
  }
  geometry.setAttribute('normal', n.clone());
  shared.dispose();
  smooth.dispose();
}

// Split matching edges by the same height error, avoiding cracks between material batches.
export function refineSkateTriangles(triangles, heightAt, rounds = 2) {
  let out = triangles;
  for (let pass = 0; pass < rounds; pass++)
    out = out.flatMap(t => {
      const p = [t.a, t.b, t.c],
        m = p.map((a, i) => {
          const b = p[(i + 1) % 3],
            x = (a[0] + b[0]) / 2,
            z = (a[2] + b[2]) / 2;
          return [x, heightAt(x, z), z];
        });
      const cut = m.map(
        (v, i) =>
          Math.abs(p[i][1] - p[(i + 1) % 3][1]) > 0.25 ||
          Math.abs(v[1] - (p[i][1] + p[(i + 1) % 3][1]) / 2) > 0.025
      );
      const count = cut.filter(Boolean).length;
      if (!count) return [t];
      let faces;
      if (count === 3)
        faces = [
          [p[0], m[0], m[2]],
          [m[0], p[1], m[1]],
          [m[2], m[1], p[2]],
          [m[0], m[1], m[2]]
        ];
      else {
        const i = count === 1 ? cut.indexOf(true) : (cut.indexOf(false) + 1) % 3;
        const a = p[i],
          b = p[(i + 1) % 3],
          c = p[(i + 2) % 3],
          ab = m[i],
          bc = m[(i + 1) % 3];
        faces =
          count === 1
            ? [
                [a, ab, c],
                [ab, b, c]
              ]
            : [
                [ab, b, bc],
                [a, ab, c],
                [ab, bc, c]
              ];
      }
      return faces.map(([a, b, c]) => ({...t, a, b, c}));
    });
  return out;
}
