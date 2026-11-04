import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {createWorld} from '../physics/world.mjs';
import {parseGLB} from '../../../../tools/rc/validate-assets.mjs';
import {
  validatePlacements,
  buildTemplateMap,
  colliderFromBounds,
  colliderTriangles,
  itemMatrix,
  transformPoint,
  groundHeight,
  instantiatePlacements,
  registerPlacementKit,
  DEFAULT_PALETTE
} from './placements.js';

const read = rel => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const EXAMPLE = read('../assets/placements/example-picnic-area.json');
const KIT_NODES = (() => {
  const doc = parseGLB(fs.readFileSync(new URL('../assets/kit/props.glb', import.meta.url)));
  return doc.scenes[doc.scene ?? 0].nodes.map(i => doc.nodes[i].name);
})();
const good = (items = [{prop: 'bench', pos: [1, null, 2]}]) => ({
  version: 1,
  name: 'test',
  kit: 'kit/props.glb',
  items
});

// ------------------------------------------------------------------ schema validation
test('a minimal file validates and gets defaults', () => {
  const r = validatePlacements(good());
  assert.ok(r.ok, r.errors.join('\n'));
  assert.deepEqual(r.data.items[0], {
    prop: 'bench',
    pos: [1, null, 2],
    yaw: 0,
    scale: 1,
    variant: 0,
    collide: true
  });
  assert.deepEqual(r.data.palette, [...DEFAULT_PALETTE]);
});

test('bad files are rejected with a reason per fault', () => {
  const cases = [
    [null, /JSON object/],
    [{...good(), version: 2}, /version/],
    [{...good(), name: ''}, /name/],
    [{...good(), kit: '../../secrets.glb'}, /kit/],
    [{...good(), kit: 'kit/props.gltf'}, /kit/],
    [{...good(), items: 'bench'}, /items must be an array/],
    [{...good(), extra: 1}, /unknown key "extra"/],
    [good([{prop: 'bench', pos: [1, 2]}]), /pos/],
    [good([{prop: 'bench', pos: [1, 'up', 2]}]), /pos/],
    [good([{prop: 'bench', pos: [NaN, 0, 2]}]), /pos/],
    [good([{prop: 'bench', pos: [1, 0, 2], yaw: '90'}]), /yaw/],
    [good([{prop: 'bench', pos: [1, 0, 2], scale: 0}]), /scale/],
    [good([{prop: 'bench', pos: [1, 0, 2], scale: -1}]), /scale/],
    [good([{prop: 'bench', pos: [1, 0, 2], variant: 99}]), /variant/],
    [good([{prop: 'bench', pos: [1, 0, 2], variant: 1.5}]), /variant/],
    [good([{prop: 'bench', pos: [1, 0, 2], collide: 'yes'}]), /collide/],
    [good([{prop: 'bench', pos: [1, 0, 2], colide: false}]), /unknown key "colide"/],
    [good([{pos: [1, 0, 2]}]), /prop/],
    [{...good(), palette: ['red']}, /palette/]
  ];
  for (const [input, why] of cases) {
    const r = validatePlacements(input);
    assert.equal(r.ok, false, `accepted ${JSON.stringify(input)}`);
    assert.match(r.errors.join('\n'), why);
  }
});

test('props are checked against the kit when the kit is known', () => {
  const r = validatePlacements(good([{prop: 'unicorn', pos: [0, 0, 0]}]), {props: KIT_NODES});
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /"unicorn" is not in the kit/);
});

test('the example picnic area is valid against the real kit and the JSON schema essentials', () => {
  const r = validatePlacements(EXAMPLE, {props: KIT_NODES});
  assert.ok(r.ok, r.errors.join('\n'));
  assert.ok(EXAMPLE.items.length >= 35 && EXAMPLE.items.length <= 45, `${EXAMPLE.items.length} items`);
  const schema = read('../../../../tools/rc/placements.schema.json');
  assert.deepEqual(schema.required, ['version', 'name', 'kit', 'items']);
  for (const key of Object.keys(EXAMPLE)) assert.ok(key in schema.properties, `schema lacks ${key}`);
  for (const key of Object.keys(schema.properties.items.items.properties))
    assert.ok(
      EXAMPLE.items.every(it => key in it),
      `example items omit ${key}`
    );
});

