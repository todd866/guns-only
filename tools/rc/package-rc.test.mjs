import {gunzipSync} from 'node:zlib';
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { packageRc, relativeImports } from './package-rc.mjs';

const files = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); e.isDirectory() ? files(p, out) : out.push(p); } return out; };

test('the packaged RC site is self-contained under /rc/', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rc-dist-')), 'dist');
  packageRc(out);
  const all = files(out);
  assert.ok(!all.some(f => /\.test\.m?js$/.test(f)), 'test files shipped');
  for(const model of all.filter(f=>f.endsWith('.glb')))assert.deepEqual(gunzipSync(fs.readFileSync(model+'.gz')),fs.readFileSync(model),'packaged compressed model matches its original');
  const main = fs.readFileSync(path.join(out, 'rc/main.js'), 'utf8');
  assert.match(main, /'\.\/vendor\/three\.module\.js'/); assert.doesNotMatch(main, /\.\.\/vendor\//);
  for (const f of all.filter(f => /\.(m?js|html)$/.test(f)))
    for (const spec of relativeImports(fs.readFileSync(f, 'utf8'))) {
      const target = path.resolve(path.dirname(f), spec);
      assert.ok(fs.existsSync(target), `${path.relative(out, f)} imports missing ${spec}`);
      assert.ok(target.startsWith(path.join(out, 'rc') + path.sep), `${path.relative(out, f)} reaches outside /rc/: ${spec}`);
    }
  for (const name of ['telemetry_batch.js','telemetry_outbox.js']) assert.equal(fs.readFileSync(path.join(out,'rc/shared/telemetry',name),'utf8'), fs.readFileSync(new URL('../../web/wwwroot/render/telemetry/'+name,import.meta.url),'utf8'), 'shared transport must be copied verbatim');
  // Start-up hints: the whole static module graph and the start assets, each once and present.
  const index = fs.readFileSync(path.join(out, 'rc/index.html'), 'utf8'), hints = [...index.matchAll(/<link rel="(?:modulepreload|preload)"[^>]* href="([^"]+)"/g)].map(m => m[1]);
  for (const href of ['main.js', 'open-world/runtime.js', 'vendor/three.module.js', 'assets/world/residential.json', 'assets/districts/skatepark.glb.gz']) assert.ok(hints.includes(href), `missing start hint ${href}`);
  assert.ok(!hints.some(h => /districts\/(housing|bx|school)/.test(h)), 'far districts load after the start, not before it');
  assert.equal(new Set(hints).size, hints.length, 'duplicate start hint');
  for (const href of hints) assert.ok(fs.existsSync(path.join(out, 'rc', href)), `hint ${href} does not exist`);
  const config = JSON.parse(fs.readFileSync(path.join(out, 'vercel.json'), 'utf8'));
  assert.ok(config.redirects.length);
  assert.equal(config.headers.find(h => h.source === '/rc/assets/(.*)').headers.find(h => h.key === 'Cache-Control').value,
    'public, max-age=0, must-revalidate', 'unversioned world data and art must revalidate across releases');
  packageRc(out);   // re-running over its own output is allowed
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-foreign-')); fs.writeFileSync(path.join(foreign, 'keep.txt'), 'x');
  assert.throws(() => packageRc(foreign), /refusing/);
});

test('import parsing ignores comments and bare or absolute specifiers', () => {
  assert.deepEqual(relativeImports(`// import x from './nope.js'\n/* from '../no.js' */\nimport a from './a.js';\nimport('../b.js');\nexport { c } from "./c.mjs";\nimport 'three';\nimport './side.js';`), ['./a.js', '../b.js', './c.mjs', './side.js']);
});
