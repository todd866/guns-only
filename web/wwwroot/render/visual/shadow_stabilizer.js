import { Vector3 } from "../../vendor/three.module.js";

const EPSILON = 1e-8;

function normalize(vector, fallback) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return length > EPSILON
    ? vector.map((component) => component / length)
    : [...fallback];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Snaps a directional-light shadow frame to whole shadow texels in light
 * space. Sub-texel camera movement therefore does not shimmer the projection.
 */
export function computeTexelStabilizedShadowFrame(options) {
  const focus = options.focus ?? [0, 0, 0];
  const direction = normalize(options.direction ?? [0, -1, 0], [0, -1, 0]);
  let right = normalize(cross(direction, options.up ?? [0, 1, 0]), [1, 0, 0]);
  if (Math.abs(dot(right, direction)) > 0.001) right = [1, 0, 0];
  const shadowUp = normalize(cross(right, direction), [0, 0, 1]);
  const halfExtent = Math.max(1, Number(options.halfExtent) || 1000);
  const mapSize = Math.max(1, Math.round(Number(options.mapSize) || 1024));
  const worldUnitsPerTexel = (halfExtent * 2) / mapSize;
  const lightX = dot(focus, right);
  const lightY = dot(focus, shadowUp);
  const snappedX = Math.round(lightX / worldUnitsPerTexel) * worldUnitsPerTexel;
  const snappedY = Math.round(lightY / worldUnitsPerTexel) * worldUnitsPerTexel;
  const deltaX = snappedX - lightX;
  const deltaY = snappedY - lightY;
  const snappedFocus = [
    focus[0] + right[0] * deltaX + shadowUp[0] * deltaY,
    focus[1] + right[1] * deltaX + shadowUp[1] * deltaY,
    focus[2] + right[2] * deltaX + shadowUp[2] * deltaY,
  ];
  return { direction, right, up: shadowUp, focus: snappedFocus, halfExtent, mapSize, worldUnitsPerTexel };
}

export function shadowHalfExtentForMode(shadowDistanceMetres, mode = "combat", overrides = {}) {
  const maximum = Math.max(1, Number(shadowDistanceMetres) || 1);
  const defaults = {
    carrier: Math.min(maximum, 900),
    cockpit: Math.min(maximum, 1200),
    combat: Math.min(maximum, 3000),
    replay: Math.min(maximum, 2200),
  };
  return Math.max(1, Number(overrides[mode] ?? defaults[mode] ?? maximum));
}

/** Applies the stabilized frame to a Three DirectionalLight and its target. */
export function applyTexelStabilizedDirectionalShadow(light, focus, options = {}) {
  if (!light?.shadow?.camera || !light.target) {
    throw new TypeError("A shadow-casting DirectionalLight with a target is required.");
  }
  const focusArray = focus?.isVector3
    ? [focus.x, focus.y, focus.z]
    : [focus?.[0] ?? 0, focus?.[1] ?? 0, focus?.[2] ?? 0];
  const derivedDirection = new Vector3().subVectors(light.target.position, light.position).normalize();
  const direction = options.direction?.isVector3
    ? [options.direction.x, options.direction.y, options.direction.z]
    : options.direction ?? [derivedDirection.x, derivedDirection.y, derivedDirection.z];
  const frame = computeTexelStabilizedShadowFrame({
    focus: focusArray,
    direction,
    up: options.up,
    halfExtent: options.halfExtent,
    mapSize: options.mapSize ?? light.shadow.mapSize.x,
  });
  const lightDistance = Math.max(frame.halfExtent, options.lightDistance ?? frame.halfExtent * 2);
  const snapped = new Vector3(...frame.focus);
  const directionVector = new Vector3(...frame.direction);

  light.target.position.copy(snapped);
  light.position.copy(snapped).addScaledVector(directionVector, -lightDistance);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();

  const shadow = light.shadow;
  if (shadow.mapSize.x !== frame.mapSize || shadow.mapSize.y !== frame.mapSize) {
    shadow.mapSize.set(frame.mapSize, frame.mapSize);
    shadow.map?.dispose();
    shadow.map = null;
  }
  const camera = shadow.camera;
  camera.left = -frame.halfExtent;
  camera.right = frame.halfExtent;
  camera.top = frame.halfExtent;
  camera.bottom = -frame.halfExtent;
  camera.near = Math.max(0.1, options.near ?? 1);
  camera.far = Math.max(camera.near + 1, options.far ?? lightDistance * 2.5);
  camera.updateProjectionMatrix();
  return frame;
}
