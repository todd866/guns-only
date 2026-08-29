import * as THREE from "../../vendor/three.module.js";

export const OKANAGAN_FIRE_VISUAL_CONTRACT = Object.freeze({
  minimumIntensity: 0.03,
  smokeLayersPerCell: 3,
  maximumGroundRadiusM: 68,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value)));
}

/**
 * One visual envelope per published fire cell. Scale may amplify readability inside the cell,
 * but position, presence and intensity always come from mission authority.
 */
export function okanaganFireVisualProfile(cell, timeSeconds = 0) {
  const intensity = clamp(cell?.intensity, 0, 1);
  if (intensity < OKANAGAN_FIRE_VISUAL_CONTRACT.minimumIntensity) return null;
  const column = Math.trunc(finite(cell?.column));
  const row = Math.trunc(finite(cell?.row));
  const phase = finite(timeSeconds) * 4.2 + column * 1.73 + row * 0.91;
  return Object.freeze({
    x: finite(cell?.x),
    y: finite(cell?.y),
    z: finite(cell?.z),
    intensity,
    pulse: 0.88 + Math.sin(phase) * 0.12,
    groundRadiusM: 44 + intensity * 24,
    outerRadiusM: 10 + intensity * 18,
    outerHeightM: 32 + intensity * 72,
    coreRadiusM: 4.5 + intensity * 9,
    coreHeightM: 20 + intensity * 46,
    smokeRadiusM: 26 + intensity * 22,
  });
}

export function createOkanaganFireEffects(scene, capacity = 180) {
  const group = new THREE.Group();
  group.name = "authority-backed Okanagan fire";
  const boundedCapacity = Math.max(1, Math.trunc(finite(capacity, 180)));
  const footprintMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4618,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const outerMaterial = new THREE.MeshBasicMaterial({
    color: 0xff641c,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd36a,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const smokeMaterial = new THREE.MeshStandardMaterial({
    color: 0x303638,
    roughness: 1,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const footprints = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 14), footprintMaterial, boundedCapacity);
  const flames = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 7), outerMaterial, boundedCapacity);
  const cores = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 7), coreMaterial, boundedCapacity);
  const smoke = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1), smokeMaterial,
    boundedCapacity * OKANAGAN_FIRE_VISUAL_CONTRACT.smokeLayersPerCell);
  footprints.name = "published fire-cell footprints";
  flames.name = "published fire-cell outer flame";
  cores.name = "published fire-cell hot core";
  smoke.name = "published fire-cell smoke columns";
  footprints.renderOrder = 2;
  flames.renderOrder = cores.renderOrder = 3;
  footprints.frustumCulled = flames.frustumCulled
    = cores.frustumCulled = smoke.frustumCulled = false;
  footprints.count = flames.count = cores.count = smoke.count = 0;
  group.add(footprints, flames, cores, smoke);
  scene.add(group);
  const dummy = new THREE.Object3D();

  function update(cells, timeSeconds, wind = new THREE.Vector3(0.42, 0, 0.91)) {
    let cellCount = 0;
    let smokeCount = 0;
    for (const cell of cells ?? []) {
      const profile = okanaganFireVisualProfile(cell, timeSeconds);
      if (!profile || cellCount >= boundedCapacity) continue;

      dummy.position.set(profile.x, profile.y + 1.4, profile.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(profile.groundRadiusM);
      dummy.updateMatrix();
      footprints.setMatrixAt(cellCount, dummy.matrix);

      dummy.position.set(profile.x, profile.y + profile.outerHeightM * profile.pulse / 2,
        profile.z);
      dummy.rotation.set(0, finite(timeSeconds) + finite(cell?.column), 0);
      dummy.scale.set(profile.outerRadiusM, profile.outerHeightM * profile.pulse,
        profile.outerRadiusM);
      dummy.updateMatrix();
      flames.setMatrixAt(cellCount, dummy.matrix);

      dummy.position.set(profile.x, profile.y + profile.coreHeightM * profile.pulse / 2 + 2,
        profile.z);
      dummy.rotation.set(0, -finite(timeSeconds) * 0.7 - finite(cell?.row), 0);
      dummy.scale.set(profile.coreRadiusM, profile.coreHeightM * profile.pulse,
        profile.coreRadiusM);
      dummy.updateMatrix();
      cores.setMatrixAt(cellCount, dummy.matrix);

      for (let layer = 0;
        layer < OKANAGAN_FIRE_VISUAL_CONTRACT.smokeLayersPerCell;
        layer += 1) {
        const height = 70 + layer * 82 + profile.intensity * 105;
        const drift = height * (0.34 + layer * 0.06);
        dummy.position.set(
          profile.x + finite(wind?.x, 0.42) * drift,
          profile.y + height,
          profile.z + finite(wind?.z, 0.91) * drift,
        );
        const scale = profile.smokeRadiusM * (1 + layer * 0.58);
        dummy.scale.setScalar(scale);
        dummy.rotation.set(0, finite(timeSeconds) * 0.08 + finite(cell?.row), 0);
        dummy.updateMatrix();
        smoke.setMatrixAt(smokeCount++, dummy.matrix);
      }
      cellCount += 1;
    }
    footprints.count = flames.count = cores.count = cellCount;
    smoke.count = smokeCount;
    footprints.instanceMatrix.needsUpdate = true;
    flames.instanceMatrix.needsUpdate = true;
    cores.instanceMatrix.needsUpdate = true;
    smoke.instanceMatrix.needsUpdate = true;
    return Object.freeze({ cells: cellCount, smokePuffs: smokeCount });
  }

  return {
    group,
    update,
    layers: Object.freeze({ footprints, flames, cores, smoke }),
  };
}
