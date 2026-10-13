import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { webcrypto, createHash } from 'node:crypto';
import { loadOkanaganTruth, OKANAGAN_TRUTH } from '../okanagan_truth.js';

const originals = await Promise.all(OKANAGAN_TRUTH.map(({ name }) =>
  readFile(new URL(`../../../content/packs/okanagan-fire/environment/${name}`, import.meta.url))));
const native = await readFile(new URL('../../../../../sim/Okanagan/OkanaganTruth.cs', import.meta.url), 'utf8');
const index = url => OKANAGAN_TRUTH.findIndex(row => url.endsWith(row.name));

test('renderer and native pins match exact original embedded bytes', async () => {
  for (let i = 0; i < originals.length; i++) {
    assert.equal(createHash('sha256').update(originals[i]).digest('hex'), OKANAGAN_TRUTH[i].sha256);
    assert.ok(native.includes(OKANAGAN_TRUTH[i].sha256));
  }
  const loaded = await loadOkanaganTruth({ cryptoImpl: webcrypto,
    fetchImpl: async url => new Response(originals[index(url)]) });
  loaded.texts.forEach((text, i) => assert.deepEqual(Buffer.from(text), originals[i]));
  loaded.data.forEach((data, i) => assert.deepEqual(data, JSON.parse(originals[i])));
});

test('HTTP error and corrupt-but-valid JSON fail closed; a fresh retry works', async () => {
  for (let i = 0; i < originals.length; i++) {
    await assert.rejects(loadOkanaganTruth({ cryptoImpl: webcrypto,
      fetchImpl: async url => new Response(originals[index(url)], { status: index(url) === i ? 503 : 200 }) }), /unavailable/);
    await assert.rejects(loadOkanaganTruth({ cryptoImpl: webcrypto,
      fetchImpl: async url => new Response(Buffer.concat([originals[index(url)], Buffer.from(index(url) === i ? ' ' : '')])) }), /SHA-256 mismatch/);
  }
  await loadOkanaganTruth({ cryptoImpl: webcrypto, fetchImpl: async url => new Response(originals[index(url)]) });
});

test('stalled body is bounded and all sibling fetches are cancelled', async () => {
  const signals = [];
  await assert.rejects(loadOkanaganTruth({ timeoutMs: 10, cryptoImpl: webcrypto,
    fetchImpl: async (_url, { signal }) => {
      signals.push(signal);
      return { ok: true, arrayBuffer: () => new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) };
    } }), /aborted/);
  assert.equal(signals.length, 3);
  assert.ok(signals.every(signal => signal.aborted));
});
