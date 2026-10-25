import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import {modelAssetRoot as root,modelFiles} from './compress-models.mjs';
test('model gzip sidecars are present, deterministic, and byte-identical after decompression',()=>{
 for(const file of modelFiles(root)){
  const relative=path.relative(root,file);
  const source=fs.readFileSync(path.join(root,relative));
  const sidecar=fs.readFileSync(`${path.join(root,relative)}.gz`);
  assert.deepEqual(zlib.gunzipSync(sidecar),source,relative);
  assert.deepEqual(zlib.gzipSync(source,{level:6,mtime:0}),sidecar,`${relative} deterministic gzip`);
 }
});
