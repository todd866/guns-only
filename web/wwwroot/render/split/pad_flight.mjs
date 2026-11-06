// TV flight pad for the two 8BitDo layouts Chrome reports as "standard".
// Ultimate 2 prints Xbox letters; SN30 Pro prints SNES letters. The same
// Gamepad index is a different letter, so darts follow the printed A.
// Deadzone is wider than a desk stick: a couch pad rests noisy.
// The rows come from the one shared flight layout (rc/flight_layout.mjs).
import {padKind} from "../../rc/pad-art.mjs";
import {FLIGHT_PAD, faceIndex, leverAxis, pedalAxis} from "../../rc/flight_layout.mjs";

export {faceIndex};

export const TV = Object.freeze({deadzone: 0.2, expo: 1.4, triggerDead: 0.08});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/** Axial stick with a couch deadzone and a soft centre. Full throw still reaches ±1. */
export function tvStick(value, deadzone = TV.deadzone, expo = TV.expo) {
  const x = clamp(finite(value), -1, 1);
  const mag = Math.abs(x);
  const dead = clamp(finite(deadzone, TV.deadzone), 0, 0.6);
  if (mag <= dead) return 0;
  const shaped = (mag - dead) / (1 - dead);
  const curve = clamp(finite(expo, TV.expo), 0.4, 3);
  return Math.sign(x) * (shaped ** curve);
}

export function tvTrigger(value, deadzone = TV.triggerDead) {
  const x = clamp(finite(value), 0, 1);
  const dead = clamp(finite(deadzone, TV.triggerDead), 0, 0.5);
  if (x <= dead) return 0;
  return (x - dead) / (1 - dead);
}

export function padUsable(pad) {
  if (!pad || pad.connected === false) return false;
  const mapping = pad.mapping;
  return mapping === "standard" || mapping === "" || mapping == null;
}

function buttonValue(pad, index) {
  const button = pad?.buttons?.[index];
  if (!button) return 0;
  const pressed = button.pressed === true ? 1 : 0;
  return clamp(Math.max(finite(button.value), pressed), 0, 1);
}

const IDLE = Object.freeze({
  connected: false,
  index: -1,
  id: "",
  kind: "xbox",
  roll: 0,
  pitch: 0,
  rudder: 0,
  throttleRate: 0,
  rt: 0,
  lt: 0,
  dartDown: false,
  balloonDown: false,
  startDown: false,
  dartEdge: false,
  balloonEdge: false,
  startEdge: false,
  touched: false,
});

/**
 * Left stick pitch/roll (pull = nose up), triggers throttle, printed A darts,
 * printed B water balloon, LB/RB rudder, Start edge.
 * `prev` is the last return value; edges are one frame.
 */
export function readFlightPad(pad, prev = {}) {
  if (!padUsable(pad)) return IDLE;
  const id = String(pad.id || "");
  const roll = tvStick(pad.axes?.[FLIGHT_PAD.LS_X]);
  // Browser Y is positive when the stick is pulled. Pull raises the nose.
  const pitch = tvStick(pad.axes?.[FLIGHT_PAD.LS_Y] ?? 0);
  const rt = tvTrigger(buttonValue(pad, FLIGHT_PAD.RT));
  const lt = tvTrigger(buttonValue(pad, FLIGHT_PAD.LT));
  const lb = buttonValue(pad, FLIGHT_PAD.LB) > 0.5;
  const rb = buttonValue(pad, FLIGHT_PAD.RB) > 0.5;
  const dartDown = buttonValue(pad, faceIndex(id, "A")) > 0.5;
  const balloonDown = buttonValue(pad, faceIndex(id, "B")) > 0.5;
  const startDown = buttonValue(pad, FLIGHT_PAD.START) > 0.5;
  return {
    connected: true,
    index: Math.max(0, Math.trunc(finite(pad.index))),
    id,
    kind: padKind(id),
    roll,
    pitch,
    rudder: pedalAxis(lb, rb),
    throttleRate: leverAxis(rt, lt),
    rt,
    lt,
    dartDown,
    balloonDown,
    startDown,
    dartEdge: dartDown && prev.dartDown !== true,
    balloonEdge: balloonDown && prev.balloonDown !== true,
    startEdge: startDown && prev.startDown !== true,
    touched: Math.abs(roll) + Math.abs(pitch) + rt + lt > 0.15 || dartDown || balloonDown || startDown || lb || rb,
  };
}

export function listPads(pads) {
  return Array.from(pads ?? []).filter(padUsable);
}
