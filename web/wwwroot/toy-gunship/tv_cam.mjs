// The gunner's TOY CAMERA: a stylised straight-down view (high contrast night,
// chunky crosshair — NOT realistic thermal). Aim point on the lawn, three zoom
// levels, three toy weapons, 2D soft lock. Pure logic; the view renders it.

import {faceIndex, tvStick} from "../render/split/pad_flight.mjs";
import {padKind} from "../rc/pad-art.mjs";

export const YARD_HALF = 40;

export const ZOOMS = Object.freeze([
  Object.freeze({id: "wide", mag: 1, label: "×1"}),
  Object.freeze({id: "mid", mag: 1.8, label: "×2"}),
  Object.freeze({id: "close", mag: 3.2, label: "×3"}),
]);

// Three weapons on the face buttons. delayS = flight time from trigger to
// impact (the balloon's arc delay); splash = area of effect on the lawn.
export const GUNS = Object.freeze({
  dart: Object.freeze({id: "dart", name: "DART", cooldownS: 0.16, delayS: 0.12, hitR: 2.4, splash: 0, damage: 1}),
  balloon: Object.freeze({id: "balloon", name: "BALLOON", cooldownS: 0.9, delayS: 0.85, hitR: 0, splash: 4.2, damage: 1}),
  confetti: Object.freeze({id: "confetti", name: "CONFETTI", cooldownS: 6, delayS: 0.5, hitR: 0, splash: 9, damage: 3}),
});

export const AIM_RATE = 26;   // lawn units/s at full stick, wide zoom
export const LOCK_R = 3.4;    // snap radius at wide zoom

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createTvCam() {
  return {
    x: 0, z: -10,            // aim point on the lawn
    zoom: 0,                 // index into ZOOMS
    cool: {dart: 0, balloon: 0, confetti: 0},
    shots: 0, hits: 0,
    washoutS: 0,             // searchlight glare on the lens
  };
}

export function zoomMag(cam) {
  return ZOOMS[cam.zoom]?.mag ?? 1;
}

/** stick = {x, y} in -1..1; y positive moves the aim up-screen (north, +z). */
export function stepTvAim(cam, stick, dt) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  const rate = AIM_RATE / zoomMag(cam);
  cam.x = clamp(cam.x + (Number(stick?.x) || 0) * rate * step, -YARD_HALF, YARD_HALF);
  cam.z = clamp(cam.z + (Number(stick?.y) || 0) * rate * step, -YARD_HALF, YARD_HALF);
  for (const key of Object.keys(cam.cool)) cam.cool[key] = Math.max(0, cam.cool[key] - step);
  cam.washoutS = Math.max(0, cam.washoutS - step);
  return cam;
}

export function cycleZoom(cam) {
  cam.zoom = (cam.zoom + 1) % ZOOMS.length;
  return cam;
}

/**
 * 2D soft lock: the nearest alive BAD toy within the snap radius (tighter when
 * zoomed, so close zoom is precise). Friendlies never lock — the chunky
 * crosshair only glues itself to bad toys.
 */
export function softLock(cam, toys) {
  const r = LOCK_R * (2 - 1 / zoomMag(cam));
  let best = null;
  let bestD = Infinity;
  for (const toy of toys ?? []) {
    if (!toy || toy.state !== "alive" || toy.team !== "bad") continue;
    const d = Math.hypot(toy.x - cam.x, toy.z - cam.z);
    if (d <= r && d < bestD) { bestD = d; best = toy; }
  }
  return best;
}

let roundSeq = 0;
export function resetRoundIds() { roundSeq = 0; }

/**
 * Fire the given gun at the aim point (snapped to the soft lock if one holds).
 * Returns the round in flight, or null while that gun reloads.
 */
export function fireGun(cam, gunId, toys, now) {
  const gun = GUNS[gunId];
  if (!gun || cam.cool[gunId] > 0) return null;
  cam.cool[gunId] = gun.cooldownS;
  cam.shots += 1;
  const lock = gunId === "dart" ? softLock(cam, toys) : null;
  return {
    id: `round-${(roundSeq += 1)}`,
    gun: gunId,
    x: lock ? lock.x : cam.x,
    z: lock ? lock.z : cam.z,
    firedAt: now,
    impactAt: now + gun.delayS,
  };
}

/** Advance rounds; returns those that impact this step (and drops them). */
export function stepRounds(rounds, now) {
  const impacts = [];
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    if (now >= rounds[i].impactAt) {
      impacts.push(rounds[i]);
      rounds.splice(i, 1);
    }
  }
  return impacts;
}

/** Printed X (confetti) → standard-mapping index; SNES pads swap both pairs. */
export function faceIndexX(id) {
  return padKind(String(id ?? "")) === "sn30" ? 3 : 2;
}

/**
 * Gunner pad read: left stick aims (y up = up-screen), printed A = dart,
 * printed B = balloon, printed X = confetti, RB cycles zoom. Same TV deadzone
 * family as the flight pad; edges are one frame.
 */
export function readTvPad(pad, prev = {}) {
  if (!pad || pad.connected === false) {
    return {connected: false, x: 0, y: 0, dartDown: false, balloonDown: false, confettiDown: false,
      zoomDown: false, startDown: false, dartEdge: false, balloonEdge: false, confettiEdge: false,
      zoomEdge: false, startEdge: false, touched: false};
  }
  const id = String(pad.id || "");
  const value = (i) => {
    const b = pad.buttons?.[i];
    if (!b) return 0;
    return Math.max(b.pressed === true ? 1 : 0, Number(b.value) || 0);
  };
  const dx = (value(15) > 0.5 ? 1 : 0) - (value(14) > 0.5 ? 1 : 0);
  const dy = (value(12) > 0.5 ? 1 : 0) - (value(13) > 0.5 ? 1 : 0);
  const x = tvStick(pad.axes?.[0]) || dx;
  const y = -(tvStick(pad.axes?.[1]) || 0) || dy;
  const dartDown = value(faceIndex(id, "A")) > 0.5;
  const balloonDown = value(faceIndex(id, "B")) > 0.5;
  const confettiDown = value(faceIndexX(id)) > 0.5;
  const zoomDown = value(5) > 0.5;
  const startDown = value(9) > 0.5;
  return {
    connected: true,
    x, y,
    dartDown, balloonDown, confettiDown, zoomDown, startDown,
    dartEdge: dartDown && prev.dartDown !== true,
    balloonEdge: balloonDown && prev.balloonDown !== true,
    confettiEdge: confettiDown && prev.confettiDown !== true,
    zoomEdge: zoomDown && prev.zoomDown !== true,
    startEdge: startDown && prev.startDown !== true,
    touched: Math.abs(x) + Math.abs(y) > 0.1 || dartDown || balloonDown || confettiDown || startDown,
  };
}
