import test from 'node:test'; import assert from 'node:assert/strict';
import { applyTone, toneMappingConstant, colorSpaceConstant, TONE_MAPPING_NAMES } from '../tone.js';
const T = { NoToneMapping: 0, LinearToneMapping: 1, ReinhardToneMapping: 2, CineonToneMapping: 3, ACESFilmicToneMapping: 4, CustomToneMapping: 5, AgXToneMapping: 6, NeutralToneMapping: 7, SRGBColorSpace: 'srgb', LinearSRGBColorSpace: 'srgb-linear' };
test('tone profile is applied to a renderer', () => {
  const r = {}; assert.equal(applyTone(r, { toneMapping: 'aces_filmic', exposure: 1.15 }, T), r);
  assert.deepEqual(r, { outputColorSpace: 'srgb', toneMapping: 4, toneMappingExposure: 1.15 });
  applyTone(r, { toneMapping: 'agx', exposure: -3, outputColorSpace: 'linear-srgb' }, T);
  assert.deepEqual(r, { outputColorSpace: 'srgb-linear', toneMapping: 6, toneMappingExposure: 1 });
});
test('every named mapping exists in the vendored three', async () => {
  const real = await import('../../../../vendor/three.module.js');
  // The vendored three predates NeutralToneMapping (profile.js still accepts 'neutral'); the helper throws rather than guess.
  for (const n of TONE_MAPPING_NAMES.filter(n => n !== 'neutral')) assert.equal(typeof toneMappingConstant(n, real), 'number', n);
  assert.throws(() => toneMappingConstant('neutral', real), /no NeutralToneMapping/);
  assert.ok(colorSpaceConstant('srgb', real));
});
test('unknown names throw', () => { assert.throws(() => toneMappingConstant('nope', T), /unknown/); assert.throws(() => colorSpaceConstant('p3', T), /unknown/); });
