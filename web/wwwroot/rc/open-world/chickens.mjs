// The steam farm's chickens (owner, 31 Oct: "We need a Minecraft chicken"): our own blocky toy
// hens, in the dark world's Minecraft spirit. A small flock pecks and wanders round its yard by the
// farm; a dinosaur coming close scatters them, flapping and squawking, and they settle again once
// it's gone. Toy animals: never hurt. Pure: flock state and behaviour; drawn by chickens.js.
import {valleyPoint} from './spirit-mountain.mjs';

const at = (along, across) => {
  const p = valleyPoint(along, across);
  return [p[0], p[2]];
};
export const YARD = Object.freeze({centre: at(552, -34), radius: 9});
export const HEN = Object.freeze({walk: 0.6, run: 3.2, scare: 7, calm: 11, turn: 3});

const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export function createFlock(n = 6, seed = 11) {
  const r = rng(seed),
    [cx, cz] = YARD.centre;
  return {
    hens: Array.from({length: n}, (_, i) => {
      const a = r() * Math.PI * 2,
        d = r() * YARD.radius * 0.7;
      return {
        id: `hen-${i}`,
        x: cx + Math.cos(a) * d,
        z: cz + Math.sin(a) * d,
        yaw: r() * 6.28,
        state: 'peck',
        t: r() * 2,
        flap: 0
      };
    }),
    rand: r
  };
}

/**
 * One step. scary: [x, z] of a ridden dinosaur (or null). Events: { scatter: id } when a calm hen
 * takes fright (for a squawk).
 */
export function stepFlock(flock, dt, scary = null) {
  const ev = [],
    [cx, cz] = YARD.centre;
  for (const h of flock.hens) {
    h.t -= dt;
    h.flap = Math.max(0, h.flap - dt);
    const d = scary ? Math.hypot(h.x - scary[0], h.z - scary[1]) : Infinity;
    if (d < HEN.scare) {
      if (h.state !== 'run') ev.push({scatter: h.id});
      h.state = 'run';
      h.flap = 0.4;
      h.yaw = Math.atan2(h.x - scary[0], -(h.z - scary[1])); // straight away from it
    } else if (h.state === 'run' && d > HEN.calm) {
      h.state = 'peck';
      h.t = 1 + flock.rand() * 2;
    }
    if (h.state !== 'run' && h.t <= 0) {
      // Alternate pecking with short wanders; drift back towards the middle of the yard.
      const home = Math.hypot(h.x - cx, h.z - cz) > YARD.radius;
      h.state = h.state === 'walk' && !home ? 'peck' : 'walk';
      h.t = h.state === 'walk' ? 0.8 + flock.rand() * 1.5 : 1.2 + flock.rand() * 2.5;
      if (h.state === 'walk')
        h.yaw = home ? Math.atan2(cx - h.x, -(cz - h.z)) : h.yaw + (flock.rand() - 0.5) * 2.2;
    }
    const speed = h.state === 'run' ? HEN.run : h.state === 'walk' ? HEN.walk : 0;
    h.x += Math.sin(h.yaw) * speed * dt;
    h.z -= Math.cos(h.yaw) * speed * dt;
  }
  return ev;
}
