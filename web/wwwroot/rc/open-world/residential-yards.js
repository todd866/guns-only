import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Small, deliberately soft residential dressing.  The input uses only local
// metres and anonymous feature kinds; this module does not retain map/source
// identifiers.  Yard dressing is visual only, so it cannot create a surprise
// collision beside a driveway or a kerb.

const ROAD_EXCLUSIONS = /foot|path|walk|cycle|trail/i;
const ROAD_PREFERENCES = /residential|service|tertiary|secondary|primary|street|avenue|drive|road/i;
const roadWidth = kind =>
  /primary|secondary|tertiary/i.test(kind || '') ? 8 : /service/i.test(kind || '') ? 5 : 5.8;

const cleanRing = ring => {
  if (!Array.isArray(ring)) return [];
  return ring.length > 3 && ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1]
    ? ring.slice(0, -1)
    : ring;
};

const centreOf = ring => {
  const points = cleanRing(ring);
  if (!points.length) return null;
  return points
    .reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
    .map(value => value / points.length);
};

const boundsOf = ring => {
  const points = cleanRing(ring);
  if (!points.length) return null;
  const xs = points.map(point => point[0]),
    zs = points.map(point => point[1]);
  return {minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs)};
};

const nearestPointOnSegment = (point, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))
  );
  const q = [a[0] + dx * t, a[1] + dz * t];
  return {q, d: Math.hypot(point[0] - q[0], point[1] - q[1]), dx, dz};
};

/** Return the nearest drivable road segment for a local x/z point. */
export function nearestResidentialRoad(point, roads = []) {
  let best = null;
  for (const road of roads) {
    if (ROAD_EXCLUSIONS.test(road?.kind || '') || !Array.isArray(road?.points)) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i];
      if (!Array.isArray(a) || !Array.isArray(b)) continue;
      const hit = nearestPointOnSegment(point, a, b);
      const preference = ROAD_PREFERENCES.test(road.kind || '') ? 0 : 2;
      if (!best || hit.d + preference < best.d + best.preference)
        best = {...hit, kind: road.kind || '', preference};
    }
  }
  return best;
}

/** Select a stable, spatially distributed subset of houses for the draw budget. */
export function selectResidentialYards(buildings = [], roads = [], maxYards = 300) {
  const candidates = buildings
    .map((building, index) => {
      if (building?.kind !== 'house') return null;
      const centre = centreOf(building.points);
      const bounds = boundsOf(building.points);
      const road = centre && nearestResidentialRoad(centre, roads);
      if (!centre || !bounds || !road || road.d < 2.8 || road.d > 28) return null;
      return {building, index, centre, bounds, road};
    })
    .filter(Boolean);
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
  const frontExtent = housePoints.length
    ? Math.max(...housePoints.map(point => (point[0] - cx) * front[0] + (point[1] - cz) * front[1]))
    : Math.min(width, depth) * 0.42;
  const yardOrigin = Math.max(0.8, frontExtent + 0.42);
  const roadHalfWidth = roadWidth(road.kind) / 2;
  const availableDepth = distance - yardOrigin - roadHalfWidth - 0.55;
  const yardDepth = Math.min(availableDepth, Math.max(2.1, Math.min(width, depth) * 0.42));
  if (yardDepth < 1.4) return null;
  const mailboxAlong = Math.max(yardDepth, distance - roadHalfWidth - 0.45 - yardOrigin);
  return {front, tangent, width, depth, distance, yardOrigin, yardDepth, roadHalfWidth, mailboxAlong};
}

const makeMaterial = (color, roughness = 0.9) => new T.MeshStandardMaterial({color, roughness});
const PALETTE = {
  gardenBed: '#5d4635',
  hedge: '#416a43',
  shrub: '#6f9650',
  shrubLight: '#a1b95b',
  mailPost: '#6f5948',
  mailbox: '#4c7480'
};

/** Front-step spots for seasonal props, one per dressed yard: on the walk just in front of the house. */
export function residentialPorches(data = {}, options = {}) {
  const heightAt = options.terrain?.heightAt ?? (() => 0);
  const yardLimit = Number.isFinite(options.maxYards) ? Math.min(300, Math.max(1, options.maxYards)) : 280;
  return selectResidentialYards(data.buildings || [], data.roads || [], yardLimit)
    .map(({building, bounds, centre, road, index}) => {
      const placement = computeResidentialYardPlacement({building, bounds, centre, road});
      if (!placement) return null;
      const {front, tangent, width, yardOrigin, yardDepth} = placement;
      const at = (along, across) => [
        centre[0] + front[0] * (yardOrigin + along) + tangent[0] * across,
        centre[1] + front[1] * (yardOrigin + along) + tangent[1] * across
      ];
      const step = at(0.35, width * 0.14),
        lawn = at(Math.min(yardDepth * 0.45, 1.8), -width * 0.3);
      return {
        index,
        x: step[0],
        z: step[1],
        y: heightAt(step[0], step[1]),
        yaw: Math.atan2(front[0], front[1]),
        lawn: {x: lawn[0], z: lawn[1], y: heightAt(lawn[0], lawn[1])}
      };
    })
    .filter(Boolean);
}

