// Chase-camera lift while the car is on a vert wall or in a vert air.
// rise is metres added to the eye. pitch is radians looking up the ramp,
// so the wall stays in frame instead of filling it.
export function vertCamera({upY = 1, onWall = false, vert = false} = {}) {
  const steep = onWall ? Math.max(0, Math.min(1, (0.82 - upY) / 0.82)) : 0;
  const k = Math.max(steep, vert ? 1 : 0);
  return {rise: 1.35 * k, pitch: 0.55 * k};
}
