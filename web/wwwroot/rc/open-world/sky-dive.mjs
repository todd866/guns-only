// World places, never a gated event. Distances and heights are authored toy challenges.
import {SUMMIT} from './spirit-mountain.mjs';
import {FLIGHT} from '../physics/flight.mjs';
import {placeCar} from '../physics/car.mjs';

export const SKY_JUMPS = Object.freeze([
  {
    id: 'mountain-jump',
    name: 'Mountain Jump',
    pad: SUMMIT.at,
    launch: [SUMMIT.at[0] + 250, SUMMIT.at[1]],
    height: 3,
    target: [SUMMIT.at[0] + 294, SUMMIT.at[1]]
  },
  {
    id: 'tower-jump',
    name: 'Tower Jump',
    pad: [1550, -460],
    launch: [1562, -460],
    height: 120,
    target: [1622, -460]
  },
  {id: 'plane-jump', name: 'Plane Jump', pad: [65, 1842], launch: [65, 1842], height: 600, target: [65, 2142]}
]);
export const SKY_RINGS = Object.freeze([
  {radius: 4, stars: 3, color: '#f6c944'},
  {radius: 10, stars: 2, color: '#fff7e3'},
  {radius: 20, stars: 1, color: '#388fed'}
]);
export const SKY_PAD_RADIUS = 6;
export const SKY_HINT = '🪂 Sky jump! [E] go';
export const SKY_STEER_HINT = '🪂 Steer with [left] [right] · land on the gold';
// Look down past the car so the rings remain in view even from the plane's 600 m drop.
export function skyDiveCamera(pos, yaw) {
  return {
    eye: [pos[0] - Math.sin(yaw) * 3.2, pos[1] + 4.8, pos[2] + Math.cos(yaw) * 3.2],
    look: [pos[0] + Math.sin(yaw) * 0.8, pos[1] + 0.1, pos[2] - Math.cos(yaw) * 0.8]
  };
}
export const skyStars = metres =>
  Number.isFinite(metres) && metres >= 0 ? (SKY_RINGS.find(r => metres <= r.radius)?.stars ?? 0) : 0;
export function skyJumpNear(pos, heightAt) {
  return (
    SKY_JUMPS.find(
      j =>
        Math.hypot(pos[0] - j.pad[0], pos[2] - j.pad[1]) <= SKY_PAD_RADIUS &&
        Math.abs(pos[1] - heightAt(...j.pad)) < 3
    ) ?? null
  );
}
export const SKY_OFF_LINE = 15; // m beside the middle: the blue ring
export const createSkyDive = () => ({active: null, report: null});

export function startSkyDive(state, jump, flight, car, heightAt, {roam = true} = {}) {
  if (!roam || state.active || flight.mode || !SKY_JUMPS.includes(jump)) return false;
  // Drift aims SKY_OFF_LINE metres beside the middle (alternating sides): hands off still lands in the
  // blue ring for a star, and one steer finds the gold for three.
  const [x, z] = jump.launch,
    side = flight.chutes % 2 ? 1 : -1,
    dx = jump.target[0] - x,
    dz = jump.target[1] - z,
    d = Math.hypot(dx, dz) || 1,
    aim = [jump.target[0] + (-dz / d) * SKY_OFF_LINE * side, jump.target[1] + (dx / d) * SKY_OFF_LINE * side],
    yaw = Math.atan2(aim[0] - x, -(aim[1] - z));
  // The mountain pad sends us off the ridge at summit height, clear of the slope below.
  placeCar(car, [x, heightAt(...jump.pad) + jump.height, z], yaw);
  car.vel = [Math.sin(yaw) * FLIGHT.chuteDrift, -FLIGHT.chuteSink, -Math.cos(yaw) * FLIGHT.chuteDrift];
  car.grounded = false;
  car.contacts = 0;
  Object.assign(flight, {
    mode: 'chute',
    speed: FLIGHT.chuteDrift,
    climb: 0,
    retro: false,
    heading: null,
    gcas: 0
  });
  flight.chutes++;
  state.active = {jump, landings: flight.landings ?? 0};
  state.report = null;
  return true;
}

// A real physics touchdown increments landings. Recovery/travel clearing mode must not score.
export function stepSkyDive(state, flight, car) {
  const run = state.active;
  if (!run || flight.mode === 'chute') return null;
  state.active = null;
  if (flight.mode !== null || (flight.landings ?? 0) <= run.landings) return null;
  const metres = Math.hypot(car.pos[0] - run.jump.target[0], car.pos[2] - run.jump.target[1]);
  state.report = {id: run.jump.id, name: run.jump.name, metres, stars: skyStars(metres)};
  return state.report;
}
export function recordSkyDive(progress, report) {
  progress.skyJumps = (progress.skyJumps ?? 0) + 1;
  progress.bestLanding = Math.min(progress.bestLanding ?? Infinity, report.metres);
}
export const skyLandingText = report =>
  report.stars === 3 ? '🎯 Bullseye! ⭐⭐⭐' : `🪂 Nice jump! ${Math.round(report.metres)} m from the middle`;
