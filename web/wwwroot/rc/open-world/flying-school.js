import * as T from '../../vendor/three.module.js';
import {SCHOOL, createSchool, startSchool, stopSchool, stepSchool, ringNormal} from './flying-school.mjs';

// All eight ring meshes share their geometry and the two state materials. Changing lessons
// reuses the meshes; there are no downloads or geometry allocations during a flight.
export function createFlyingSchool(scene, heightAt = () => 0) {
  const root = new T.Group();
  root.name = 'Flying School';
  const state = createSchool(),
    keep = [],
    K = x => (keep.push(x), x),
    geometry = K(new T.TorusGeometry(1, 0.055, 8, 48)),
    gold = K(new T.MeshBasicMaterial({color: '#ffd064', fog: false})),
    white = K(
      new T.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false})
    ),
    rings = Array.from({length: 8}, () => {
      const mesh = new T.Mesh(geometry, white);
      mesh.visible = false;
      root.add(mesh);
      return mesh;
    }),
    normal = new T.Vector3(),
    zAxis = new T.Vector3(0, 0, 1),
    box = K(new T.BoxGeometry(1, 1, 1)),
    blue = K(new T.MeshStandardMaterial({color: '#407e98', roughness: 0.8})),
    cream = K(new T.MeshStandardMaterial({color: '#efe7cf', roughness: 0.85})),
    orange = K(new T.MeshBasicMaterial({color: '#ff954e'}));
  function block(parent, material, pos, size) {
    const mesh = new T.Mesh(box, material);
    mesh.position.set(...pos);
    mesh.scale.set(...size);
    parent.add(mesh);
    return mesh;
  }
  const [x, , z] = SCHOOL.at,
    y = heightAt(x, z);
  // Leave the arrival point clear; a little hangar and windsock mark its west side.
  block(root, cream, [x - 12, y + 2, z], [10, 4, 8]);
  block(root, blue, [x - 12, y + 4.2, z], [11, 0.5, 9]);
  block(root, blue, [x - 6.95, y + 1.5, z], [0.12, 3, 5]);
  block(root, cream, [x + 5, y + 3, z - 5], [0.12, 6, 0.12]);
  const sock = block(root, orange, [x + 6.4, y + 5.8, z - 5], [2.8, 0.5, 0.5]);
  const landing = new T.Group(),
    {center, half, yaw} = SCHOOL.landing;
  landing.position.set(center[0], heightAt(center[0], center[2]) + 0.12, center[2]);
  landing.rotation.y = -yaw;
  for (const side of [-1, 1]) {
    block(landing, gold, [side * half, 0, 0], [0.35, 0.08, half * 2]);
    block(landing, gold, [0, 0, side * half], [half * 2, 0.08, 0.35]);
  }
  landing.visible = false;
  root.add(landing);
  scene.add(root);
  let clock = 0;
  function draw() {
    const lesson = state.lessons?.[state.lesson];
    rings.forEach((mesh, i) => {
      const ring = lesson?.rings[i];
      mesh.visible = !!(state.active && ring && i >= state.next && !state.pending);
      if (!mesh.visible) return;
      mesh.position.set(ring[0], ring[1], ring[2]);
      normal.set(...ringNormal(lesson, i));
      mesh.quaternion.setFromUnitVectors(zAxis, normal);
      mesh.material = i === state.next ? gold : white;
      mesh.scale.setScalar(ring[4]);
    });
    gold.color.setHSL(0.12, 1, 0.6 + Math.sin(clock * 4) * 0.12);
    landing.visible = state.active && state.lesson === 2;
    sock.rotation.y = Math.sin(clock * 2) * 0.08;
  }
  return {
    state,
    start(mode) {
      const event = startSchool(state, {mode, groundY: heightAt(24, 1842)});
      draw();
      return event;
    },
    stop() {
      stopSchool(state);
      draw();
    },
    step(dt, pilot) {
      clock += dt;
      const events = stepSchool(state, pilot, dt);
      draw();
      return events;
    },
    dispose() {
      stopSchool(state);
      root.removeFromParent();
      keep.forEach(resource => resource.dispose());
    }
  };
}
