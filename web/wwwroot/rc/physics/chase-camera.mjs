// Chase camera vs the collision world. A single ray leaves the camera sphere inside a
// wall whenever the hit is grazing (playtest 7 Nov: half sky, half the bowl wall).
// The sphere is walked back along the segment until it is clear of solid faces.
// A thin occluder (a rail, a post) does not pull the camera in; the sphere is only
// nudged out of that sliver.
import {sub, scale, madd, dot, cross, len, norm} from './math.mjs';

export const CHASE_CAMERA = Object.freeze({
  radius: 0.18, // clears the 6 cm near plane plus a margin off the collision skin
  minDist: 0.22,
  thinSpan: 0.42 // a face that does not continue both ways across the view is thin
});

function tangent(n) {
  const t = Math.abs(n[1]) < 0.85 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0]);
  return norm(t);
}

// A wall continues in both directions across its face. A rail or post does not.
function thinContact(world, contact, radius, span) {
  const n = contact.normal,
    t = tangent(n),
    b = norm(cross(n, t));
  const along = dir => {
    const p = madd(madd(contact.point, n, radius * 0.55), dir, span);
    return world.sphereContacts(p, radius * 0.8).some(c => dot(c.normal, n) > 0.82);
  };
  const wide = (along(t) || along(scale(t, -1))) && (along(b) || along(scale(b, -1)));
  return !wide;
}

// First solid face along one ray. Thin hits are stepped through. Returns the
// distance from `from`, or null when the ray reaches `maxDist` in the clear.
function solidHitDistance(world, from, dir, maxDist, radius, span) {
  let origin = from,
    left = maxDist;
  for (let k = 0; k < 5 && left > 0.02; k++) {
    const hit = world.raycast(origin, dir, left);
    if (!hit) return null;
    if (thinContact(world, hit, radius, span)) {
      const step = Math.min(left, hit.dist + radius);
      origin = madd(origin, dir, step);
      left -= step;
      continue;
    }
    return maxDist - left + hit.dist;
  }
  return null;
}

// Closest solid approach of a sphere swept from the eye to `wanted`.
// Checking only the endpoint would sit the camera on the far side of a wall.
function clearAlong(world, eye, wanted, radius, span) {
  const delta = sub(wanted, eye),
    dist = len(delta);
  if (dist < 1e-4) return [...eye];
  const dir = scale(delta, 1 / dist);
  const side = tangent(dir),
    up = norm(cross(dir, side));
  let nearest = dist;
  for (const origin of [
    eye,
    madd(eye, side, radius),
    madd(eye, side, -radius),
    madd(eye, up, radius),
    madd(eye, up, -radius)
  ]) {
    const hit = solidHitDistance(world, origin, dir, dist, radius, span);
    if (hit != null) nearest = Math.min(nearest, hit);
  }
  // A wall closer than the comfort gap wins: stop a radius short of the face
  // rather than sit the sphere in the concrete.
  const travel = nearest >= dist - 1e-4 ? dist : Math.max(0, nearest - radius);
  return madd(eye, dir, Math.min(dist, travel));
}

// Push the sphere out of whatever it still overlaps. Thin hits only move by their depth.
function depenetrate(world, point, radius, span) {
  let p = [...point];
  for (let i = 0; i < 5; i++) {
    const all = world.sphereContacts(p, radius);
    if (!all.length) break;
    const solid = all.filter(c => !thinContact(world, c, radius, span));
    const use = solid.length ? solid : all;
    let worst = use[0];
    for (const c of use) if (c.depth > worst.depth) worst = c;
    p = madd(p, worst.normal, worst.depth + 0.012);
  }
  return p;
}

// Sit minDist off the car when the sweep to that point is still clear. A nearer wall stays put.
function comfort(world, eye, position, radius, minDist, span) {
  const delta = sub(position, eye),
    dist = len(delta);
  if (dist < 1e-4 || dist + 1e-4 >= minDist) return position;
  const further = madd(eye, scale(delta, 1 / dist), minDist);
  const cleared = clearAlong(world, eye, further, radius, span);
  return len(sub(cleared, eye)) + 1e-3 < minDist ? position : cleared;
}

/**
 * @param {object} o
 * @param {number[]} o.eye car-side origin of the segment
 * @param {number[]} o.desired where the chase wants to sit
 * @param {number[]} [o.current] smoothed camera; cleared again so the glide cannot enter a wall
 * @param {object} o.world collision world (raycast + sphereContacts)
 * @param {number} [o.glide] 0..1 lerp toward the cleared aim
 */
export function resolveChaseCamera({
  eye,
  desired,
  current = null,
  world,
  glide = 1,
  radius = CHASE_CAMERA.radius,
  minDist = CHASE_CAMERA.minDist,
  thinSpan = CHASE_CAMERA.thinSpan
}) {
  const aim = depenetrate(world, clearAlong(world, eye, desired, radius, thinSpan), radius, thinSpan);
  const from = current ?? aim;
  const smoothed = aim.map((v, i) => from[i] + (v - from[i]) * glide);
  // Glide can ask for a point inside the wall, so the smoothed point is cleared again.
  const position = depenetrate(world, clearAlong(world, eye, smoothed, radius, thinSpan), radius, thinSpan);
  return {aim, position: comfort(world, eye, position, radius, minDist, thinSpan)};
}
