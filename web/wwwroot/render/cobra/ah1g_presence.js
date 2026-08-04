/**
 * Lightweight AH-1G rear-seat presence for Hold the Bridge.
 * Same league as F-22 canopy glass: intentional silhouette cues, not a full cockpit GLB.
 *
 * Body axes match the lab camera contract: +X right, +Y up, -Z forward (Three.js, north = -z).
 * Authority yaw uses +sin/-cos look; Three YXZ needs -yaw so local -Z matches that heading.
 */

export const AH1G_PRESENCE_SCHEMA = "guns-only.ah1g-presence.v1";

/** Rear-seat eye relative to vehicle origin (CG). Aft and above. */
export const REAR_SEAT_EYE_LOCAL_M = Object.freeze({
  x: 0,
  y: 1.12,
  z: 1.05,
});

function skinMaterial(THREE, hex, opts = {}) {
  return new THREE.MeshLambertMaterial({
    color: hex,
    emissive: opts.emissive ?? 0x000000,
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite !== false,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flatShading !== false,
  });
}

function box(THREE, name, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * Body orientation matching Hold the Bridge lookAt(+sin(yaw), …, -cos(yaw)).
 */
export function vehicleBodyQuaternion(THREE, vehicle, target = null) {
  const quat = target ?? new THREE.Quaternion();
  const euler = new THREE.Euler(
    Number(vehicle?.pitch_rad) || 0,
    -(Number(vehicle?.yaw_rad) || 0),
    Number(vehicle?.roll_rad) || 0,
    "YXZ",
  );
  return quat.setFromEuler(euler);
}

/**
 * Build the procedural rear-seat Cobra presence group.
 */
export function createAh1gPresence(THREE) {
  const group = new THREE.Group();
  group.name = "AH1G_PRESENCE";
  group.visible = true;

  const skin = skinMaterial(THREE, 0x4a5a3a, { emissive: 0x0a1008 });
  const dark = skinMaterial(THREE, 0x1c2218, { emissive: 0x050605 });
  const glass = skinMaterial(THREE, 0x9bb8ae, {
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
    flatShading: false,
    emissive: 0x142820,
  });
  const metal = skinMaterial(THREE, 0x2a3030, { emissive: 0x080a0a });
  const disc = skinMaterial(THREE, 0x151a15, {
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide,
    flatShading: false,
  });
  const bladeMat = skinMaterial(THREE, 0x0e120e, { opacity: 0.72, depthWrite: false });

  const canopyFrame = new THREE.Group();
  canopyFrame.name = "AH1G_CANOPY_FRAME";
  canopyFrame.add(
    box(THREE, "AH1G_CANOPY_RAIL_L", [0.06, 0.9, 2.4], [-0.52, 0.95, 0.55], dark),
    box(THREE, "AH1G_CANOPY_RAIL_R", [0.06, 0.9, 2.4], [0.52, 0.95, 0.55], dark),
    box(THREE, "AH1G_CANOPY_BOW", [1.1, 0.08, 0.08], [0, 1.35, -0.55], dark),
    box(THREE, "AH1G_CANOPY_AFT", [1.1, 0.08, 0.08], [0, 1.35, 1.65], dark),
    box(THREE, "AH1G_CANOPY_SPINE", [0.05, 0.06, 2.3], [0, 1.38, 0.55], dark),
  );
  group.add(canopyFrame);

  const canopyGlass = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    glass,
  );
  canopyGlass.name = "AH1G_CANOPY_GLASS";
  canopyGlass.scale.set(0.72, 0.55, 1.35);
  canopyGlass.position.set(0, 0.95, 0.55);
  canopyGlass.renderOrder = 2;
  group.add(canopyGlass);

  group.add(box(THREE, "AH1G_INSTRUMENT_BROW", [0.95, 0.12, 0.35], [0, 0.72, -0.15], metal));
  group.add(box(THREE, "AH1G_CYCLIC", [0.05, 0.55, 0.05], [0.12, 0.45, 0.35], dark, [0.35, 0, 0.08]));
  group.add(box(THREE, "AH1G_COLLECTIVE", [0.04, 0.08, 0.45], [-0.38, 0.48, 0.55], dark, [0, 0, 0.4]));
  group.add(box(THREE, "AH1G_NOSE", [0.55, 0.45, 2.2], [0, 0.35, -2.4], skin));
  group.add(box(THREE, "AH1G_CHIN_TURRET", [0.35, 0.28, 0.45], [0, -0.05, -3.35], metal));
  group.add(box(THREE, "AH1G_CABIN", [0.85, 0.7, 2.0], [0, 0.45, 0.7], skin));
  group.add(box(THREE, "AH1G_ROTOR_MAST", [0.12, 1.1, 0.12], [0, 1.85, 0.15], metal));

  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.04, 48), disc);
  rotor.name = "AH1G_ROTOR_DISC";
  rotor.position.set(0, 2.35, 0.15);
  rotor.renderOrder = 1;
  group.add(rotor);

  const blades = [];
  for (const yaw of [0, Math.PI / 2]) {
    const blade = box(THREE, `AH1G_ROTOR_BLADE_${yaw}`, [0.18, 0.03, 10.8], [0, 2.37, 0.15], bladeMat);
    blade.rotation.y = yaw;
    blades.push(blade);
    group.add(blade);
  }

  const scratchQuat = new THREE.Quaternion();
  const scratchEye = new THREE.Vector3();
  const scratchLocal = new THREE.Vector3();

  return {
    schema: AH1G_PRESENCE_SCHEMA,
    group,
    THREE,
    eyeLocalM: REAR_SEAT_EYE_LOCAL_M,
    rotor,
    blades,
    scratchQuat,
    scratchEye,
    scratchLocal,
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

/**
 * World-space rear-seat eye from authority vehicle state (east/up/north sim → Three).
 */
export function eyeWorldFromVehicle(THREE, vehicle, out = null) {
  const target = out ?? new THREE.Vector3();
  const quat = vehicleBodyQuaternion(THREE, vehicle);
  const local = new THREE.Vector3(
    REAR_SEAT_EYE_LOCAL_M.x,
    REAR_SEAT_EYE_LOCAL_M.y,
    REAR_SEAT_EYE_LOCAL_M.z,
  );
  local.applyQuaternion(quat);
  return target.set(
    (Number(vehicle?.x_m) || 0) + local.x,
    (Number(vehicle?.y_m) || 0) + local.y,
    -(Number(vehicle?.z_m) || 0) + local.z,
  );
}

/**
 * Pose the presence group to the authority vehicle and advance rotor animation from Nr.
 */
export function updateAh1gPresence(presence, vehicle, deltaSeconds = 0) {
  if (!presence || !vehicle) return null;
  const THREE = presence.THREE;
  const rpm = Number(
    vehicle.main_rotor_rpm
      ?? vehicle.rotorcraft?.main_rotor_rpm
      ?? 324,
  );
  const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;

  presence.group.position.set(
    Number(vehicle.x_m) || 0,
    Number(vehicle.y_m) || 0,
    -(Number(vehicle.z_m) || 0),
  );
  vehicleBodyQuaternion(THREE, vehicle, presence.scratchQuat);
  presence.group.quaternion.copy(presence.scratchQuat);

  const omega = (Number.isFinite(rpm) ? rpm : 324) * Math.PI * 2 / 60;
  if (presence.rotor) presence.rotor.rotation.y += omega * dt;
  for (const blade of presence.blades ?? []) blade.rotation.y += omega * dt;
  presence.setVisible(true);
  return presence;
}
