import * as THREE from "../../vendor/three.module.js?v=338";

export function createFireBossCockpit(camera) {
  const group = new THREE.Group();
  group.name = "AT-802F Fire Boss cockpit reference";
  const glare = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x171c1c, roughness: 0.82 }));
  glare.position.set(0, -0.48, -1.02);
  group.add(glare);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.38, 2.5, 12),
    new THREE.MeshStandardMaterial({ color: 0xe3d44c, roughness: 0.48 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.55, -2.05);
  group.add(nose);
  const prop = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32),
    new THREE.MeshBasicMaterial({ color: 0x9fb4b6, transparent: true, opacity: 0.08,
      side: THREE.DoubleSide, depthWrite: false }));
  prop.position.set(0, -0.48, -3.3);
  group.add(prop);
  const floatMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d8c8, roughness: 0.55 });
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.4), floatMaterial);
    tip.position.set(side * 1.48, -0.92, -1.3);
    tip.rotation.x = -0.03;
    group.add(tip);
  }
  camera.add(group);
  return {
    group,
    update(timeSeconds, throttle) {
      prop.rotation.z = timeSeconds * (25 + throttle * 85);
      prop.material.opacity = 0.04 + throttle * 0.08;
    },
  };
}
