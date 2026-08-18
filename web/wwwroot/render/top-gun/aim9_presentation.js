const LIVE_STATES = new Set([1, 2]); // Aim9FlightState.Seeking / Tracking C# ordinals.

const finite = (value) => typeof value === "number" && Number.isFinite(value);

/// Pure snapshot-to-scene contract. Simulation +Z is north; the Three.js scene mirrors Z.
export function projectAim9Presentation(state) {
  const poseValid = state?.aim9_pose_valid === true
    && ["aim9_x", "aim9_y", "aim9_z", "aim9_vx", "aim9_vy", "aim9_vz"]
      .every((key) => finite(state?.[key]));
  const stateCode = Number(state?.aim9_state_code) || 0;
  const velocity = poseValid
    ? { x: Number(state.aim9_vx), y: Number(state.aim9_vy), z: -Number(state.aim9_vz) }
    : { x: 0, y: 0, z: -1 };
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  return Object.freeze({
    visible: poseValid && LIVE_STATES.has(stateCode) && speed > 1e-6,
    stateCode,
    position: Object.freeze(poseValid
      ? { x: Number(state.aim9_x), y: Number(state.aim9_y), z: -Number(state.aim9_z) }
      : { x: 0, y: 0, z: 0 }),
    direction: Object.freeze(speed > 1e-6
      ? { x: velocity.x / speed, y: velocity.y / speed, z: velocity.z / speed }
      : { x: 0, y: 0, z: -1 }),
  });
}

/// Lightweight physical-round presentation driven only by fixed-tick pose/velocity telemetry.
export function createAim9Presentation(THREE) {
  const group = new THREE.Group();
  group.name = "AIM9_AUTHORITY";
  group.visible = false;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xe5e2d5,
    roughness: 0.58,
    metalness: 0.18,
    emissive: 0x171309,
  });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.09, 2.5, 8),
    bodyMaterial,
  );
  body.rotation.x = Math.PI / 2;
  group.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.42, 8),
    bodyMaterial,
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.46;
  group.add(nose);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.8, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffb13b,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  flame.rotation.x = Math.PI / 2;
  flame.position.z = 1.62;
  group.add(flame);

  const forward = new THREE.Vector3(0, 0, -1);
  const direction = new THREE.Vector3(0, 0, -1);
  const update = (state) => {
    const pose = projectAim9Presentation(state);
    group.visible = pose.visible;
    if (!pose.visible) return pose;
    group.position.set(pose.position.x, pose.position.y, pose.position.z);
    direction.set(pose.direction.x, pose.direction.y, pose.direction.z);
    group.quaternion.setFromUnitVectors(forward, direction);
    return pose;
  };

  return Object.freeze({
    group,
    update,
    dispose() {
      group.removeFromParent();
      body.geometry.dispose();
      nose.geometry.dispose();
      flame.geometry.dispose();
      bodyMaterial.dispose();
      flame.material.dispose();
    },
  });
}
