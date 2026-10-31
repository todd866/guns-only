import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {update, check, servedFiles, canonicalText, DEFAULT_ROOT} from './asset-manifest.mjs';

function glb(triangles) {
  const doc = {asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}], nodes: [{name: 'Root', mesh: 0}], materials: [{}],
    meshes: [{primitives: [{attributes: {POSITION: 0}}]}], accessors: [{count: triangles * 3, min: [0, 0, 0], max: [1, 1, 1]}]};
  let json = Buffer.from(JSON.stringify(doc)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const h = Buffer.alloc(20); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(20 + json.length, 8); h.writeUInt32LE(json.length, 12); h.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([h, json]);
}
const contract = {tri: {file: 'm.glb', max_triangles: 4, max_materials: 2, max_bytes: 100000, required_nodes: ['Root'], max_extent_m: [2, 2, 2]}};
// Fixture trees live under os.tmpdir() and are removed after each test.
function tree(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-manifest-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'audio')); fs.mkdirSync(path.join(root, 'world'));
  fs.writeFileSync(path.join(root, 'm.glb'), glb(2)); fs.writeFileSync(path.join(root, 'audio/a.ogg'), 'ogg-bytes');
  fs.writeFileSync(path.join(root, 'world/t.json'), '{}'); fs.writeFileSync(path.join(root, 'world/LICENSE.md'), 'ODbL');
  fs.writeFileSync(path.join(root, 'provenance.json'), JSON.stringify({license: 'MIT (original)'}));
  return root;
}
const read = root => JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const entry = (root, p) => read(root).assets.find(a => a.path === p);
function edit(root, mut) { const m = read(root); for (const a of m.assets) mut(a); fs.writeFileSync(path.join(root, 'manifest.json'), canonicalText(m)); }
const fill = a => { if (a.license.id === 'unknown') a.license = {id: 'CC0-1.0', source: 's', attribution: '', redistributable: true}; };

test('update adds entries, collapses world/, infers MIT from provenance, leaves others unknown', t => {
  const root = tree(t); const {report} = update(root, {contract});
  assert.deepEqual(servedFiles(root), ['audio/a.ogg', 'm.glb', 'world/']);
  assert.equal(report.added.length, 3);
  const m = entry(root, 'm.glb');
  assert.equal(m.license.id, 'MIT'); assert.equal(m.provenance, 'provenance.json'); assert.equal(m.locked, false);
  assert.deepEqual(m.lods, [{level: 0, source: 'm.glb', minProjectedPixels: 0}]); assert.equal(m.budgets.max_triangles, 4);
  assert.equal(entry(root, 'audio/a.ogg').license.id, 'unknown'); assert.equal(entry(root, 'world/').kind, 'world-data');
  assert.match(m.sha256, /^[0-9a-f]{64}$/);
});
test('update is deterministic, keeps hand edits, and drops entries whose file is gone', t => {
  const root = tree(t); update(root, {contract}); edit(root, fill);
  const first = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'); update(root, {contract});
  assert.equal(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'), first);
  assert.equal(entry(root, 'audio/a.ogg').license.id, 'CC0-1.0');
  fs.rmSync(path.join(root, 'audio/a.ogg')); const {report} = update(root, {contract});
  assert.deepEqual(report.removed, ['audio/a.ogg']); assert.equal(entry(root, 'audio/a.ogg'), undefined);
});
test('check: unknown licence fails unless allowed (then it is listed); non-redistributable always fails', t => {
  const root = tree(t); update(root, {contract});
  assert.ok(check(root, {contract}).errors.some(e => /audio\/a\.ogg.*unknown/.test(e)));
  const ok = check(root, {contract, allowUnknownLicense: true}); assert.deepEqual(ok.errors, []); assert.match(ok.warnings[0], /audio\/a\.ogg/);
  edit(root, fill); assert.deepEqual(check(root, {contract}).errors, []);
  edit(root, a => { a.license.redistributable = false; });
  assert.ok(check(root, {contract, allowUnknownLicense: true}).errors.some(e => /not marked redistributable/.test(e)));
});
test('check flags uncovered served files, dangling manifest paths, and authoring sources', t => {
  const root = tree(t); update(root, {contract}); edit(root, fill);
  fs.writeFileSync(path.join(root, 'new.mp3'), 'x'); fs.writeFileSync(path.join(root, 'scene.blend1'), 'x');
  let r = check(root, {contract});
  assert.ok(r.errors.some(e => /not in manifest: new\.mp3/.test(e))); assert.ok(r.errors.some(e => /authoring source.*scene\.blend1/.test(e)));
  fs.rmSync(path.join(root, 'new.mp3')); fs.rmSync(path.join(root, 'scene.blend1')); fs.rmSync(path.join(root, 'audio/a.ogg'));
  r = check(root, {contract}); assert.ok(r.errors.some(e => /path does not exist: audio\/a\.ogg/.test(e)));
});
test('hash drift is information for unlocked entries and an error for locked ones', t => {
  const root = tree(t); update(root, {contract}); edit(root, fill);
  fs.writeFileSync(path.join(root, 'audio/a.ogg'), 'regenerated');
  let r = check(root, {contract}); assert.deepEqual(r.errors, []); assert.ok(r.info.some(i => /audio\/a\.ogg/.test(i)));
  edit(root, a => { if (a.path === 'audio/a.ogg') a.locked = true; });
  update(root, {contract}); // refresh the lock baseline? locked hashes must stay put
  fs.writeFileSync(path.join(root, 'audio/a.ogg'), 'drift-again');
  r = check(root, {contract}); assert.ok(r.errors.some(e => /locked entry drifted/.test(e)));
  update(root, {contract}); assert.ok(check(root, {contract}).errors.some(e => /locked entry drifted/.test(e)), 'update must not rewrite a locked hash');
  assert.equal(entry(root, 'm.glb').locked, false);
});
test('check enforces model budgets and canonical formatting', t => {
  const root = tree(t); update(root, {contract}); edit(root, fill);
  fs.writeFileSync(path.join(root, 'm.glb'), glb(9)); // 9 triangles > 4
  assert.ok(check(root, {contract}).errors.some(e => /m\.glb: budget\/contract.*triangle budget/.test(e)));
  fs.writeFileSync(path.join(root, 'm.glb'), glb(2)); update(root, {contract});
  assert.deepEqual(check(root, {contract}).errors, []);
  const f = path.join(root, 'manifest.json'); fs.writeFileSync(f, JSON.stringify(read(root)));
  assert.ok(check(root, {contract}).errors.some(e => /canonical form/.test(e)));
});
test('the real served RC tree passes check --allow-unknown-license', () => {
  assert.deepEqual(check(DEFAULT_ROOT, {allowUnknownLicense: true}).errors, []);
});
