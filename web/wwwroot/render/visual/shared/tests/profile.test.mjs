import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { toneMappingConstant } from '../tone.js'; import { atmosphereParams } from '../atmosphere.js'; import { createAdaptivePolicy } from '../adaptive.js';
import { TONE_MAPPING_NAMES } from '../tone.js';
const has = (src, literal) => new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?\s*([=,()])\s*/g, (m, c) => `\\s*\\${c}\\s*`)).test(src);
const p = JSON.parse(fs.readFileSync(new URL('../../../../rc/visual-profile.json', import.meta.url), 'utf8'));
test('rc/visual-profile.json declares a valid RC profile over the f22 base', () => {
  assert.equal(p.base, 'f22-desktop'); assert.ok(Array.isArray(p._notes) && p._notes.length >= 5);
  assert.ok(TONE_MAPPING_NAMES.includes(p.tone.toneMapping)); assert.ok(p.tone.exposure > 0 && p.tone.exposure <= 8);
  for (const k of Object.keys(p.atmosphere)) { const a = atmosphereParams(p.atmosphere[k]); assert.ok(a.far > a.near, k); }
  const pol = createAdaptivePolicy({ max: 1.75, min: 1, ...p.adaptive, min: 1, max: 1.75 }); assert.equal(pol.percentile, 0.75);
  for (const h of Object.values(p.hemisphere)) assert.ok(h.intensity > 0);
  assert.ok(p.shadow.mapSize >= 512 && p.shadow.contact.mapSize >= 512);
});
test('profile numbers match the RC source they were read from', () => {
  const main = fs.readFileSync(new URL('../../../../rc/main.js', import.meta.url), 'utf8'), vis = fs.readFileSync(new URL('../../../../rc/visuals.js', import.meta.url), 'utf8');
  assert.ok(has(main, `toneMappingExposure=${p.tone.exposure}`));
  assert.ok(has(main, `new T.Fog('${p.atmosphere.default.fogColor}',${p.atmosphere.default.near},${p.atmosphere.default.far})`));
  assert.ok(has(main, `shadow.mapSize.set(${p.shadow.mapSize},${p.shadow.mapSize})`));
  assert.ok(has(vis, `exposure: ${p.tone.exposureByContext.outdoorTrack}`));
  assert.ok(has(vis, `saturation: ${p.grade.saturation}`));
  assert.ok(fs.readFileSync(new URL('../../../../rc/adaptive-resolution.mjs', import.meta.url), 'utf8') && has(fs.readFileSync(new URL('../../../../rc/adaptive-resolution.mjs', import.meta.url), 'utf8'), `window: ${p.adaptive.window}, slow: ${p.adaptive.slowMs}, calm: ${p.adaptive.calmMs}`));
});
