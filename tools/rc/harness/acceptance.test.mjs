import test from 'node:test';
import assert from 'node:assert/strict';
import {suite,replay} from './run.mjs';
import {courses,tapes} from './courses.mjs';
// Authored design envelopes for the 1:10 toy, not thresholds measured from Re-Volt.
const m=suite().cases;
test('straight-line handling targets',()=>{const a=m.acceleration.metrics;assert.ok(a.secondsTo9Mps>=.6&&a.secondsTo9Mps<=1.4,`t9 ${a.secondsTo9Mps}`);assert.ok(a.maxSpeedMps>11.5&&a.maxSpeedMps<14);assert.ok(m.reverse.metrics.maxSpeedMps<=5.1);assert.ok(m.brake.metrics.stopDistanceM<9,`stop ${m.brake.metrics.stopDistanceM}`);});
test('ramp and ripple stay within a toy-scale envelope',()=>{const j=m.jump.metrics;assert.ok(j.airSeconds>.2&&j.airSeconds<1.2,`air ${j.airSeconds}`);assert.ok(j.maxCentreHeightM<1.5);assert.ok(j.minUpY>-.5,'jump should not flip on a straight run');assert.ok(m.ripple.metrics.maxCentreHeightM<.4);});
test('solid wall is not crossed',()=>{const r=replay(tapes.wall,courses.wall);assert.ok(r.frames.every(f=>f.z>=-9.875-1e-6),'crossed');assert.ok(r.state.hits>=1);});
test('gym floor holds less cornering grip than asphalt',()=>{const g=c=>{const f=replay(tapes.gym,c).frames.slice(300);let a=0;for(let i=1;i<f.length;i++){const dy=Math.atan2(Math.sin(f[i].yaw-f[i-1].yaw),Math.cos(f[i].yaw-f[i-1].yaw));a+=f[i].speed*Math.abs(dy)/(f[i].t-f[i-1].t);}return a/(f.length-1);};const gym=g(courses.gym),flat=g(courses.flat);assert.ok(gym<flat*.75,`gym ${gym.toFixed(2)} m/s² asphalt ${flat.toFixed(2)} m/s²`);});
test('input-tape segmentation does not alter fixed-tick replay',()=>{const flat=tapes.turn.flatMap(s=>Array.from({length:s.ticks},()=>s.input));const grouped=[{ticks:1,input:flat[0]},...flat.slice(1).map(input=>({ticks:1,input}))];assert.equal(replay(grouped).sha256,replay(tapes.turn).sha256);});
