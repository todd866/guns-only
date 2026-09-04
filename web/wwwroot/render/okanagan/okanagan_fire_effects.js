import * as THREE from "../../vendor/three.module.js";

export const OKANAGAN_FIRE_VISUAL_CONTRACT = Object.freeze({
  minimumIntensity: 0.03,
  smokeLayersPerCell: 3,
  maximumGroundRadiusM: 130,
  incidentPlumePuffs: 5,
});

const CELL_FOOTPRINT_M = 82;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hash01(value) {
  const x = Math.sin(finite(value) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value)));
}

/**
 * One visual envelope per published fire cell. Ground scars cover the 140 m cell so the
 * flank reads as one fire. Long-range smoke lives on the incident plume, not these cones.
 */
export function okanaganFireVisualProfile(cell, timeSeconds = 0) {
  const intensity = clamp(cell?.intensity, 0, 1);
  if (intensity < OKANAGAN_FIRE_VISUAL_CONTRACT.minimumIntensity) return null;
  const column = Math.trunc(finite(cell?.column));
  const row = Math.trunc(finite(cell?.row));
  const phase = finite(timeSeconds) * 4.2 + column * 1.73 + row * 0.91;
  return Object.freeze({
    x: finite(cell?.x),
    y: finite(cell?.y),
    z: finite(cell?.z),
    intensity,
    pulse: 0.88 + Math.sin(phase) * 0.12,
    groundRadiusM: CELL_FOOTPRINT_M + intensity * 36,
    outerRadiusM: 8 + intensity * 11,
    outerHeightM: 22 + intensity * 28,
    coreRadiusM: 3.2 + intensity * 5.5,
    coreHeightM: 14 + intensity * 22,
    smokeRadiusM: 18 + intensity * 14,
  });
}

/**
 * One column for the whole published flank. Cell cones are timber-scale; this is what you
 * read from the lake join, about fifteen kilometres out.
 */
export function okanaganIncidentPlume(cells, timeSeconds = 0) {
  let x = 0;
  let y = 0;
  let z = 0;
  let weight = 0;
  for (const cell of cells ?? []) {
    const intensity = clamp(cell?.intensity, 0, 1);
    if (intensity < OKANAGAN_FIRE_VISUAL_CONTRACT.minimumIntensity) continue;
    x += finite(cell?.x) * intensity;
    y += finite(cell?.y) * intensity;
    z += finite(cell?.z) * intensity;
    weight += intensity;
  }
  if (weight < 0.35) return null;
  const meanIntensity = clamp(weight / Math.max(1, (cells ?? []).length), 0.2, 1);
  const peakIntensity = clamp(
    Math.max(...(cells ?? []).map((cell) => finite(cell?.intensity))),
    0,
    1,
  );
  const column = 0.55 * meanIntensity + 0.45 * peakIntensity;
  const phase = finite(timeSeconds) * 0.11;
  return Object.freeze({
    x: x / weight,
    y: y / weight,
    z: z / weight,
    intensity: column,
    heightM: 1_400 + column * 900,
    baseRadiusM: 120 + column * 140,
    pallRadiusM: 520 + column * 380,
    pulse: 0.94 + Math.sin(phase) * 0.06,
  });
}

/**
 * Principal-axis fire front from published hot cells. This is the thing you fly at on a drop run:
 * a length of timber on fire, not a scatter of cones.
 */
