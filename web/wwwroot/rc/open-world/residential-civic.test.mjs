import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {prepareResidentialCivic} from './residential-civic.js';
test('mapped civic roof and outward walls render finite geometry and dispose', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../assets/world/residential.json', import.meta.url))),
    scene = new T.Scene();
  const civic = prepareResidentialCivic(null, data, {terrain: {heightAt: () => 2}});
  const root = civic.attach(scene);
  assert.equal(root.position.y, 2);
  for (const mesh of root.children) {
    for (const v of mesh.geometry.attributes.position.array) assert.ok(Number.isFinite(v), mesh.name);
  }
  for (const name of ['fanRoof', 'roofSeam']) {
    const mesh = root.children.find(m => m.name === 'ResidentialCivic_' + name);
    assert.ok(mesh);
    const n = mesh.geometry.attributes.normal;
    for (let i = 0; i < n.count; i++) assert.ok(n.getY(i) > 0.99, 'roof is visible from above');
  }
  const walls = root.children.find(m => m.name === 'ResidentialCivic_rearWall');
  assert.ok(walls.geometry.attributes.position.count > 100);
  // The walls facing the starting skatepark must read as a building, not a blank slab.
  assert.ok(walls.geometry.attributes.uv && walls.material.map, 'rear walls carry the block texture');
  const panels = root.children.find(m => m.name === 'ResidentialCivic_roof');
  assert.ok(panels.geometry.attributes.position.count > 36 * 20, 'rear walls carry panel seams');
  const roof = root.children.find(m => m.name === 'ResidentialCivic_fanRoof'),
    seams = root.children.find(m => m.name === 'ResidentialCivic_roofSeam');
  roof.geometry.computeBoundingBox();
  seams.geometry.computeBoundingBox();
  assert.ok(seams.geometry.boundingBox.min.x >= roof.geometry.boundingBox.min.x - 0.01);
  assert.ok(seams.geometry.boundingBox.max.z <= roof.geometry.boundingBox.max.z + 0.01);
  civic.dispose();
  assert.equal(scene.children.length, 0);
});
