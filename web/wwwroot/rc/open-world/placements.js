// Saucer Springs placements: venues as data. A placement file (docs/rc-placements.md, schema in
// tools/rc/placements.schema.json) lists props from the kit GLB (tools/rc/blender/prop_kit.py) with a
// position, yaw, scale, colour variant and collision flag. This module loads the kit once, validates
// a file, and draws every item of one prop type with ONE InstancedMesh per material part, so a
// 300-prop venue costs (distinct props x their materials) draw calls, typically 6-15.
//
// Why InstancedMesh and not BatchedMesh: the vendored three is r160. Its BatchedMesh has no
// addInstance(): every addGeometry() copies the vertices again and owns one matrix (see
// vendor/three.module.js `class BatchedMesh`, addGeometry/setGeometryAt), so 300 benches would mean
// 300 copies of the bench in GPU memory, a per-frame CPU cull/sort over all of them, no per-instance
// colour, and one draw per range when WEBGL_multi_draw is missing. InstancedMesh shares the
// geometry, has setColorAt for variants, is culled as one bounding sphere, and casts shadows.
// Revisit when three is upgraded past r166 (BatchedMesh.addInstance + setColorAt).
//
// Not wired into the game: runtime.js integration is described in docs/rc-placements.md.
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {fetchAssetBuffer} from '../asset-buffer.mjs';

export const PLACEMENT_VERSION = 1;
export const MAX_ITEMS = 4096;
export const COLLIDER_PREFIX = 'COL_';
// Variant multipliers (sRGB hex) applied to a prop's Kit_Paint parts (or every part if it has no paint).
// Index 0 is the authored colour. A file may supply its own "palette".
export const DEFAULT_PALETTE = Object.freeze(['#ffffff', '#ff9e8c', '#8fb8ff', '#a8e48e', '#ffe28a', '#d6c4ff']);
// Collision surface per prop (physics/world.mjs SURFACES); anything unlisted is concrete.
export const PROP_SURFACES = Object.freeze({
 'picnic-table': 'wood', bench: 'wood', 'hay-bale': 'grass', tent: 'carpet', 'chain-link-fence-panel': 'metal',
 'street-lamp': 'metal', 'sign-post': 'metal', 'fuel-drum': 'metal', bin: 'metal', bollard: 'metal',
 'traffic-cone': 'rubber', pumpkin: 'dirt', 'water-tower': 'metal', 'jersey-barrier': 'concrete',
});

