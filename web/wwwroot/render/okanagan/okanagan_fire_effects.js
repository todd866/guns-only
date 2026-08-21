import * as THREE from "../../vendor/three.module.js?v=345";

export function createOkanaganFireEffects(scene, capacity = 180) {
  const group = new THREE.Group();
  const flameGeometry = new THREE.ConeGeometry(18, 48, 6);
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.86 });
  const smokeGeometry = new THREE.IcosahedronGeometry(38, 1);
  const smokeMaterial = new THREE.MeshStandardMaterial({ color: 0x333838, roughness: 1,
    transparent: true, opacity: 0.46, depthWrite: false });
  const flames = new THREE.InstancedMesh(flameGeometry, flameMaterial, capacity);
  const smoke = new THREE.InstancedMesh(smokeGeometry, smokeMaterial, capacity * 2);
  flames.frustumCulled = smoke.frustumCulled = false;
  group.add(flames, smoke);
  scene.add(group);
  const dummy = new THREE.Object3D();

  function update(cells, timeSeconds, wind = new THREE.Vector3(0.42, 0, 0.91)) {
    let flameCount = 0;
    let smokeCount = 0;
    for (const cell of cells ?? []) {
      if (cell.intensity < 0.03 || flameCount >= capacity) continue;
      const pulse = 0.75 + Math.sin(timeSeconds * 5 + cell.column * 1.7 + cell.row) * 0.2;
      dummy.position.set(cell.x, cell.y + 18 + cell.intensity * 15, cell.z);
      dummy.scale.set(0.6 + cell.intensity, pulse * (0.5 + cell.intensity * 1.8), 0.6 + cell.intensity);
      dummy.rotation.y = timeSeconds + cell.column;
      dummy.updateMatrix();
      flames.setMatrixAt(flameCount++, dummy.matrix);
      for (let layer = 0; layer < 2 && smokeCount < capacity * 2; layer += 1) {
        const height = 65 + layer * 90 + cell.intensity * 120;
        dummy.position.set(cell.x + wind.x * height * 0.48, cell.y + height, cell.z + wind.z * height * 0.48);
        const scale = 0.8 + layer * 0.72 + cell.intensity * 1.2;
        dummy.scale.setScalar(scale);
        dummy.rotation.y = timeSeconds * 0.08 + cell.row;
        dummy.updateMatrix();
        smoke.setMatrixAt(smokeCount++, dummy.matrix);
      }
    }
    flames.count = flameCount;
    smoke.count = smokeCount;
    flames.instanceMatrix.needsUpdate = true;
    smoke.instanceMatrix.needsUpdate = true;
  }

  return { group, update };
}
