import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Small, deliberately soft residential dressing.  The input uses only local
// metres and anonymous feature kinds; this module does not retain map/source
// identifiers.  Yard dressing is visual only, so it cannot create a surprise
// collision beside a driveway or a kerb.

const ROAD_EXCLUSIONS = /foot|path|walk|cycle|trail/i;
const ROAD_PREFERENCES = /residential|service|tertiary|secondary|primary|street|avenue|drive|road/i;
const roadWidth = kind => /primary|secondary|tertiary/i.test(kind || '') ? 8 : /service/i.test(kind || '') ? 5 : 5.8;

const cleanRing = ring => {
  if (!Array.isArray(ring)) return [];
  return ring.length > 3 && ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1] ? ring.slice(0, -1) : ring;
};

const centreOf = ring => {
  const points = cleanRing(ring);
  if (!points.length) return null;
  return points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]).map(value => value / points.length);
};

const boundsOf = ring => {
  const points = cleanRing(ring);
  if (!points.length) return null;
  const xs = points.map(point => point[0]), zs = points.map(point => point[1]);
  return {minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs)};
};

const nearestPointOnSegment = (point, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  const q = [a[0] + dx * t, a[1] + dz * t];
  return {q, d: Math.hypot(point[0] - q[0], point[1] - q[1]), dx, dz};
};

/** Return the nearest drivable road segment for a local x/z point. */
export function nearestResidentialRoad(point, roads = []) {
  let best = null;
  for (const road of roads) {
    if (ROAD_EXCLUSIONS.test(road?.kind || '') || !Array.isArray(road?.points)) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      if (!Array.isArray(a) || !Array.isArray(b)) continue;
      const hit = nearestPointOnSegment(point, a, b);
      const preference = ROAD_PREFERENCES.test(road.kind || '') ? 0 : 2;
      if (!best || hit.d + preference < best.d + best.preference) best = {...hit, kind: road.kind || '', preference};
    }
  }
  return best;
}

/** Select a stable, spatially distributed subset of houses for the draw budget. */
export function selectResidentialYards(buildings = [], roads = [], maxYards = 300) {
  const candidates = buildings.map((building, index) => {
    if (building?.kind !== 'house') return null;
    const centre = centreOf(building.points);
    const bounds = boundsOf(building.points);
    const road = centre && nearestResidentialRoad(centre, roads);
    if (!centre || !bounds || !road || road.d < 2.8 || road.d > 28) return null;
    return {building, index, centre, bounds, road};
  }).filter(Boolean);
  if (candidates.length <= maxYards) return candidates;
  // Taking every Nth feature preserves the neighbourhood’s mapped spread and
  // avoids a dense cluster if the source list happens to be grouped by block.
  const stride = candidates.length / maxYards;
  return Array.from({length: maxYards}, (_, slot) => candidates[Math.floor(slot * stride)]);
}

/** Compute the soft, in-yard placement envelope for a selected house. */
export function computeResidentialYardPlacement({building, bounds, centre, road}) {
  if (!building || !bounds || !centre || !road || !Number.isFinite(road.d) || road.d <= 0) return null;
  const [cx, cz] = centre;
  const distance = road.d;
  const front = [(road.q[0] - cx) / distance, (road.q[1] - cz) / distance];
  const tangent = [-front[1], front[0]];
  const width = Math.max(3.5, Math.min(13, bounds.maxX - bounds.minX));
  const depth = Math.max(3.5, Math.min(13, bounds.maxZ - bounds.minZ));
  const housePoints = cleanRing(building.points || []);
  const frontExtent = housePoints.length ? Math.max(...housePoints.map(point => (point[0] - cx) * front[0] + (point[1] - cz) * front[1])) : Math.min(width, depth) * .42;
  const yardOrigin = Math.max(.8, frontExtent + .42);
  const roadHalfWidth = roadWidth(road.kind) / 2;
  const availableDepth = distance - yardOrigin - roadHalfWidth - .55;
  const yardDepth = Math.min(availableDepth, Math.max(2.1, Math.min(width, depth) * .42));
  if (yardDepth < 1.4) return null;
  const mailboxAlong = Math.max(yardDepth, distance - roadHalfWidth - .45 - yardOrigin);
  return {front, tangent, width, depth, distance, yardOrigin, yardDepth, roadHalfWidth, mailboxAlong};
}

const makeMaterial = (color, roughness = .9) => new T.MeshStandardMaterial({color, roughness});

