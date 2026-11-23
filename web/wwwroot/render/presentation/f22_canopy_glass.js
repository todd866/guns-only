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
  // Canopy glass, bow etch, and helmet reflection imitate a cockpit the player
  // does not have. The named nodes stay for the contract tests; none of them draw.
  shell.visible = false;

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
  darkAxis.visible = false;

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
  lightAxis.visible = false;

  const reflection = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 0.68),
    material(THREE, 0xd9e7e6, 0.11),
  );
  reflection.name = "F22_CANOPY_PILOT_REFLECTION";
  reflection.position.set(0, 0.18, 1.28);
  reflection.rotation.x = -0.28;
  reflection.renderOrder = 2;
  reflection.visible = false;

  // Low-profile peripheral canopy frame: sits outside the central +-28 deg HUD cone and below
  // the pitch ladder so pilots get peripheral cockpit grounding with zero symbology occlusion.
  const frameGroup = new THREE.Group();
  frameGroup.name = "F22_CANOPY_FRAME";
  frameGroup.visible = false;
  frameGroup.renderOrder = 3;

  const frameMat = new THREE.MeshBasicMaterial({
    color: 0x1b222a,
    transparent: true,
    opacity: 0.9,
    depthWrite: true,
  });
  const trimMat = new THREE.MeshBasicMaterial({
    color: 0x33414e,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });

  const coaming = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.055, 0.28), frameMat);
  coaming.name = "F22_CANOPY_COAMING";
  coaming.position.set(0, -0.57, -1.16);
  coaming.rotation.x = 0.15;

  const coamingLip = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.012, 0.03), trimMat);
  coamingLip.name = "F22_CANOPY_COAMING_LIP";
  coamingLip.position.set(0, -0.538, -1.03);

  const railLeft = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.032, 1.55), frameMat);
  railLeft.name = "F22_CANOPY_RAIL_LEFT";
  railLeft.position.set(-0.72, -0.43, -0.48);
  railLeft.rotation.set(0.09, -0.11, 0.0);

  const railRight = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.032, 1.55), frameMat);
  railRight.name = "F22_CANOPY_RAIL_RIGHT";
  railRight.position.set(0.72, -0.43, -0.48);
  railRight.rotation.set(0.09, 0.11, 0.0);

  // Full semicircular arch anchored down at the left/right sill rails so it frames the peripheral
  // sky cleanly instead of ending mid-air at the top corners.
  const bowArch = new THREE.Mesh(
    new THREE.TorusGeometry(0.71, 0.016, 8, 36, Math.PI),
    trimMat,
  );
  bowArch.name = "F22_CANOPY_BOW_ARCH";
  bowArch.scale.set(1.04, 1.18, 1.0);
  bowArch.position.set(0, -0.42, -0.68);
  bowArch.rotation.set(-0.22, 0, 0);

  frameGroup.add(coaming, coamingLip, railLeft, railRight, bowArch);
  group.add(shell, darkAxis, lightAxis, reflection, frameGroup);
  return {
    group,
    frameGroup,
    reflection,
    lookForward: new THREE.Vector3(),
    inverseBodyQuaternion: new THREE.Quaternion(),
    setVisible(visible, frameVisible = false) {
      const showFrame = frameVisible === true;
      frameGroup.visible = showFrame;
      group.visible = visible === true || showFrame;
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
  frameVisible = false,
}) {
  if (!glass) return null;
  if (position) glass.group.position.copy(position);
  if (quaternion) glass.group.quaternion.copy(quaternion);
  glass.setVisible(visible, frameVisible);

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
