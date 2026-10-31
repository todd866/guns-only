export const PORTAL_ENTRIES = Object.freeze([
  {id: 'base', position: [2530, 0, -1200], destination: [10000, 0, 212]},
  {id: 'alien', position: [10000, 0, 200], destination: [2530, 0, -1188]}
]);

const distance = (a, b) => Math.hypot((a?.[0] ?? Infinity) - b[0], (a?.[2] ?? Infinity) - b[2]);

// Pure state transition. The caller owns state persistence and applies the returned
// destination/fade; no scene, car, or input mutation happens here.
export function portalTransition(state = {}, position, unlockInput = false, now = 0, radius = 3) {
  const current = {latch: state.latch ?? null, cooldownUntil: Number(state.cooldownUntil) || 0};
  const time = Number.isFinite(now) ? now : 0;
  const near = PORTAL_ENTRIES.find(
    entry =>
      distance(position, entry.position) <= radius &&
      Math.abs((position?.[1] ?? Infinity) - entry.position[1]) <= 5
  );
  if (!near) {
    if (time >= current.cooldownUntil) current.latch = null;
    return {state: current, transition: null};
  }
  if (!unlockInput || time < current.cooldownUntil || current.latch === near.id)
    return {state: current, transition: null};
  current.latch = near.id;
  current.cooldownUntil = time + 1.2;
  return {
    state: current,
    transition: {from: near.id, to: near.id === 'base' ? 'alien' : 'base', position: [...near.destination]}
  };
}

export function createPortalTransition(options = {}) {
  let state = {};
  const radius = options.radius ?? 3;
  return Object.freeze({
    step(position, unlockInput = false, now = 0) {
      const result = portalTransition(state, position, unlockInput, now, radius);
      state = result.state;
      return result.transition;
    },
    reset() {
      state = {};
    },
    getState() {
      return {...state};
    }
  });
}
