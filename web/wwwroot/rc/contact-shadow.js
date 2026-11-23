// A soft contact shadow under a toy (owner, 18 Nov 2026: the Pixar look; the car "barely casts a
// shadow" and reads pasted on). The sun shadow stays; this is the dark, soft footprint right under
// the body that sells scale at toy size. One quad per toy, no shadow-map cost. It hugs the ground
// below (the physics world's raycast), tilts with the surface, and fades and widens with height.
import * as T from '../vendor/three.module.js';

let texture = null;
function blobTexture() {
  if (texture) return texture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'),
    r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(0,0,0,0.9)');
  r.addColorStop(0.55, 'rgba(0,0,0,0.7)');
  r.addColorStop(0.8, 'rgba(0,0,0,0.25)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export function createContactShadow(scene, {width = 0.8, length = 1.05, strength = 0.8} = {}) {
  const material = new T.MeshBasicMaterial({
      map: blobTexture(),
      transparent: true,
      depthWrite: false,
      opacity: strength,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }),
    mesh = new T.Mesh(new T.PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const up = new T.Vector3(0, 1, 0),
    n = new T.Vector3(),
    q = new T.Quaternion(),
    yaw = new T.Quaternion(),
    flat = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0));
  return {
    mesh,
    /** pos: [x,y,z] of the toy's body; heading: yaw in radians; world: physics world with raycast. */
    update(pos, heading, world, visible = true) {
      const hit = visible && world?.raycast ? world.raycast([pos[0], pos[1] + 0.2, pos[2]], [0, -1, 0], 4) : null;
      if (!hit) {
        mesh.visible = false;
        return;
      }
      const height = Math.max(0, pos[1] - hit.point[1]),
        fade = Math.max(0, 1 - height / 2.2);
      mesh.visible = fade > 0.02;
      if (!mesh.visible) return;
      n.set(hit.normal[0], hit.normal[1], hit.normal[2]).normalize();
      q.setFromUnitVectors(up, n);
      yaw.setFromAxisAngle(up, -heading);
      mesh.quaternion.copy(q).multiply(yaw).multiply(flat);
      mesh.position.set(hit.point[0] + n.x * 0.012, hit.point[1] + n.y * 0.012, hit.point[2] + n.z * 0.012);
      const spread = 1 + height * 0.6;
      mesh.scale.set(width * spread, length * spread, 1);
      material.opacity = strength * fade * fade;
    }
  };
}
