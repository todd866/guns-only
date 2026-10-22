import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { packageRc, relativeImports } from './package-rc.mjs';

const files = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); e.isDirectory() ? files(p, out) : out.push(p); } return out; };

test('the packaged RC site is self-contained under /rc/', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rc-dist-')), 'dist');
  packageRc(out);
  const all = files(out);
  assert.ok(!all.some(f => /\.test\.m?js$/.test(f)), 'test files shipped');
  const main = fs.readFileSync(path.join(out, 'rc/main.js'), 'utf8');
  assert.match(main, /'\.\/vendor\/three\.module\.js'/); assert.doesNotMatch(main, /\.\.\/vendor\//);
  for (const f of all.filter(f => /\.(m?js|html)$/.test(f)))
    for (const spec of relativeImports(fs.readFileSync(f, 'utf8'))) {
      const target = path.resolve(path.dirname(f), spec);
      assert.ok(fs.existsSync(target), `${path.relative(out, f)} imports missing ${spec}`);
      assert.ok(target.startsWith(path.join(out, 'rc') + path.sep), `${path.relative(out, f)} reaches outside /rc/: ${spec}`);
    }
  assert.ok(JSON.parse(fs.readFileSync(path.join(out, 'vercel.json'), 'utf8')).redirects.length);
  packageRc(out);   // re-running over its own output is allowed
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-foreign-')); fs.writeFileSync(path.join(foreign, 'keep.txt'), 'x');
  assert.throws(() => packageRc(foreign), /refusing/);
});

test('import parsing ignores comments and bare or absolute specifiers', () => {
  assert.deepEqual(relativeImports(`// import x from './nope.js'\n/* from '../no.js' */\nimport a from './a.js';\nimport('../b.js');\nexport { c } from "./c.mjs";\nimport 'three';\nimport './side.js';`), ['./a.js', '../b.js', './c.mjs', './side.js']);
});
