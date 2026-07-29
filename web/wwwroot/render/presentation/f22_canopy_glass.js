const F22_AIRFRAME_ID = "aircraft.f22a.public-data-surrogate";

export function isF22CanopyGlassAirframe(state) {
  return String(state?.player_aircraft_id || "").includes(F22_AIRFRAME_ID);
}

function material(THREE, color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createF22CanopyGlass(THREE) {
  const group = new THREE.Group();
  group.name = "F22_CANOPY_GLASS";
  group.visible = false;
  group.renderOrder = 1;

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.82),
    material(THREE, 0x9db8c7, 0.08),
  );
  shell.name = "F22_CANOPY_GLASS_SHELL";
  shell.scale.set(1.45, 0.78, 1.8);
  shell.position.set(0, -0.42, 0.32);
  shell.renderOrder = 1;

  const darkAxis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.012, 0.64, 0.08),
      new THREE.Vector3(-0.012, 0.27, 1.62),
    ]),
    new THREE.LineBasicMaterial({
      color: 0x1f3037,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  darkAxis.name = "F22_CANOPY_MID_AXIS_DARK";
  darkAxis.renderOrder = 2;

  const lightAxis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.012, 0.64, 0.08),
      new THREE.Vector3(0.012, 0.27, 1.62),
    ]),
    new THREE.LineBasicMaterial({
      color: 0xc6d9df,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  lightAxis.name = "F22_CANOPY_MID_AXIS_LIGHT";
  lightAxis.renderOrder = 2;

  const reflection = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 0.68),
    material(THREE, 0xd9e7e6, 0.11),
  );
  reflection.name = "F22_CANOPY_PILOT_REFLECTION";
  reflection.position.set(0, 0.18, 1.28);
  reflection.rotation.x = -0.28;
  reflection.renderOrder = 2;

  group.add(shell, darkAxis, lightAxis, reflection);
  return {
    group,
    reflection,
    lookForward: new THREE.Vector3(),
    inverseBodyQuaternion: new THREE.Quaternion(),
    setVisible(visible) {
      group.visible = visible === true;
    },
    dispose() {
      group.traverse((object) => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((item) => item.dispose?.());
      });
    },
  };
}

export function updateF22CanopyGlass(glass, {
  position,
  quaternion,
  lookQuaternion,
  visible,
}) {
  if (!glass) return null;
  if (position) glass.group.position.copy(position);
  if (quaternion) glass.group.quaternion.copy(quaternion);
  glass.setVisible(visible);

  if (quaternion && lookQuaternion) {
    glass.inverseBodyQuaternion.copy(quaternion).invert();
    glass.lookForward.set(0, 0, -1)
      .applyQuaternion(glass.inverseBodyQuaternion.multiply(lookQuaternion));
    const azimuth = Math.atan2(glass.lookForward.x, -glass.lookForward.z);
    glass.reflection.position.x = Math.sin(azimuth) * 0.34;
    glass.reflection.position.z = 1.28 + (1 - Math.cos(azimuth)) * 0.14;
    glass.reflection.rotation.y = -azimuth * 0.18;
  }
  return glass;
}
