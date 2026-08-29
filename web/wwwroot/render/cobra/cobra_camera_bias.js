/**
 * Rear-seat camera target cueing + F-22-coherent Tab/V padlock helpers.
 *
 * F-22 contract (app.js / player_gun_target.js):
 *  - Tab changes the persistent weapon/gunner target selection.
 *  - V toggles a visual-lock view, preferring that selection and accepting only an authority-LOS
 *    living hostile; the atomically accepted ID becomes the gunner target.
 *  - Forward view is nose-forward; padlock is a true look-at the selected mark.
 *
 * Soft bias (±COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD) remains available for optional cueing, but
 * the Hold-the-Bridge eye no longer treats the clamped lean as a padlock substitute:
 * Build 267 capped cueing so hard it felt like V was broken.
 */

export const COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD = 0.05;
// View-only grace: the authority sight refreshes at 10 Hz, so 350 ms tolerates two missed
// samples/a momentary leaf-edge mask without letting V stare through a ridge indefinitely.
export const COBRA_PADLOCK_LOS_GRACE_MS = 350;

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
 * Ask authority for a visual lock without ever first presenting an omniscient target. The
 * current Tab mark gets first refusal; if it is masked, V walks the remaining living-hostile
 * IDs in their established cycle order. `tryAcquire` must atomically validate LOS and assign the
 * same ID to the gunner (CobraWebBridge.TrySetVisualLockTarget in production).
 */
export function acquireAuthorityVisualLockTarget({
  selectedTargetId = null,
  hostileTargetIds = [],
  tryAcquire = null,
} = {}) {
  if (typeof tryAcquire !== "function") return null;
  const ids = [...new Set(
    (Array.isArray(hostileTargetIds) ? hostileTargetIds : [])
      .filter((id) => typeof id === "string" && id.length > 0),
  )];
  if (!ids.length) return null;
  const selectedIndex = selectedTargetId ? ids.indexOf(selectedTargetId) : -1;
  const ordered = selectedIndex < 0
    ? ids
    : [ids[selectedIndex], ...ids.slice(selectedIndex + 1), ...ids.slice(0, selectedIndex)];
  for (const targetId of ordered) {
    if (tryAcquire(targetId) === true) return targetId;
  }
  return null;
}

/**
 * Preserve a visual track through a momentary authority LOS dropout, then return to the honest
 * nose-forward view if the selected gunner target remains masked. Target selection itself stays
 * intact, so the gunner HUD can continue to say MASKED and F remains safely inhibited.
 */
export function advancePadlockLosGrace({
  padlockActive = false,
  lockedTargetId = null,
  gunner = null,
  maskedSinceMs = null,
  nowMs = 0,
  graceMs = COBRA_PADLOCK_LOS_GRACE_MS,
} = {}) {
  const now = Number(nowMs);
  const grace = Number(graceMs);
  if (!padlockActive || !lockedTargetId || !Number.isFinite(now)
    || !Number.isFinite(grace) || grace < 0) {
    return Object.freeze({ padlockActive: false, maskedSinceMs: null });
  }
  // A newly acquired bridge target can precede the next 30 Hz state snapshot. A mismatched
  // snapshot is stale, not evidence that the new target is masked.
  const sameAuthorityTarget = gunner?.selected_target_id === lockedTargetId;
  const masked = sameAuthorityTarget && (
    gunner?.state === "masked"
    || gunner?.reason === "Masked"
    || gunner?.target_has_line_of_sight === false
  );
  if (!masked) {
    return Object.freeze({ padlockActive: true, maskedSinceMs: null });
  }
  const since = maskedSinceMs !== null && Number.isFinite(Number(maskedSinceMs))
    ? Number(maskedSinceMs)
    : now;
  return Object.freeze({
    padlockActive: now - since < grace,
    maskedSinceMs: now - since < grace ? since : null,
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
    const publishedAimY = Number(selectedUnit.aim_y_m);
    return Object.freeze({
      x: Number(selectedUnit.x_m) || 0,
      y: Number.isFinite(publishedAimY)
        ? publishedAimY
        : (Number(selectedUnit.y_m) || 0) + 1.2,
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
