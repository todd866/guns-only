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

test('frozen theatre truth is inventoried as optional with exact bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'guns-manifest-frozen-'));
  const frozen = {
    'content/packs/korea-1950s/environment/terrain/central-front.truth': 'korea truth bytes\n',
    'content/packs/okanagan-fire/environment/okanagan-resorts.osm.json': '{"osm":"resorts"}\n',
    'content/packs/okanagan-fire/environment/okanagan-central.cdem.json': '{"cdem":"central"}\n',
    'content/packs/okanagan-fire/environment/okanagan-central.world.json': '{"world":"central"}\n',
  };
  try {
    await mkdir(path.join(root, 'content/packs/korea-1950s/environment/terrain'), { recursive: true });
    await mkdir(path.join(root, 'content/packs/okanagan-fire/environment'), { recursive: true });
    await writeFile(path.join(root, 'index.html'), 'shell');
    for (const [name, bytes] of Object.entries(frozen)) {
      await writeFile(path.join(root, name), bytes);
    }
    await writeOfflineManifest(root, '375');
    const manifest = JSON.parse(await readFile(path.join(root, 'offline-manifest.json'), 'utf8'));
    const expected = [
      ['/content/packs/korea-1950s/environment/terrain/central-front.truth', 18, '136e4ba2a3d0c4e9326dea8993778a9b38b82044c7afa8afbe040c86597c4ab5'],
      ['/content/packs/okanagan-fire/environment/okanagan-resorts.osm.json', 18, '6dee16c6e82a6453dd74e03f06901cb4b8b523b9eef1737c5e996caa0e72c6cf'],
      ['/content/packs/okanagan-fire/environment/okanagan-central.cdem.json', 19, '82dbe47aa19c1147b3249fa04c1a7f095e30778d1e2934c04e05ba27fff49ca6'],
      ['/content/packs/okanagan-fire/environment/okanagan-central.world.json', 20, '8f02426e77748295b32c9546dabb8e7ba38dea0a589f0cc30e4063d2fc59c236'],
    ];
    for (const [url, size, sha256] of expected) {
      assert.deepEqual(manifest.assets.find(asset => asset.url === url), { url, size, sha256, core: false });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
