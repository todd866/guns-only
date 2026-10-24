// Traversable residential kerbs for the metre-scale RC world.
//
// A kerb is modelled as a shallow rolled profile, rather than a vertical wall:
// 0.40 m slope -> 0.10 m rise -> 1.45 m sidewalk -> 0.40 m roll back to grass.
// The returned quads can be used by the renderer; when a physics world is passed,
// the same profile is installed there so visuals and driving surfaces agree.

const EPS = 1e-9;

export const RESIDENTIAL_KERB = Object.freeze({
  roadWidth: 9,
  rise: 0.10,
  slope: 0.40,
  sidewalk: 1.45,
  surface: 'concrete',
});

const length2 = (x, z) => Math.hypot(x, z);

function unitNormal(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = length2(dx, dz);
  if (l < EPS) throw new RangeError('kerb segment must have non-zero length');
  return { along: [dx / l, dz / l], left: [-dz / l, dx / l], length: l };
}

function upwardQuad(quad) {
  const ax = quad[1][0] - quad[0][0], az = quad[1][2] - quad[0][2];
  const bx = quad[2][0] - quad[0][0], bz = quad[2][2] - quad[0][2];
  return az * bx - ax * bz >= 0 ? quad : [quad[0], quad[3], quad[2], quad[1]];
}

function shifted(p, n, distance, y) { return [p[0] + n[0] * distance, y, p[1] + n[1] * distance]; }

// Return the profile stations from street centreline to the adjacent grass.
// Distances are signed in the requested side direction.
export function rolledKerbProfile(options = {}) {
  const k = { ...RESIDENTIAL_KERB, ...options };
  if (![k.rise, k.slope, k.sidewalk, k.roadWidth].every(Number.isFinite)
    || !(k.rise > 0) || !(k.slope > 0) || !(k.sidewalk > 0) || !(k.roadWidth > 0)) {
    throw new RangeError('kerb dimensions must be positive');
  }
  return [
    { offset: k.roadWidth / 2, y: 0 },
    { offset: k.roadWidth / 2 + k.slope, y: k.rise },
    { offset: k.roadWidth / 2 + k.slope + k.sidewalk, y: k.rise },
    { offset: k.roadWidth / 2 + 2 * k.slope + k.sidewalk, y: 0 },
  ];
}

function quadUp(world, quad, surface) {
  world.addQuad(...quad, surface);
}

/**
 * Build one or both sides of a straight road segment.
 *
 * `a` and `b` are [x,z] metre coordinates. `side` is 'both', 'left' or 'right'.
 * The result contains upward-facing visual quads, each as four [x,y,z] points,
 * and `addCollision(world)` installs those same quads into the physics world.
 */
export function createRolledKerb(a, b, options = {}) {
  const k = { ...RESIDENTIAL_KERB, ...options };
  const { left, length } = unitNormal(a, b);
  const side = options.side ?? 'both';
  if (!['both', 'left', 'right'].includes(side)) throw new RangeError(`invalid kerb side: ${side}`);
  const profiles = rolledKerbProfile(k);
  const quads = [];
  const addSide = (sign) => {
    const n = left.map(v => v * sign);
    for (let i = 1; i < profiles.length; i++) {
      const lo = profiles[i - 1], hi = profiles[i];
      quads.push(upwardQuad([
        shifted(a, n, lo.offset, lo.y), shifted(b, n, lo.offset, lo.y),
        shifted(b, n, hi.offset, hi.y), shifted(a, n, hi.offset, hi.y),
      ]));
    }
  };
  if (side === 'both' || side === 'left') addSide(1);
  if (side === 'both' || side === 'right') addSide(-1);
  return {
    a: [...a], b: [...b], length, side,
    dimensions: { roadWidth: k.roadWidth, rise: k.rise, slope: k.slope, sidewalk: k.sidewalk },
    quads,
    addCollision(world) { for (const q of quads) quadUp(world, q, k.surface); return world; },
  };
}

export function kerbBounds(segment) {
  const reach = segment.dimensions.roadWidth / 2 + 2 * segment.dimensions.slope + segment.dimensions.sidewalk;
  const minX = Math.min(segment.a[0], segment.b[0]) - reach;
  const maxX = Math.max(segment.a[0], segment.b[0]) + reach;
  const minZ = Math.min(segment.a[1], segment.b[1]) - reach;
  const maxZ = Math.max(segment.a[1], segment.b[1]) + reach;
  return [minX, minZ, maxX, maxZ];
}
