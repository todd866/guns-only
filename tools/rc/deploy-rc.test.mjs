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
  const verifyFailures = mode === 'parity' ? 8 : mode === 'retry' ? 1 : mode === 'last-retry' ? 7 : 0;
  await fs.writeFile(path.join(mock, 'node'), `#!/bin/sh
echo "node $*" >> "${log}"
case "$*" in
  *package-rc.mjs*) out=""; prev=""; for x in "$@"; do [ "$prev" = --out ] && out="$x"; prev="$x"; done; mkdir -p "$out/rc"; echo payload > "$out/rc/main.js";;
  *verify-dist.mjs*)
    attempt=0
    [ ! -f "${root}/verify-count" ] || attempt=$(cat "${root}/verify-count")
    attempt=$((attempt + 1))
    echo "$attempt" > "${root}/verify-count"
    if [ "$attempt" -le ${verifyFailures} ]; then
      echo 'verify-dist: rc/new.js: HTTP 404 or SHA-256 mismatch' >&2
      echo 'verify-dist: 8 file(s) failed' >&2
      exit 1
    fi
    echo 'verify-dist: 460 files match';;
esac
exit 0
`);
  await fs.writeFile(path.join(mock, 'vercel'), `#!/bin/sh\necho "vercel $*" >> "${log}"\ncase "$*" in *deploy*) if [ "${mode}" = deploy-fail ]; then echo https://candidate.vercel.app; exit 1; fi; [ "${mode}" = no-url ] || echo https://candidate.vercel.app;; esac\nexit 0\n`);
  await fs.writeFile(path.join(mock, 'heavy-slot'), `#!/bin/sh\necho heavy-slot >> "${log}"\nwhile [ "$1" != "--" ]; do shift; done; shift; "$@"\n`);
  await fs.writeFile(path.join(mock, 'curl'), `#!/bin/sh\necho curl >> "${log}"\n[ "${mode}" = rewrite-fail ] && exit 1\nexit 0\n`);
  await fs.writeFile(path.join(mock, 'sleep'), `#!/bin/sh\necho "sleep $*" >> "${log}"\n`);
  for (const f of ['node', 'vercel', 'heavy-slot', 'curl', 'sleep']) await fs.chmod(path.join(mock, f), 0o755);
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
  assert.match(r.calls, /package-rc\.mjs --bundle --out /, 'releases ship the esbuild bundle');
  assert.match(r.calls, /verify-dist\.mjs .*https:\/\/guns-only-rc.vercel.app/);
  assert.equal((r.calls.match(/verify-dist\.mjs/g) || []).length, 1);
  assert.doesNotMatch(r.calls, /sleep/);
});
test('preview checks its exact URL and succeeds without a production rewrite request', async t => {
  const r = await run(t, 'success', ['--preview']); assert.equal(r.code, 0, r.out);
  assert.match(r.calls, /verify-dist\.mjs .*https:\/\/candidate.vercel.app/);assert.doesNotMatch(r.calls, /curl/);
});
test('production and preview continue after transient byte verification failures', async t => {
  for (const args of [[], ['--preview']]) {
    const host = args.length ? 'https://candidate.vercel.app' : 'https://guns-only-rc.vercel.app';
    for (const mode of ['retry', 'last-retry']) {
      const attempts = mode === 'retry' ? 2 : 8;
      const r = await run(t, mode, args);
      assert.equal(r.code, 0, r.out);
      const calls = r.calls.trim().split('\n');
      const verifies = calls.filter(line => line.includes('verify-dist.mjs'));
      assert.equal(verifies.length, attempts);
      assert.ok(verifies.every(line => line.endsWith(` ${host}`)), 'every attempt checks the intended host');
      assert.equal(calls.filter(line => line === 'sleep 20').length, attempts - 1);
      const lastVerify = calls.findLastIndex(line => line.includes('verify-dist.mjs'));
      assert.match(calls[lastVerify + 1], /heavy-slot/, 'live checks start immediately after verification succeeds');
      assert.ok(calls.findIndex(line => line.includes('smoke-dist.mjs') && line.endsWith(` ${host}`)) > lastVerify);
      assert.equal((r.calls.match(/check-release\.cjs/g) || []).length, 2);
      assert.match(r.out, /attempt 1\/8: 8 file\(s\) failed/);
      assert.ok(r.out.includes(`attempt ${attempts}/8: 0 file(s) failed`));
      if (args.length) assert.doesNotMatch(r.calls, /curl/);
      else assert.match(r.calls, /curl/);
    }
  }
});
test('production and preview fail after eight byte verification attempts', async t => {
  for (const args of [[], ['--preview']]) {
    const r = await run(t, 'parity', args);
    assert.equal(r.code, 1, r.out);
    const calls = r.calls.trim().split('\n');
    assert.equal(calls.filter(line => line.includes('verify-dist.mjs')).length, 8);
    assert.equal(calls.filter(line => line === 'sleep 20').length, 7);
    assert.match(calls.at(-1), /verify-dist\.mjs/, 'no sleep or live checks after the final failure');
    for (let attempt = 1; attempt <= 8; attempt++) {
      assert.ok(r.out.includes(`attempt ${attempt}/8: 8 file(s) failed`));
    }
    assert.equal((r.calls.match(/check-release\.cjs/g) || []).length, 1);
    assert.doesNotMatch(r.calls, /curl/);
  }
});
