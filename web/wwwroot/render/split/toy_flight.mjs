// Toy-scale flyer for two pads. The production kernel is one human seat
// (WebBridge.Session), so each toy here is its own body stepped with the same
// command: pitch, roll, rudder, throttle. A pad command replaces the AI
// command; the integrator does not change. This is not the F-22 polar and
// must not be tuned against one.

export const WORLD = Object.freeze({half: 42, floor: 0.8, ceiling: 26});

export const ASSIST = Object.freeze({cone: 0.48, range: 36, blend: 0.74});

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export function noseOf(craft) {
  const pitch = Number(craft.pitch) || 0;
  const heading = Number(craft.heading) || 0;
  const cp = Math.cos(pitch);
  return {
    x: Math.sin(heading) * cp,
    y: Math.sin(pitch),
    z: Math.cos(heading) * cp,
  };
}

function norm(v) {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return {x: v.x / m, y: v.y / m, z: v.z / m};
}

/** Pull the nose toward the nearest foe inside a wide cone. Outside the cone, no help. */
export function assistDirection(from, dir, targets, opts = ASSIST) {
  const cone = opts.cone ?? ASSIST.cone;
  const range = opts.range ?? ASSIST.range;
  const blend = opts.blend ?? ASSIST.blend;
  let best = null;
  let bestDist = Infinity;
  for (const target of targets ?? []) {
    if (!target) continue;
    const dx = target.x - from.x;
    const dy = (target.y ?? 0) - (from.y ?? 0);
    const dz = target.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.4 || dist > range) continue;
    const aim = {x: dx / dist, y: dy / dist, z: dz / dist};
    const dot = clamp(aim.x * dir.x + aim.y * dir.y + aim.z * dir.z, -1, 1);
    if (Math.acos(dot) > cone) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = aim;
    }
  }
  if (!best) return dir;
  return norm({
    x: dir.x * (1 - blend) + best.x * blend,
    y: dir.y * (1 - blend) + best.y * blend,
    z: dir.z * (1 - blend) + best.z * blend,
  });
}

function contain(craft) {
  if (craft.x > WORLD.half || craft.x < -WORLD.half) {
    craft.x = clamp(craft.x, -WORLD.half, WORLD.half);
    craft.heading = Math.PI - craft.heading;
  }
  if (craft.z > WORLD.half || craft.z < -WORLD.half) {
    craft.z = clamp(craft.z, -WORLD.half, WORLD.half);
    craft.heading = -craft.heading;
  }
  if (craft.y < WORLD.floor) {
    craft.y = WORLD.floor;
    craft.vy = Math.max(0, Number(craft.vy) || 0);
    if ((craft.pitch || 0) < 0.05) craft.pitch = 0.05;
  }
  if (craft.y > WORLD.ceiling) {
    craft.y = WORLD.ceiling;
    craft.vy = Math.min(0, Number(craft.vy) || 0);
    craft.pitch = Math.min(craft.pitch || 0, -0.02);
  }
}

function stepJet(craft, cmd, dt) {
  const pitchIn = Number(cmd.pitch) || 0;
  const rollIn = Number(cmd.roll) || 0;
  const rudder = Number(cmd.rudder) || 0;
  craft.pitch = clamp(craft.pitch + pitchIn * 1.15 * dt, -0.6, 0.85);
  craft.bank = clamp(craft.bank + rollIn * 2 * dt, -1.15, 1.15);
  if (Math.abs(rollIn) < 0.08) craft.bank *= Math.exp(-1.4 * dt);
  craft.heading += (rudder * 1.05 + Math.sin(craft.bank) * 0.85) * dt;
  const target = 7 + craft.lever * 11;
  craft.speed += (target - craft.speed) * (1 - Math.exp(-1.6 * dt));
  const cp = Math.cos(craft.pitch);
  craft.x += Math.sin(craft.heading) * cp * craft.speed * dt;
  craft.z += Math.cos(craft.heading) * cp * craft.speed * dt;
  craft.y += Math.sin(craft.pitch) * craft.speed * dt;
  craft.vy = Math.sin(craft.pitch) * craft.speed;
}

function stepChopper(craft, cmd, dt) {
  const pitchIn = Number(cmd.pitch) || 0;
  const rollIn = Number(cmd.roll) || 0;
  const rudder = Number(cmd.rudder) || 0;
  craft.pitch = clamp(craft.pitch + pitchIn * 0.9 * dt - craft.pitch * 0.8 * dt, -0.45, 0.45);
  craft.bank = clamp(craft.bank + rollIn * 1.1 * dt - craft.bank * 0.8 * dt, -0.5, 0.5);
  craft.heading += rudder * 1.3 * dt;
  const climb = (craft.lever - 0.5) * 8;
  craft.vy += (climb - (Number(craft.vy) || 0)) * (1 - Math.exp(-3 * dt));
  craft.y += craft.vy * dt;
  const slide = 14 * dt;
  craft.x += (Math.sin(craft.heading) * -craft.pitch + Math.cos(craft.heading) * craft.bank) * slide;
  craft.z += (Math.cos(craft.heading) * -craft.pitch - Math.sin(craft.heading) * craft.bank) * slide;
  craft.speed = Math.hypot(craft.vy, craft.pitch * 14, craft.bank * 14);
  craft.rotor = (Number(craft.rotor) || 0) + dt * (8 + craft.lever * 18);
}

function stepTop(craft, dt) {
  const ai = craft.ai || (craft.ai = {orbit: 0});
  ai.orbit = (Number(ai.orbit) || 0) + dt * 1.8;
  const radius = 8 + (craft.slot || 0) * 1.4;
  craft.x = Math.cos(ai.orbit + craft.slot) * radius;
  craft.z = Math.sin(ai.orbit + craft.slot) * radius;
  craft.y = 3.2 + (craft.slot || 0) * 0.3;
  craft.heading = ai.orbit;
  craft.speed = radius * 1.8;
  craft.lever = 0.4;
}

/** Integrate one toy. `cmd.throttleRate` drives the lever in -1..1 per second. */
export function stepCraft(craft, cmd, dt) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  if (step === 0) return craft;
  craft.coolDart = Math.max(0, (craft.coolDart || 0) - step);
  craft.coolBalloon = Math.max(0, (craft.coolBalloon || 0) - step);
  craft.invuln = Math.max(0, (craft.invuln || 0) - step);
  craft.splat = Math.max(0, (craft.splat || 0) - step);
  craft.pop = Math.max(0, (craft.pop || 0) - step);
  const rate = Number(cmd?.throttleRate) || 0;
  craft.lever = clamp((Number(craft.lever) || 0) + rate * step * 0.95, 0, 1);
  if (craft.kindId === "spinning-top-swarm") stepTop(craft, step);
  else if (craft.kind === "chopper") stepChopper(craft, cmd || {}, step);
  else stepJet(craft, cmd || {}, step);
  if (craft.kindId !== "spinning-top-swarm") contain(craft);
  return craft;
}

export function craftRadius(kindId) {
  if (kindId === "spinning-top-swarm") return 0.55;
  if (kindId === "toy-chest-boss") return 2.2;
  if (kindId === "balloon-animal-blimp") return 1.8;
  if (kindId === "rc-car-gang") return 0.85;
  return 1.15;
}
