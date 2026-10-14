import assert from 'node:assert/strict';
import test from 'node:test';
import { runwayLightFootprint } from '../runway_lights.js';
import { createConventionalRunwayPresentation, updateConventionalRunwayPresentation } from '../scene_builders.js';
import * as THREE from '../../../vendor/three.module.js';

const energy = ({ diameterPx, coverage }) => diameterPx ** 2 * coverage;

test('near lights retain glare cap; distant light energy falls with inverse square range', () => {
  for (const size of [4.5, 5.5, 7]) {
    assert.deepEqual(runwayLightFootprint(size, 0), { diameterPx: size, coverage: 1 });
    assert.deepEqual(runwayLightFootprint(size, 1000), { diameterPx: size, coverage: 1 });
    const approach = runwayLightFootprint(size, 3704);
    assert.ok(approach.diameterPx > 1 && approach.diameterPx < 2);
    const far = runwayLightFootprint(size, 20000);
    assert.equal(far.diameterPx, 1);
    assert.ok(far.coverage < 0.13, 'no opaque minimum-pixel stripe at 20 km');
    assert.ok(Math.abs(energy(runwayLightFootprint(size, 10000)) / energy(far) - 4) < 1e-12);
    let last = Infinity;
    for (const range of [1, 999, 1000, 1001, 3704, 8000, 15000, 20000, 40000]) {
      const next = energy(runwayLightFootprint(size, range));
      assert.ok(next <= last, 'continuous monotonic fade, no distance LOD pop');
      last = next;
    }
  }
});

test('angular footprint follows focal length and conserves CSS-area energy across DPR', () => {
  for (const range of [500, 3704, 15000, 20000]) {
    const one = runwayLightFootprint(5.5, range);
    const two = runwayLightFootprint(5.5, range, 600, 2);
    assert.ok(Math.abs(energy(two) / 4 - energy(one)) < 1e-12);
  }
  assert.equal(energy(runwayLightFootprint(5.5, 20000, 1200)),
    energy(runwayLightFootprint(5.5, 10000, 600)));
});

test('all five fields attenuate per vertex, retaining buffers, draw calls and scene fog fallback', () => {
  const runway = createConventionalRunwayPresentation();
  const fields = [runway.edgeLights, runway.approachLights, runway.thresholdLights,
    runway.runwayEndLights, runway.towerBeacon];
  assert.equal(runway.group.children.filter(child => child.isPoints).length, 5);
  for (const field of fields) {
    const material = field.material;
    const shader = { ...THREE.ShaderLib.points, uniforms: {} };
    material.onBeforeCompile(shader);
    assert.equal(material.sizeAttenuation, false, 'custom angular shader owns attenuation');
    assert.match(shader.vertexShader, /1000.0 \/ max\(length\(mvPosition.xyz\), 1.0\)/);
    assert.match(shader.vertexShader, /scale \* projectionMatrix\[1\]\[1\]/);
    assert.match(shader.fragmentShader, /opacity \* vRunwayLightCoverage/);
    assert.match(shader.fragmentShader, /#include <fog_fragment>/);
    assert.equal(material.fog, true);
  }
  const versions = fields.map(f => [f.material.version, f.geometry.getAttribute('position').version]);
  updateConventionalRunwayPresentation(runway, { runway_available: false });
  assert.deepEqual(fields.map(f => [f.material.version, f.geometry.getAttribute('position').version]), versions);
});
