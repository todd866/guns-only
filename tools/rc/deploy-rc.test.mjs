import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const source = path.resolve('bin/deploy-rc');
async function fixture(mode) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'deploy-rc-'));
  await fs.mkdir(path.join(root, 'bin'), { recursive: true }); await fs.mkdir(path.join(root, 'tools/rc'), { recursive: true });
  await fs.mkdir(path.join(root, 'web/wwwroot/rc'), { recursive: true }); await fs.mkdir(path.join(root, 'web/smoke/node_modules/playwright'), { recursive: true });
  await fs.copyFile(source, path.join(root, 'bin/deploy-rc')); await fs.chmod(path.join(root, 'bin/deploy-rc'), 0o755);
  const log = path.join(root, 'calls');
  await fs.writeFile(path.join(root, 'tools/rc/package-rc.mjs'), ''); await fs.writeFile(path.join(root, 'tools/rc/smoke-dist.mjs'), ''); await fs.writeFile(path.join(root, 'tools/rc/check-release.cjs'), '');
  const mock = path.join(root, 'mock'); await fs.mkdir(mock);
  await fs.writeFile(path.join(mock, 'node'), `#!/bin/sh\necho "node $*" >> "${log}"\ncase "$*" in *package-rc.mjs*) out=""; prev=""; for x in "$@"; do [ "$prev" = --out ] && out="$x"; prev="$x"; done; mkdir -p "$out/rc"; echo payload > "$out/rc/main.js";; *verify-dist.mjs*) [ "${mode}" = parity ] && exit 1;; esac\nexit 0\n`);
  await fs.writeFile(path.join(mock, 'vercel'), `#!/bin/sh\necho "vercel $*" >> "${log}"\ncase "$*" in *deploy*) if [ "${mode}" = deploy-fail ]; then echo https://candidate.vercel.app; exit 1; fi; [ "${mode}" = no-url ] || echo https://candidate.vercel.app;; esac\nexit 0\n`);
  await fs.writeFile(path.join(mock, 'heavy-slot'), `#!/bin/sh\necho heavy-slot >> "${log}"\nwhile [ "$1" != "--" ]; do shift; done; shift; "$@"\n`);
  await fs.writeFile(path.join(mock, 'curl'), `#!/bin/sh\necho curl >> "${log}"\n[ "${mode}" = rewrite-fail ] && exit 1\nexit 0\n`);
  for (const f of ['node', 'vercel', 'heavy-slot', 'curl']) await fs.chmod(path.join(mock, f), 0o755);
  return { root, log };
}
async function run(t, mode, args = []) { const f = await fixture(mode); t.after(() => fs.rm(f.root, {recursive: true, force: true})); const p = spawn(path.join(f.root, 'bin/deploy-rc'), args, { cwd: f.root, env: { ...process.env, PATH: `${f.root}/mock:${process.env.PATH}`, HEAVY_SLOT_LABEL: '' } }); let out = ''; p.stdout.on('data', b => out += b); p.stderr.on('data', b => out += b); const code = await new Promise(resolve => p.on('close', resolve)); return { ...f, code, out, calls: await fs.readFile(f.log, 'utf8') }; }
test('release script fails closed for deploy exit, missing URL, parity, and rewrite failures', async t => {
  for (const mode of ['deploy-fail', 'no-url', 'parity', 'rewrite-fail']) {
    const r = await run(t, mode); assert.notEqual(r.code, 0, mode);
    if (mode !== 'rewrite-fail') assert.equal((r.calls.match(/check-release\.cjs/g) || []).length, 1, 'failed release cannot reach live hardware approval');
    if (['deploy-fail', 'no-url'].includes(mode)) assert.doesNotMatch(r.calls, /verify-dist\.mjs/, 'failed deployment cannot reach parity verification');
  }
});
test('release script runs both hardware gates on success', async t => {
  const r = await run(t, 'success'); assert.equal(r.code, 0, r.out); assert.equal((r.calls.match(/check-release\.cjs/g) || []).length, 2);
  assert.match(r.calls, /verify-dist\.mjs .*https:\/\/guns-only-rc.vercel.app/);
});
test('preview checks its exact URL and succeeds without a production rewrite request', async t => {
  const r = await run(t, 'success', ['--preview']); assert.equal(r.code, 0, r.out);
  assert.match(r.calls, /verify-dist\.mjs .*https:\/\/candidate.vercel.app/);assert.doesNotMatch(r.calls, /curl/);
});
