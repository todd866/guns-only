// Package web/wwwroot/rc/ as a self-contained static site for the Saucer Springs Vercel project.
// guns-only.com rewrites /rc/* to that project, so the page must never reach outside /rc/ for
// code: the three.js files RC imports are copied to rc/vendor/ and RC's imports re-pointed.
//   node tools/rc/package-rc.mjs [--out DIR] [--bundle]   (default .rc-dist at the repo root)
// --bundle: esbuild bundles the JS into rc/main.js + rc/chunks/*.js (no rc/vendor, no rc/shared).
import {compressModels} from './compress-models.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WWW = path.join(ROOT, 'web/wwwroot'), RC = path.join(WWW, 'rc'), VENDOR = path.join(WWW, 'vendor');
// The only render/ code rc/ may import, copied to rc/shared/<name>/. `files` is an exact allowlist;
// `any` allows every .js directly inside the directory (not tests/ or subdirectories).
const SHARED_DIRS = [
  { name: 'telemetry', dir: path.join(WWW, 'render/telemetry'), files: new Set(['telemetry_batch.js', 'telemetry_outbox.js']) },
  { name: 'visual', dir: path.join(WWW, 'render/visual/shared'), any: true },
];
const sharedDirOf = (target, roots = SHARED_DIRS.map(d => d.dir)) => {
  const i = roots.findIndex(r => inside(target, r)); if (i < 0) return null;
  const rel = path.relative(roots[i], target), d = SHARED_DIRS[i];
  return (d.any ? /^[^/\\]+\.js$/.test(rel) && !/\.test\.js$/.test(rel) : d.files.has(rel)) ? { d, rel } : null;
};
const MARKER = '.rc-dist-marker', CODE = /\.(m?js|html)$/;
const SKIP = name => /\.test\.m?js$|\.blend1?$/.test(name) || name === 'tests' || name === '__fixtures__' || name.startsWith('.') || name.endsWith('.glb.gz');

