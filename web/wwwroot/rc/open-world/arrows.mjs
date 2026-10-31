// Electric toy arrows. Positions are [x, y, z]; heading is yaw in radians (0 faces -z).
// No rendering or world mutations here: the caller turns hit events into stuns.
const SPEED = 24,
  RANGE = 25,
  CONE = Math.cos((35 * Math.PI) / 180),
  FLIGHT = 30 / SPEED,
  DROP = 0.6;
const valid = t => t.alive && t.pos?.length === 3 && t.pos.every(Number.isFinite);

export function createArrows() {
  return {arrows: [], cooldown: 0, nextId: 0};
}

/** Loose from the saddle; return the arrow, or null during the 0.6 s cooldown. */
export function loose(state, {from, heading, targets = []}) {
  if (state.cooldown > 1e-8) return null;
  const forward = [Math.sin(heading), 0, -Math.cos(heading)];
  let lock = null,
    nearest = Infinity;
  for (const target of targets) {
    if (!valid(target)) continue;
    const dx = target.pos[0] - from[0],
      dz = target.pos[2] - from[2],
      flat = Math.hypot(dx, dz),
      distance = Math.hypot(dx, target.pos[1] - from[1], dz);
    if (
      distance <= RANGE &&
      distance < nearest &&
      (flat < 1e-8 || (dx * forward[0] + dz * forward[2]) / flat >= CONE - 1e-8)
    ) {
      lock = target;
      nearest = distance;
    }
  }
  const arrow = {
    id: state.nextId++,
    from: [...from],
    pos: [...from],
    direction: forward,
    control: from.map((v, i) => v + forward[i] * Math.min(8, nearest * 0.5)),
    target: lock?.id ?? null,
    duration: lock ? Math.max(0.18, nearest / SPEED) : FLIGHT + DROP,
    age: 0
  };
  state.arrows.push(arrow);
  state.cooldown = 0.6;
  return arrow;
}

/** Advance once; removed arrows emit exactly one {hit, at} or {miss} event. */
export function stepArrows(state, dt, targets = []) {
  if (!Number.isFinite(dt) || dt <= 0) return [];
  state.cooldown = Math.max(0, state.cooldown - dt);
  const events = [],
    live = new Map(targets.filter(valid).map(t => [t.id, t]));
  state.arrows = state.arrows.filter(arrow => {
    arrow.age += dt;
    const before = arrow.pos;
    if (arrow.target != null) {
      const target = live.get(arrow.target);
      if (!target) {
        events.push({miss: true});
        return false;
      }
      // A guided quadratic arc starts along the mount's heading and gently bends to the live
      // endpoint. A fixed arrival time guarantees the lock even when a steer shies away; no
      // pursuit orbit, overshoot or distance timeout can turn an acquired live target into a miss.
      const t = Math.min(1, arrow.age / arrow.duration),
        u = 1 - t;
      arrow.pos = arrow.from.map((v, i) => u * u * v + 2 * u * t * arrow.control[i] + t * t * target.pos[i]);
      if (t === 1) {
        events.push({hit: target.id, at: [...target.pos]});
        return false;
      }
    } else {
      const fall = Math.max(0, arrow.age - FLIGHT),
        distance = SPEED * Math.min(FLIGHT, arrow.age) + SPEED * 0.2 * fall;
      arrow.pos = arrow.from.map((v, i) => v + arrow.direction[i] * distance);
      arrow.pos[1] = arrow.from[1] - 10 * fall * fall;
      if (arrow.age >= arrow.duration) {
        events.push({miss: true});
        return false;
      }
    }
    // Keep the launch direction separately: a falling arrow must not steer its own trajectory.
    const delta = arrow.pos.map((v, i) => v - before[i]),
      length = Math.hypot(...delta);
    if (length > 1e-8) arrow.tangent = delta.map(v => v / length);
    return true;
  });
  return events;
}
