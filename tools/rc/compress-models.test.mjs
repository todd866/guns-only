import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import {compressModels, modelFiles} from './compress-models.mjs';

test('model gzip sidecars are present, deterministic, and byte-identical after decompression', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-compress-models-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'nested'));
  const models = {
    'hero.glb': Buffer.from('glTF-synthetic-hero'),
    'nested/prop.glb': Buffer.from('glTF-synthetic-prop'),
  };
  for (const [relative, bytes] of Object.entries(models)) fs.writeFileSync(path.join(root, relative), bytes);
  fs.writeFileSync(path.join(root, 'notes.txt'), 'not a model');
  compressModels(root);
  const files = modelFiles(root);
  assert.deepEqual(files.map(file => path.relative(root, file)).sort(), Object.keys(models).sort());
  for (const file of files) {
    const relative = path.relative(root, file);
    const source = fs.readFileSync(path.join(root, relative));
    const sidecar = fs.readFileSync(`${path.join(root, relative)}.gz`);
    assert.deepEqual(zlib.gunzipSync(sidecar), source, relative);
    assert.deepEqual(zlib.gzipSync(source, {level: 6, mtime: 0}), sidecar, `${relative} deterministic gzip`);
  }
  assert.equal(fs.existsSync(path.join(root, 'notes.txt.gz')), false);
});
