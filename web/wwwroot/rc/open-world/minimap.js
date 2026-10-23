import {buildingInfo} from './geometry.mjs';
import {WAVEPOOL_BEACH} from './wavepool-course.mjs';
// Dense tactical map renderer. The canvas is intentionally authored in 180x160 logical
// units so the existing HUD can move to a larger backing store without changing layout.
import { LOCATIONS } from './catalog.mjs';
const DEFAULTS = {
  bg: '#10242a', land: '#233b3c', water: '#164d61', building: '#526267', road: '#70827d',
  course: '#f2c56d', edge: '#fff1b0', center: '#c18c4d', finish: '#f8f4df', player: '#fff', rival: '#f47c68',
};

const finite = n => Number.isFinite(n);
const point = p => Array.isArray(p) && finite(p[0]) && finite(p[p.length > 2 ? 2 : 1]) ? [p[0], p[p.length > 2 ? 2 : 1]] : null;
const geometryPoints = geometry => {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates.map(point).filter(Boolean)];
  if (geometry.type === 'Polygon') return geometry.coordinates.map(r => r.map(point).filter(Boolean));
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap(p => p.map(r => r.map(point).filter(Boolean)));
  return [];
};
const allCoursePoints = course => {
  const out = [];
  if (course?.ai?.length) for (const n of course.ai) { const p = point(n.pos); if (p) out.push(p); }
  else for (const c of course?.checkpoints ?? []) { const p = finite(c?.[0]) && finite(c?.[1]) ? [c[0], c[1]] : null; if (p) out.push(p); }
  return out;
};

const visible = (pts, minX, maxX, minZ, maxZ, pad = 0) => pts.some(p => p[0] >= minX - pad && p[0] <= maxX + pad && p[1] >= minZ - pad && p[1] <= maxZ + pad);

function path(ctx, pts, map, close = false) {
  if (pts.length < 2) return;
  ctx.beginPath(); const a = map(pts[0]); ctx.moveTo(a[0], a[1]);
  for (let i = 1; i < pts.length; i++) { const p = map(pts[i]); ctx.lineTo(p[0], p[1]); }
  if (close) ctx.closePath();
}

function drawStatic(ctx, state, map, palette, bounds) {
  ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, 180, 160);
  const loaded = state.world?.loaded instanceof Map ? state.world.loaded : state.world?.stream?.loaded;
  const tileValues = loaded instanceof Map ? [...loaded.values()] : [];
  for (const tile of tileValues) for (const feature of tile.features ?? []) {
    const props = feature.properties ?? {}, rings = geometryPoints(feature.geometry);
    if (!rings.length || (props.building && feature.bbox && !buildingInfo(feature))) continue;
    const colour = props.natural === 'water' || props.water || props.waterway ? palette.water
      : props.building ? palette.building : props.landuse || props.leisure ? palette.land : null;
    if (!colour || !rings.some(r => visible(r, ...bounds))) continue;
    ctx.fillStyle = colour;
    for (const ring of rings) { path(ctx, ring, map, true); ctx.fill(); }
  }
  const roads = state.world?.overview?.roads ?? state.world?.roads ?? state.overview?.roads ?? [];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = palette.road; ctx.lineWidth = 1.2;
  for (const road of roads) { const pts = (road.points ?? road.geometry?.coordinates?.map(point))?.map(point).filter(Boolean); if (!pts?.length || !visible(pts, ...bounds)) continue; path(ctx, pts, map); ctx.stroke(); }
  // Authored water and beach use the same footprint as the visible wavepool.
  if(visible([[-604,3326],[-486,3404]],...bounds)){
    const rect=(x,z,w,d,color)=>{const a=map([x-w/2,z-d/2]),b=map([x+w/2,z+d/2]);ctx.fillStyle=color;ctx.fillRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);};
    rect(-545,3365,118,78,'#b99e70');rect(-545,3365,104,64,palette.water);
    for(const [x,z] of Object.values(WAVEPOOL_BEACH.landmarks))rect(x,z,5,5,'#b6c2b0');
  }
  const course = state.course;
  const pts = allCoursePoints(course);
  if (pts.length > 1) {
    const width = Math.max(1, (course?.event?.half ?? course?.half ?? 4) * 2 * (map([1, 0])[0] - map([0, 0])[0]));
    const alien = course?.event?.alien || course?.alien;
    ctx.strokeStyle = palette.edge; ctx.lineWidth = width + 2; path(ctx, pts, map); ctx.stroke();
    ctx.strokeStyle = alien ? `hsl(${(pts[0][1] % 360 + 360) % 360},75%,62%)` : palette.course; ctx.lineWidth = width; path(ctx, pts, map); ctx.stroke();
    if (alien) for (let i = 1; i < pts.length; i++) { const y0 = course.ai?.[i - 1]?.pos?.[1] ?? 0, y1 = course.ai?.[i]?.pos?.[1] ?? y0; ctx.strokeStyle = `hsl(${((y0 + y1) * 18) % 360},75%,62%)`; ctx.lineWidth = width; path(ctx, pts.slice(i - 1, i + 1), map); ctx.stroke(); }
    ctx.strokeStyle = palette.center; ctx.lineWidth = .8; ctx.setLineDash?.([2, 2]); path(ctx, pts, map); ctx.stroke(); ctx.setLineDash?.([]);
    for (const alt of course?.alts ?? []) { const line = (alt.nodes ?? []).map(n => finite(n?.[0]) && finite(n?.[1]) ? [n[0], n[1]] : null).filter(Boolean); ctx.strokeStyle = palette.center; ctx.lineWidth = 1.5; ctx.setLineDash?.([2, 2]); path(ctx, line, map); ctx.stroke(); ctx.setLineDash?.([]); }
    const finishRaw = course?.checkpoints?.at(-1); const finish = finishRaw && finite(finishRaw[0]) && finite(finishRaw[1]) ? [finishRaw[0], finishRaw[1]] : pts.at(-1);
    const before = pts.at(-2) ?? finish, f = map(finish), dx = finish[0] - before[0], dz = finish[1] - before[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * 4, nz = dx / l * 4;
    const tx = dx / l * 2, tz = dz / l * 2; ctx.lineWidth = 1;
    for (let i = -2; i < 2; i++) { ctx.strokeStyle = i % 2 ? palette.finish : palette.course; const cx = f[0] + tx * i, cz = f[1] + tz * i; ctx.beginPath(); ctx.moveTo(cx - nx, cz - nz); ctx.lineTo(cx + nx, cz + nz); ctx.stroke(); }
  }
  const locations = state.world?.locations ?? state.locations ?? LOCATIONS;
  ctx.fillStyle = palette.location ?? '#b5e5cc';
  for (const loc of locations) { const p = point(loc.pos); if (!p || !visible([p], ...bounds)) continue; const q = map(p); ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, Math.PI * 2); ctx.fill(); }
}

