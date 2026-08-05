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
 * Box with a lighter +Y (top) face: the one-value-step console/deck treatment.
 * BoxGeometry material order is [+x, -x, +y, -y, +z, -z].
 */
function toppedBox(THREE, name, size, position, sideMaterial, topMaterial) {
  return box(THREE, name, size, position, [
    sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial,
  ]);
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

  // Interior palette (TF2-illustrative: flat painted tones, one value step
  // between planes, no photorealism). Lambert + emissive floor so faces the
  // scene sun never reaches still read as painted structure, not construction
  // paper. Near-black (all RGB < 25) is banned for interior-facing surfaces.
  const skin = skinMaterial(THREE, 0x4a5a3a, { emissive: 0x161a10 });
  const frameMat = skinMaterial(THREE, 0x5c6654, { emissive: 0x2c3226 });
  const consoleSide = skinMaterial(THREE, 0x40483e, { emissive: 0x1c211a });
  const consoleTop = skinMaterial(THREE, 0x555f4d, { emissive: 0x272d23 });
  const stickMat = skinMaterial(THREE, 0x353b31, { emissive: 0x171b14 });
  const noseTop = skinMaterial(THREE, 0x515f42, { emissive: 0x20261a });
  const glass = skinMaterial(THREE, 0x9bb8ae, {
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
    flatShading: false,
    emissive: 0x142820,
  });
  const metal = skinMaterial(THREE, 0x39423c, { emissive: 0x181d18 });
  const disc = skinMaterial(THREE, 0x39423a, {
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
    flatShading: false,
    emissive: 0x2a332a,
  });
  const bladeMat = skinMaterial(THREE, 0x23291f, { opacity: 0.72, depthWrite: false, emissive: 0x181d15 });

  // Frame members must stay out of the rear-seat forward frustum (eye at
  // REAR_SEAT_EYE_LOCAL_M, fov 58, +0.08 pitch bias): sills stay below the
  // eyeline, the front bow splits around the gunsight, pillars hug the corners.
  // The frame must also read CONNECTED: pillars run down into the console/sill
  // line (consoles below overlap the pillar plane), no member floats in air.
  const canopyFrame = new THREE.Group();
  canopyFrame.name = "AH1G_CANOPY_FRAME";
  canopyFrame.add(
    box(THREE, "AH1G_CANOPY_SILL_L", [0.07, 0.14, 2.5], [-0.52, 0.55, 0.5], frameMat),
    box(THREE, "AH1G_CANOPY_SILL_R", [0.07, 0.14, 2.5], [0.52, 0.55, 0.5], frameMat),
    box(THREE, "AH1G_CANOPY_PILLAR_L", [0.06, 0.91, 0.06], [-0.52, 0.9, -0.5], frameMat),
    box(THREE, "AH1G_CANOPY_PILLAR_R", [0.06, 0.91, 0.06], [0.52, 0.9, -0.5], frameMat),
    box(THREE, "AH1G_CANOPY_BOW_L", [0.35, 0.08, 0.08], [-0.375, 1.35, -0.55], frameMat),
    box(THREE, "AH1G_CANOPY_BOW_R", [0.35, 0.08, 0.08], [0.375, 1.35, -0.55], frameMat),
    box(THREE, "AH1G_CANOPY_AFT", [1.1, 0.08, 0.08], [0, 1.35, 1.65], frameMat),
  );
  group.add(canopyFrame);

  // Shell for the exterior silhouette, with the forward wedge left open: the
  // rear-seat gunsight looks out through air, not tint. Sphere phi 270 deg is
  // local -Z (forward), so the gap is centered there. thetaStart trims the
  // polar cap: with the cap present, its triangles adjacent to the gap edge
  // hover almost dead-ahead-overhead from the interior eye and read as a
  // floating pale shard whenever the gunner-target look bias swings the
  // camera off the body axis.
  const glassGapRad = Math.PI * (178 / 180);
  const canopyGlass = new THREE.Mesh(
    new THREE.SphereGeometry(
      1, 20, 12,
      Math.PI * 1.5 + glassGapRad / 2,
      Math.PI * 2 - glassGapRad,
      Math.PI * 0.18, Math.PI * 0.37,
    ),
    glass,
  );
  canopyGlass.name = "AH1G_CANOPY_GLASS";
  canopyGlass.scale.set(0.72, 0.55, 1.35);
  canopyGlass.position.set(0, 0.95, 0.55);
  canopyGlass.renderOrder = 2;
  group.add(canopyGlass);

  // Instrument brow splits around the centerline gunsight so the aim column
  // stays open; the consoles reach outboard past the pillar plane and forward
  // under the pillar feet, so each pillar plants into its console instead of
  // ending in mid-air. Top faces take the lighter deck tone.
  group.add(toppedBox(THREE, "AH1G_INSTRUMENT_BROW_L", [0.38, 0.12, 0.55], [-0.37, 0.68, -0.225], consoleSide, consoleTop));
  group.add(toppedBox(THREE, "AH1G_INSTRUMENT_BROW_R", [0.38, 0.12, 0.55], [0.37, 0.68, -0.225], consoleSide, consoleTop));
  group.add(box(THREE, "AH1G_CYCLIC", [0.05, 0.55, 0.05], [0.12, 0.45, 0.35], stickMat, [0.35, 0, 0.08]));
  group.add(box(THREE, "AH1G_COLLECTIVE", [0.04, 0.08, 0.45], [-0.38, 0.48, 0.55], stickMat, [0, 0, 0.4]));
  // Low sloping nose: the top edge must sit under the rear-seat depressed
  // sightline (Cobra noses drop away from the canopy anyway). Its aft face is
  // the forward bulkhead the gunner actually sees, its top deck takes the
  // lighter step so it reads as airframe, not silhouette.
  group.add(box(THREE, "AH1G_NOSE", [0.55, 0.3, 2.2], [0, 0.09, -2.4], [
    skin, skin, noseTop, skin, consoleSide, skin,
  ]));
  group.add(box(THREE, "AH1G_CHIN_TURRET", [0.35, 0.28, 0.45], [0, -0.05, -3.35], metal));
  // Cabin runs aft under the mast so the rotor pylon stands on structure.
  group.add(box(THREE, "AH1G_CABIN", [0.85, 0.5, 2.7], [0, 0.35, 0.85], skin));
  // Mast is aft of the rear-seat eye (out of the forward frustum) and tall
  // enough that the translucent rotor wash clears the upper sight picture.
  group.add(box(THREE, "AH1G_ROTOR_MAST", [0.12, 2.15, 0.12], [0, 1.675, 2.2], metal));

  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.04, 48), disc);
  rotor.name = "AH1G_ROTOR_DISC";
  rotor.position.set(0, 2.8, 2.2);
  rotor.renderOrder = 1;
  group.add(rotor);

  const blades = [];
  for (const yaw of [0, Math.PI / 2]) {
    const blade = box(THREE, `AH1G_ROTOR_BLADE_${yaw}`, [0.18, 0.03, 10.8], [0, 2.82, 2.2], bladeMat);
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