export function okanaganFireline(cells) {
  const hot = [];
  for (const cell of cells ?? []) {
    const intensity = clamp(cell?.intensity, 0, 1);
    if (intensity < 0.08) continue;
    hot.push({
      x: finite(cell?.x),
      y: finite(cell?.y),
      z: finite(cell?.z),
      intensity,
    });
  }
  if (hot.length < 2) return null;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let weight = 0;
  for (const point of hot) {
    cx += point.x * point.intensity;
    cy += point.y * point.intensity;
    cz += point.z * point.intensity;
    weight += point.intensity;
  }
  cx /= weight;
  cy /= weight;
  cz /= weight;
  let covXX = 0;
  let covXZ = 0;
  let covZZ = 0;
  for (const point of hot) {
    const dx = point.x - cx;
    const dz = point.z - cz;
    covXX += point.intensity * dx * dx;
    covXZ += point.intensity * dx * dz;
    covZZ += point.intensity * dz * dz;
  }
  const theta = 0.5 * Math.atan2(2 * covXZ, covXX - covZZ);
  const axisX = Math.cos(theta);
  const axisZ = Math.sin(theta);
  let minS = Number.POSITIVE_INFINITY;
  let maxS = Number.NEGATIVE_INFINITY;
  for (const point of hot) {
    const s = (point.x - cx) * axisX + (point.z - cz) * axisZ;
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
  }
  const lengthM = maxS - minS;
  if (lengthM < 80) return null;
  const meanIntensity = clamp(weight / hot.length, 0.2, 1);
  const heightM = 38 + meanIntensity * 34;
  const posts = [];
  const spacingM = 36;
  for (let s = minS; s <= maxS + 0.01; s += spacingM) {
    posts.push(Object.freeze({
      x: cx + axisX * s,
      y: cy,
      z: cz + axisZ * s,
      heightM,
      radiusM: 11 + meanIntensity * 7,
    }));
  }
  return Object.freeze({
    x: cx,
    y: cy,
    z: cz,
    axisX,
    axisZ,
    startX: cx + axisX * minS,
    startZ: cz + axisZ * minS,
    endX: cx + axisX * maxS,
    endZ: cz + axisZ * maxS,
    lengthM,
    heightM,
    widthM: 48 + meanIntensity * 40,
    intensity: meanIntensity,
    posts,
  });
}

function creditedSteamOrigin(cells, impact) {
  let y = finite(impact?.y);
  let best = Number.POSITIVE_INFINITY;
  for (const cell of cells ?? []) {
    if (clamp(cell?.intensity, 0, 1) < OKANAGAN_FIRE_VISUAL_CONTRACT.minimumIntensity) continue;
    const rangeM = Math.hypot(finite(cell.x) - finite(impact?.x), finite(cell.z) - finite(impact?.z));
    if (rangeM >= best) continue;
    best = rangeM;
    y = finite(cell.y);
  }
  return { x: finite(impact?.x), y, z: finite(impact?.z) };
}

