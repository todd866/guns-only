// Reachable cumulus, separate from the distant painted sky. All heights are metres AGL.
import {CANYON_LENGTH, canyonPoint} from './canyon.mjs';

const base = [
  [-607, -29],
  [-1285, -1132],
  [-546, 791],
  [380, 400],
  [24, 1842],
  [618, 71],
  [-1130, 1230],
  [800, -800]
];
export const CLOUDS = Object.freeze(
  Array.from({length: 14}, (_, i) =>
    Object.freeze({
      id: `cloud-${i + 1}`,
      x: base[i]?.[0] ?? 0,
      z: base[i]?.[1] ?? 0,
      along: i < 8 ? null : 240 + ((i - 8) * (CANYON_LENGTH - 480)) / 5,
      radius: 44 + (i % 3) * 5,
      base: 78 + (i % 3) * 6,
      top: 125 + (i % 3) * 4,
      speed: 1.2 + (i % 4) * 0.2,
      puffs: 10
    })
  )
);
const smooth = x => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

export function createCloudField(heightAt = () => 0, saved = []) {
  const field = {
    heightAt,
    time: 0,
    clouds: CLOUDS.map(def => ({...def, ground: 0, y: 0, alpha: 1, collected: saved.includes(def.id)})),
    fog: 0,
    fogTarget: 0,
    inside: false,
    whoosh: false,
    rising: false,
    rose: false,
    collectedMask: 0
  };
  // Cache each bounded drift track once. Height sampling may traverse terrain data; the frame
  // loop only interpolates these prepared samples and never builds vectors or terrain queries.
  for (const cloud of field.clouds) {
    cloud.track = new Float64Array(121 * 3);
    for (let j = 0; j <= 120; j++) {
      const offset = j - 60;
      const p = cloud.along == null ? null : canyonPoint(cloud.along + offset);
      const x = p ? p.x : cloud.x + offset,
        z = p ? p.z : cloud.z;
      cloud.track[j * 3] = x;
      cloud.track[j * 3 + 1] = heightAt(x, z);
      cloud.track[j * 3 + 2] = z;
    }
  }
  updateCloudField(field, 0);
  return field;
}

export function updateCloudField(field, dt) {
  field.time += Math.max(0, dt);
  for (let i = 0; i < field.clouds.length; i++) {
    const c = field.clouds[i],
      phase = (60 + field.time * c.speed) % 120;
    const j = Math.floor(phase),
      t = phase - j,
      k = j * 3,
      a = c.track;
    c.x = a[k] + (a[k + 3] - a[k]) * t;
    c.z = a[k + 2] + (a[k + 5] - a[k + 2]) * t;
    c.ground = a[k + 1] + (a[k + 4] - a[k + 1]) * t;
    c.y = c.ground + (c.base + c.top) / 2;
    // Fade out at the wrap edge, then back in at the other edge of the same small patch.
    c.alpha = smooth(Math.min(phase, 120 - phase) / 4);
  }
}

export function cloudLift(field, pos) {
  let lift = 0;
  for (const c of field.clouds) {
    if (pos[1] < c.ground || pos[1] >= c.ground + c.base) continue;
    const d = Math.hypot(pos[0] - c.x, pos[2] - c.z) / c.radius;
    lift = Math.max(lift, 3 * smooth((1 - d) / 0.3) * c.alpha);
  }
  return lift;
}

// Swept ellipsoid core: skimming a lobe doesn't count, but a fast flight cannot skip the core.
export function crossesCloudCore(c, prev, pos) {
  const rx = c.radius * 0.6,
    ry = (c.top - c.base) * 0.3;
  const x = (prev[0] - c.x) / rx,
    y = (prev[1] - c.y) / ry,
    z = (prev[2] - c.z) / rx;
  const dx = (pos[0] - prev[0]) / rx,
    dy = (pos[1] - prev[1]) / ry,
    dz = (pos[2] - prev[2]) / rx;
  const length2 = dx * dx + dy * dy + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, -(x * dx + y * dy + z * dz) / length2)) : 0;
  return (x + dx * t) ** 2 + (y + dy * t) ** 2 + (z + dz * t) ** 2 <= 1;
}

// Reused result fields: allocations happen only when the caller saves a newly collected ID.
export function sampleClouds(field, pos, prev = pos, flying = true) {
  field.collectedMask = 0;
  field.whoosh = field.rising = false;
  field.fogTarget = 0;
  if (flying) {
    for (let i = 0; i < field.clouds.length; i++) {
      const c = field.clouds[i];
      if (c.alpha < 0.95) continue;
      const d = Math.hypot(
        (pos[0] - c.x) / c.radius,
        (pos[1] - c.y) / ((c.top - c.base) / 2),
        (pos[2] - c.z) / c.radius
      );
      field.fogTarget = Math.max(field.fogTarget, 0.92 * smooth((0.85 - d) / 0.4));
      if (!c.collected && crossesCloudCore(c, prev, pos)) {
        c.collected = true;
        field.collectedMask |= 1 << i;
      }
    }
    if (!field.rose && cloudLift(field, pos) > 0.5) field.rose = field.rising = true;
  }
  if (field.fogTarget > 0.3 && !field.inside) field.whoosh = field.inside = true;
  else if (field.fogTarget < 0.05) field.inside = false;
  return field;
}
