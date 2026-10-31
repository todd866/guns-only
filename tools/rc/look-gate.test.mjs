import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { pixelMad, diffBuffers, judge, thresholdsFor } = createRequire(import.meta.url)('./look-gate.cjs');

// pngjs is a tools/look-gate install, not part of a bare worktree mirror.
const pngjsSpecifier = '../look-gate/node_modules/pngjs/lib/png.js';
let PNG = null;
let pngjsSkip = '';
try {
  const resolved = await import.meta.resolve(pngjsSpecifier);
  ({ PNG } = await import(resolved));
  if (typeof PNG !== 'function') pngjsSkip = `pngjs resolved (${resolved}) but did not export PNG`;
} catch (error) {
  pngjsSkip = `pngjs cannot be resolved (${pngjsSpecifier}): ${error.message}`;
}
function skipWithoutPngjs(t) {
  if (!pngjsSkip) return false;
  t.skip(pngjsSkip);
  return true;
}

// Synthetic 128x80 "scene": sky over ground with a stripe pattern; tweak() edits pixels.
function img(tweak = () => [0, 0, 0]) {
  const png = new PNG({ width: 128, height: 80 });
  for (let y = 0; y < 80; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4, sky = y < 36;
    const base = sky ? [120, 170, 230] : [150 + ((x >> 3) & 1) * 30, 130, 90];
    const d = tweak(x, y, sky);
    png.data[i] = base[0] + d[0]; png.data[i + 1] = base[1] + d[1]; png.data[i + 2] = base[2] + d[2]; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}
const T = { maxPalette: 0.2, maxStructure: 0.2, maxPixelMad: 6, edgeRatio: [0.7, 1.4] };

test('identical images have zero distance and pass', async (t) => {
  if (skipWithoutPngjs(t)) return;
  const d = await diffBuffers(img(), img());
  assert.equal(d.palette, 0); assert.equal(d.structure, 0); assert.equal(d.pixelMad, 0);
  assert.ok(Math.abs(d.edgeRatio - 1) < 1e-6);
  assert.deepEqual(judge(d, T), []);
});

test('a tiny brightness change stays within thresholds', async (t) => {
  if (skipWithoutPngjs(t)) return;
  const d = await diffBuffers(img(), img(() => [2, 2, 2]));
  assert.ok(d.pixelMad > 1.9 && d.pixelMad < 2.1);
  // Synthetic flat colours put the saturation histogram on a bin edge, so palette is not asserted here.
  assert.deepEqual(judge(d, { ...T, maxPalette: 1 }), []);
});

test('a big colour shift (sky goes grey, ground goes green) is flagged', async (t) => {
  if (skipWithoutPngjs(t)) return;
  const d = await diffBuffers(img(), img((x, y, sky) => sky ? [60, -20, -80] : [-70, 60, 10]));
  assert.ok(d.pixelMad > 40);
  const issues = judge(d, T);
  assert.ok(issues.some(s => s.startsWith('pixelMad')));
});

test('losing ground detail trips the edge-ratio gate', async (t) => {
  if (skipWithoutPngjs(t)) return;
  const flat = img((x, y, sky) => sky ? [0, 0, 0] : [-((x >> 3) & 1) * 30, 0, 0]);
  const d = await diffBuffers(flat, img());
  assert.ok(d.edgeRatio < 0.7, 'edgeRatio ' + d.edgeRatio);
  assert.ok(judge(d, T).some(s => s.startsWith('edgeRatio')));
});

test('pixelMad needs equal sizes and averages channel differences', () => {
  const mk = v => ({ width: 2, height: 1, data: Uint8Array.from([v, v, v, 255, v, v, v, 255]) });
  assert.equal(pixelMad(mk(10), mk(16)), 6);
  assert.throws(() => pixelMad(mk(1), { width: 1, height: 1, data: new Uint8Array(4) }), /size mismatch/);
});

test('per-view thresholds override the defaults', () => {
  const th = { default: T, views: { 'bx-apron': { maxPixelMad: 12 } } };
  assert.equal(thresholdsFor(th, 'bx-apron').maxPixelMad, 12);
  assert.equal(thresholdsFor(th, 'bx-apron').maxPalette, 0.2);
  assert.equal(thresholdsFor(th, 'other').maxPixelMad, 6);
});
