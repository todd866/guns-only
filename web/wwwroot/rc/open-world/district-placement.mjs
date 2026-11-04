// Place a native metre district course in the open world.  This module deliberately
// knows nothing about the location catalog: callers provide the resolved placement.
import {createWorld} from '../physics/world.mjs';

const finite = (v, label) => {
  if (!Number.isFinite(v)) throw new TypeError(`${label} must be finite`);
  return v;
};

function placementOf(p) {
  if (!p || typeof p !== 'object') throw new TypeError('district placement is required');
  const a = p.anchor ?? p.pos ?? p.position ?? [0, 0, 0];
  if (!Array.isArray(a) || a.length < 3) throw new TypeError('district placement needs anchor [x,y,z]');
  const anchor = a.slice(0, 3).map((v, i) => finite(v, `anchor[${i}]`));
  const yaw = finite(Number(p.yaw ?? 0), 'placement yaw');
  const scale = Number(p.scale ?? 1);
  if (Math.abs(scale - 1) > 1e-9) throw new RangeError('district placement scale must be 1');
  return {anchor, yaw};
}

export function placeDistrictCourse(course, placement) {
  if (!course?.world?.tris) throw new TypeError('course must contain a native collision world');
  const {
    anchor: [ax, ay, az],
    yaw
  } = placementOf(placement);
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const point = ([x, y, z]) => [ax + c * x + s * z, ay + y, az - s * x + c * z];
  const vector = ([x, y, z]) => [c * x + s * z, y, -s * x + c * z];
  const world = createWorld();
  for (const t of course.world.tris) world.addTri(point(t.a), point(t.b), point(t.c), t.surface);
  const marker = m => ({...m, pos: point(m.pos), forward: vector(m.forward)});
  const gates = (course.gates ?? []).map(marker);
  // courseFromGlb exposes grid entries as {pos, yaw}; they are not full markers.
  const starts = (course.grid ?? []).map(g => ({...g, pos: point(g.pos), yaw: g.yaw - yaw}));
  const ai = (course.ai ?? []).map(marker),
    pickups = (course.pickups ?? []).map(marker),
    cams = (course.cams ?? []).map(marker);
  const checkpoints = (course.checkpoints ?? []).map(([x, z, name, width, dir]) => {
    const p = point([x, 0, z]),
      d = vector([dir?.[0] ?? 0, 0, dir?.[1] ?? -1]);
    return [p[0], p[2], name, width, [d[0], d[2]]];
  });
  const secrets = (course.secrets ?? []).map(q => {
    const p = point([q.x, q.y ?? 0, q.z]);
    return {...q, x: p[0], y: p[1], z: p[2]};
  });
  const coins = (course.coins ?? []).map(q => {
    const p = point([q.x, q.y ?? 0, q.z]);
    return {...q, x: p[0], y: p[1], z: p[2]};
  });
  const alts = (course.alts ?? []).map(a => ({
    ...a,
    nodes: (a.nodes ?? []).map(([x, z, width]) => {
      const p = point([x, 0, z]);
      return [p[0], p[2], width];
    })
  }));
  const start = course.start
    ? {...course.start, pos: point(course.start.pos), yaw: course.start.yaw - yaw}
    : undefined;
  return {
    ...course,
    world,
    gates,
    grid: starts,
    starts,
    ai,
    pickups,
    cams,
    checkpoints,
    secrets,
    coins,
    alts,
    start,
    placement: {anchor: [ax, ay, az], yaw}
  };
}

export const placeCourse = placeDistrictCourse;
