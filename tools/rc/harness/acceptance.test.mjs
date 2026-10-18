import test from 'node:test';
import assert from 'node:assert/strict';
import {suite,replay} from './run.mjs';
import {courses,tapes} from './courses.mjs';
// Authored design envelopes, not thresholds measured from Re-Volt.
const m=suite().cases;
test('straight-line handling targets',()=>{assert.ok(m.acceleration.metrics.secondsTo9Mps>=.6&&m.acceleration.metrics.secondsTo9Mps<=1.3);assert.equal(m.acceleration.metrics.maxSpeedMps,11);assert.equal(m.reverse.metrics.maxSpeedMps,4.5);assert.ok(m.brake.metrics.stopDistanceM<2.2);});
test('ramp and ripple stay within a toy-scale envelope',()=>{assert.ok(m.jump.metrics.airSeconds>.2&&m.jump.metrics.airSeconds<.7);assert.ok(m.jump.metrics.maxCentreHeightM<1.2);assert.ok(m.ripple.metrics.maxCentreHeightM<.4);});
test('solid wall is not crossed',()=>{const r=replay(tapes.wall,courses.wall);assert.ok(r.frames.every(f=>f.z>=-9.645-1e-6));assert.equal(r.state.hits,1);});
test('input-tape segmentation does not alter fixed-tick replay',()=>{const flat=tapes.turn.flatMap(s=>Array.from({length:s.ticks},()=>s.input));const grouped=[{ticks:1,input:flat[0]},...flat.slice(1).map(input=>({ticks:1,input}))];assert.equal(replay(grouped).sha256,replay(tapes.turn).sha256);});
