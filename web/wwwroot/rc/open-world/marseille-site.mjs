// Marseille is an authored cut in the ordinary flight-line terrain, kept in its
// own local frame so the park geometry never needs to know the world origin.
export const MARSEILLE = Object.freeze({
  center: [2200, 2464], datum: 0,
  bounds: [-40, -24, 32, 32],
});
const worldBounds = (bounds, margin = 0) => Object.freeze([
  MARSEILLE.center[0] + bounds[0] - margin, MARSEILLE.center[1] + bounds[1] - margin,
  MARSEILLE.center[0] + bounds[2] + margin, MARSEILLE.center[1] + bounds[3] + margin,
]);
export const MARSEILLE_HOLE = worldBounds(MARSEILLE.bounds);
export const MARSEILLE_PAD = Object.freeze({
  bounds: worldBounds(MARSEILLE.bounds, 8), datum: 0, feather: 32,
});
export const MARSEILLE_TERRAIN = Object.freeze({
  hole: MARSEILLE_HOLE, pad: MARSEILLE_PAD,
});
export const marseilleWorld = ([x, y, z]) => [MARSEILLE.center[0] + x, y + MARSEILLE.datum, MARSEILLE.center[1] + z];
export const marseilleLocal = ([x, y, z]) => [x - MARSEILLE.center[0], y - MARSEILLE.datum, z - MARSEILLE.center[1]];
export const inMarseilleHole = (x, z) => x >= MARSEILLE_HOLE[0] && x <= MARSEILLE_HOLE[2] && z >= MARSEILLE_HOLE[1] && z <= MARSEILLE_HOLE[3];
