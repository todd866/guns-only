const DEG = Math.PI / 180;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
/**
 * Applies the simulation carrier frame to a Three.js root without allocating per frame.
 *
 * Simulation +Z is north while the renderer flips Z, so heading is negated. Positive deck
 * pitch raises the local -Z bow. Water-bound effects share ship translation and yaw but remain at
 * sea level and never inherit pitch/heave.
 */
export function applyCarrierRootPose(THREE, root, state, options = {}) {
  const followPitch = options.followPitch === true;
  const seaLevel = options.seaLevel === true;
  const yaw = finite(state?.cheading);
  const pitch = followPitch ? finite(state?.deck_pitch_deg) * DEG : 0;
  const scratch = options.scratch ?? {};
  const yawQuaternion = scratch.yawQuaternion ?? new THREE.Quaternion();
  const pitchQuaternion = scratch.pitchQuaternion ?? new THREE.Quaternion();
  const yAxis = scratch.yAxis ?? new THREE.Vector3(0, 1, 0);
  const xAxis = scratch.xAxis ?? new THREE.Vector3(1, 0, 0);

  root.position.set(
    finite(state?.cx),
    seaLevel ? 0 : finite(state?.cy),
    -finite(state?.cz),
  );
  yawQuaternion.setFromAxisAngle(yAxis, -yaw);
  root.quaternion.copy(yawQuaternion);
  if (pitch !== 0) {
    pitchQuaternion.setFromAxisAngle(xAxis, pitch);
    root.quaternion.multiply(pitchQuaternion);
  }
  return root;
}
