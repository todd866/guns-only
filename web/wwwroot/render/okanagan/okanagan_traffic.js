import * as THREE from "../../vendor/three.module.js";

function paint(color, extras = {}) {
  return new THREE.MeshBasicMaterial({ color, ...extras });
}

export function createOkanaganTrafficCraft(kind) {
  const helicopter = String(kind ?? "").toUpperCase() === "HELICOPTER";
  const group = new THREE.Group();
  group.name = helicopter ? "okanagan-helco" : "okanagan-air-attack";
  if (helicopter) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(4.2, 18, 6, 10), paint(0xc9a227));
    body.rotation.z = Math.PI / 2;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 22), paint(0xb48e1c));
    tail.position.set(0, 1.4, -18);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 5), paint(0xb48e1c));
    fin.position.set(0, 5.2, -28);
    const rotor = new THREE.Mesh(
      new THREE.CircleGeometry(22, 24),
      new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    rotor.rotation.x = -Math.PI / 2;
    rotor.position.y = 7.4;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6, 6), paint(0x222222));
    mast.position.y = 4.4;
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(4.8, 10, 8), paint(0x5c6570));
    cabin.position.set(8.5, 1.2, 0);
    cabin.scale.set(1.15, 0.85, 0.9);
    const skidLeft = new THREE.Mesh(new THREE.BoxGeometry(22, 0.5, 0.6), paint(0x222222));
    skidLeft.position.set(2, -4.2, 3.4);
    const skidRight = skidLeft.clone();
    skidRight.position.z = -3.4;
    group.add(body, tail, fin, mast, rotor, cabin, skidLeft, skidRight);
    group.userData.rotor = rotor;
  } else {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 22, 6, 10), paint(0xf2f0e6));
    body.rotation.z = Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(48, 0.9, 7.5), paint(0xe7e2d4));
    wing.position.y = 3.4;
    const tailplane = new THREE.Mesh(new THREE.BoxGeometry(16, 0.7, 4), paint(0xe7e2d4));
    tailplane.position.set(0, 2.2, -16);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7, 5), paint(0xd4cfc0));
    fin.position.set(0, 5.4, -16);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(18, 0.6, 0.6), paint(0x333333));
    boom.position.set(0, -2.4, 2);
    group.add(body, wing, tailplane, fin, boom);
  }
  const outline = new THREE.Mesh(
    new THREE.SphereGeometry(helicopter ? 26 : 28, 10, 8),
    new THREE.MeshBasicMaterial({
      color: 0x101010,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  outline.scale.set(1, helicopter ? 0.45 : 0.28, 1);
  group.add(outline);
  return group;
}

export function poseOkanaganTrafficCraft(craft, track, timeSeconds = 0) {
  if (!craft || !track?.position) return;
  craft.position.set(track.position.x, track.position.y, track.position.z);
  craft.rotation.y = Number(track.heading_rad) || 0;
  if (craft.userData?.rotor) craft.userData.rotor.rotation.z = timeSeconds * 28;
}
