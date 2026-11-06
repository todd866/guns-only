// One pad layout for everything that flies (owner, 6 Nov 2026: flight controls
// "should work the same across guns-only, helicopter and rc"). Standard
// Gamepad mapping, both printed 8BitDo layouts:
//   left stick   flight stick / cyclic — pull back = nose up (slows a chopper)
//   right stick  look
//   RT / LT      throttle or collective up / down — a lever that holds
//   LB / RB      rudder or pedals (RB = right pedal = yaw right)
//   printed A    guns / darts        printed B    missiles / balloons
// The plane readers (pad_flight.mjs, guns-only), the helicopters (cobra,
// toy chopper) and RC flight (gamepad.mjs) all take their indices and axis
// arithmetic from here, so the layouts cannot drift apart.
import {padKind} from './pad-art.mjs';

export const FLIGHT_PAD = Object.freeze({
  LS_X: 0,
  LS_Y: 1,
  RS_X: 2,
  RS_Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
});

/** Printed letter → standard-mapping index. The SN30 prints the letters swapped. */
export function faceIndex(id, letter) {
  const snes = padKind(id) === 'sn30';
  if (letter === 'A') return snes ? 1 : 0;
  if (letter === 'B') return snes ? 0 : 1;
  return 0;
}

/** LB/RB → rudder or pedals: right bumper is the right pedal, +1 = nose right. */
export function pedalAxis(lbHeld, rbHeld) {
  return (rbHeld ? 1 : 0) - (lbHeld ? 1 : 0);
}

/** RT/LT → the rate that walks a held throttle/collective lever. RT raises it. */
export function leverAxis(rt, lt) {
  const up = Number.isFinite(rt) ? Math.max(0, Math.min(1, rt)) : 0;
  const down = Number.isFinite(lt) ? Math.max(0, Math.min(1, lt)) : 0;
  return up - down;
}
