const DEG = Math.PI / 180;
const MAX_EVENT_DELTA_RAD = 14 * DEG;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Normalize WheelEvent deltaMode without depending on the browser's WheelEvent globals. */
export function wheelDeltaPixels(event = {}, viewportHeight = 800) {
  const mode = Math.trunc(finite(event.deltaMode));
  const scale = mode === 1 ? 16 : mode === 2 ? Math.max(1, finite(viewportHeight, 800)) : 1;
  return {
    x: finite(event.deltaX) * scale,
    y: finite(event.deltaY) * scale,
  };
}

/**
 * macOS natural-scroll deltas describe viewport motion, which is opposite the physical two-finger
 * drag on the horizontal axis. These signs make the virtual head follow the fingers: drag left to
 * look left and drag upward to look up. Per-event caps keep a mouse wheel notch or delayed batch
 * from becoming an accidental snap view.
 */
export function trackpadLookDelta(event = {}, viewportHeight = 800) {
  const pixels = wheelDeltaPixels(event, viewportHeight);
  return {
    yawRad: clamp(-pixels.x * 0.0018, -MAX_EVENT_DELTA_RAD, MAX_EVENT_DELTA_RAD),
    pitchRad: clamp(pixels.y * 0.00165, -MAX_EVENT_DELTA_RAD, MAX_EVENT_DELTA_RAD),
  };
}

export function applyLookDelta({ yawRad = 0, pitchRad = 0 } = {}, delta = {}, limits = {}) {
  const yawLimit = Math.max(0, finite(limits.yawRad, 165 * DEG));
  const pitchLimit = Math.max(0, finite(limits.pitchRad, 88 * DEG));
  return {
    yawRad: clamp(finite(yawRad) + finite(delta.yawRad), -yawLimit, yawLimit),
    pitchRad: clamp(finite(pitchRad) + finite(delta.pitchRad), -pitchLimit, pitchLimit),
  };
}
