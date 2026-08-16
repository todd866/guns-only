import * as THREE from "../../vendor/three.module.js?v=340";

/** Outside-world view: no decorative cockpit frame or invented first-person aircraft mesh. */
export function createFireBossCockpit(camera) {
  const group = new THREE.Group();
  group.name = "AT-802F unobstructed pilot view";

  camera.add(group);
  return {
    group,
    update() {},
  };
}
