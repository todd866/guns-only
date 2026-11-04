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

export const RACE_LANES = Object.freeze([1, 6]);
export const PINSETTER_Z = LANES[0].endZ - 0.8;
export const BALL_RETURN_Z = LANES[0].startZ + 1.1;
// Leave a car-width turning aisle between the counter and the stepped west wall.
export const SNACK_COUNTER = Object.freeze({x: minX + 7, z: LANES[0].startZ - 3});
// Stay within the mapped shell. The two outside lanes open beneath the
// pinsetters into a maintenance corridor; the approach crosses all five returns.
const down = LANES[0],
  back = LANES[5],
  front = DOORS[0].center,
  side = DOORS[1].center,
  snack = SNACK_COUNTER;
export const ALLEY_RACE_POINTS = Object.freeze(
  [
    [front[0], front[1] + 3],
    [front[0], front[1] - 1],
    [front[0] - 1, front[1] - 3.5],
    [down.x, down.approachZ + 1],
    [down.x, down.startZ],
    [down.x, down.startZ - 6],
    [down.x, down.startZ - 12],
    [down.x, down.headZ],
    [down.x, PINSETTER_Z],
    [down.x + 0.5, PINSETTER_Z - 2],
    [down.x + 2, PINSETTER_Z - 3.5],
    [front[0], PINSETTER_Z - 3.9],
    [back.x - 2, PINSETTER_Z - 3.5],
    [back.x - 0.5, PINSETTER_Z - 2],
    [back.x, PINSETTER_Z],
    [back.x, back.headZ],
    [back.x, back.startZ - 12],
    [back.x, back.startZ - 6],
    [back.x, back.startZ - 1],
    [back.x - 0.8, BALL_RETURN_Z],
    [(LANES[4].x + LANES[5].x) / 2 - 1, BALL_RETURN_Z],
    [(LANES[0].x + LANES[1].x) / 2, BALL_RETURN_Z],
    [down.x - 2, BALL_RETURN_Z],
    [snack.x + 4, snack.z + 2.5],
    [snack.x + 2.5, snack.z],
    [snack.x + 1.2, snack.z - 1.8],
    [snack.x - 0.5, snack.z - 2.3],
    [snack.x - 2, snack.z - 1],
    [snack.x - 2, snack.z + 1],
    [snack.x - 0.5, snack.z + 2.5],
    [snack.x + 4, side[1] - 2],
    [down.x, side[1]],
    [front[0], side[1]],
    [side[0] - 6, side[1]],
    [side[0] - 2, side[1]],
    [side[0] + 2, side[1]],
    [side[0] + 4, side[1] + 2],
    [side[0] + 4, front[1] + 2],
    [side[0] + 1, front[1] + 5],
    [front[0] + 7, front[1] + 7],
    [front[0] + 2, front[1] + 6],
    [front[0], front[1] + 3]
  ].map(Object.freeze)
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
