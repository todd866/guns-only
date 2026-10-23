import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addBox} from './world.mjs';
import {createSession,stepSession} from './session.mjs';
import {placeCar,rideHeight} from './car.mjs';
import {progress} from './race.mjs';
function fixture(){const world=createWorld();addBox(world,0,0,100,100,-1,0);return {world,laps:3,start:{pos:[0,0,0],yaw:0},checkpoints:[[0,0,'Start',1],[10,0,'A',1],[10,10,'B',1],[0,10,'C',1],[0,0,'Finish',1]],secrets:[]};}
function gate(s,i){const p=s.course.checkpoints[i];placeCar(s.car,[p[0],rideHeight(s.car.params),p[1]],0);stepSession(s,{throttle:0,steer:0},1/120);}
test('three full circuits required, ordered gates prevent finish-line farming',()=>{const s=createSession(fixture());gate(s,0);for(let lap=1;lap<=3;lap++){for(let i=1;i<5;i++)gate(s,i);assert.equal(s.finished,lap===3);assert.equal(s.lap,Math.min(3,lap+1));if(lap<3){assert.equal(s.gate,1);gate(s,0);assert.equal(s.gate,1);}}assert.equal(s.lapTimes.length,3);assert.ok(Math.abs(s.lapTimes.reduce((a,b)=>a+b,0)-s.time)<1e-9);});
test('place progress keeps the next lap ahead and sprint remains one pass',()=>{const a=createSession(fixture()),b=createSession(fixture());a.lap=2;a.gate=1;b.gate=4;assert.ok(progress(a)>progress(b));const sprint=createSession({...fixture(),laps:1});for(let i=0;i<5;i++)gate(sprint,i);assert.equal(sprint.finished,true);});
