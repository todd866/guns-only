const DEG = Math.PI / 180;

export const PADLOCK_LIMITS = Object.freeze({
  yawRad: 165 * DEG,
  pitchRad: 88 * DEG,
  trackingYawRateRadPerSecond: 240 * DEG,
  trackingPitchRateRadPerSecond: 180 * DEG,
  returnYawRateRadPerSecond: 540 * DEG,
  returnPitchRateRadPerSecond: 420 * DEG,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function angleNearestReference(angle, reference) {
  return reference + wrapAngle(angle - reference);
}

function moveBounded(current, desired, deltaSeconds, gain, maximumRate) {
  const dt = clamp(finite(deltaSeconds), 0, 0.25);
  if (dt === 0) return current;
  const error = desired - current;
  const exponentialStep = error * (1 - Math.exp(-Math.max(0, gain) * dt));
  const maximumStep = Math.max(0, maximumRate) * dt;
  return current + clamp(exponentialStep, -maximumStep, maximumStep);
}

/**
 * Resolve a target vector expressed in the ownship frame used by three.js: +X right, +Y up,
 * -Z forward. Keeping yaw beside the current head angle prevents the +179/-179 six-o'clock whip.
 */
export function targetLookAngles(localTarget = {}, currentYawRad = 0) {
  const x = finite(localTarget.x);
  const y = finite(localTarget.y);
  const z = finite(localTarget.z, -1);
  const horizontal = Math.hypot(x, z);
  const rawYaw = horizontal < 0.02
    ? finite(currentYawRad)
    : Math.atan2(x, -z);
  return {
    yawRad: angleNearestReference(rawYaw, finite(currentYawRad)),
    pitchRad: Math.atan2(y, horizontal),
  };
}

/**
 * Keep some target displacement toward the ownship nose, but derive the maximum displacement from
 * the actual viewport FOV. A fixed fraction can place the target outside a portrait display or
 * dead-centre it on an ultrawide display, and neither result communicates nose-to-target geometry.
 */
export function desiredPadlockAngles(targetAngles = {}, {
  aspect = 16 / 9,
  verticalFovRad = 66 * DEG,
  limits = PADLOCK_LIMITS,
} = {}) {
  const targetYaw = finite(targetAngles.yawRad);
  const targetPitch = finite(targetAngles.pitchRad);
  const halfVerticalFov = clamp(finite(verticalFovRad, 66 * DEG) / 2, 10 * DEG, 70 * DEG);
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * Math.max(0.2, finite(aspect, 16 / 9)));
  const protectedYawOffset = clamp(halfHorizontalFov * 0.55, 8 * DEG, 30 * DEG);
  const protectedPitchOffset = clamp(halfVerticalFov * 0.48, 7 * DEG, 17 * DEG);
  const yawResidual = clamp(targetYaw * 0.20, -protectedYawOffset, protectedYawOffset);
  const pitchResidual = clamp(targetPitch * 0.20, -protectedPitchOffset, protectedPitchOffset);

  return {
    yawRad: clamp(targetYaw - yawResidual, -limits.yawRad, limits.yawRad),
    pitchRad: clamp(targetPitch - pitchResidual, -limits.pitchRad, limits.pitchRad),
    protectedYawOffsetRad: protectedYawOffset,
    protectedPitchOffsetRad: protectedPitchOffset,
  };
}

export function advancePadlockGimbal({
  localTarget,
  yawRad = 0,
  pitchRad = 0,
  deltaSeconds = 0,
  aspect = 16 / 9,
  verticalFovRad = 66 * DEG,
  returning = false,
  limits = PADLOCK_LIMITS,
} = {}) {
  let target = targetLookAngles(localTarget, yawRad);
  let desired = desiredPadlockAngles(target, { aspect, verticalFovRad, limits });
  let shoulderHandoff = false;
  // Preserve the chosen shoulder through the immediate +179/-179 crossing. If the target keeps
  // travelling around the far side, however, the unwrapped bearing eventually strands the gimbal
  // against +/-165 while the contact walks out of the protected view. Once clamping grows the
  // residual beyond the intended protected offset, deliberately reacquire via the other shoulder.
  const clampResidual = Math.abs(target.yawRad - desired.yawRad);
  if (Math.abs(target.yawRad) > Math.PI
      && clampResidual > desired.protectedYawOffsetRad + 0.5 * DEG) {
    target = targetLookAngles(localTarget, 0);
    desired = desiredPadlockAngles(target, { aspect, verticalFovRad, limits });
    shoulderHandoff = true;
  }
  const yawRate = returning
    ? limits.returnYawRateRadPerSecond
    : limits.trackingYawRateRadPerSecond;
  const pitchRate = returning
    ? limits.returnPitchRateRadPerSecond
    : limits.trackingPitchRateRadPerSecond;
  const nextYaw = moveBounded(yawRad, desired.yawRad, deltaSeconds, returning ? 24 : 12, yawRate);
  const nextPitch = moveBounded(pitchRad, desired.pitchRad, deltaSeconds, returning ? 24 : 12, pitchRate);
  return {
    yawRad: nextYaw,
    pitchRad: nextPitch,
    targetYawRad: target.yawRad,
    targetPitchRad: target.pitchRad,
    desiredYawRad: desired.yawRad,
    desiredPitchRad: desired.pitchRad,
    shoulderHandoff,
    trackingErrorRad: Math.max(
      Math.abs(desired.yawRad - nextYaw),
      Math.abs(desired.pitchRad - nextPitch),
    ),
  };
}

export function advanceForwardGimbal({
  yawRad = 0,
  pitchRad = 0,
  deltaSeconds = 0,
  limits = PADLOCK_LIMITS,
} = {}) {
  const nextYaw = moveBounded(
    yawRad, 0, deltaSeconds, 24, limits.returnYawRateRadPerSecond,
  );
  const nextPitch = moveBounded(
    pitchRad, 0, deltaSeconds, 24, limits.returnPitchRateRadPerSecond,
  );
  return {
    yawRad: Math.abs(nextYaw) < 0.0001 ? 0 : nextYaw,
    pitchRad: Math.abs(nextPitch) < 0.0001 ? 0 : nextPitch,
    trackingErrorRad: Math.max(Math.abs(nextYaw), Math.abs(nextPitch)),
  };
}

function screenDirection(cameraVector = {}, fallbackX = 1, fallbackY = 0) {
  let x = finite(cameraVector.x);
  let y = -finite(cameraVector.y);
  const magnitude = Math.hypot(x, y);
  if (magnitude < 0.015) {
    x = finite(fallbackX, 1);
    y = finite(fallbackY, 0);
  }
  const normalizedMagnitude = Math.max(1e-9, Math.hypot(x, y));
  return { x: x / normalizedMagnitude, y: y / normalizedMagnitude };
}

/**
 * Convert actual post-camera-motion body/world vectors into padlock-only SA. Inputs are camera-space
 * vectors (+X right, +Y up, -Z forward); outputs are normalized screen vectors (+Y down).
 */
export function padlockOrientationModel({
  noseCamera,
  liftCamera,
  worldUpCamera,
  sensorYawRad = 0,
  sensorPitchRad = 0,
} = {}) {
  const fallbackNoseX = sensorYawRad > 0 ? -1 : sensorYawRad < 0 ? 1 : 1;
  const fallbackNoseY = sensorPitchRad > 0 ? 1 : sensorPitchRad < 0 ? -1 : 0;
  const nose = screenDirection(noseCamera, fallbackNoseX, fallbackNoseY);
  const liftMagnitude = Math.hypot(
    finite(liftCamera?.x),
    finite(liftCamera?.y),
  );
  const lift = screenDirection(liftCamera, 0, -1);
  const worldUpMagnitude = Math.hypot(
    finite(worldUpCamera?.x),
    finite(worldUpCamera?.y),
  );
  const worldUp = screenDirection(worldUpCamera, 0, -1);
  const horizon = { x: -worldUp.y, y: worldUp.x };
  return {
    nose,
    lift,
    liftValid: liftMagnitude >= 0.035,
    worldUp,
    horizon,
    horizonValid: worldUpMagnitude >= 0.035,
    noseBehind: finite(noseCamera?.z) > 0,
  };
}

/**
 * Resolve the physical roll needed to put positive body lift in the target plane. targetRight and
 * targetUp are components of the normalized target direction in the aircraft body frame. Unlike a
 * screen-space target offset, this error is independent of where the padlock camera points: a
 * positive/right bank reduces a positive error one-for-one, including in aft and inverted views.
 *
 * Capture uses separate enter/exit thresholds so the director cannot chatter between roll and
 * pull while the pilot hunts the lift plane.
 */
export function padlockLiftPlaneModel({
  targetRight,
  targetUp,
  targetForward = 0,
  wasCaptured = false,
  captureToleranceRad = 11 * DEG,
  releaseToleranceRad = 18 * DEG,
} = {}) {
  const right = finite(targetRight);
  const up = finite(targetUp);
  const forward = finite(targetForward);
  const planeMagnitude = Math.hypot(right, up);
  if (planeMagnitude < 0.035) {
    // At exact/near six o'clock the target has no unique roll plane: every current lift plane
    // reduces the 180-degree nose error. Show a neutral current-plane pull instead of inventing a
    // left/right roll. Near the nose, no steering director is needed.
    if (forward < 0) {
      return {
        valid: true,
        captured: true,
        anyPlane: true,
        action: "PULL",
        direction: null,
        rollErrorRad: 0,
      };
    }
    return {
      valid: false,
      captured: false,
      anyPlane: false,
      action: "WAIT",
      direction: null,
      rollErrorRad: null,
    };
  }

  const rollErrorRad = Math.atan2(right / planeMagnitude, up / planeMagnitude);
  const captureTolerance = clamp(
    Math.abs(finite(captureToleranceRad, 11 * DEG)),
    1 * DEG,
    45 * DEG,
  );
  const releaseTolerance = clamp(
    Math.abs(finite(releaseToleranceRad, 18 * DEG)),
    captureTolerance,
    60 * DEG,
  );
  const captured = Math.abs(rollErrorRad)
    <= (wasCaptured ? releaseTolerance : captureTolerance);
  return {
    valid: true,
    captured,
    anyPlane: false,
    action: captured ? "PULL" : "ROLL",
    direction: captured ? null : rollErrorRad > 0 ? "RIGHT" : "LEFT",
    rollErrorRad,
  };
}