// ------------------------------------------------------------------ validation (pure)
const finite = v => typeof v === 'number' && Number.isFinite(v);
const HEX = /^#[0-9a-fA-F]{6}$/;
const FILE_KEYS = new Set(['version', 'name', 'kit', 'palette', 'items', 'note', '$schema']);
const ITEM_KEYS = new Set(['prop', 'pos', 'yaw', 'scale', 'variant', 'collide']);
// Returns {ok, errors, data} where data has defaults filled in (yaw 0, scale 1, variant 0, collide true).
// `props` (optional Set/array of kit node names) also checks that every prop exists.
export function validatePlacements(input, {props = null} = {}) {
 const errors = [], known = props ? new Set(props) : null;
 if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok: false, errors: ['placement file must be a JSON object'], data: null};
 for (const k of Object.keys(input)) if (!FILE_KEYS.has(k)) errors.push(`unknown key "${k}"`);
 if (input.note !== undefined && typeof input.note !== 'string') errors.push('note must be a string');
 if (input.version !== PLACEMENT_VERSION) errors.push(`version must be ${PLACEMENT_VERSION}`);
 if (typeof input.name !== 'string' || !input.name.trim()) errors.push('name must be a non-empty string');
 if (typeof input.kit !== 'string' || !/^[\w./-]+\.glb$/.test(input.kit) || input.kit.includes('..')) errors.push('kit must be a relative .glb path under rc/assets');
 let palette = DEFAULT_PALETTE;
 if (input.palette !== undefined) {
  if (!Array.isArray(input.palette) || !input.palette.length || input.palette.length > 16 || !input.palette.every(c => typeof c === 'string' && HEX.test(c))) errors.push('palette must be 1-16 "#rrggbb" strings');
  else palette = input.palette;
 }
 if (!Array.isArray(input.items)) errors.push('items must be an array');
 else if (input.items.length > MAX_ITEMS) errors.push(`at most ${MAX_ITEMS} items`);
 const items = [];
 for (const [i, it] of (Array.isArray(input.items) ? input.items : []).entries()) {
  const at = `items[${i}]`;
  if (!it || typeof it !== 'object') { errors.push(`${at} must be an object`); continue; }
  for (const k of Object.keys(it)) if (!ITEM_KEYS.has(k)) errors.push(`${at} has unknown key "${k}"`);
  if (typeof it.prop !== 'string' || !it.prop) errors.push(`${at}.prop must be a string`);
  else if (known && !known.has(it.prop)) errors.push(`${at}.prop "${it.prop}" is not in the kit`);
  const p = it.pos;
  if (!Array.isArray(p) || p.length !== 3 || !finite(p[0]) || !finite(p[2]) || !(p[1] === null || finite(p[1]))) errors.push(`${at}.pos must be [x, y|null, z] with finite x and z`);
  if (it.yaw !== undefined && !finite(it.yaw)) errors.push(`${at}.yaw must be a number (degrees)`);
  if (it.scale !== undefined && !(finite(it.scale) && it.scale > 0 && it.scale <= 20)) errors.push(`${at}.scale must be in (0, 20]`);
  if (it.variant !== undefined && !(Number.isInteger(it.variant) && it.variant >= 0 && it.variant < palette.length)) errors.push(`${at}.variant must be an integer index into the palette (0-${palette.length - 1})`);
  if (it.collide !== undefined && typeof it.collide !== 'boolean') errors.push(`${at}.collide must be true or false`);
  items.push({prop: it.prop, pos: Array.isArray(p) ? [...p] : p, yaw: it.yaw ?? 0, scale: it.scale ?? 1, variant: it.variant ?? 0, collide: it.collide ?? true});
 }
 const ok = errors.length === 0;
 return {ok, errors, data: ok ? {version: input.version, name: input.name, kit: input.kit, palette: [...palette], items} : null};
}

// ------------------------------------------------------------------ transforms (pure)
const DEG = Math.PI / 180;
// Placement frame: three.js world, +Y up. yaw is degrees about +Y, counter-clockwise seen from above
// (Object3D.rotation.y). A prop's authored front (Blender +Y) is local -Z, so yaw 0 faces -Z.
export function itemMatrix(item, y = item.pos[1] ?? 0, out = new T.Matrix4()) {
 const s = item.scale ?? 1;
 return out.compose(new T.Vector3(item.pos[0], y, item.pos[2]), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), (item.yaw ?? 0) * DEG), new T.Vector3(s, s, s));
}
// Plain-array version of the same transform, for collision without three objects.
export function transformPoint([x, y, z], item, groundY) {
 const s = item.scale ?? 1, a = (item.yaw ?? 0) * DEG, c = Math.cos(a), sn = Math.sin(a);
 return [item.pos[0] + s * (x * c + z * sn), groundY + s * y, item.pos[2] + s * (-x * sn + z * c)];
}

// ------------------------------------------------------------------ collision descriptors (pure)
// collider: {kind:'box'|'cylinder', centre:[x,y,z], size:[w,h,d]} in prop-local metres (glTF Y-up).
export function colliderFromBounds(kind, min, max) {
 const centre = [0, 1, 2].map(i => (min[i] + max[i]) / 2), size = [0, 1, 2].map(i => max[i] - min[i]);
 return {kind: kind === 'cylinder' ? 'cylinder' : 'box', centre, size};
}
// Outward-wound triangles (counter-clockwise seen from outside, physics/world.mjs convention) of a
// collider placed by `item` whose ground contact is at height groundY. A cylinder is an 8-sided prism.
export function colliderTriangles(collider, item, groundY, sides = 8) {
 const {centre: [cx, cy, cz], size: [w, h, d]} = collider, y0 = cy - h / 2, y1 = cy + h / 2, P = p => transformPoint(p, item, groundY), out = [];
 let ring;
 if (collider.kind === 'cylinder') {
  const r = Math.max(w, d) / 2;
  ring = Array.from({length: sides}, (_, k) => { const a = -2 * Math.PI * k / sides; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });
 } else ring = [[cx - w / 2, cz - d / 2], [cx - w / 2, cz + d / 2], [cx + w / 2, cz + d / 2], [cx + w / 2, cz - d / 2]];
 // ring runs with decreasing atan2(z, x), so side quad (a_low, b_low, b_high, a_high) faces outward.
 for (let i = 0; i < ring.length; i++) {
  const a = ring[i], b = ring[(i + 1) % ring.length];
  const al = P([a[0], y0, a[1]]), bl = P([b[0], y0, b[1]]), bh = P([b[0], y1, b[1]]), ah = P([a[0], y1, a[1]]);
  out.push([al, bl, bh], [al, bh, ah]);
 }
 const top = ring.map(([x, z]) => P([x, y1, z])), bottom = ring.map(([x, z]) => P([x, y0, z])).reverse();
 for (let i = 1; i + 1 < top.length; i++) out.push([top[0], top[i], top[i + 1]]);
 if (y0 > 0.001) for (let i = 1; i + 1 < bottom.length; i++) out.push([bottom[0], bottom[i], bottom[i + 1]]);
 return out;
}

