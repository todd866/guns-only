// Strike occupies the mapped recreation building, way/1017445302 in tile--4-4.json.
// Keep the exact stepped outline here as the shared shell/layout source; the tile
// regression checks it against the source polygon. +x east, +z south.
export const ALLEY_FLOOR_Y = 0.04;
const outline = [
  [-1023.3, 1244.61],
  [-991.2, 1244.61],
  [-991.2, 1232.71],
  [-991.73, 1232.82],
  [-991.73, 1224.81],
  [-989.94, 1224.81],
  [-989.94, 1217.81],
  [-989.31, 1217.81],
  [-989.31, 1201.02],
  [-1006.89, 1201.02],
  [-1006.89, 1193.01],
  [-1023.75, 1193.01],
  [-1023.75, 1209.14],
  [-1022.31, 1209.14],
  [-1022.23, 1232.15],
  [-1023.3, 1232.15]
].map(Object.freeze);
export const BOWLING_ALLEY = Object.freeze({
  featureId: 'way/1017445302',
  outline: Object.freeze(outline),
  bounds: Object.freeze({
    minX: Math.min(...outline.map(p => p[0])),
    maxX: Math.max(...outline.map(p => p[0])),
    minZ: Math.min(...outline.map(p => p[1])),
    maxZ: Math.max(...outline.map(p => p[1]))
  }),
  // The mapped building has no height tag: the tile's >500 m² fallback is 5.5 m.
  height: 5.5,
  doorTop: 2.8
});
const {minX, minZ, maxX, maxZ} = BOWLING_ALLEY.bounds;
// Scenery only: keep ground under the forecourt, remove roads, plants and props.
export const ALLEY_SCENERY_BOUNDS = Object.freeze([minX - 3, minZ - 3, maxX + 3, maxZ + 3]);
export const DOORS = Object.freeze([
  Object.freeze({
    id: 'front',
    edge: 0,
    axis: 'x',
    center: Object.freeze([(outline[0][0] + outline[1][0]) / 2, maxZ]),
    width: 3.6
  }),
  Object.freeze({
    id: 'side',
    edge: 1,
    axis: 'z',
    center: Object.freeze([outline[1][0], maxZ - 6]),
    width: 3.6
  })
]);
export const FRONT_DOOR_POS = Object.freeze([DOORS[0].center[0], 0, DOORS[0].center[1]]);
export const LANES = Object.freeze(
  Array.from({length: 6}, (_, i) =>
    Object.freeze({
      id: i + 1,
      x: DOORS[0].center[0] + (i - 2.5) * 1.55,
      width: 1.05,
      startZ: maxZ - 12,
      headZ: maxZ - 30,
      endZ: maxZ - 31.6,
      approachZ: maxZ - 9
    })
  )
);

// Cut the two openings out of the mapped perimeter; render and collision use
// these same solid runs, including the small jogs in the original footprint.
export const COLLISION_WALLS = Object.freeze(
  outline.flatMap((a, edge) => {
    const b = outline[(edge + 1) % outline.length],
      door = DOORS.find(d => d.edge === edge);
    if (!door) return [Object.freeze({id: `edge-${edge}`, a, b})];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      dx = (b[0] - a[0]) / len,
      dz = (b[1] - a[1]) / len,
      P = sign =>
        Object.freeze([
          door.center[0] + (sign * dx * door.width) / 2,
          door.center[1] + (sign * dz * door.width) / 2
        ]);
    return [
      Object.freeze({id: `${door.id}-a`, a, b: P(-1)}),
      Object.freeze({id: `${door.id}-b`, a: P(1), b})
    ];
  })
);
export function insideAlley(pos) {
  if (!Array.isArray(pos) || pos[1] < -0.5 || pos[1] >= BOWLING_ALLEY.height) return false;
  const [x, , z] = pos;
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i],
      b = outline[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
