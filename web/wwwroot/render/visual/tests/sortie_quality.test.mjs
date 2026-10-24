import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { FrameGovernorPolicy } from '../../telemetry/frame_governor.js';
import { AdaptiveResolutionController } from '../adaptive_resolution.js';

const source = readFileSync(new URL('../../../app.js', import.meta.url), 'utf8');
const start = source.indexOf('const frameGovernor = {');
const end = source.indexOf('\nfunction announceGovernor', start);

function fixture() {
  let reallocations = 0;
  const resolution = new AdaptiveResolutionController({
    onChange: () => reallocations++, minimumPixelRatio: 0.5,
  });
  resolution.setViewport(1280, 800, 1);
  const policy = new FrameGovernorPolicy();
  const context = vm.createContext({
    selectedBeat: 7, latestFrameContractPass: null,
    frameGovernorPolicy: policy, performance: { now: () => 1000 },
  });
  const governor = vm.runInContext(source.slice(start, end) + '\nframeGovernor;', context);
  const view = { terrainPresentationKey: 'world', directAdaptiveResolution: resolution,
    renderer: { shadowMap: { enabled: true } } };
  return { governor, policy, view, resolution, context, reallocations: () => reallocations };
}

test('same-scene restart discards timing samples without reallocating graphics or losing recovery state', () => {
  const f = fixture();
  f.governor.reset(f.view);
  f.resolution.nudgeDown();
  f.policy.level = 2;
  f.policy.qualityPressureStack = ['terrain', 'view'];
  f.policy.cleanWindows = 2;
  f.policy.windowFrames = 90;
  f.governor.viewLevel = 1;
  const allocations = f.reallocations();
  f.governor.reset(f.view);
  assert.equal(f.reallocations(), allocations);
  assert.equal(f.resolution.scale, 0.92);
  assert.equal(f.policy.level, 2);
  assert.equal(f.policy.qualityPressureStack.length, 2);
  assert.equal(f.governor.viewLevel, 1);
  assert.equal(f.policy.cleanWindows, 0);
  assert.equal(f.policy.windowFrames, 0);
  f.resolution.nudgeUp();
  assert.equal(f.resolution.scale, 0.96, 'quality can recover after restarting');
});

for (const change of ['mission', 'terrain', 'view']) {
  test(`changing ${change} restores authored quality`, () => {
    const f = fixture();
    f.governor.reset(f.view);
    f.resolution.nudgeDown();
    f.policy.level = 2;
    if (change === 'mission') f.context.selectedBeat = 8;
    if (change === 'terrain') f.view.terrainPresentationKey = 'other-world';
    const view = change === 'view' ? { ...f.view } : f.view;
    f.governor.reset(view);
    assert.equal(f.policy.level, 0);
    assert.equal(f.resolution.scale, 1);
  });
}

for (const transition of ['pending', 'disposed']) {
  test(`terrain ${transition} cannot reuse the previous quality decision`, () => {
    const f = fixture();
    f.governor.reset(f.view);
    f.resolution.nudgeDown();
    if (transition === 'pending') f.view.terrainPresentationRequestedKey = 'new-feature-pack';
    else f.view.terrainPresentationKey = null;
    f.governor.reset(f.view);
    assert.equal(f.resolution.scale, 1);
  });
}

test('flight preparation retains the radius cap even beyond the radius ladder', () => {
  const start = source.indexOf('  applyTerrainFlightPolicy() {');
  const end = source.indexOf('\n  ensureTerrainPresentation', start);
  const governor = { terrainLevel: 5, qualityKey: '7:world' };
  let radius;
  const view = { terrainPresentationKey: 'world', terrainNominalStreamingRadiusM: 64000,
    terrainPresentation: { setStreamingRadiusM: value => { radius = value; return true; } } };
  governor.qualityView = view;
  const apply = vm.runInNewContext('({' + source.slice(start, end) + '}).applyTerrainFlightPolicy', {
    frameGovernor: governor, selectedBeat: 7, FRAME_GOVERNOR_RADII_M: [48000, 32000],
  });
  apply.call(view);
  assert.equal(radius, 32000);
  governor.qualityKey = '8:world';
  apply.call(view);
  assert.equal(radius, 64000, 'a different mission starts at authored radius');
});
