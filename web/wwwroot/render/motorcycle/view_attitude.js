/** Helmet-cam attitude helpers for the weekend ride. */

/**
 * Sim-authored bike pitch for the helmet view (positive = nose up in a wheelie).
 * Snapshots from a bridge that predates pitch serialization must read as level,
 * never as NaN in the camera quaternion.
 */
export function viewPitchRad(state) {
  const pitch = state?.pitch_rad;
  return Number.isFinite(pitch) ? pitch : 0;
}
