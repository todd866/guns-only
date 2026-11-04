// Original gabled roofs over anonymous mapped footprints. Split at the ridge
// before triangulation so a roof never becomes a quilt of little pyramids.
export function roofProfile(ring, wallHeight, variant = 0) {
  const edges = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length];
    return {dx: b[0] - a[0], dz: b[1] - a[1], length: Math.hypot(b[0] - a[0], b[1] - a[1])};
  });
  const e = edges.reduce((a, b) => (a.length > b.length ? a : b));
  const normal = [-e.dz / e.length, e.dx / e.length];
  const across = p => p[0] * normal[0] + p[1] * normal[1];
  const values = ring.map(across),
    lo = Math.min(...values),
    hi = Math.max(...values),
    ridge = (lo + hi) / 2;
  const half = Math.max(0.5, (hi - lo) / 2),
    rise = Math.min(1.85, half * (0.32 + (variant % 3) * 0.055));
  return {
    normal,
    ridge,
    rise,
    across,
    height: p => wallHeight + Math.max(0, 1 - Math.abs(across(p) - ridge) / half) * rise
  };
}

export function splitRoofTriangle(triangle, profile) {
  const result = [];
  for (const sign of [-1, 1]) {
    const polygon = [];
    for (let i = 0; i < triangle.length; i++) {
      const a = triangle[i],
        b = triangle[(i + 1) % triangle.length],
        da = (profile.across(a) - profile.ridge) * sign,
        db = (profile.across(b) - profile.ridge) * sign;
      if (da >= -1e-8) polygon.push(a);
      if ((da > 1e-8 && db < -1e-8) || (da < -1e-8 && db > 1e-8)) {
        const t = da / (da - db);
        polygon.push(a.map((v, k) => v + (b[k] - v) * t));
      }
    }
    for (let i = 1; i < polygon.length - 1; i++) {
      const t = [polygon[0], polygon[i], polygon[i + 1]];
      if (
        Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) > 1e-8
      )
        result.push(t);
    }
  }
  return result;
}
