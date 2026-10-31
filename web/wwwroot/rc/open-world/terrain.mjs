// USGS DEM horizon only. The authored playable floor remains flat and collidable.
export function terrainMesh(data, bounds) {
  const {width: w, height: h, stepM, origin, pixelCenter, valuesM} = data,
    R = 6371008.8,
    rad = Math.PI / 180;
  if (valuesM.length !== w * h || valuesM.some(v => !Number.isFinite(v))) throw Error('Invalid terrain grid');
  const x0 = (pixelCenter.lon - origin.lon) * rad * R * Math.cos(origin.lat * rad),
    z0 = (origin.lat - pixelCenter.lat) * rad * R;
  const positions = [],
    indices = [];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = x0 + i * stepM.eastX,
        z = z0 + j * stepM.southZ,
        d = Math.max(bounds[0] - x, x - bounds[2], bounds[1] - z, z - bounds[3], 0),
        blend = Math.min(1, d / 1200);
      positions.push(x, valuesM[j * w + i] * blend - 0.1, z);
    }
  for (let j = 0; j < h - 1; j++)
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i,
        b = a + 1,
        c = a + w,
        d = c + 1,
        x = positions[a * 3],
        z = positions[a * 3 + 2];
      if (x + stepM.eastX >= bounds[0] && x <= bounds[2] && z + stepM.southZ >= bounds[1] && z <= bounds[3])
        continue;
      indices.push(a, c, b, b, c, d);
    }
  return {positions, indices};
}