export function createOkanaganFireEffects(scene, capacity = 180) {
  const group = new THREE.Group();
  group.name = "authority-backed Okanagan fire";
  const boundedCapacity = Math.max(1, Math.trunc(finite(capacity, 180)));
  const footprintMaterial = new THREE.MeshBasicMaterial({
    color: 0x2a1810,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const emberMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4618,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const outerMaterial = new THREE.MeshBasicMaterial({
    color: 0xff641c,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe18a,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0x2c3032,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  const plumeMaterial = new THREE.MeshBasicMaterial({
    color: 0x121416,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    fog: false,
  });
  const firelineMaterial = new THREE.MeshBasicMaterial({
    color: 0xff5a18,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const steamMaterial = new THREE.MeshBasicMaterial({
    color: 0xd8e4ea,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const footprints = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 14), footprintMaterial, boundedCapacity);
  const embers = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 12), emberMaterial, boundedCapacity);
  const flames = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 7), outerMaterial, boundedCapacity);
  const cores = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 7), coreMaterial, boundedCapacity);
  const smoke = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1), smokeMaterial,
    boundedCapacity * OKANAGAN_FIRE_VISUAL_CONTRACT.smokeLayersPerCell);
  const plume = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8), plumeMaterial,
    OKANAGAN_FIRE_VISUAL_CONTRACT.incidentPlumePuffs + 3);
  const fireline = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6), firelineMaterial, 64);
  const steam = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1), steamMaterial, 48);
  footprints.name = "published fire-cell scars";
  embers.name = "published fire-cell embers";
  flames.name = "published fire-cell outer flame";
  cores.name = "published fire-cell hot core";
  smoke.name = "published fire-cell smoke columns";
  plume.name = "incident smoke column";
  fireline.name = "published fireline";
  steam.name = "credited drop steam";
  footprints.renderOrder = 2;
  embers.renderOrder = 2;
  flames.renderOrder = cores.renderOrder = fireline.renderOrder = 3;
  plume.renderOrder = 1;
  steam.renderOrder = 4;
  footprints.frustumCulled = embers.frustumCulled = flames.frustumCulled
    = cores.frustumCulled = smoke.frustumCulled = plume.frustumCulled
    = fireline.frustumCulled = steam.frustumCulled = false;
  footprints.count = embers.count = flames.count = cores.count
    = smoke.count = plume.count = fireline.count = steam.count = 0;
  group.add(footprints, embers, flames, cores, smoke, plume, fireline, steam);
  scene.add(group);
  const dummy = new THREE.Object3D();
  let steamPuffs = [];

  function update(cells, timeSeconds, wind = new THREE.Vector3(0.42, 0, 0.91), impact = null) {
    let cellCount = 0;
    let smokeCount = 0;
    for (const cell of cells ?? []) {
      const profile = okanaganFireVisualProfile(cell, timeSeconds);
      if (!profile || cellCount >= boundedCapacity) continue;

      dummy.position.set(profile.x, profile.y + 1.4, profile.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(profile.groundRadiusM);
      dummy.updateMatrix();
      footprints.setMatrixAt(cellCount, dummy.matrix);

      dummy.scale.setScalar(profile.groundRadiusM * 0.62);
      dummy.updateMatrix();
      embers.setMatrixAt(cellCount, dummy.matrix);

      dummy.position.set(profile.x, profile.y + profile.outerHeightM * profile.pulse / 2,
        profile.z);
      dummy.rotation.set(0, finite(timeSeconds) + finite(cell?.column), 0);
      dummy.scale.set(profile.outerRadiusM, profile.outerHeightM * profile.pulse,
        profile.outerRadiusM);
      dummy.updateMatrix();
      flames.setMatrixAt(cellCount, dummy.matrix);

      dummy.position.set(profile.x, profile.y + profile.coreHeightM * profile.pulse / 2 + 2,
        profile.z);
      dummy.rotation.set(0, -finite(timeSeconds) * 0.7 - finite(cell?.row), 0);
      dummy.scale.set(profile.coreRadiusM, profile.coreHeightM * profile.pulse,
        profile.coreRadiusM);
      dummy.updateMatrix();
      cores.setMatrixAt(cellCount, dummy.matrix);

      for (let layer = 0;
        layer < OKANAGAN_FIRE_VISUAL_CONTRACT.smokeLayersPerCell;
        layer += 1) {
        const height = 28 + layer * 36 + profile.intensity * 48;
        const drift = height * (0.22 + layer * 0.05);
        dummy.position.set(
          profile.x + finite(wind?.x, 0.42) * drift,
          profile.y + height,
          profile.z + finite(wind?.z, 0.91) * drift,
        );
        dummy.rotation.set(0, finite(timeSeconds) * 0.08 + finite(cell?.row), 0);
        dummy.scale.setScalar(profile.smokeRadiusM * (1 + layer * 0.42));
        dummy.updateMatrix();
        smoke.setMatrixAt(smokeCount++, dummy.matrix);
      }
      cellCount += 1;
    }

    const incident = okanaganIncidentPlume(cells, timeSeconds);
    let plumeCount = 0;
    if (incident) {
      const puffCount = OKANAGAN_FIRE_VISUAL_CONTRACT.incidentPlumePuffs;
      for (let layer = 0; layer < puffCount; layer += 1) {
        const climb = incident.heightM * (0.12 + layer * 0.16) * incident.pulse;
        const drift = climb * (0.08 + layer * 0.03);
        dummy.position.set(
          incident.x + finite(wind?.x, 0.42) * drift,
          incident.y + climb,
          incident.z + finite(wind?.z, 0.91) * drift,
        );
        dummy.rotation.set(0, finite(timeSeconds) * 0.05 + layer, 0);
        dummy.scale.setScalar(incident.baseRadiusM * (1 + layer * 0.38) * incident.pulse);
        dummy.updateMatrix();
        plume.setMatrixAt(plumeCount++, dummy.matrix);
      }
      dummy.position.set(
        incident.x + finite(wind?.x, 0.42) * incident.heightM * 0.12,
        incident.y + incident.heightM * 0.72,
        incident.z + finite(wind?.z, 0.91) * incident.heightM * 0.12,
      );
      dummy.scale.set(
        incident.pallRadiusM,
        incident.pallRadiusM * 0.28,
        incident.pallRadiusM,
      );
      dummy.updateMatrix();
      plume.setMatrixAt(plumeCount++, dummy.matrix);
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(incident.x, incident.y + 210, incident.z);
      dummy.scale.set(48, 380, 48);
      dummy.updateMatrix();
      plume.setMatrixAt(plumeCount++, dummy.matrix);
      dummy.position.set(incident.x, incident.y + incident.heightM * 0.58, incident.z);
      dummy.scale.set(
        incident.baseRadiusM * 1.35,
        incident.heightM * 0.42,
        incident.baseRadiusM * 1.35,
      );
      dummy.updateMatrix();
      plume.setMatrixAt(plumeCount++, dummy.matrix);
    }

    const line = okanaganFireline(cells);
    let firelineCount = 0;
    if (line) {
      const pulse = 0.9 + Math.sin(finite(timeSeconds) * 5.1) * 0.1;
      for (const post of line.posts) {
        dummy.position.set(post.x, post.y + post.heightM * pulse / 2, post.z);
        dummy.rotation.set(0, finite(timeSeconds) * 0.7 + firelineCount, 0);
        dummy.scale.set(post.radiusM, post.heightM * pulse, post.radiusM);
        dummy.updateMatrix();
        fireline.setMatrixAt(firelineCount++, dummy.matrix);
      }
    }

    const dtSeconds = Math.max(0, finite(impact?.dtSeconds, 1 / 60));
    steamPuffs = steamPuffs
      .map((puff) => Object.freeze({
        x: puff.x + finite(wind?.x, 0.42) * 6 * dtSeconds,
        y: puff.y + 18 * dtSeconds,
        z: puff.z + finite(wind?.z, 0.91) * 6 * dtSeconds,
        age: puff.age + dtSeconds,
        radius: puff.radius + 10 * dtSeconds,
      }))
      .filter((puff) => puff.age < 2.5);
    if (finite(impact?.kg) >= 50) {
      const origin = creditedSteamOrigin(cells, impact);
      for (let index = 0; index < 8 && steamPuffs.length < 48; index += 1) {
        const seed = origin.x * 0.02 + origin.z * 0.03 + index;
        steamPuffs.push(Object.freeze({
          x: origin.x + (hash01(seed) - 0.5) * 22,
          y: origin.y + 3 + index * 1.4,
          z: origin.z + (hash01(seed + 9) - 0.5) * 22,
          age: 0,
          radius: 7 + index * 1.8,
        }));
      }
    }
    steamPuffs.forEach((puff, index) => {
      dummy.position.set(puff.x, puff.y, puff.z);
      dummy.rotation.set(0, puff.age, 0);
      dummy.scale.setScalar(puff.radius);
      dummy.updateMatrix();
      steam.setMatrixAt(index, dummy.matrix);
    });

    footprints.count = embers.count = flames.count = cores.count = cellCount;
    smoke.count = smokeCount;
    plume.count = plumeCount;
    fireline.count = firelineCount;
    steam.count = steamPuffs.length;
    footprints.instanceMatrix.needsUpdate = true;
    embers.instanceMatrix.needsUpdate = true;
    flames.instanceMatrix.needsUpdate = true;
    cores.instanceMatrix.needsUpdate = true;
    smoke.instanceMatrix.needsUpdate = true;
    plume.instanceMatrix.needsUpdate = true;
    fireline.instanceMatrix.needsUpdate = true;
    steam.instanceMatrix.needsUpdate = true;
    return Object.freeze({
      cells: cellCount,
      smokePuffs: smokeCount,
      incidentPlumes: incident ? 1 : 0,
      firelineSegments: firelineCount,
      steamPuffs: steamPuffs.length,
    });
  }

  return {
    group,
    update,
    layers: Object.freeze({
      footprints, embers, flames, cores, smoke, plume, fireline, steam,
    }),
  };
}
