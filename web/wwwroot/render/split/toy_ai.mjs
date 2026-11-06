// One command shape per toy, same fields a pad produces. The session steps
// the body either way. Behaviours stay distinct on purpose.

function wrap(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function nearest(craft, foes) {
  let best = null;
  let bestD = Infinity;
  for (const foe of foes ?? []) {
    const d = Math.hypot(foe.x - craft.x, foe.z - craft.z);
    if (d < bestD) {
      bestD = d;
      best = foe;
    }
  }
  return {foe: best, dist: bestD};
}

// Aviation rudder sign (airplane.mjs): rudder+ is nose RIGHT, which in this
// frame is heading decreasing — so closing a positive heading error needs
// negative rudder.
function steer(craft, foe, limit = 1) {
  if (!foe) return {rudder: 0, err: 0};
  const want = Math.atan2(foe.x - craft.x, foe.z - craft.z);
  const err = wrap(want - craft.heading);
  return {rudder: Math.max(-limit, Math.min(limit, -err * 1.4)), err};
}

function holdHeight(craft, want, pitch = 0.8) {
  const err = want - craft.y;
  return Math.max(-pitch, Math.min(pitch, err * 0.15));
}

const IDLE = {pitch: 0, roll: 0, rudder: 0, throttleRate: 0, dartEdge: false, balloonEdge: false};

export function aiCommand(craft, foes, dt) {
  const step = Math.max(0, Number(dt) || 0);
  const ai = craft.ai || (craft.ai = {t: 0, phase: "run", open: false, lid: true, telegraph: 0, orbit: 0});
  ai.t = (ai.t || 0) + step;
  const id = craft.kindId;
  const {foe, dist} = nearest(craft, foes);
  if (id === "wind-up-robot") {
    if (ai.phase !== "wind" && ai.t > 1.4) {
      ai.phase = "wind";
      ai.t = 0;
    } else if (ai.phase === "wind" && ai.t > 0.5) {
      ai.phase = "run";
      ai.t = 0;
      craft.heading += Math.PI / 2;
    }
    return {...IDLE, throttleRate: ai.phase === "wind" ? -1 : 1, pitch: holdHeight(craft, 6)};
  }
  if (id === "jack-in-the-box") {
    if (!ai.open && ai.t > 2.4) {
      ai.open = true;
      ai.t = 0;
    } else if (ai.open && ai.t > 0.85) {
      ai.open = false;
      ai.t = 0;
    }
    const turn = ai.open ? steer(craft, foe, 1) : {rudder: 0};
    return {...IDLE, ...turn, throttleRate: ai.open ? 1 : -1, pitch: holdHeight(craft, ai.open ? 5 : 1.2)};
  }
  if (id === "rubber-band-sniper") {
    ai.telegraph = (ai.telegraph || 0) + step;
    ai.stretching = ai.telegraph > 0.35 && ai.telegraph < 0.8;
    let throttleRate = 0;
    let rudder = 0.4;
    if (dist < 14) {
      throttleRate = -1;
      rudder = foe ? -steer(craft, foe).rudder : 0;
    } else if (dist > 34) {
      throttleRate = 1;
      rudder = steer(craft, foe, 0.8).rudder;
    }
    const wants = ai.telegraph >= 0.8 && dist > 16 && dist < 42;
    if (wants) ai.telegraph = 0;
    return {...IDLE, rudder, throttleRate, pitch: holdHeight(craft, 9), dartEdge: wants};
  }
  if (id === "evil-teddy") {
    return {...IDLE, ...steer(craft, foe, 0.7), throttleRate: 1, pitch: holdHeight(craft, 4)};
  }
  if (id === "plastic-dinosaur") {
    if (ai.phase !== "pause" && ai.t > 1.2) {
      ai.phase = "pause";
      ai.t = 0;
    } else if (ai.phase === "pause" && ai.t > 0.7) {
      ai.phase = "run";
      ai.t = 0;
    }
    const pausing = ai.phase === "pause";
    const turn = pausing ? {rudder: 0} : steer(craft, foe, 0.32);
    return {...IDLE, ...turn, throttleRate: pausing ? -1 : 1, pitch: holdHeight(craft, 3.5)};
  }
  if (id === "rc-car-gang") {
    const lane = (craft.slot - 1) * 3;
    const aim = foe ? {x: foe.x + lane, z: foe.z} : null;
    const want = aim ? Math.atan2(aim.x - craft.x, aim.z - craft.z) : craft.heading;
    const rudder = Math.max(-1, Math.min(1, -wrap(want - craft.heading) * 1.6));
    return {...IDLE, rudder, throttleRate: 1, pitch: holdHeight(craft, 1.6)};
  }
  if (id === "balloon-animal-blimp") {
    return {...IDLE, rudder: 0.25, throttleRate: craft.lever < 0.25 ? 0.4 : 0, pitch: holdHeight(craft, 14, 0.5)};
  }
  if (id === "tin-soldier-wrong-colour") {
    const column = (craft.slot - 1) * 4;
    const want = Math.atan2(column - craft.x, 18 - craft.z);
    const rudder = Math.max(-0.6, Math.min(0.6, -wrap(want - craft.heading)));
    return {...IDLE, rudder, throttleRate: 0.6, pitch: holdHeight(craft, 6)};
  }
  if (id === "spinning-top-swarm") {
    if (ai.phase !== "wobble" && ai.t > 2) {
      ai.phase = "wobble";
      ai.t = 0;
    } else if (ai.phase === "wobble" && ai.t > 0.6) {
      ai.phase = "spin";
      ai.t = 0;
    }
    return {...IDLE, pitch: holdHeight(craft, 3)};
  }
  if (id === "toy-chest-boss") {
    if (ai.lid && ai.t > 3) {
      ai.lid = false;
      ai.t = 0;
      ai.spit = true;
    } else if (!ai.lid && ai.t > 1.4) {
      ai.lid = true;
      ai.t = 0;
    }
    return {...IDLE, throttleRate: 0, pitch: holdHeight(craft, 8, 0.4)};
  }
  return {...IDLE, ...steer(craft, foe), throttleRate: 0.5, pitch: holdHeight(craft, 6)};
}
