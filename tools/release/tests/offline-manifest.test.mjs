import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { writeOfflineManifest } from '../offline-manifest.mjs';

test('published offline inventory hashes exact stamped bytes and separates optional terrain', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'guns-manifest-'));
  try {
    await mkdir(path.join(root, 'api'));
    for (const [name, bytes] of Object.entries({ 'index.html': 'shell', 'app.js': 'build 374',
      'page.terrain': 'terrain', 'app.js.br': 'compressed', 'api/private.js': 'server-only' })) {
      await writeFile(path.join(root, name), bytes);
    }
    await writeOfflineManifest(root, '374');
    const manifest = JSON.parse(await readFile(path.join(root, 'offline-manifest.json'), 'utf8'));
    assert.equal(manifest.build, '374');
    assert.deepEqual(manifest.assets.map(asset => asset.url), ['/app.js', '/index.html', '/page.terrain']);
    assert.equal(manifest.assets[0].sha256, createHash('sha256').update('build 374').digest('hex'));
    assert.equal(manifest.assets[0].core, true);
    assert.equal(manifest.assets[2].core, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
