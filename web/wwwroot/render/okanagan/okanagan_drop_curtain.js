import * as THREE from "../../vendor/three.module.js";

export const OKANAGAN_DROP_CURTAIN = Object.freeze({
  fallSpeedMps: 34,
  maxSamples: 96,
  emitPerTick: 6,
  maxAgeSeconds: 6,
  hitSlopM: 8,
  jitterM: 5.5,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hash01(value) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Authority-agnostic water curtain. Presentation calls this once per frame with the published
 * aircraft pose and surface height; it does not sample private mission state.
 */
export function stepOkanaganDropCurtain(samples, options = {}) {
  const dtSeconds = Math.max(0, finite(options.dtSeconds, 1 / 60));
  const surfaceY = finite(options.surfaceY);
  const origin = options.origin ?? {};
  const active = options.active === true;
  const next = [];
  for (const sample of samples ?? []) {
    const y = finite(sample?.y) - OKANAGAN_DROP_CURTAIN.fallSpeedMps * dtSeconds;
    const age = finite(sample?.age) + dtSeconds;
    if (y <= surfaceY - 1) continue;
    if (age > OKANAGAN_DROP_CURTAIN.maxAgeSeconds) continue;
    next.push(Object.freeze({
      x: finite(sample?.x),
      y,
      z: finite(sample?.z),
      age,
    }));
  }
  if (active) {
    for (let index = 0; index < OKANAGAN_DROP_CURTAIN.emitPerTick; index += 1) {
      if (next.length >= OKANAGAN_DROP_CURTAIN.maxSamples) break;
      const seed = finite(origin.x) * 0.013 + finite(origin.z) * 0.017 + next.length + index;
      next.push(Object.freeze({
        x: finite(origin.x) + (hash01(seed) - 0.5) * OKANAGAN_DROP_CURTAIN.jitterM,
        y: finite(origin.y) - 2.5,
        z: finite(origin.z) + (hash01(seed + 3) - 0.5) * OKANAGAN_DROP_CURTAIN.jitterM,
        age: 0,
      }));
    }
  }
  return next.slice(0, OKANAGAN_DROP_CURTAIN.maxSamples);
}

export function createOkanaganDropCurtain(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.2, 6.2, 1.1),
    new THREE.MeshBasicMaterial({
      color: 0xb7f4ff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
    OKANAGAN_DROP_CURTAIN.maxSamples,
  );
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.name = "fireboss water curtain";
  scene?.add(mesh);
  const dummy = new THREE.Object3D();
  let samples = [];

  function update(current, active, dtSeconds, surfaceY) {
    samples = stepOkanaganDropCurtain(samples, {
      active,
      origin: current?.position,
      surfaceY,
      dtSeconds,
    });
    samples.forEach((sample, index) => {
      dummy.position.set(sample.x, sample.y, sample.z);
      dummy.rotation.set(0, sample.age * 0.4, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.count = samples.length;
    mesh.instanceMatrix.needsUpdate = true;
    return samples.length;
  }

  return { group: mesh, update };
}
