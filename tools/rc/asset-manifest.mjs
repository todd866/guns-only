// RC asset manifest: licence, provenance, budgets and completeness for every file in the served asset tree
// (web/wwwroot/rc/assets). Vocabulary follows docs/graphics-asset-pipeline.md (ids, lods, sha256/sizeBytes)
// but the shape is deliberately lighter. There is no global hash lock: an entry only pins its bytes when a
// human sets "locked": true, so routine regeneration of Blender exports never blocks a deploy.
//   node tools/rc/asset-manifest.mjs update [--root DIR]
//   node tools/rc/asset-manifest.mjs check  [--root DIR] [--allow-unknown-license]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseGLB, validateDocument, servedTreeSources} from './validate-assets.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, '../../web/wwwroot/rc/assets');
export const DEFAULT_CONTRACT = path.join(here, 'asset-contract.json');
export const MANIFEST_NAME = 'manifest.json';
export const WORLD_DIR = 'world';
export const KINDS = ['model', 'texture', 'environment', 'audio', 'world-data'];
// Documentation that explains assets rather than being one; not listed, but referenced as provenance.
const METADATA = f => /(^|\/)provenance\.json$/.test(f) || /\.provenance\.json$/.test(f) || /(^|\/)SOURCES\.md$/.test(f) || /(^|\/)\.DS_Store$/.test(f);
const KIND_BY_EXT = {'.glb': 'model', '.gltf': 'model', '.png': 'texture', '.webp': 'texture', '.jpg': 'texture', '.jpeg': 'texture', '.ktx2': 'texture', '.hdr': 'environment', '.exr': 'environment', '.mp3': 'audio', '.ogg': 'audio', '.wav': 'audio'};

export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const posix = p => p.split(path.sep).join('/');
export const idFor = rel => rel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function kindFor(rel) {
  if (rel === WORLD_DIR + '/') return 'world-data';
  return KIND_BY_EXT[path.extname(rel.replace(/\.gz$/, '')).toLowerCase()] ?? 'unknown';
}

// Recursively key-sorted JSON: the one canonical form `update` writes and `check` demands.
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}
export function canonicalText(manifest) {
  const m = {...manifest, assets: [...(manifest.assets ?? [])].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))};
  return JSON.stringify(sortKeys(m), null, 2) + '\n';
}

// Every served file the manifest must list, as paths relative to the asset root. The generated world tiles
// collapse into the single directory entry "world/".
export function servedFiles(root) {
  const out = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      const f = path.join(d, e.name), rel = posix(path.relative(root, f));
      if (e.isDirectory()) { if (rel === WORLD_DIR) { out.push(WORLD_DIR + '/'); continue; } walk(f); }
      else if (rel !== MANIFEST_NAME && !METADATA(rel)) out.push(rel);
    }
  };
  walk(root);
  return out.sort();
}
function worldDigest(root) {
  const base = path.join(root, WORLD_DIR), lines = [];
  let size = 0;
  const walk = d => { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { const b = fs.readFileSync(f); size += b.length; lines.push(`${posix(path.relative(base, f))} ${sha256(b)}`); } } };
  walk(base);
  return {sizeBytes: size, sha256: sha256(lines.sort().join('\n'))};
}
export function measure(root, rel) {
  if (rel === WORLD_DIR + '/') return worldDigest(root);
  const b = fs.readFileSync(path.join(root, rel));
  return {sizeBytes: b.length, sha256: sha256(b)};
}