const FARM = [
  'steam-tractor',
  'thresher',
  'windmill',
  'windmill-head',
  'hay-wagon',
  'water-pump',
  'split-rail-fence',
  'crop-row',
  'crop-row@1',
  'scarecrow',
  'silo'
];
test('the kit GLB carries the 14 base props and the farm set; every ground prop has a COL_ proxy', () => {
  const doc = parseGLB(fs.readFileSync(new URL('../assets/kit/props.glb', import.meta.url)));
  assert.equal(KIT_NODES.length, 25);
  for (const name of FARM) assert.ok(KIT_NODES.includes(name), name);
  // the windmill carries its rotor as an attachment: offset on the axle, 8-9 m up, in front of the tower axis
  const mill = doc.nodes.find(n => n.name === 'windmill');
  assert.equal(mill.extras?.attach?.prop, 'windmill-head');
  const [, ay, az] = mill.extras.attach.offset;
  assert.ok(ay > 8 && ay < 9 && az < 0, `${mill.extras.attach.offset}`);
  for (const name of KIT_NODES.filter(n => n !== 'windmill-head')) {
    const node = doc.nodes.find(n => n.name === name);
    const cols = (node.children ?? []).map(i => doc.nodes[i]).filter(n => n.name === `COL_${name}`);
    assert.equal(cols.length, 1, `${name} collider`);
    assert.match(cols[0].extras?.collider ?? '', /^(box|cylinder)$/);
  }
});

// ------------------------------------------------------------------ template map from a stub glTF scene
function stubScene() {
  const paint = new T.MeshStandardMaterial({name: 'Kit_Paint'}),
    metal = new T.MeshStandardMaterial({name: 'Kit_Metal'});
  const root = new T.Group();
  // multi-primitive prop: a Group named after the prop with one Mesh per material (GLTFLoader's shape)
  const drum = new T.Group();
  drum.name = 'fuel-drum';
  drum.position.set(20, 0, -10); // review-grid offset, must be ignored
  drum.add(new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.9).translate(0, 0.45, 0), paint));
  drum.add(new T.Mesh(new T.CylinderGeometry(0.31, 0.31, 0.03).translate(0, 0.3, 0), metal));
  const col = new T.Mesh(new T.BoxGeometry(0.6, 0.9, 0.6).translate(0, 0.45, 0));
  col.name = 'COL_fuel-drum';
  col.userData.collider = 'cylinder';
  drum.add(col);
  // single-primitive prop: the Mesh is the node
  const wall = new T.Mesh(new T.BoxGeometry(3, 0.8, 0.6).translate(0, 0.4, 0), metal);
  wall.name = 'jersey-barrier';
  wall.position.set(10, 0, 0);
  const wcol = new T.Mesh(new T.BoxGeometry(3, 0.8, 0.6).translate(0, 0.4, 0));
  wcol.name = 'COL_jersey-barrier';
  wcol.userData.collider = 'box';
  wall.add(wcol);
  root.add(drum, wall);
  return root;
}

test('template map: one entry per top-level node, COL_ stripped into a collider, grid offset ignored', () => {
  const map = buildTemplateMap(stubScene());
  assert.deepEqual([...map.keys()], ['fuel-drum', 'jersey-barrier']);
  const drum = map.get('fuel-drum');
  assert.equal(drum.parts.length, 2);
  assert.ok(drum.parts.every(p => !p.geometry.name?.startsWith('COL_')));
  assert.equal(drum.paint, true);
  assert.equal(drum.collider.kind, 'cylinder');
  drum.collider.centre.forEach((v, i) =>
    assert.ok(Math.abs(v - [0, 0.45, 0][i]) < 1e-6, `centre ${drum.collider.centre}`)
  );
  drum.collider.size.forEach((v, i) => assert.ok(Math.abs(v - [0.6, 0.9, 0.6][i]) < 1e-6));
  // drawn geometry is in prop-local space: bounds start at the ground contact, centred on x/z
  drum.parts[0].geometry.computeBoundingBox();
  assert.ok(Math.abs(drum.parts[0].geometry.boundingBox.min.y) < 1e-6);
  assert.ok(Math.abs(drum.parts[0].geometry.boundingBox.getCenter(new T.Vector3()).x) < 1e-6);
  const wall = map.get('jersey-barrier');
  assert.equal(wall.parts.length, 1);
  assert.equal(wall.paint, false);
  assert.equal(wall.collider.kind, 'box');
});

test('collider descriptor from bounds', () => {
  assert.deepEqual(colliderFromBounds('box', [-1, 0, -0.5], [1, 2, 0.5]), {
    kind: 'box',
    centre: [0, 1, 0],
    size: [2, 2, 1]
  });
  assert.equal(colliderFromBounds('weird', [0, 0, 0], [1, 1, 1]).kind, 'box');
});

