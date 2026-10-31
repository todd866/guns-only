// Strike Recreation's indoor bowling house. Coordinates stay in the existing
// rec footprint so the approach and the later RC race can share the open floor.
export const ALLEY_FLOOR_Y = 0.04;

export const LANES = Object.freeze(
  Array.from({length: 6}, (_, i) => {
    const id = i + 1;
    return Object.freeze({
      id,
      x: -1020 + i * 1.55,
      width: 1.05,
      startZ: 1254,
      headZ: 1236,
      endZ: 1234.4,
      approachZ: 1257
    });
  })
);

export const BOWLING_ALLEY = Object.freeze({
  bounds: Object.freeze({minX: -1024, maxX: -1009, minZ: 1232, maxZ: 1265}),
  height: 4.5
});

export const DOORS = Object.freeze([
  Object.freeze({id: 'front', axis: 'x', center: [-1020, 1265], width: 3.2}),
  Object.freeze({id: 'side', axis: 'z', center: [-1009, 1260], width: 3.2})
]);

// Collision tests and the renderer both consume these solid runs. Door gaps are
// deliberately represented by absent runs, so driving through is always possible.
export const COLLISION_WALLS = Object.freeze([
  Object.freeze({id: 'back', a: [-1024, 1232], b: [-1009, 1232]}),
  Object.freeze({id: 'left', a: [-1024, 1232], b: [-1024, 1265]}),
  Object.freeze({id: 'front-left', a: [-1024, 1265], b: [-1021.6, 1265]}),
  Object.freeze({id: 'front-right', a: [-1018.4, 1265], b: [-1009, 1265]}),
  Object.freeze({id: 'side-back', a: [-1009, 1232], b: [-1009, 1258.4]}),
  Object.freeze({id: 'side-front', a: [-1009, 1261.6], b: [-1009, 1265]})
]);
