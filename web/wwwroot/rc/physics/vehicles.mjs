import { BUGGY } from './car.mjs';

export const VEHICLE_KINDS = Object.freeze(['buggy', 'monster', 'rally', 'pickup', 'golf']);
const clone = x => ({ ...x, size: [...x.size], wheels: x.wheels.map(w => ({ ...w, at:[...w.at] })), hull: x.hull.map(h => ({ ...h, at: [...h.at] })), staticFriction: [...x.staticFriction], kineticFriction: [...x.kineticFriction] });
const PRESETS = Object.freeze({
  buggy: {}, monster: { topSpeed: 12, wheelRadius: BUGGY.wheelRadius * 1.2, restLength: BUGGY.restLength * 1.1, mass: 2.2 },
  rally: { topSpeed: 15, staticFriction: [1.72, 1.62], kineticFriction: [1.3, 1.22] },
  pickup: { topSpeed: 11.5, mass: 2.05 }, golf: { topSpeed: 8, driveForce: 20, staticFriction: [1.35, 1.28], kineticFriction: [1.0, .96] },
});
export function vehicleParams(kind = 'buggy') { if (!PRESETS[kind]) throw new RangeError(`unknown vehicle kind: ${kind}`); return clone(Object.assign(clone(BUGGY), PRESETS[kind])); }
export function golfVehicleUnlocked(state) { const d = Array.isArray(state) ? state : state?.discovered; return !!d?.includes('golf'); }
