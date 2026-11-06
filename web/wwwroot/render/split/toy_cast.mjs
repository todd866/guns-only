// Split-screen cast uses the toy-pass gallery so the beats match the rest of
// the game. `beat` is a tooltip.

import {BAD_GUYS, GOOD_GUYS} from "../toy/toy_pass.js";

const BALLOONS = Object.freeze({
  "wind-up-robot": 1,
  "jack-in-the-box": 1,
  "rubber-band-sniper": 1,
  "evil-teddy": 1,
  "plastic-dinosaur": 1,
  "rc-car-gang": 1,
  "balloon-animal-blimp": 1,
  "tin-soldier-wrong-colour": 1,
  "spinning-top-swarm": 1,
  "toy-chest-boss": 5,
});

const COUNTS = Object.freeze({
  "rc-car-gang": 3,
  "tin-soldier-wrong-colour": 3,
  "spinning-top-swarm": 4,
});

const NAMES = Object.freeze({
  "wind-up-robot": "Wind-up",
  "jack-in-the-box": "Jack",
  "rubber-band-sniper": "Sniper",
  "evil-teddy": "Teddy",
  "plastic-dinosaur": "Dino",
  "rc-car-gang": "RC cars",
  "balloon-animal-blimp": "Blimp",
  "tin-soldier-wrong-colour": "Tin soldier",
  "spinning-top-swarm": "Tops",
  "toy-chest-boss": "Toy chest",
});

function hex(color) {
  return `#${(Number(color) >>> 0).toString(16).padStart(6, "0").slice(-6)}`;
}

export const ARMY_COLOR = hex(GOOD_GUYS[0].color);

export const CAST = Object.freeze(BAD_GUYS.map((guy) => Object.freeze({
  id: guy.id,
  name: NAMES[guy.id] ?? guy.id,
  color: hex(guy.color),
  balloons: BALLOONS[guy.id] ?? 1,
  count: COUNTS[guy.id] ?? 1,
  beat: guy.beat,
  behaviour: guy.behaviour,
  look: guy.look,
})));

export function castById(id) {
  return CAST.find((entry) => entry.id === id) ?? null;
}

export function castAt(index) {
  if (!CAST.length) return null;
  const i = Math.max(0, Math.trunc(Number(index) || 0));
  return CAST[Math.min(i, CAST.length - 1)];
}

/** True when this shot matches that toy's published way to beat it. */
export function hitAccepted(target, shot, shooter) {
  const id = target?.kindId;
  if (!id || id === "army") return true;
  const weapon = shot?.weapon;
  if (id === "wind-up-robot") return target.ai?.phase === "wind";
  if (id === "jack-in-the-box") return true;
  if (id === "rubber-band-sniper") return target.ai?.stretching === true;
  if (id === "evil-teddy" || id === "rc-car-gang") return weapon === "balloon";
  if (id === "plastic-dinosaur") return target.ai?.phase === "pause";
  if (id === "balloon-animal-blimp") return true;
  if (id === "tin-soldier-wrong-colour") return hatBonk(target, shooter);
  if (id === "spinning-top-swarm") return target.ai?.phase === "wobble" && weapon === "dart";
  if (id === "toy-chest-boss") return weapon === "balloon";
  return true;
}

/** A hit on the tall hat: the toy is below the one throwing. */
export function hatBonk(target, shooter) {
  if (!shooter) return false;
  return Number(shooter.y) > Number(target?.y) + 1.2;
}
