import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {fetchAssetBuffer} from './asset-buffer.mjs';

const response = (body, status = 200) => new Response(body, {status});
const withBrowser = async (fetchImpl, fn) => {
  const old = {
    fetch: globalThis.fetch,
    document: globalThis.document,
    window: globalThis.window,
    DecompressionStream: globalThis.DecompressionStream
  };
  globalThis.fetch = fetchImpl;
  globalThis.document = {};
  globalThis.window = {};
  globalThis.DecompressionStream = old.DecompressionStream;
  try {
    return await fn();
  } finally {
    Object.assign(globalThis, old);
  }
};

test('browser path decompresses the explicit gzip sidecar', async () => {
  const source = Uint8Array.from([0, 1, 2, 3, 255]),
    calls = [];
  const result = await withBrowser(
    async url => {
      calls.push(String(url));
      return response(calls.length === 1 ? zlib.gzipSync(source) : source);
    },
    () => fetchAssetBuffer('/model.glb')
  );
  assert.deepEqual(new Uint8Array(result), source);
  assert.deepEqual(calls, ['/model.glb.gz']);
});

test('missing sidecar falls back to the raw asset', async () => {
  const calls = [];
  const result = await withBrowser(
    async url => {
      calls.push(String(url));
      return calls.length === 1 ? response('', 404) : response('raw');
    },
    () => fetchAssetBuffer('/model.glb')
  );
  assert.equal(new TextDecoder().decode(result), 'raw');
  assert.deepEqual(calls, ['/model.glb.gz', '/model.glb']);
});

test('compressed HTTP failures and decode failures are not hidden', async () => {
  await assert.rejects(
    withBrowser(
      async () => response('', 503),
      () => fetchAssetBuffer('/model.glb')
    ),
    /Compressed asset unavailable \(503\)/
  );
  await assert.rejects(
    withBrowser(
      async () => response(Uint8Array.from([1, 2, 3])),
      () => fetchAssetBuffer('/model.glb')
    )
  );
});

test('raw HTTP failures remain fail-closed', async () => {
  const old = {fetch: globalThis.fetch, document: globalThis.document, window: globalThis.window};
  delete globalThis.document;
  delete globalThis.window;
  globalThis.fetch = async () => response('', 500);
  try {
    await assert.rejects(fetchAssetBuffer('/model.glb', {compressed: false}), /Asset unavailable \(500\)/);
  } finally {
    Object.assign(globalThis, old);
  }
});

test('browsers without native gzip decompression still load the raw model', async () => {
  const calls = [];
  const result = await withBrowser(
    async url => {
      calls.push(String(url));
      return response('raw');
    },
    async () => {
      globalThis.DecompressionStream = undefined;
      return fetchAssetBuffer('/model.glb');
    }
  );
  assert.equal(new TextDecoder().decode(result), 'raw');
  assert.deepEqual(calls, ['/model.glb']);
});
