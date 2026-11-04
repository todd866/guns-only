import {add, rotate, scale} from './physics/math.mjs';
import {dangleSpot} from './physics/pickups.mjs';

// Carried missiles are mounted on a small rear rack. Keep the presentation fixed
// at the same point used by the defensive trailer collision, rather than making
// them orbit the car and compete with the driving view.
export function heldMissilePose(car, index = 0, count = 1) {
  const total = Math.max(1, count | 0);
  const spread = (index - (total - 1) / 2) * 0.11;
  const right = rotate(car.q, [1, 0, 0]);
  const dir = rotate(car.q, [0, 0, -1]);
  return {
    pos: add(add(dangleSpot(car), [0, 0.12, 0]), scale(right, spread)),
    dir
  };
}