function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function contractFor(contract, rel) { return Object.values(contract).find(s => s && typeof s === 'object' && s.file === rel); }
export function inferProvenance(root, rel) {
  const plain = rel.replace(/\.gz$/, ''), stem = plain.replace(/\.[^./]+$/, '');
  const sibling = stem + '.provenance.json';
  if (fs.existsSync(path.join(root, sibling))) return sibling;
  if (!plain.includes('/') && plain.endsWith('.glb') && fs.existsSync(path.join(root, 'provenance.json'))) return 'provenance.json';
  if (plain.startsWith('audio/') && fs.existsSync(path.join(root, 'audio/SOURCES.md'))) return 'audio/SOURCES.md';
  if (rel === WORLD_DIR + '/' && fs.existsSync(path.join(root, WORLD_DIR, 'LICENSE.md'))) return WORLD_DIR + '/LICENSE.md';
  return null;
}
const UNKNOWN_LICENSE = {id: 'unknown', source: 'unknown', attribution: '', redistributable: false};
function inferLicense(root, provenance) {
  if (provenance?.endsWith('.json')) {
    const lic = readJSON(path.join(root, provenance))?.license;
    if (typeof lic === 'string' && /\bMIT\b/.test(lic)) return {id: 'MIT', source: provenance, attribution: 'Saucer Springs AFB authors (repository MIT)', redistributable: true};
  }
  return {...UNKNOWN_LICENSE};
}
export function newEntry(root, rel, contract = {}) {
  const kind = kindFor(rel), provenance = inferProvenance(root, rel), isGz = rel.endsWith('.gz');
  const e = {id: idFor(rel), path: rel, kind, ...measure(root, rel), license: inferLicense(root, provenance), provenance: provenance ?? 'unknown', locked: false};
  if (!provenance) e.note = 'no provenance recorded; a human must supply source and licence';
  if (isGz) e.derivedFrom = rel.replace(/\.gz$/, '');
  else if (kind === 'model') {
    const spec = contractFor(contract, rel);
    if (spec) e.budgets = Object.fromEntries(['max_triangles', 'max_materials', 'max_bytes', 'max_primitives'].filter(k => spec[k] !== undefined).map(k => [k, spec[k]]));
    e.lods = [{level: 0, source: rel, minProjectedPixels: 0}];
  }
  return e;
}

export function loadManifest(root) { return readJSON(path.join(root, MANIFEST_NAME)) ?? {version: 1, assets: []}; }

export function update(root = DEFAULT_ROOT, {contract = readJSON(DEFAULT_CONTRACT) ?? {}, write = true} = {}) {
  const manifest = loadManifest(root), files = new Set(servedFiles(root)), kept = new Map();
  const report = {added: [], removed: [], refreshed: [], drift: []};
  for (const a of manifest.assets ?? []) {
    if (!files.has(a.path)) { report.removed.push(a.path); continue; }
    if (!a.locked) {
      const m = measure(root, a.path);
      if (m.sha256 !== a.sha256) report.drift.push(a.path);
      Object.assign(a, m); report.refreshed.push(a.path);
    }
    kept.set(a.path, a);
  }
  for (const rel of files) if (!kept.has(rel)) { kept.set(rel, newEntry(root, rel, contract)); report.added.push(rel); }
  const next = {version: 1, assets: [...kept.values()]};
  const text = canonicalText(next);
  if (write) fs.writeFileSync(path.join(root, MANIFEST_NAME), text);
  return {manifest: next, text, report};
}

