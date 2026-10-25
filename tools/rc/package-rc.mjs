// Package web/wwwroot/rc/ as a self-contained static site for the Saucer Springs Vercel project.
// guns-only.com rewrites /rc/* to that project, so the page must never reach outside /rc/ for
// code: the three.js files RC imports are copied to rc/vendor/ and RC's imports re-pointed.
//   node tools/rc/package-rc.mjs [--out DIR]   (default .rc-dist at the repo root)
import {compressModels} from './compress-models.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WWW = path.join(ROOT, 'web/wwwroot'), RC = path.join(WWW, 'rc'), VENDOR = path.join(WWW, 'vendor');
const SHARED = path.join(WWW, 'render/telemetry');
const SHARED_FILES = new Set(['telemetry_batch.js', 'telemetry_outbox.js']);
const MARKER = '.rc-dist-marker', CODE = /\.(m?js|html)$/;
const SKIP = name => /\.test\.m?js$|\.blend1?$/.test(name) || name === 'tests' || name === '__fixtures__' || name.startsWith('.') || name.endsWith('.glb.gz');

// Real relative imports only: comments are blanked first (vendor files carry example code in them).
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const IMPORT = /(\bimport\s*\(\s*|\b(?:import|export)\b[^'"`;]*?\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2/g;
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

export function packageRc(out = path.join(ROOT, '.rc-dist')) {
  if (fs.existsSync(out) && fs.readdirSync(out).length && !fs.existsSync(path.join(out, MARKER)))
    throw Error(`${out} is not empty and has no ${MARKER}; refusing to overwrite it`);
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const vendor = new Set(), queue = [];
  const shared = target => inside(target, SHARED) && SHARED_FILES.has(path.relative(SHARED, target));
  const bundledPath = target => inside(target, VENDOR)
    ? path.join(out, 'rc/vendor', path.relative(VENDOR, target))
    : path.join(out, 'rc/shared/telemetry', path.relative(SHARED, target));
  const resolve = (file, spec) => {
    const target = path.resolve(path.dirname(file), spec.split(/[?#]/)[0]);
    if (!fs.existsSync(target)) throw Error(`${posix(path.relative(ROOT, file))}: import '${spec}' does not exist`);
    if (!inside(target, RC) && !inside(target, VENDOR) && !shared(target)) throw Error(`${posix(path.relative(ROOT, file))}: import '${spec}' leaves rc/ and approved shared dependencies`);
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
  fs.writeFileSync(path.join(out, 'vercel.json'), JSON.stringify({
    redirects: [{ source: '/', destination: '/rc/', permanent: false }],
    // Asset names are stable across releases. Revalidate before reusing them with new code;
    // conditional requests still reuse the browser's downloaded bytes when unchanged.
    headers: [{ source: '/rc/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] }],
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(out, MARKER), 'written by tools/rc/package-rc.mjs\n');
  return { out, files, vendor: vendor.size, bytes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--out'), out = i > 0 ? path.resolve(process.argv[i + 1]) : undefined;
  try { const r = packageRc(out); console.log(`package-rc: ${r.files} rc files + ${r.vendor} vendor files, ${(r.bytes / 1048576).toFixed(1)} MiB -> ${r.out}`); }
  catch (e) { console.error(`package-rc: ${e.message}`); process.exit(1); }
}