export function prepareResidentialYards(world, data = {}, options = {}) {
  const terrain = options.terrain;
  const heightAt = terrain?.heightAt ?? (() => 0);
  const roads = data.roads || [];
  const yardLimit = Number.isFinite(options.maxYards) ? Math.min(300, Math.max(1, options.maxYards)) : 280;
  const yards = selectResidentialYards(data.buildings || [], roads, yardLimit);
  let root = null, disposed = false;
  const meshes = [], geometries = [], materials = [];

  const attach = scene => {
    if (disposed) throw new Error('Residential yards have been disposed');
    if (!scene?.add) throw new TypeError('prepareResidentialYards.attach requires a scene');
    if (root) return root;
    root = new T.Group(); root.name = 'ResidentialYards';
    if (!yards.length) { scene.add(root); return root; }

    // Keep each material in 128m spatial chunks so distant residential detail
    // can be frustum-culled instead of living in one always-visible mesh.
    const parts = new Map();
    const addPart = (key, geometry, position, yaw = 0, scale = [1, 1, 1]) => {
      const copy = geometry.clone();
      copy.applyMatrix4(new T.Matrix4().compose(
        new T.Vector3(...position),
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
        new T.Vector3(...scale),
      ));
      const chunkKey = `${key}:${Math.floor(position[0] / 128)}:${Math.floor(position[2] / 128)}`;
      if (!parts.has(chunkKey)) parts.set(chunkKey, []);
      parts.get(chunkKey).push(copy);
    };
    const box = new T.BoxGeometry(1, 1, 1);
    const post = new T.CylinderGeometry(.045, .07, 1, 6);
    const shrub = new T.IcosahedronGeometry(1, 1);

    yards.forEach(({building, bounds, centre, road, index}, yardIndex) => {
      const [cx, cz] = centre;
      const placement = computeResidentialYardPlacement({building, bounds, centre, road});
      if (!placement) return;
      const {front, tangent, width, yardOrigin, yardDepth, mailboxAlong} = placement;
      const driveYaw = Math.atan2(front[0], front[1]);
      const basePoint = (along, across = 0) => [cx + front[0] * (yardOrigin + along) + tangent[0] * across, cz + front[1] * (yardOrigin + along) + tangent[1] * across];
      const ground = (point) => heightAt(point[0], point[1]);
      const placeBox = (key, point, size, yaw = 0, lift = 0) => addPart(key, box, [point[0], ground(point) + size[1] / 2 + lift, point[1]], yaw, size);

      const bedOffset = Math.min(width * .24, 2.6);
      for (const across of [-bedOffset, bedOffset]) {
        const bed = basePoint(Math.min(yardDepth * .7, 2.8), across);
        placeBox('gardenBed', bed, [Math.min(1.1, width * .18), .08, .72], driveYaw);
        const plant = basePoint(Math.min(yardDepth * .7 + .12, 2.95), across + (across > 0 ? .08 : -.08));
        addPart(yardIndex % 3 === 0 ? 'shrubLight' : 'shrub', shrub, [plant[0], ground(plant) + .32, plant[1]], 0, [.34, .34 + ((index * 7) % 4) * .04, .34]);
      }

      // A single low hedge mark per yard gives the street edge a friendly,
      // toy-scale rhythm without turning every driveway into a fence maze.
      const hedge = basePoint(Math.min(yardDepth * .82, 3.3), width * .39);
      placeBox('hedge', hedge, [Math.min(1.8, width * .2), .55, .34], driveYaw);

      // Mailboxes sit just inside the road edge and remain purely decorative.
      const mailboxPoint = basePoint(mailboxAlong, Math.min(1.1, width * .33));
      addPart('mailPost', post, [mailboxPoint[0], ground(mailboxPoint) + .5, mailboxPoint[1]], 0, [1, 1, 1]);
      const cap = [mailboxPoint[0] - front[0] * .08, mailboxPoint[1] - front[1] * .08];
      placeBox('mailbox', cap, [.34, .2, .24], driveYaw, .96);
    });

    box.dispose(); post.dispose(); shrub.dispose();
    const palette = {
      gardenBed: makeMaterial('#5d4635'),
      hedge: makeMaterial('#416a43'), shrub: makeMaterial('#6f9650'), shrubLight: makeMaterial('#a1b95b'),
      mailPost: makeMaterial('#6f5948'), mailbox: makeMaterial('#4c7480'),
    };
    for (const [chunkKey, geometriesForKey] of parts) {
      const key = chunkKey.split(':', 1)[0];
      const merged = geometriesForKey.length === 1 ? geometriesForKey[0] : mergeGeometries(geometriesForKey, false);
      geometriesForKey.forEach(geometry => { if (geometry !== merged) geometry.dispose(); });
      if (!merged) continue;
      merged.computeVertexNormals(); merged.computeBoundingSphere(); geometries.push(merged);
      const material = palette[key] || palette.gardenBed; materials.push(material);
      const mesh = new T.Mesh(merged, material); mesh.name = `ResidentialYard_${chunkKey}`; mesh.castShadow = key === 'shrub' || key === 'shrubLight'; mesh.receiveShadow = true;
      root.add(mesh); meshes.push(mesh);
    }
    scene.add(root); return root;
  };

  const dispose = () => {
    disposed = true;
    root?.removeFromParent();
    meshes.splice(0).forEach(mesh => mesh.removeFromParent());
    geometries.splice(0).forEach(geometry => geometry.dispose());
    materials.splice(0).forEach(material => material.dispose());
    root = null;
  };
  return {attach, dispose, yardCount: yards.length};
}
