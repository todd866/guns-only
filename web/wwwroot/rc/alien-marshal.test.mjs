import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {createAlienMarshal} from './alien-marshal.js';

test('alien marshal has a bounded saucer, alien, signal board and recovery beam', () => {
  const scene = new T.Scene();
  const marshal = createAlienMarshal(scene, {position: [4, 4, -2]});
  let meshes = 0;
  marshal.root.traverse(object => {
    if (object.isMesh) meshes++;
  });
  assert.ok(meshes >= 25 && meshes < 90, `unexpected mesh count ${meshes}`);
  assert.ok(marshal.root.getObjectByName('RobotMP'));
  assert.equal(marshal.root.getObjectByName('RobotMP').visible, true);
  assert.equal(marshal.root.getObjectByName('FriendlyAlien').visible, false);
  assert.ok(marshal.root.getObjectByName('RaceSignals'));
  assert.ok(marshal.root.getObjectByName('RecoveryBeam'));
  marshal.update({time: 1.25, countdown: 3, car: {pos: [4, 0, 2]}});
  marshal.update({alienUnlocked: true});
  assert.equal(marshal.root.getObjectByName('RobotMP').visible, false);
  assert.equal(marshal.root.getObjectByName('FriendlyAlien').visible, true);
  marshal.update({alienUnlocked: false});
  assert.equal(marshal.root.getObjectByName('RobotMP').visible, true);
  const lamps = marshal.root.getObjectByName('RaceSignals').children.filter(o => o.isMesh);
  assert.equal(lamps.filter(o => o.visible).length >= 1, true);
  marshal.update({time: 1.4, recovering: true, car: {xyz: [4, 0, 2]}});
  const beam = marshal.root.getObjectByName('RecoveryBeam');
  assert.equal(beam.visible, true);
  assert.ok(Math.abs(beam.scale.y - 3.7 / 4.2) < 0.001);
  marshal.update({time: 2, retreat: true});
  assert.equal(marshal.root.getObjectByName('StopSign').visible, true);
  marshal.update({time: 3, lap: {current: 2, total: 3}});
  assert.equal(marshal.root.getObjectByName('LapBoard').userData.label, 'LAP 2/3');
  marshal.update({time: 4, finish: true});
  assert.equal(marshal.root.getObjectByName('FinishFlag').visible, true);
  assert.equal(marshal.root.getObjectByName('LapBoard').userData.label, 'FINISH');
  marshal.dispose();
  assert.equal(scene.children.length, 0);
});

test('marshal uses seconds continuously and rejects a missing scene', () => {
  assert.throws(() => createAlienMarshal(null), /scene/);
  const scene = new T.Scene();
  const marshal = createAlienMarshal(scene);
  const alien = marshal.root.getObjectByName('FriendlyAlien');
  marshal.update({time: 100});
  const at100 = alien.rotation.y;
  marshal.update({time: 101});
  const at101 = alien.rotation.y;
  assert.notEqual(at100, at101);
  marshal.update({time: 1});
  const at1 = alien.rotation.y;
  assert.notEqual(at101, at1, 'clock is seconds-only; 101 does not silently become 1');
  marshal.dispose();
});