// ------------------------------------------------------------------ kit templates
// Builds name -> {name, parts:[{geometry, material, triangles}], collider, paint:boolean} from a parsed
// glTF scene. Each top-level child is one prop; its own transform (the Blender review grid) is
// ignored. COL_* descendants become the collider and are never drawn.
export function buildTemplateMap(root) {
 const map = new Map();
 root.updateMatrixWorld(true);
 for (const top of root.children) {
  const inv = new T.Matrix4().copy(top.matrixWorld).invert(), parts = [];
  let collider = null;
  const visit = (o, inCollider) => {
   const isCol = inCollider || o.name?.startsWith(COLLIDER_PREFIX);
   if (o.isMesh && o.geometry) {
    const rel = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    if (isCol) {
     const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
     const box = g.boundingBox.clone().applyMatrix4(rel), kind = o.userData?.collider ?? findColliderKind(o);
     collider = collider ? union(collider, kind, box) : colliderFromBounds(kind, box.min.toArray(), box.max.toArray());
    } else {
     const geometry = rel.equals(IDENTITY) ? o.geometry : o.geometry.clone().applyMatrix4(rel);
     for (const material of [].concat(o.material)) parts.push({geometry, material, triangles: triangleCount(geometry)});
    }
   }
   for (const c of o.children) visit(c, isCol);
  };
  visit(top, false);
  if (!top.name) continue;
  map.set(top.name, {name: top.name, parts, collider, paint: parts.some(p => /paint/i.test(p.material?.name ?? ''))});
 }
 return map;
}
const IDENTITY = new T.Matrix4();
function findColliderKind(o) { for (let p = o; p; p = p.parent) if (p.userData?.collider) return p.userData.collider; return 'box'; }
function union(c, kind, box) {
 const min = c.centre.map((v, i) => Math.min(v - c.size[i] / 2, box.min.getComponent(i))), max = c.centre.map((v, i) => Math.max(v + c.size[i] / 2, box.max.getComponent(i)));
 return colliderFromBounds(c.kind === 'cylinder' && kind === 'cylinder' ? 'cylinder' : 'box', min, max);
}
function triangleCount(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }

const kits = new Map();
// Loads and parses a kit GLB once (path relative to rc/assets). Resolves to {path, templates, props}.
export function preparePlacementKit(path = 'kit/props.glb') {
 if (!kits.has(path)) kits.set(path, (async () => {
  const url = new URL(`../assets/${path}`, import.meta.url).href;
  const buffer = await fetchAssetBuffer(url);
  const gltf = await new GLTFLoader().parseAsync(buffer, new URL('./', url).href);
  const templates = buildTemplateMap(gltf.scene);
  return {path, templates, props: [...templates.keys()]};
 })().catch(e => { kits.delete(path); throw e; }));
 return kits.get(path);
}
// Tests and preloaders can register an already-built template map.
export function registerPlacementKit(path, templates) { const kit = {path, templates, props: [...templates.keys()]}; kits.set(path, Promise.resolve(kit)); return kit; }

