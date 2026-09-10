import * as THREE from "../../vendor/three.module.js";

export function createOkanaganWorldRoot() {
  // Simulation/data use east, up, north. Three's visible world must be east,
  // up, south: leaving north as +Z mirrors geographic turns in the cockpit.
  // Keep the conversion at this boundary so terrain/contact/map data stay in
  // their authored coordinates. The camera and cockpit are outside this root.
  const root = new THREE.Group();
  root.name = "OKANAGAN_GEOGRAPHIC_WORLD";
  root.scale.z = -1;
  return root;
}

export function okanaganWorldToRender(point, target = new THREE.Vector3()) {
  return target.set(point.x, point.y, -point.z);
}

// Reflection is its own inverse. Use this for scenery-distance queries, never
// feed render-space southings back into northing-based terrain or collision.
export const okanaganRenderToWorld = okanaganWorldToRender;

export function setOkanaganCockpitCamera(camera, state) {
  okanaganWorldToRender(state.position, camera.position);
  camera.position.y += 2.25;
  camera.rotation.set(state.pitch_rad, -state.heading_rad, -state.roll_rad, "YXZ");
}

export function lookAtOkanaganPoint(camera, point) {
  camera.lookAt(okanaganWorldToRender(point));
}