// ------------------------------------------------------------------ transforms
test('yaw and scale: transformPoint agrees with the three.js matrix', () => {
  const item = {pos: [100, null, -50], yaw: 90, scale: 2};
  const m = itemMatrix(item, 3);
  for (const p of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0.3, 0.7, -0.2]
  ]) {
    const a = transformPoint(p, item, 3),
      b = new T.Vector3(...p).applyMatrix4(m).toArray();
    a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${p}: ${a} vs ${b}`));
  }
  // yaw 90 (counter-clockwise from above) turns the authored front (-Z) to face -X
  const front = transformPoint([0, 0, -1], {pos: [0, 0, 0], yaw: 90, scale: 1}, 0);
  assert.ok(Math.abs(front[0] + 1) < 1e-9 && Math.abs(front[2]) < 1e-9, `${front}`);
  // scale is about the ground contact: a 1 m-high point at scale 2 is 2 m above the ground
  assert.ok(Math.abs(transformPoint([0, 1, 0], item, 3)[1] - 5) < 1e-9);
});

test('collider triangles wind outward and close the shape', () => {
  for (const kind of ['box', 'cylinder']) {
    const col = {kind, centre: [0, 0.4, 0], size: [3, 0.8, 0.6]},
      item = {pos: [5, 0, 5], yaw: 30, scale: 1};
    const tris = colliderTriangles(col, item, 1);
    const centre = transformPoint(col.centre, item, 1);
    for (const [a, b, c] of tris) {
      const e1 = b.map((v, i) => v - a[i]),
        e2 = c.map((v, i) => v - a[i]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const mid = [0, 1, 2].map(i => (a[i] + b[i] + c[i]) / 3),
        out = mid.map((v, i) => v - centre[i]);
      assert.ok(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] > 0, `${kind} face points inward`);
    }
    assert.equal(tris.length, kind === 'box' ? 4 * 2 + 2 : 8 * 2 + 6, `${kind} on the ground has no bottom`);
  }
});

test('ground snap: raycast first, elevationAt second, numeric y untouched', () => {
  const world = createWorld(4);
  world.addQuad([-5, 2, -5], [-5, 2, 5], [5, 2, 5], [5, 2, -5]); // a 2 m deck facing up
  assert.equal(groundHeight({pos: [0, null, 0]}, {world, elevationAt: () => 1.5}), 2);
  assert.equal(groundHeight({pos: [50, null, 0]}, {world, elevationAt: () => 1.5}), 1.5);
  assert.equal(groundHeight({pos: [0, null, 0]}), 0);
  assert.equal(groundHeight({pos: [0, 7, 0]}, {world}), 7);
});

// ------------------------------------------------------------------ instancing + collision end to end (no DOM)
test('instantiate: one InstancedMesh per prop part, variants tint paint only, collision blocks the car', () => {
  const kit = registerPlacementKit('stub.glb', buildTemplateMap(stubScene()));
  const scene = new T.Scene(),
    world = createWorld(4);
  const data = good([
    {prop: 'fuel-drum', pos: [0, null, 0], variant: 2},
    {prop: 'fuel-drum', pos: [2, null, 0]},
    {prop: 'jersey-barrier', pos: [0, null, 10], yaw: 90},
    {prop: 'jersey-barrier', pos: [0, null, 20], collide: false}
  ]);
  const h = instantiatePlacements(scene, data, {kit, world, elevationAt: () => 0});
  assert.deepEqual(
    {...h.counts, triangles: undefined},
    {
      items: 4,
      props: 2,
      templates: 2,
      attached: 0,
      meshes: 3,
      drawCalls: 3,
      triangles: undefined,
      colliders: 3,
      collisionTriangles: 2 * 22 + 10
    }
  );
  assert.ok(h.meshes.every(m => m.isInstancedMesh && m.castShadow));
  const paint = h.meshes.find(m => m.name === 'fuel-drum:Kit_Paint'),
    metal = h.meshes.find(m => m.name === 'fuel-drum:Kit_Metal');
  assert.equal(paint.count, 2);
  assert.ok(paint.instanceColor, 'paint part carries variant colours');
  assert.equal(metal.instanceColor, null);
  const tint = new T.Color(),
    want = new T.Color(DEFAULT_PALETTE[2]);
  paint.getColorAt(0, tint);
  ['r', 'g', 'b'].forEach(k =>
    assert.ok(Math.abs(tint[k] - want[k]) < 1e-6, `${k} ${tint[k]} vs ${want[k]}`)
  );
  // a 0.12 m buggy-height sphere pushed into the side of the yawed barrier (now running along z) is pushed back out along x
  const contacts = world.sphereContacts([0.25, 0.2, 10], 0.12);
  assert.ok(contacts.length > 0 && contacts.some(c => c.normal[0] > 0.9), JSON.stringify(contacts));
  // driving along x at bumper height hits the barrier face
  const hit = world.raycast([-5, 0.2, 10], [1, 0, 0], 10);
  assert.ok(hit && Math.abs(hit.point[0] + 0.3) < 1e-6, JSON.stringify(hit));
  // collide:false leaves no proxy
  assert.equal(world.raycast([-5, 0.2, 20], [1, 0, 0], 10), null);
  assert.equal(scene.children.includes(h.root), true);
  h.dispose();
  assert.equal(scene.children.includes(h.root), false);
});

test('instantiate rejects unknown props and unprepared kits', () => {
  const kit = registerPlacementKit('stub2.glb', buildTemplateMap(stubScene()));
  assert.throws(
    () => instantiatePlacements(new T.Scene(), good([{prop: 'bench', pos: [0, 0, 0]}]), {kit}),
    /bench/
  );
  assert.throws(() => instantiatePlacements(new T.Scene(), good(), {}), /preparePlacementKit/);
});

// Blender 5.2's exporter wrote the colour attribute only into the first primitive of a multi-material mesh;
// later primitives came out pure white (seen in-engine as white bench slats and a white jersey barrier).
test('every drawn kit primitive carries real vertex colours (no all-white COLOR_0)', () => {
  const bytes = fs.readFileSync(new URL('../assets/kit/props.glb', import.meta.url)),
    doc = parseGLB(bytes);
  const bin = bytes.subarray(20 + bytes.readUInt32LE(12) + 8);
  for (const node of doc.nodes.filter(n => n.mesh !== undefined && !n.name.startsWith('COL_'))) {
    const prims = doc.meshes[node.mesh].primitives;
    assert.equal(prims.length, 1, `${node.name}: one material per exported mesh`);
    const a = doc.accessors[prims[0].attributes.COLOR_0];
    assert.ok(a, `${node.name} has COLOR_0`);
    const view = doc.bufferViews[a.bufferView],
      C = {5121: Uint8Array, 5123: Uint16Array, 5126: Float32Array}[a.componentType],
      max = {5121: 255, 5123: 65535, 5126: 1}[a.componentType];
    const width = a.type === 'VEC4' ? 4 : 3,
      start = bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const values = new C(bin.buffer.slice(start, start + a.count * width * C.BYTES_PER_ELEMENT));
    let white = 0;
    for (let i = 0; i < a.count; i++)
      if (values[i * width] >= max && values[i * width + 1] >= max && values[i * width + 2] >= max) white++;
    assert.ok(white < a.count * 0.05, `${node.name}: ${white}/${a.count} vertices are pure white`);
  }
});

test('kit variants and attachments: crop-row variant 1 draws crop-row@1; a windmill brings its rotor, which spins', () => {
  const mat = name => new T.MeshStandardMaterial({name});
  const root = new T.Group();
  const node = (name, extras = {}) => {
    const g = new T.Group();
    g.name = name;
    Object.assign(g.userData, extras);
    const m = new T.Mesh(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat('Kit_Wood'));
    g.add(m);
    if (name !== 'windmill-head') {
      const c = new T.Mesh(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
      c.name = 'COL_' + name;
      c.userData.collider = 'box';
      g.add(c);
    }
    root.add(g);
    return g;
  };
  node('crop-row');
  node('crop-row@1');
  node('windmill', {attach: {prop: 'windmill-head', offset: [0, 8.35, -0.62]}});
  node('windmill-head');
  const kit = registerPlacementKit('stub-farm.glb', buildTemplateMap(root));
  assert.deepEqual(kit.props, ['crop-row', 'windmill', 'windmill-head']);
  const world = createWorld(4);
  const h = instantiatePlacements(
    new T.Scene(),
    good([
      {prop: 'crop-row', pos: [0, 0, 0]},
      {prop: 'crop-row', pos: [0, 0, 2], variant: 1},
      {prop: 'windmill', pos: [10, 0, 0], yaw: 90}
    ]),
    {kit, world}
  );
  assert.deepEqual(h.meshes.map(m => [m.userData.prop, m.count]).sort(), [
    ['crop-row', 1],
    ['crop-row@1', 1],
    ['windmill', 1],
    ['windmill-head', 1]
  ]);
  assert.equal(h.counts.attached, 1);
  assert.equal(h.counts.colliders, 3);
  const head = h.meshes.find(m => m.userData.prop === 'windmill-head'),
    a = new T.Matrix4(),
    p = new T.Vector3();
  head.getMatrixAt(0, a);
  p.setFromMatrixPosition(a);
  // yaw 90 turns the -0.62 m (forward) offset toward -X
  assert.ok(
    Math.abs(p.x - (10 - 0.62)) < 1e-6 && Math.abs(p.y - 8.35) < 1e-6 && Math.abs(p.z) < 1e-6,
    p.toArray().join()
  );
  assert.equal(world.raycast([10, 8.35, -5], [0, 0, 1], 10), null, 'the rotor has no collider');
  assert.equal(h.spin('windmill-head', 1), 1);
  const b = new T.Matrix4();
  head.getMatrixAt(0, b);
  assert.ok(
    !a.equals(b) && new T.Vector3().setFromMatrixPosition(b).distanceTo(p) < 1e-6,
    'spins in place about its axle'
  );
});
