import { BUGGY } from './car.mjs';

export const VEHICLE_KINDS = Object.freeze(['buggy', 'monster', 'rally', 'pickup', 'golf']);
const clone = x => ({ ...x, size: [...x.size], wheels: x.wheels.map(w => ({ ...w, at:[...w.at] })), hull: x.hull.map(h => ({ ...h, at: [...h.at] })), staticFriction: [...x.staticFriction], kineticFriction: [...x.kineticFriction] });
const PRESETS = Object.freeze({
  buggy: {}, monster: { topSpeed: 12, wheelRadius: .07, wheelWidth: .07, restLength: .06, mass: 2.2, size: [.24, .1, .42], wheels: BUGGY.wheels.map(w => ({ ...w, at: [Math.sign(w.at[0]) * .15, w.at[1], w.at[2]] })), hull: BUGGY.hull.map(h => ({ ...h, at: [h.at[0] * 4 / 3, h.at[1], h.at[2]] })) },
  rally: { topSpeed: 15, staticFriction: [1.72, 1.62], kineticFriction: [1.3, 1.22] },
  pickup: { topSpeed: 11.5, mass: 2.05 }, golf: { topSpeed: 8, driveForce: 20, staticFriction: [1.35, 1.28], kineticFriction: [1.0, .96] },
});
// The skateboard form (docs/design/adventure): the robot rides a deck. Not a Garage body; T
// switches to it. Narrow trucks, small hard wheels, a light low deck that carves and grinds.
const BOARD = { mass: 1.1, size: [.09, .04, .3], topSpeed: 12, driveForce: 22, wheelRadius: .026, wheelWidth: .022, restLength: .03,
  spring: 320, damper: 9, bumpAt: .018, maxSteer: .42, staticFriction: [1.45, 1.4], kineticFriction: [1.1, 1.06],
  wheels: [{ at: [-.045, 0, -.1], front: true }, { at: [.045, 0, -.1], front: true }, { at: [-.045, 0, .1], front: false }, { at: [.045, 0, .1], front: false }],
  hull: [{ at: [0, -.01, -.13], r: .02 }, { at: [0, -.01, .13], r: .02 }, { at: [0, .03, 0], r: .035 }] };
export function vehicleParams(kind = 'buggy') { if (kind === 'board') return clone(Object.assign(clone(BUGGY), BOARD)); if (!PRESETS[kind]) throw new RangeError(`unknown vehicle kind: ${kind}`); return clone(Object.assign(clone(BUGGY), PRESETS[kind])); }
export function golfVehicleUnlocked(state) { const d = Array.isArray(state) ? state : state?.discovered; return !!d?.includes('golf'); }
