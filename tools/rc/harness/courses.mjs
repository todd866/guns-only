// Original SI-unit acceptance courses as triangle worlds, not reconstructions of proprietary tracks.
import { createWorld, addBox } from '../../../web/wwwroot/rc/physics/world.mjs';
const START = { pos: [0, 0, 5], yaw: 0 };
function flat(size = 200) { const w = createWorld(); w.addQuad([-size, 0, -size], [-size, 0, size], [size, 0, size], [size, 0, -size], 'asphalt'); return w; }
// Heightfield strip with outward (up) faces; h(x,z) in metres.
function field(h, x0 = -20, x1 = 20, z0 = -120, z1 = 40, step = 0.05) {
  const w = createWorld();
  for (let z = z0; z < z1; z += step) w.addQuad([x0, h(0, z), z], [x0, h(0, z + step), z + step], [x1, h(0, z + step), z + step], [x1, h(0, z), z], 'asphalt');
  return w;
}
const make = world => ({ world, checkpoints: [[900, 900, 'unused']], secrets: [], start: START });
export const courses = {
  flat: make(flat()),
  ripple: make(field((x, z) => 0.035 * (1 + Math.sin(z * 10)))),
  jump: (() => { const w = flat(); const r = [-2, 2], zl = 0, zh = -4, hgt = 0.6;
    w.addQuad([r[0], 0, zl], [r[1], 0, zl], [r[1], hgt, zh], [r[0], hgt, zh], 'wood');
    w.addQuad([r[1], 0, zh], [r[0], 0, zh], [r[0], hgt, zh], [r[1], hgt, zh], 'wood'); return make(w); })(),
  wall: (() => { const w = flat(); addBox(w, 0, -10, 10, 0.25, 0, 1); return make(w); })(),
  gym: make((() => { const w = createWorld(); w.addQuad([-200, 0, -200], [-200, 0, 200], [200, 0, 200], [200, 0, -200], 'gymfloor'); return w; })()),
};
export const tapes = {
  acceleration: [{ ticks: 600, input: { throttle: 1 } }],
  brake: [{ ticks: 240, input: { throttle: 1 } }, { ticks: 240, input: { brake: true } }],
  reverse: [{ ticks: 600, input: { throttle: -1 } }],
  turn: [{ ticks: 240, input: { throttle: 1 } }, { ticks: 360, input: { throttle: .4, steer: 1 } }],
  drift: [{ ticks: 240, input: { throttle: 1 } }, { ticks: 90, input: { throttle: .4, steer: 1, brake: true } }, { ticks: 240, input: { throttle: 1 } }],
  jump: [{ ticks: 480, input: { throttle: 1 } }],
  wall: [{ ticks: 360, input: { throttle: 1 } }],
  ripple: [{ ticks: 480, input: { throttle: .7 } }],
  gym: [{ ticks: 240, input: { throttle: 1 } }, { ticks: 240, input: { throttle: .8, steer: .35 } }],
};
