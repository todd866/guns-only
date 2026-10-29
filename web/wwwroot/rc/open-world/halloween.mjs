// Halloween on the base: jack-o'-lanterns on porches, a pumpkin patch at the neighbourhood
// skatepark where every new run starts, and pumpkins a car can smash. A smash is a splat, not a
// collision: pumpkins never stop the car, and they grow back once the car has driven away.
import { RESIDENTIAL_START } from './residential-frame.mjs';

export const PUMPKIN = Object.freeze({ radius: .32, hit: .55, minSpeed: .6, regrow: 40, regrowClear: 18, cell: 16 });

// Car yaw convention: forward is (sin yaw, -cos yaw) in x/z.
const START = RESIDENTIAL_START.pos, YAW = RESIDENTIAL_START.yaw;
const FWD = [Math.sin(YAW), -Math.cos(YAW)], RIGHT = [Math.cos(YAW), Math.sin(YAW)];
export const spawnPoint = (ahead, right) => [START[0] + FWD[0] * ahead + RIGHT[0] * right, START[2] + FWD[1] * ahead + RIGHT[1] * right];
export const spawnYaw = YAW;

// The patch sits in front of the first run: a slalom line ahead and right, clear of the funbox dead
// ahead, to teach the joke; then a scattered patch to the left beside the scarecrow and hay bales.
// Spots were checked against a height scan of the skatepad (~/.local/state/rc-halloween/scan.mjs).
export const PATCH = [
  ...[4, 7.5, 11, 14.5].map((a, i) => [a, i % 2 ? 5.6 : 3.6, 1]),
  ...[[8, -6.5, 1.4], [9.2, -8, .9], [10.5, -6.2, 1.1], [11.4, -7.8, 1.25], [12.6, -6.6, .8], [13.4, -8.4, 1.5], [7.2, -8.6, .85], [14.6, -7.1, 1]],
];
export const SCARECROW = [10.6, -10.4];
export const HAY = [[7.4, -11], [9.4, -11.6], [12, -11.6], [14.2, -10.6]];
export const INFLATABLES = { pumpkin: [19, -9], ghost: [20, 7.5] };
export const BANNER = { at: [21.5, 0], width: 7 };

/** Pumpkins: [{x,z,y,scale,yaw,lit}] world positions. Porch ones come from the yard placements. */
export function pumpkinField({ porches = [], heightAt = () => 0 } = {}) {
  const field = PATCH.map(([a, r, s], i) => { const [x, z] = spawnPoint(a, r); return { x, z, y: heightAt(x, z), scale: s, yaw: -YAW + (i % 3 - 1) * .4, lit: i % 2 === 0 }; });
  for (const p of porches) field.push({ x: p.x, z: p.z, y: p.y ?? heightAt(p.x, p.z), scale: p.scale ?? 1, yaw: p.yaw ?? 0, lit: true });
  return field;
}

export function createPumpkins(field) {
  const pumpkins = field.map((p, i) => ({ ...p, i, smashedAt: null }));
  const grid = new Map(), key = (x, z) => `${Math.floor(x / PUMPKIN.cell)},${Math.floor(z / PUMPKIN.cell)}`;
  for (const p of pumpkins) { const k = key(p.x, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  return { pumpkins, grid, key, smashed: 0, changed: false };
}

/** Smash every standing pumpkin the car touches and regrow old ones out of sight. */
export function stepPumpkins(state, pos, vel, time) {
  const speed = Math.hypot(vel[0], vel[2]), hits = [];
  state.changed = false;
  const cx = Math.floor(pos[0] / PUMPKIN.cell), cz = Math.floor(pos[2] / PUMPKIN.cell);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const p of state.grid.get(`${cx + dx},${cz + dz}`) ?? []) {
    const d = Math.hypot(p.x - pos[0], p.z - pos[2]);
    if (p.smashedAt === null) {
      if (speed >= PUMPKIN.minSpeed && d < PUMPKIN.hit * Math.max(.8, p.scale) && Math.abs(pos[1] - p.y) < 1.2) {
        p.smashedAt = time; state.smashed++; state.changed = true;
        hits.push({ pumpkin: p, speed, dir: speed > 0 ? [vel[0] / speed, vel[2] / speed] : [0, 0] });
      }
    } else if (time - p.smashedAt > PUMPKIN.regrow && d > PUMPKIN.regrowClear) { p.smashedAt = null; state.changed = true; }
  }
  // Pumpkins that were smashed and left behind regrow on a slower sweep.
  if (!hits.length && (state.sweep = (state.sweep ?? 0) + 1) % 120 === 0) for (const p of state.pumpkins) if (p.smashedAt !== null && time - p.smashedAt > PUMPKIN.regrow && Math.hypot(p.x - pos[0], p.z - pos[2]) > PUMPKIN.regrowClear) { p.smashedAt = null; state.changed = true; }
  return hits;
}