export function check(root = DEFAULT_ROOT, {allowUnknownLicense = false, contract = readJSON(DEFAULT_CONTRACT) ?? {}} = {}) {
  const errors = [], warnings = [], info = [];
  const file = path.join(root, MANIFEST_NAME);
  if (!fs.existsSync(file)) return {errors: [`${MANIFEST_NAME} is missing; run node tools/rc/asset-manifest.mjs update`], warnings, info, unknown: []};
  const text = fs.readFileSync(file, 'utf8');
  let manifest;
  try { manifest = JSON.parse(text); } catch (e) { return {errors: [`${MANIFEST_NAME} is not valid JSON: ${e.message}`], warnings, info, unknown: []}; }
  const listed = new Map((manifest.assets ?? []).map(a => [a.path, a])), ids = new Set(), unknown = [];
  for (const rel of servedFiles(root)) if (!listed.has(rel)) errors.push(`served file not in manifest: ${rel}`);
  for (const src of servedTreeSources(root)) errors.push(`authoring source in the served tree (move to assets/rc/): ${src}`);
  for (const a of manifest.assets ?? []) {
    const where = a.path ?? a.id;
    if (ids.has(a.id)) errors.push(`duplicate id ${a.id}`); ids.add(a.id);
    if (!KINDS.includes(a.kind)) errors.push(`${where}: kind "${a.kind}" is not one of ${KINDS.join('|')}`);
    const abs = path.join(root, a.path ?? '');
    if (!a.path || !fs.existsSync(abs)) { errors.push(`manifest path does not exist: ${a.path}`); continue; }
    if (a.provenance && a.provenance !== 'unknown' && !fs.existsSync(path.join(root, a.provenance))) errors.push(`${where}: provenance file missing: ${a.provenance}`);
    const lic = a.license;
    if (!lic || !lic.id || lic.id === 'unknown') { unknown.push(where); if (!allowUnknownLicense) errors.push(`${where}: licence is unknown`); }
    else if (lic.redistributable !== true) errors.push(`${where}: licence ${lic.id} is not marked redistributable`);
    const m = measure(root, a.path);
    if (m.sha256 !== a.sha256 || m.sizeBytes !== a.sizeBytes) {
      if (a.locked) errors.push(`${where}: locked entry drifted (manifest ${String(a.sha256).slice(0, 12)}, file ${m.sha256.slice(0, 12)}); unlock or run update after review`);
      else info.push(`${where}: changed since the manifest was written (${a.sizeBytes} -> ${m.sizeBytes} bytes); run update to refresh`);
    }
    if (a.kind === 'model' && !a.path.endsWith('.gz')) {
      const bytes = fs.readFileSync(abs), spec = contractFor(contract, a.path);
      if (a.budgets?.max_bytes !== undefined && bytes.length > a.budgets.max_bytes) errors.push(`${where}: ${bytes.length} bytes exceeds manifest budget ${a.budgets.max_bytes}`);
      if (spec) { try { validateDocument(parseGLB(bytes), spec, bytes.length); } catch (e) { errors.push(`${where}: budget/contract: ${e.message}`); } }
    }
  }
  if (text !== canonicalText(manifest)) errors.push(`${MANIFEST_NAME} is not in canonical form; run node tools/rc/asset-manifest.mjs update`);
  if (unknown.length && allowUnknownLicense) warnings.push(`${unknown.length} asset(s) have an UNKNOWN licence (tolerated by --allow-unknown-license, which goes away once this list is empty):\n  ${unknown.join('\n  ')}`);
  return {errors, warnings, info, unknown};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2), flag = n => rest.includes(n);
  const root = rest.includes('--root') ? path.resolve(rest[rest.indexOf('--root') + 1]) : DEFAULT_ROOT;
  if (cmd === 'update') {
    const {manifest, report} = update(root);
    console.log(`asset-manifest: ${manifest.assets.length} entries (+${report.added.length} -${report.removed.length}, ${report.drift.length} changed)`);
    for (const e of manifest.assets.filter(a => report.added.includes(a.path))) console.log(`  added ${e.path}${e.license.id === 'unknown' ? ' (licence UNKNOWN until a human fills it in)' : ''}`);
    for (const f of report.removed) console.log(`  removed ${f}`);
  } else if (cmd === 'check') {
    const r = check(root, {allowUnknownLicense: flag('--allow-unknown-license')});
    for (const w of r.warnings) console.warn(`asset-manifest: WARNING ${w}`);
    for (const i of r.info) console.log(`asset-manifest: info ${i}`);
    for (const e of r.errors) console.error(`asset-manifest: ERROR ${e}`);
    if (r.errors.length) { console.error(`asset-manifest: FAILED with ${r.errors.length} error(s)`); process.exit(1); }
    console.log('asset-manifest: ok');
  } else { console.error('usage: node tools/rc/asset-manifest.mjs update|check [--root DIR] [--allow-unknown-license]'); process.exit(2); }
}