// Real relative imports only: comments are blanked first (vendor files carry example code in them).
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const IMPORT = /(\bimport\s*\(\s*|\b(?:import|export)\b[^'"`;]*?\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2/g;
// What rc/ code may import: itself, the vendored three, and the allowlisted shared render modules.
export const importApproved = target => inside(target, RC) || inside(target, VENDOR) || !!sharedDirOf(target);
export function relativeImports(src) { return [...stripComments(src).matchAll(IMPORT)].map(m => m[3]); }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP(e.name)) continue;
    const p = path.join(dir, e.name); e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const inside = (p, dir) => p === dir || p.startsWith(dir + path.sep);
const posix = p => p.split(path.sep).join('/');

// The default open-world start downloads these before the car is drivable. Without hints the
// browser only learns of each file after the previous module or JSON has been parsed, so on a
// 150 ms satellite link the static import chain alone cost about 4 s before any world data.
export const START_ASSETS = [
  ['fetch', 'assets/world/manifest.json'], ['fetch', 'assets/world/overview.json'],
  ['fetch', 'assets/world/terrain.json'], ['fetch', 'assets/world/playable-terrain.json'],
  ['fetch', 'assets/world/residential.json'], ['fetch', 'assets/world/residential-terrain.json'],
  ['fetch', 'assets/districts/skatepark.glb.gz'], ['fetch', 'assets/buggy.glb.gz'],
  ['fetch', 'assets/heroes/landmarks.glb.gz'], ['fetch', 'assets/heroes/B-52.glb.gz'],
  ['fetch', 'assets/heroes/C-17.glb.gz'], ['fetch', 'assets/heroes/A-10.glb.gz'],
  ['fetch', 'assets/env/goegap_1k.hdr'],
  ['image', 'assets/materials/park-paint-atlas.webp'], ['image', 'assets/foliage/deciduous-cluster.webp'],
];
// Every module main.js reaches through static imports, plus the asset loader it imports at once.
export function startModules(rcDir) {
  const seen = new Set(), queue = [path.join(rcDir, 'main.js'), path.join(rcDir, 'assets.js')];
  const STATIC = /\b(?:import|export)\b[^'"`;()]*?\bfrom\s*(['"])(\.{1,2}\/[^'"]+)\1|\bimport\s*(['"])(\.{1,2}\/[^'"]+)\3/g;
  while (queue.length) {
    const file = queue.shift(); if (seen.has(file) || !fs.existsSync(file)) continue; seen.add(file);
    for (const m of stripComments(fs.readFileSync(file, 'utf8')).matchAll(STATIC)) queue.push(path.resolve(path.dirname(file), (m[2] ?? m[4]).split(/[?#]/)[0]));
  }
  return [...seen].map(f => posix(path.relative(rcDir, f))).filter(f => !f.startsWith('..')).sort();
}
export function injectPreloads(rcDir) {
  const index = path.join(rcDir, 'index.html'), html = fs.readFileSync(index, 'utf8');
  for (const [, file] of START_ASSETS) if (!fs.existsSync(path.join(rcDir, file))) throw Error(`preload ${file} is missing`);
  const tags = [...startModules(rcDir).map(f => `<link rel="modulepreload" href="${f}">`),
    ...START_ASSETS.map(([as, f]) => `<link rel="preload" as="${as}" href="${f}" crossorigin>`)].join('');
  if (!html.includes('</head>')) throw Error('rc/index.html has no </head>');
  fs.writeFileSync(index, html.replace('</head>', tags + '</head>'));
}

export function packageRc(out = path.join(ROOT, '.rc-dist')) {
  if (fs.existsSync(out) && fs.readdirSync(out).length && !fs.existsSync(path.join(out, MARKER)))
    throw Error(`${out} is not empty and has no ${MARKER}; refusing to overwrite it`);
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const vendor = new Set(), queue = [];
  const shared = target => !!sharedDirOf(target);
  const bundledPath = target => {
    if (inside(target, VENDOR)) return path.join(out, 'rc/vendor', path.relative(VENDOR, target));
    const { d, rel } = sharedDirOf(target); return path.join(out, 'rc/shared', d.name, rel);
  };
  const resolve = (file, spec) => {
    const target = path.resolve(path.dirname(file), spec.split(/[?#]/)[0]);
    if (!fs.existsSync(target)) throw Error(`${posix(path.relative(ROOT, file))}: import '${spec}' does not exist`);
    if (!importApproved(target)) throw Error(`${posix(path.relative(ROOT, file))}: import '${spec}' leaves rc/ and approved shared dependencies`);
    if ((inside(target, VENDOR) || shared(target)) && !vendor.has(target)) { vendor.add(target); queue.push(target); }
    return target;
  };
  let bytes = 0, files = 0;
  for (const file of walk(RC)) {
    const dest = path.join(out, 'rc', path.relative(RC, file)); fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!CODE.test(file)) { fs.copyFileSync(file, dest); bytes += fs.statSync(dest).size; files++; continue; }
    let src = fs.readFileSync(file, 'utf8');
    for (const spec of new Set(relativeImports(src))) {
      const target = resolve(file, spec);
      if (inside(target, RC)) continue;
      let rel = posix(path.relative(path.dirname(dest), bundledPath(target)));
      if (!rel.startsWith('.')) rel = './' + rel;
      src = src.split(`'${spec}'`).join(`'${rel}'`).split(`"${spec}"`).join(`"${rel}"`);
    }
    fs.writeFileSync(dest, src); bytes += Buffer.byteLength(src); files++;
  }
  // Regenerate transport assets from this exact release's originals.
  const compressed=compressModels(path.join(out,'rc/assets'));files+=compressed.length;bytes+=compressed.reduce((n,r)=>n+r.bytes,0);
  // Vendor files import each other relatively; the copied tree keeps those paths valid.
  while (queue.length) { const file = queue.pop(); for (const spec of relativeImports(fs.readFileSync(file, 'utf8'))) resolve(file, spec); }
  for (const file of vendor) {
    const dest = bundledPath(file); fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest); bytes += fs.statSync(dest).size;
  }
  injectPreloads(path.join(out, 'rc'));
  fs.writeFileSync(path.join(out, 'vercel.json'), JSON.stringify({
    redirects: [{ source: '/', destination: '/rc/', permanent: false }],
    // Asset names are stable across releases. Revalidate before reusing them with new code;
    // conditional requests still reuse the browser's downloaded bytes when unchanged.
    headers: [{ source: '/rc/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] }],
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(out, MARKER), 'written by tools/rc/package-rc.mjs\n');
  return { out, files, vendor: vendor.size, bytes };
}

// ---- opt-in bundle mode -------------------------------------------------------------------------
export function findEsbuild() {
  const candidates = [process.env.ESBUILD];
  const projects = path.join(os.homedir(), 'Projects');
  if (fs.existsSync(projects)) for (const d of fs.readdirSync(projects).sort()) candidates.push(path.join(projects, d, 'node_modules/.bin/esbuild'));
  return candidates.find(c => c && fs.existsSync(c)) ?? null;
}
// Three sources resolve art with new URL('../assets/..', import.meta.url). Bundled, import.meta.url is
// no longer inside open-world/, so point them at the page base (<base href="/rc/">) instead.
const META_URL = /new URL\((['"`])\.\.\/assets\/([^)]*?)import\.meta\.url\)/g;
export function rewriteMetaUrl(src) {
  let n = 0;
  const out = src.replace(META_URL, (_m, q, rest) => { n++; return `new URL(${q}assets/${rest}document.baseURI)`; });
  return { src: out, rewrites: n, found: (src.match(/import\.meta\.url/g) ?? []).length };
}
// Every output reachable from the entry by static imports (what the browser must fetch to start).
export function staticChunks(metafile, entryOutput) {
  const seen = new Set(), queue = [entryOutput];
  while (queue.length) {
    const o = queue.shift(); if (seen.has(o)) continue; seen.add(o);
    for (const imp of metafile.outputs[o]?.imports ?? []) if (imp.kind === 'import-statement' && !imp.external) queue.push(imp.path);
  }
  return [...seen];
}
function writeSiteConfig(out) {
  fs.writeFileSync(path.join(out, 'vercel.json'), JSON.stringify({
    redirects: [{ source: '/', destination: '/rc/', permanent: false }],
    headers: [{ source: '/rc/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] }],
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(out, MARKER), 'written by tools/rc/package-rc.mjs\n');
}
export function packageRcBundle(out = path.join(ROOT, '.rc-dist')) {
  const esbuild = findEsbuild();
  if (!esbuild) throw Error('esbuild not found (set ESBUILD or install it under ~/Projects/*/node_modules/.bin)');
  if (fs.existsSync(out) && fs.readdirSync(out).length && !fs.existsSync(path.join(out, MARKER)))
    throw Error(`${out} is not empty and has no ${MARKER}; refusing to overwrite it`);
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, MARKER), 'written by tools/rc/package-rc.mjs\n');   // first, so a failed run stays re-runnable
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-bundle-'));
  try {
    // Same depth as the real tree so ../vendor and ../render/telemetry resolve identically.
    const tWww = path.join(tmp, 'web/wwwroot'), tRc = path.join(tWww, 'rc'), tVendor = path.join(tWww, 'vendor'), tRoots = SHARED_DIRS.map(d => path.join(tWww, path.relative(WWW, d.dir)));
    fs.cpSync(VENDOR, tVendor, { recursive: true });
    SHARED_DIRS.forEach((d, i) => {
      fs.mkdirSync(tRoots[i], { recursive: true });
      for (const e of fs.readdirSync(d.dir, { withFileTypes: true }))
        if (e.isFile() && (d.any ? /\.js$/.test(e.name) : d.files.has(e.name))) fs.copyFileSync(path.join(d.dir, e.name), path.join(tRoots[i], e.name));
    });
    let bytes = 0, files = 0, rewrites = 0, found = 0; const guard = [];
    const copyOut = file => { const dest = path.join(out, 'rc', path.relative(RC, file)); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(file, dest); bytes += fs.statSync(dest).size; files++; };
    for (const file of walk(RC)) {
      if (!CODE.test(file) || path.relative(RC, file) === 'index.html') { copyOut(file); continue; }
      const dest = path.join(tRc, path.relative(RC, file)); fs.mkdirSync(path.dirname(dest), { recursive: true });
      const r = rewriteMetaUrl(fs.readFileSync(file, 'utf8')); rewrites += r.rewrites; found += r.found;
      fs.writeFileSync(dest, r.src); guard.push([file, dest, r.src]);
    }
    for (const [file, dest, src] of guard) {
      for (const spec of new Set(relativeImports(src))) {   // same "import leaves rc/" guard as the default mode
        const target = path.resolve(path.dirname(dest), spec.split(/[?#]/)[0]);
        if (!fs.existsSync(target)) throw Error(`${posix(path.relative(ROOT, file))}: import '${spec}' does not exist`);
        const ok = inside(target, tRc) || inside(target, tVendor) || !!sharedDirOf(target, tRoots);
        if (!ok) throw Error(`${posix(path.relative(ROOT, file))}: import '${spec}' leaves rc/ and approved shared dependencies`);
      }
    }
    if (rewrites !== found) throw Error(`import.meta.url: ${found} occurrences but ${rewrites} rewritten; teach rewriteMetaUrl the new pattern`);
    const outRc = path.join(out, 'rc'), metaFile = path.join(tmp, 'meta.json');
    const r = spawnSync(esbuild, ['main.js', '--bundle', '--splitting', '--format=esm', '--minify', '--target=es2022', `--outdir=${outRc}`,
      '--entry-names=[name]', '--chunk-names=chunks/[name]-[hash]', `--metafile=${metaFile}`, '--log-level=warning', '--legal-comments=none'],
      { cwd: tRc, encoding: 'utf8' });
    if (r.status !== 0) throw Error(`esbuild failed: ${r.stderr || r.stdout}`);
    const metafile = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const outputFor = ep => Object.keys(metafile.outputs).find(o => metafile.outputs[o].entryPoint === ep);
    const entryOut = outputFor('main.js'), loaderOut = outputFor('assets.js');   // the default mode also hints the asset loader main.js imports at once
    if (!entryOut || !loaderOut) throw Error('esbuild metafile lacks the main.js or assets.js output');
    const jsOutputs = Object.keys(metafile.outputs).filter(o => o.endsWith('.js'));
    for (const o of jsOutputs) { bytes += metafile.outputs[o].bytes; files++; }
    const compressed = compressModels(path.join(out, 'rc/assets')); files += compressed.length; bytes += compressed.reduce((n, c) => n + c.bytes, 0);
    const hrefs = [...new Set([...staticChunks(metafile, entryOut), ...staticChunks(metafile, loaderOut)])].map(o => posix(path.relative(outRc, path.resolve(tRc, o))));
    const index = path.join(outRc, 'index.html'), html = fs.readFileSync(index, 'utf8');
    for (const [, f] of START_ASSETS) if (!fs.existsSync(path.join(outRc, f))) throw Error(`preload ${f} is missing`);
    if (!html.includes('</head>')) throw Error('rc/index.html has no </head>');
    const tags = [...hrefs.map(f => `<link rel="modulepreload" href="${f}">`), ...START_ASSETS.map(([as, f]) => `<link rel="preload" as="${as}" href="${f}" crossorigin>`)].join('');
    fs.writeFileSync(index, html.replace('</head>', tags + '</head>'));
    writeSiteConfig(out);
    return { out, files, vendor: 0, bytes, chunks: jsOutputs.length - 1, preloaded: hrefs };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--out'), out = i > 0 ? path.resolve(process.argv[i + 1]) : undefined;
  try { const r = (process.argv.includes('--bundle') ? packageRcBundle : packageRc)(out); console.log(`package-rc: ${r.files} rc files + ${r.vendor} vendor files, ${(r.bytes / 1048576).toFixed(1)} MiB -> ${r.out}`); }
  catch (e) { console.error(`package-rc: ${e.message}`); process.exit(1); }
}
