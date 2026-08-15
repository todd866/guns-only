import * as THREE from "../../vendor/three.module.js?v=338";

const ACTIVE = 0xffbd54;
const ROUTE = 0x59ebdf;

export function createOkanaganHighway(scene) {
  const group = new THREE.Group();
  group.name = "Fire Boss continuous highway in the sky";
  scene.add(group);
  let signature = "";

  function clear() {
    group.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    group.clear();
  }

  function rebuild(route = []) {
    const next = route.map((gate) => `${gate.id}:${gate.position.x.toFixed(1)}:${gate.position.y.toFixed(1)}:${gate.position.z.toFixed(1)}`).join("|");
    if (next === signature) return;
    signature = next;
    clear();
    const positions = route.map((gate) => new THREE.Vector3(gate.position.x, gate.position.y, gate.position.z));
    route.forEach((gate, index) => {
      const node = createGate(gate, index, positions);
      group.add(node);
      if (index > 0) group.add(createCorridor(positions[index - 1], positions[index], index));
    });
  }

  function update(route, activeGate) {
    rebuild(route);
    const last = Math.max(0, (route?.length ?? 1) - 1);
    const active = Math.min(activeGate, last);
    group.children.forEach((object) => {
      const index = object.userData.gateIndex ?? object.userData.segmentEndIndex ?? 0;
      const passed = index < active;
      object.visible = !passed || index === Math.max(0, active - 1);
      const isActive = object.userData.gateIndex === active;
      object.traverse((child) => {
        if (!child.material) return;
        child.material.opacity = isActive ? 0.98 : passed ? 0.12 : 0.42;
        if ("color" in child.material) child.material.color.setHex(isActive ? ACTIVE : ROUTE);
      });
      if (object.userData.gateIndex !== undefined) {
        const pulse = isActive ? 1 + Math.sin(performance.now() * 0.006) * 0.06 : 1;
        object.scale.setScalar(pulse);
      }
    });
  }

  return { group, update, dispose: clear };
}

function createGate(gate, index, positions) {
  const node = new THREE.Group();
  node.name = `route-gate:${gate.id}`;
  node.userData.gateIndex = index;
  node.position.copy(positions[index]);
  const direction = index < positions.length - 1
    ? positions[index + 1].clone().sub(positions[index])
    : index > 0 ? positions[index].clone().sub(positions[index - 1]) : new THREE.Vector3(0, 0, 1);
  direction.normalize();
  node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  const height = Math.max(95, Math.min(190, gate.radius_m * 0.22));
  const width = height * 1.72;
  const material = () => new THREE.MeshBasicMaterial({ color: ROUTE, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
  const addBar = (x, y, w, h) => {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material());
    bar.position.set(x, y, 0);
    node.add(bar);
  };
  addBar(0, height * 0.5, width, 7);
  addBar(-width * 0.5, 0, 7, height);
  addBar(width * 0.5, 0, 7, height);
  addBar(0, -height * 0.5, width * 0.34, 5);
  const arrow = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-width * 0.18, -height * 0.25, 1),
    new THREE.Vector3(0, -height * 0.43, 1),
    new THREE.Vector3(width * 0.18, -height * 0.25, 1),
  ]), new THREE.LineBasicMaterial({ color: ROUTE, transparent: true, opacity: 0.42 }));
  node.add(arrow);
  return node;
}

function createCorridor(start, end, endIndex) {
  const segment = new THREE.Group();
  segment.name = `route-corridor:${endIndex - 1}-${endIndex}`;
  segment.userData.segmentEndIndex = endIndex;
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length < 1) return segment;
  const direction = delta.clone().normalize();
  const right = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
  const material = new THREE.LineBasicMaterial({ color: ROUTE, transparent: true, opacity: 0.34 });
  for (const side of [-1, 1]) {
    const offset = right.clone().multiplyScalar(side * 75);
    segment.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      start.clone().add(offset), end.clone().add(offset),
    ]), material.clone()));
  }
  const steps = Math.max(1, Math.floor(length / 700));
  for (let step = 1; step < steps; step += 1) {
    const centre = start.clone().lerp(end, step / steps);
    const rung = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      centre.clone().addScaledVector(right, -75), centre.clone().addScaledVector(right, 75),
    ]), material.clone());
    segment.add(rung);
  }
  return segment;
}
