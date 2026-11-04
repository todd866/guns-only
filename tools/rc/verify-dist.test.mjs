import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { verifyDist } from './verify-dist.mjs';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-dist-'));
  await fs.mkdir(path.join(root, 'rc'), { recursive: true });
  await fs.writeFile(path.join(root, 'rc/main.js'), 'same-size-content');
  await fs.writeFile(path.join(root, 'rc/data.json'), '{"ok":true}\n');
  return root;
}
function server(body) {
  const s = http.createServer((req, res) => { const value = body(req.url); if (value == null) return res.writeHead(404).end(); res.writeHead(200).end(value); });
  return new Promise(resolve => s.listen(0, '127.0.0.1', () => resolve([s, `http://127.0.0.1:${s.address().port}`])));
}
test('verify-dist accepts exact bytes and catches same-size mismatches', async t => {
  const root = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const [good, goodBase] = await server(url => url.endsWith('main.js') ? 'same-size-content' : '{"ok":true}\n'); t.after(() => good.close());
  assert.equal(await verifyDist(root, goodBase), 2);
  const [bad, badBase] = await server(url => url.endsWith('main.js') ? 'same-size-contEnt' : '{"ok":true}\n'); t.after(() => bad.close());
  await assert.rejects(() => verifyDist(root, badBase), /1 file\(s\) failed/);
});
test('verify-dist catches request failures', async t => {
  const root = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const [s, base] = await server(url => url.endsWith('main.js') ? 'same-size-content' : null); t.after(() => s.close());
  await assert.rejects(() => verifyDist(root, base), /1 file\(s\) failed/);
});
