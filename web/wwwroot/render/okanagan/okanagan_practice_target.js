import * as THREE from "../../vendor/three.module.js";

export function createOkanaganPracticeTarget(scene) {
  const group = new THREE.Group();
  group.name = "water-circuit practice drop";
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(110, 36),
    new THREE.MeshBasicMaterial({
      color: 0xff6a2a,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      fog: false,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.4;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(88, 3.2, 10, 36),
    new THREE.MeshBasicMaterial({ color: 0xfff4e0, fog: false }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.8;
  const barge = new THREE.Mesh(
    new THREE.BoxGeometry(18, 3.2, 44),
    new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.9 }),
  );
  barge.position.set(0, 2.0, -52);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.7, 28, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.9 }),
  );
  pole.position.set(0, 14.4, 0);
  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(16, 9, 0.45),
    new THREE.MeshBasicMaterial({ color: 0xff6a2a, fog: false }),
  );
  flag.position.set(8.2, 24.5, 0);
  group.add(water, ring, barge, pole, flag);
  group.visible = false;
  scene?.add(group);

  function update(position, visible) {
    const show = visible === true && position != null
      && [position.x, position.y, position.z].every(Number.isFinite);
    group.visible = show;
    if (show) group.position.set(position.x, position.y, position.z);
  }

  return { group, update };
}