export function drawDetailedMinimap(ctx, { world, course, race, player, yaw = 0, palette = {} } = {}) {
  if (!ctx || typeof ctx.fillRect !== 'function') return false;
  ctx.save?.();
  const sx = (ctx.canvas?.width ?? 180) / 180, sy = (ctx.canvas?.height ?? 160) / 160;
  if (ctx.scale) ctx.scale(sx, sy);
  const colours = { ...DEFAULTS, ...palette };
  const car = player?.car?.pos ?? player?.pos ?? [0, 0, 0];
  const pts = allCoursePoints(course);
  const roam = !course || !pts.length || race?.roam;
  let minX, maxX, minZ, maxZ;
  if (roam) { const radius = 100, x = Math.round((car[0] ?? 0) / 32) * 32, z = Math.round((car[2] ?? car[1] ?? 0) / 32) * 32; minX = x - radius; maxX = x + radius; minZ = z - radius; maxZ = z + radius; }
  else { minX = Math.min(...pts.map(p => p[0])); maxX = Math.max(...pts.map(p => p[0])); minZ = Math.min(...pts.map(p => p[1])); maxZ = Math.max(...pts.map(p => p[1])); const margin = Math.max(12, (course.event?.half ?? course.half ?? 4) * 3); minX -= margin; maxX += margin; minZ -= margin; maxZ += margin; }
  const scale = Math.min(176 / Math.max(1, maxX - minX), 156 / Math.max(1, maxZ - minZ));
  const ox = (180 - (maxX - minX) * scale) / 2, oz = (160 - (maxZ - minZ) * scale) / 2;
  const map = ([x, z]) => [ox + (x - minX) * scale, oz + (z - minZ) * scale];
  const loaded = world?.loaded instanceof Map ? world.loaded : world?.stream?.loaded;
  const tileKey = loaded instanceof Map ? [...loaded.keys()].sort().join('|') : '';
  const centerKey = roam ? `${Math.round((car[0] ?? 0) / 32)},${Math.round((car[2] ?? car[1] ?? 0) / 32)}` : '';
  const cacheKey = `${course?.event?.id ?? course?.id ?? 'roam'}:${tileKey}:${centerKey}:${JSON.stringify(colours)}`;
  const cache = ctx.__detailedMinimapCache ??= { key: '', canvas: null };
  let cached = cache.key === cacheKey ? cache.canvas : null;
  if (!cached && globalThis.document?.createElement) {
    cached = document.createElement('canvas'); cached.width = 360; cached.height = 320;
    const c = cached.getContext?.('2d');
    if (c) { c.scale?.(2, 2); drawStatic(c, { world, course, overview: world?.overview }, map, colours, [minX, maxX, minZ, maxZ]); cache.key = cacheKey; cache.canvas = cached; }
  }
  if (cached && ctx.drawImage) ctx.drawImage(cached, 0, 0, 180, 160); else drawStatic(ctx, { world, course, overview: world?.overview }, map, colours, [minX, maxX, minZ, maxZ]);
  // Dynamic markers are deliberately drawn after the cached geometry.
  for (const rival of race?.rivals ?? []) { const p = point(rival.session?.car?.pos); if (!p) continue; const q = map(p); ctx.fillStyle = colours.rival; ctx.beginPath(); ctx.arc(q[0], q[1], 2.5, 0, Math.PI * 2); ctx.fill(); }
  const pp = map([car[0] ?? 0, car[2] ?? car[1] ?? 0]); ctx.fillStyle = colours.player; ctx.beginPath(); ctx.arc(pp[0], pp[1], 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.save?.(); ctx.translate?.(pp[0], pp[1]); ctx.rotate?.(yaw); ctx.fillStyle = colours.player; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-3, 3); ctx.lineTo(3, 3); ctx.closePath(); ctx.fill(); ctx.restore?.();
  ctx.restore?.();
  return true;
}
