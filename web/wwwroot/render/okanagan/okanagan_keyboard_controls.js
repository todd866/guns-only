const AXES = Object.freeze({
  ArrowDown: [0, 1], ArrowUp: [0, -1],
  ArrowRight: [1, 1], ArrowLeft: [1, -1],
  KeyD: [2, 1], KeyA: [2, -1],
});

/** Track real keyboard edges without replaying a press already flown by the authority. */
export function createOkanaganKeyboardControls() {
  const presses = new Map();
  return Object.freeze({
    down(code, nowMs) {
      if (AXES[code] && !presses.has(code)) presses.set(code, { nowMs, sampled: false });
    },
    up(code, nowMs) {
      const press = presses.get(code);
      presses.delete(code);
      if (!press || press.sampled) return null;
      const [axis, direction] = AXES[code];
      return { axis, direction, durationSeconds: Math.min(0.1, Math.max(0, nowMs - press.nowMs) / 1000) };
    },
    applied(ticks) {
      if (ticks > 0) for (const press of presses.values()) press.sampled = true;
    },
    clear() { presses.clear(); },
  });
}
