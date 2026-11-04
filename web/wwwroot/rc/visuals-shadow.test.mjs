import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {followSun} from './visuals.js';

test('the sun shadow frame moves only in whole shadow texels in light space (no swimming)', () => {
  const sun = new T.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left: -20, right: 20, top: 20, bottom: -20});
  sun.userData.dir = new T.Vector3(-0.65, 1, 0.45).normalize();
  const texel = 40 / 2048,
    d = sun.userData.dir,
    dir = new T.Vector3(-d.x, -d.y, -d.z),
    right = new T.Vector3().crossVectors(dir, new T.Vector3(0, 1, 0)).normalize(),
    up = new T.Vector3().crossVectors(right, dir).normalize();
  const frame = x => {
    followSun(sun, new T.Vector3(x, 0, 3));
    return [sun.target.position.dot(right) / texel, sun.target.position.dot(up) / texel];
  };
  for (const x of [0, 0.004, 0.5, 1.237])
    for (const v of frame(x)) assert.ok(Math.abs(v - Math.round(v)) < 1e-6, `${x}: ${v}`);
  const a = frame(0),
    b = frame(texel * 0.3);
  for (let k = 0; k < 2; k++)
    assert.ok(
      [0, 1].includes(Math.round(Math.abs(a[k] - b[k]))),
      'a sub-texel move keeps the frame or steps one whole texel, never a fraction'
    );
});