export async function loadPlacements(url, {kit = null} = {}) {
 const response = await fetch(url);
 if (!response.ok) throw Error(`placements unavailable (${response.status}): ${url}`);
 const result = validatePlacements(await response.json(), {props: kit?.props ?? null});
 if (!result.ok) throw Error(`invalid placement file ${url}:\n  ${result.errors.join('\n  ')}`);
 return result.data;
}

// ------------------------------------------------------------------ instancing
// Ground height for an item with pos[1] === null: world raycast down from above elevationAt(x, z),
// falling back to elevationAt, then 0. Numeric y is used as-is.
export function groundHeight(item, {elevationAt = null, world = null} = {}) {
 const [x, y, z] = item.pos;
 if (y !== null && y !== undefined) return y;
 const datum = elevationAt ? elevationAt(x, z) : 0;
 const hit = world?.raycast?.([x, datum + 4, z], [0, -1, 0], 8);
 return hit ? hit.point[1] : datum;
}

// Adds the items of a validated placement file to `scene`.
//  kit: the resolved preparePlacementKit() value (required); elevationAt(x, z), world (addTri, and raycast
//  for ground snapping) and ground (a separate raycast source for snapping, default `world`) are optional. Collision triangles go into `world` and CANNOT be removed later (world.mjs
//  triangles are immutable): for streamed tiles pass the tile's own collision world (docs/rc-placements.md).
// Returns {root, counts, collisionTriangles, dispose()}.
export function instantiatePlacements(scene, data, {kit, elevationAt = null, world = null, ground = world, castShadow = true, receiveShadow = true} = {}) {
 if (!kit?.templates) throw Error('instantiatePlacements needs {kit} from preparePlacementKit()');
 const valid = validatePlacements(data, {props: kit.props});
 if (!valid.ok) throw Error('placement data failed validation: ' + valid.errors.join('; '));
 const checked = valid.data;
 const palette = (checked.palette ?? DEFAULT_PALETTE).map(c => new T.Color(c)), root = new T.Group();
 root.name = `Placements_${checked.name}`;
 const byProp = new Map(), collisionTriangles = [];
 for (const item of checked.items) {
  const template = kit.templates.get(item.prop);
  if (!template) throw Error(`prop "${item.prop}" is not in kit ${kit.path}`);
  const y = groundHeight(item, {elevationAt, world: ground});
  if (!byProp.has(item.prop)) byProp.set(item.prop, []);
  byProp.get(item.prop).push({item, y});
 }
 // Collision after every height is resolved, so items never snap onto each other's proxies.
 for (const [prop, list] of byProp) {
  const {collider} = kit.templates.get(prop), surface = PROP_SURFACES[prop] ?? 'concrete';
  if (!collider) continue;
  for (const {item, y} of list) if (item.collide) for (const tri of colliderTriangles(collider, item, y)) { collisionTriangles.push(tri); world?.addTri?.(tri[0], tri[1], tri[2], surface); }
 }
 const meshes = [], m = new T.Matrix4();
 let triangles = 0;
 for (const [prop, list] of byProp) {
  const template = kit.templates.get(prop);
  for (const part of template.parts) {
   const mesh = new T.InstancedMesh(part.geometry, part.material, list.length);
   mesh.name = `${prop}:${part.material?.name ?? 'material'}`;
   mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
   const tint = template.paint ? /paint/i.test(part.material?.name ?? '') : true;
   list.forEach(({item, y}, i) => { mesh.setMatrixAt(i, itemMatrix(item, y, m)); if (tint && list.some(e => e.item.variant)) mesh.setColorAt(i, palette[item.variant] ?? palette[0]); });
   mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
   mesh.computeBoundingSphere(); mesh.computeBoundingBox();
   triangles += part.triangles * list.length;
   root.add(mesh); meshes.push(mesh);
  }
 }
 scene.add(root);
 const counts = {items: checked.items.length, props: byProp.size, meshes: meshes.length, drawCalls: meshes.length, triangles,
  colliders: checked.items.filter(it => it.collide && kit.templates.get(it.prop).collider).length, collisionTriangles: collisionTriangles.length};
 let disposed = false;
 return {root, counts, meshes, collisionTriangles, dispose() {
  if (disposed) return; disposed = true;
  root.removeFromParent();
  // Geometry and materials belong to the kit and are shared; only the per-instance buffers go.
  for (const mesh of meshes) mesh.dispose();
 }};
}
