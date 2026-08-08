/**
 * Rear-seat camera target cueing + F-22-coherent Tab/V padlock helpers.
 *
 * F-22 contract (app.js / player_gun_target.js):
 *  - Tab changes the persistent weapon/gunner target selection.
 *  - V toggles the padlock *view* on that selection — it does not invent a target.
 *  - Forward view is nose-forward; padlock is a true look-at the selected mark.
 *
 * Soft bias (±COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD) remains available for optional cueing, but
 * the Hold-the-Bridge eye no longer treats the clamped lean as a padlock substitute:
 * Build 267 capped cueing so hard it felt like V was broken.
 */

export const COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD = 0.05;

function wrapPi(angleRad) {
  return Math.atan2(Math.sin(angleRad), Math.cos(angleRad));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lookAnglesFromOffset(x, y, z) {
  return {
    yawRad: Math.atan2(x, -z),
    pitchRad: Math.atan2(y, Math.hypot(x, z)),
  };
}

export function lookOffsetFromAngles(yawRad, pitchRad, distanceM) {
  const horizontal = Math.cos(pitchRad) * distanceM;
  return {
    x: Math.sin(yawRad) * horizontal,
    y: Math.sin(pitchRad) * distanceM,
    z: -Math.cos(yawRad) * horizontal,
  };
}

/**
 * Rotate from `base` toward `desired` by at most ±limitRad on each axis. Yaw is wrap-aware, so
 * a cue across ±π still takes the short way and still respects the cap.
 */
export function clampInducedLookRotation(
  base,
  desired,
  limitRad = COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD,
) {
  const yawDelta = clamp(wrapPi(desired.yawRad - base.yawRad), -limitRad, limitRad);
  const pitchDelta = clamp(desired.pitchRad - base.pitchRad, -limitRad, limitRad);
  return {
    yawRad: wrapPi(base.yawRad + yawDelta),
    pitchRad: base.pitchRad + pitchDelta,
  };
}

/**
 * Tab: advance the hostile list. First press from no selection lands on the preferred
 * (seam-first) mark; subsequent presses cycle. Returns null when nothing is alive.
 */
export function nextHostileTargetId(hostileTargetIds, currentId = null) {
  const ids = Array.isArray(hostileTargetIds) ? hostileTargetIds.filter(Boolean) : [];
  if (!ids.length) return null;
  const index = currentId ? ids.indexOf(currentId) : -1;
  if (index < 0) return ids[0];
  return ids[(index + 1) % ids.length];
}

/**
 * V: toggle padlock view. Turning ON without a selection adopts the preferred hostile
 * (same first mark Tab would pick). Turning OFF keeps the selection — V is a view toggle.
 */
export function togglePadlockSelection({
  padlockActive = false,
  selectedTargetId = null,
  hostileTargetIds = [],
} = {}) {
  if (padlockActive) {
    return Object.freeze({
      padlockActive: false,
      selectedTargetId: selectedTargetId || null,
    });
  }
  const selected = selectedTargetId || nextHostileTargetId(hostileTargetIds, null);
  if (!selected) {
    return Object.freeze({
      padlockActive: false,
      selectedTargetId: null,
    });
  }
  return Object.freeze({
    padlockActive: true,
    selectedTargetId: selected,
  });
}

/**
 * Resolve the eye look-at point. Padlock owns a true look-at; forward view stays nose-forward
 * (no soft target lean — that was the broken "almost padlock" substitute).
 */
export function resolveAuthorityLookAtPoint({
  padlockActive = false,
  selectedUnit = null,
  forwardLook = null,
} = {}) {
  if (padlockActive && selectedUnit) {
    return Object.freeze({
      x: Number(selectedUnit.x_m) || 0,
      y: (Number(selectedUnit.y_m) || 0) + 1.2,
      z: -(Number(selectedUnit.z_m) || 0),
      mode: "padlock",
    });
  }
  return Object.freeze({
    x: Number(forwardLook?.x) || 0,
    y: Number(forwardLook?.y) || 0,
    z: Number(forwardLook?.z) || 0,
    mode: "forward",
  });
}