export function prepareResidentialYards(world, data = {}, options = {}) {
  const terrain = options.terrain;
  const heightAt = terrain?.heightAt ?? (() => 0);
  const roads = data.roads || [];
  const yardLimit = Number.isFinite(options.maxYards) ? Math.min(300, Math.max(1, options.maxYards)) : 280;
  const yards = selectResidentialYards(data.buildings || [], roads, yardLimit);
  let root = null,
    disposed = false;
  const meshes = [],
    geometries = [],
    materials = [];

  const attach = scene => {
    if (disposed) throw new Error('Residential yards have been disposed');
    if (!scene?.add) throw new TypeError('prepareResidentialYards.attach requires a scene');
    if (root) return root;
    root = new T.Group();
    root.name = 'ResidentialYards';
    if (!yards.length) {
      scene.add(root);
      return root;
    }

    // Keep each material in 128m spatial chunks so distant residential detail
    // can be frustum-culled instead of living in one always-visible mesh.
    const parts = new Map();
    const addPart = (key, geometry, position, yaw = 0, scale = [1, 1, 1]) => {
      let copy = geometry.clone();
      copy.deleteAttribute('uv');
      copy.applyMatrix4(
        new T.Matrix4().compose(
          new T.Vector3(...position),
          new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
          new T.Vector3(...scale)
        )
      );
      // One vertex-coloured mesh per 256 m area for every yard part (WebKit pays ~2x per draw call).
      const shadows = key === 'shrub' || key === 'shrubLight',
        chunkKey = `${shadows ? 'plants' : 'yard'}:${Math.floor(position[0] / 256)}:${Math.floor(position[2] / 256)}`;
      const colour = new T.Color(PALETTE[key] ?? PALETTE.gardenBed),
        n = copy.attributes.position.count,
        rgb = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) rgb.set([colour.r, colour.g, colour.b], i * 3);
      copy.setAttribute('color', new T.BufferAttribute(rgb, 3));
      if (copy.index) {
        const flat = copy.toNonIndexed();
        copy.dispose();
        copy = flat;
      }
      if (!parts.has(chunkKey)) parts.set(chunkKey, []);
      parts.get(chunkKey).push(copy);
    };
    const box = new T.BoxGeometry(1, 1, 1);
    const post = new T.CylinderGeometry(0.045, 0.07, 1, 6);
    const shrub = new T.IcosahedronGeometry(1, 1);

    yards.forEach(({building, bounds, centre, road, index}, yardIndex) => {
      const [cx, cz] = centre;
      const placement = computeResidentialYardPlacement({building, bounds, centre, road});
      if (!placement) return;
      const {front, tangent, width, yardOrigin, yardDepth, mailboxAlong} = placement;
      const driveYaw = Math.atan2(front[0], front[1]);
      const basePoint = (along, across = 0) => [
        cx + front[0] * (yardOrigin + along) + tangent[0] * across,
        cz + front[1] * (yardOrigin + along) + tangent[1] * across
      ];
      const ground = point => heightAt(point[0], point[1]);
      const placeBox = (key, point, size, yaw = 0, lift = 0) =>
        addPart(key, box, [point[0], ground(point) + size[1] / 2 + lift, point[1]], yaw, size);

      const bedOffset = Math.min(width * 0.24, 2.6);
      for (const across of [-bedOffset, bedOffset]) {
        const bed = basePoint(Math.min(yardDepth * 0.7, 2.8), across);
        placeBox('gardenBed', bed, [Math.min(1.1, width * 0.18), 0.08, 0.72], driveYaw);
        const plant = basePoint(Math.min(yardDepth * 0.7 + 0.12, 2.95), across + (across > 0 ? 0.08 : -0.08));
        addPart(
          yardIndex % 3 === 0 ? 'shrubLight' : 'shrub',
          shrub,
          [plant[0], ground(plant) + 0.32, plant[1]],
          0,
          [0.34, 0.34 + ((index * 7) % 4) * 0.04, 0.34]
        );
      }

      // A single low hedge mark per yard gives the street edge a friendly,
      // toy-scale rhythm without turning every driveway into a fence maze.
      const hedge = basePoint(Math.min(yardDepth * 0.82, 3.3), width * 0.39);
      placeBox('hedge', hedge, [Math.min(1.8, width * 0.2), 0.55, 0.34], driveYaw);

      // Mailboxes sit just inside the road edge and remain purely decorative.
      const mailboxPoint = basePoint(mailboxAlong, Math.min(1.1, width * 0.33));
      addPart('mailPost', post, [mailboxPoint[0], ground(mailboxPoint) + 0.5, mailboxPoint[1]], 0, [1, 1, 1]);
      const cap = [mailboxPoint[0] - front[0] * 0.08, mailboxPoint[1] - front[1] * 0.08];
      placeBox('mailbox', cap, [0.34, 0.2, 0.24], driveYaw, 0.96);
    });

    box.dispose();
    post.dispose();
    shrub.dispose();
    const yardMaterial = () => {
      const m = makeMaterial('#ffffff');
      m.vertexColors = true;
      return m;
    };
    const palette = {yard: yardMaterial(), plants: yardMaterial()};
    for (const [chunkKey, geometriesForKey] of parts) {
      const key = chunkKey.split(':', 1)[0];
      const merged =
        geometriesForKey.length === 1 ? geometriesForKey[0] : mergeGeometries(geometriesForKey, false);
      geometriesForKey.forEach(geometry => {
        if (geometry !== merged) geometry.dispose();
      });
      if (!merged) continue;
      merged.computeVertexNormals();
      merged.computeBoundingSphere();
      geometries.push(merged);
      const material = palette[key] || palette.gardenBed;
      materials.push(material);
      const mesh = new T.Mesh(merged, material);
      mesh.name = `ResidentialYard_${chunkKey}`;
      mesh.castShadow = key === 'plants';
      mesh.receiveShadow = true;
      root.add(mesh);
      meshes.push(mesh);
    }
    scene.add(root);
    return root;
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
