import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareResidentialDetails} from './residential-details.js';

const trees = {trees: [0, 1, 2, 3, 4, 5].map(i => ({kind: 'tree', point: [i * 9, i * 4]}))};

test('the Pixar look grows solid toy crowns: no leaf texture, vertex-coloured, every tree once', async () => {
  const details = prepareResidentialDetails({}, trees, {look: 'pixar'}),
    root = await details.attach({add() {}});
  const crowns = root.children.filter(m => /Canopy/.test(m.name));
  assert.equal(crowns.reduce((n, m) => n + m.count, 0), trees.trees.length);
  for (const m of crowns) {
    assert.equal(m.material.map, null, 'no alpha leaf cards');
    assert.equal(m.material.alphaTest, 0);
    assert.ok(m.material.vertexColors && m.geometry.attributes.color, 'baked sky-to-shade gradient');
    assert.ok(m.castShadow);
  }
  // A crown stays within the trunk's reach: the clumps cover the branch tips (y 3.4-4.2 m before scale).
  for (const m of crowns) {
    const b = m.geometry.boundingBox;
    assert.ok(b.min.y < 3.6 && b.max.y > 6, `${m.name} spans ${b.min.y.toFixed(2)}-${b.max.y.toFixed(2)}`);
  }
  details.dispose();
});
