#!/usr/bin/env node
// Compile a local GeoJSON extract into deterministic, spatially indexed world tiles.
// This is intentionally offline: it does not fetch or infer missing source data.
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_ORIGIN = { lat: 36.241303, lon: -115.04465775 };
export const TILE_SIZE = 256;
const R = 6371008.8;

export function project([lon, lat], origin = DEFAULT_ORIGIN) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90)
    throw new Error(`invalid coordinate [${lon}, ${lat}]`);
  const x = (Math.PI / 180) * (lon - origin.lon) * R * Math.cos(origin.lat * Math.PI / 180);
  const yNorth = (Math.PI / 180) * (lat - origin.lat) * R;
  return [x, -yNorth]; // runtime +z is south
}

const walkCoords = (value, fn) => Array.isArray(value) ? (value.length && typeof value[0] === 'number' ? fn(value) : value.forEach(v => walkCoords(v, fn))) : null;

function transformGeometry(geometry, origin) {
  if (!geometry || typeof geometry !== 'object' || !geometry.type) throw new Error('feature has no geometry');
  if (!['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(geometry.type))
    throw new Error(`unsupported geometry type ${geometry.type}`);
  const coordinates = structuredClone(geometry.coordinates);
  walkCoords(coordinates, c => { const p = project(c, origin); c[0] = p[0]; c[1] = p[1]; c.length = 2; });
  return { type: geometry.type, coordinates };
}

function bounds(geometry) {
  const xs = [], zs = [];
  walkCoords(geometry.coordinates, c => { xs.push(c[0]); zs.push(c[1]); });
  if (!xs.length) throw new Error('geometry has no coordinates');
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

export function tileFor(x, z) { return [Math.floor(x / TILE_SIZE), Math.floor(z / TILE_SIZE)]; }

function tilesFor(bbox) {
  const [minX, minZ, maxX, maxZ] = bbox;
  const out = [];
  for (let x = Math.floor(minX / TILE_SIZE); x <= Math.floor(maxX / TILE_SIZE); x++)
    for (let z = Math.floor(minZ / TILE_SIZE); z <= Math.floor(maxZ / TILE_SIZE); z++) out.push([x, z]);
  return out;
}

function mkdirFresh(out) {
  if (fs.existsSync(out)) {
    if (!fs.statSync(out).isDirectory() || fs.readdirSync(out).length) throw new Error(`output must be a new or empty directory: ${out}`);
  } else fs.mkdirSync(out, { recursive: true });
}

export function compileWorldTiles({ input, out, origin = DEFAULT_ORIGIN, tileSize = TILE_SIZE }) {
  if (tileSize !== TILE_SIZE) throw new Error(`tile size must be ${TILE_SIZE}`);
  const source = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (source.type !== 'FeatureCollection' || !Array.isArray(source.features)) throw new Error('input must be a GeoJSON FeatureCollection');
  mkdirFresh(out);
  const tiles = new Map(), counts = {};
  source.features.forEach((feature, index) => {
    if (!feature || feature.type !== 'Feature' || !feature.geometry) throw new Error(`feature ${index} is invalid`);
    const geometry = transformGeometry(feature.geometry, origin), bbox = bounds(geometry);
    const id = feature.id ?? feature.properties?.osm ?? `feature-${index}`;
    const item = { id: String(id), properties: feature.properties ?? {}, geometry, bbox };
    counts[geometry.type] = (counts[geometry.type] ?? 0) + 1;
    for (const [tx, tz] of tilesFor(bbox)) {
      const key = `${tx},${tz}`;
      if (!tiles.has(key)) tiles.set(key, { x: tx, z: tz, features: [] });
      tiles.get(key).features.push(item);
    }
  });
  for (const tile of [...tiles.values()].sort((a, b) => a.x - b.x || a.z - b.z)) {
    const file = path.join(out, `tile-${tile.x}-${tile.z}.json`);
    fs.writeFileSync(file, JSON.stringify({ version: 1, tileSize: TILE_SIZE, tile: [tile.x, tile.z], features: tile.features }) + '\n');
  }
  const manifest = { version: 1, source: path.resolve(input), attribution: source.attribution ?? '© OpenStreetMap contributors', license: 'ODbL', origin, tileSize: TILE_SIZE, featureCount: source.features.length, geometryCounts: counts, tileCount: tiles.size, projection: 'equirectangular local metre frame; +x east, +z south', tiles: [...tiles.values()].map(t => [t.x, t.z]).sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function args(argv) {
  const out = {}, names = ['input', 'out'];
  for (let i = 2; i < argv.length; i++) {
    const m = argv[i].match(/^--(input|out)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (/^--(input|out)$/.test(argv[i]) && argv[i + 1]) out[argv[i++].slice(2)] = argv[i];
    else throw new Error('usage: build-world-tiles.mjs --input FILE --out DIR');
  }
  if (names.some(n => !out[n])) throw new Error('usage: build-world-tiles.mjs --input FILE --out DIR'); return out;
}
if (import.meta.url === `file://${process.argv[1]}`) { try { const r = compileWorldTiles(args(process.argv)); console.log(`world tiles: ${r.featureCount} features -> ${r.tileCount} tiles`); } catch (e) { console.error(`build-world-tiles: ${e.message}`); process.exit(1); } }
