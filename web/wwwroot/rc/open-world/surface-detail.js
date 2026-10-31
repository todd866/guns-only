import * as T from '../../vendor/three.module.js';

// Small deterministic maps keep the authored surfaces tactile without adding image
// requests or a post-processing pass. Values stay close to neutral so the base colours
// and the readable course silhouette remain in charge.
function texture(kind, size = 48) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const wave = Math.sin(x * 0.42 + Math.sin(y * 0.17)) * 0.5 + Math.sin(y * 0.31) * 0.25;
      if (kind === 'sand') {
        const v = Math.round(226 + wave * 7 + (((x * 17 + y * 31) % 5) - 2));
        pixels[i] = v;
        pixels[i + 1] = Math.min(255, v - 25);
        pixels[i + 2] = Math.min(255, v - 66);
      } else {
        const v = Math.round(194 + wave * 6);
        pixels[i] = Math.max(0, v - 25);
        pixels[i + 1] = Math.min(255, v + 20);
        pixels[i + 2] = Math.min(255, v + 27);
      }
      pixels[i + 3] = 255;
    }
  const t = new T.DataTexture(pixels, size, size, T.RGBAFormat, T.UnsignedByteType);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.magFilter = T.LinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = T.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function rippleNormal(size = 48) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = Math.sin(x * 0.34 + y * 0.11) + Math.cos(y * 0.27 - x * 0.08);
      const b = Math.cos(y * 0.31 + x * 0.13) - Math.sin(x * 0.19);
      const i = (y * size + x) * 4;
      pixels[i] = Math.max(0, Math.min(255, Math.round(128 + a * 7)));
      pixels[i + 1] = Math.max(0, Math.min(255, Math.round(128 + b * 7)));
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    }
  const t = new T.DataTexture(pixels, size, size, T.RGBAFormat, T.UnsignedByteType);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.magFilter = T.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export function attachSurfaceDetails({sand, water}) {
  const sandMap = texture('sand'),
    sandNormal = rippleNormal();
  const waterMap = texture('water'),
    waterNormal = rippleNormal();
  for (const t of [sandMap, sandNormal, waterMap, waterNormal]) t.repeat.set(3.5, 3.5);
  sand.map = sandMap;
  sand.normalMap = sandNormal;
  sand.normalScale = new T.Vector2(0.12, 0.12);
  sand.needsUpdate = true;
  water.map = waterMap;
  water.normalMap = waterNormal;
  water.normalScale = new T.Vector2(0.16, 0.16);
  water.needsUpdate = true;
  return {
    sandMap,
    sandNormal,
    waterMap,
    waterNormal,
    dispose() {
      sandMap.dispose();
      sandNormal.dispose();
      waterMap.dispose();
      waterNormal.dispose();
    }
  };
}

export function addWorldUv(geometry, scale = 0.08) {
  const position = geometry.getAttribute('position');
  if (!position) return geometry;
  const uv = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i) * scale, position.getZ(i) * scale);
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  return geometry;
}
