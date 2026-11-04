// Radians, metres. Yaw can pass through any number of full turns; zero looks from -z.
export const MIN_PITCH = -Math.PI / 18;
export const MAX_PITCH = (7 * Math.PI) / 18;

export function clampPitch(pitch) {
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
}

export function clampZoom(dist, min, max) {
  return Math.max(min, Math.min(max, dist));
}

export function orbit({yaw, pitch, dist, target}) {
  const horizontal = dist * Math.cos(clampPitch(pitch));
  return [
    target[0] + horizontal * Math.sin(yaw),
    target[1] + dist * Math.sin(clampPitch(pitch)),
    target[2] - horizontal * Math.cos(yaw)
  ];
}
