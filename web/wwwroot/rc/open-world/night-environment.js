import * as T from '../../vendor/three.module.js';
// Original radiance environment: moon, stars and horizon glow. No external imagery.
export function nightRadiance(width = 256, height = 128) {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * 4,
        v = y / (height - 1),
        glow = Math.exp(-Math.pow((v - 0.5) * 12, 2)),
        moon = Math.hypot((x / width - 0.71) * 2, y / height - 0.23) < 0.018 ? 10 : 0,
        star = y < height / 2 && (((x * 73856093) ^ (y * 19349663)) >>> 0) % 311 === 0 ? 2 : 0;
      data[k] = 0.008 + glow * 0.035 + moon + star;
      data[k + 1] = 0.015 + glow * 0.04 + moon * 0.95 + star;
      data[k + 2] = 0.035 + glow * 0.045 + moon * 0.8 + star;
      data[k + 3] = 1;
    }
  return data;
}
export function createNightEnvironment(renderer) {
  const texture = new T.DataTexture(nightRadiance(), 256, 128, T.RGBAFormat, T.FloatType);
  texture.mapping = T.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  const pmrem = new T.PMREMGenerator(renderer),
    target = pmrem.fromEquirectangular(texture);
  pmrem.dispose();
  texture.dispose();
  return {texture: target.texture, dispose: () => target.dispose()};
}
