// Juice: hit-stop, screen hit markers, rumble descriptors, confetti. Pure —
// the view spends these, gamepad.vibrationActuator plays the descriptors.

export const HITSTOP = Object.freeze({small: 0.035, big: 0.09, scale: 0.12});

export function createJuice() {
  return {hitstopS: 0, markers: [], confetti: [], seq: 0};
}

/** Returns the time scale for this frame (world slows during hit-stop; UI never does). */
export function stepJuice(juice, dt) {
  const step = Math.max(0, Number(dt) || 0);
  juice.hitstopS = Math.max(0, juice.hitstopS - step);
  juice.markers = juice.markers.filter((m) => (m.ttl -= step) > 0);
  for (const c of juice.confetti) {
    c.ttl -= step;
    c.x += c.vx * step;
    c.y += c.vy * step;
    c.vy -= 3.5 * step;
    c.spin += c.vspin * step;
  }
  juice.confetti = juice.confetti.filter((c) => c.ttl > 0);
  return juice.hitstopS > 0 ? HITSTOP.scale : 1;
}

/** A confirmed hit: marker at screen point (0..1), hit-stop sized to the pop. */
export function addHit(juice, {big = false, sx = 0.5, sy = 0.5, friendly = false} = {}) {
  juice.hitstopS = Math.max(juice.hitstopS, big ? HITSTOP.big : HITSTOP.small);
  juice.markers.push({id: (juice.seq += 1), sx, sy, big, friendly, ttl: 0.4});
  return juice;
}

/** Descriptor for gamepad.vibrationActuator.playEffect("dual-rumble", ...). */
export function rumblePulse(big = false, friendly = false) {
  if (friendly) return {duration: 120, strongMagnitude: 0.2, weakMagnitude: 0.5};
  return big
    ? {duration: 180, strongMagnitude: 0.9, weakMagnitude: 0.6}
    : {duration: 70, strongMagnitude: 0.4, weakMagnitude: 0.8};
}

export function confettiBurst(juice, n = 40, origin = {x: 0.5, y: 0.5}) {
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const v = 0.3 + Math.random() * 0.8;
    juice.confetti.push({
      id: (juice.seq += 1),
      x: origin.x, y: origin.y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v + 0.9,
      spin: Math.random() * Math.PI, vspin: (Math.random() - 0.5) * 12,
      hue: Math.floor(Math.random() * 360),
      ttl: 1.6 + Math.random() * 1.2,
    });
  }
  return juice;
}
