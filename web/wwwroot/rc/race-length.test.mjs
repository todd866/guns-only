import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addBox} from './physics/world.mjs';
import {createSession,recover,readout} from './physics/session.mjs';
import {RACE_EVENTS,eventById,eventLaps,medal,RACE_TARGET_M} from './open-world/catalog.mjs';

test('laps keep every authored circuit near the kid race length and sprints stay one run',()=>{
 const len=p=>p.slice(1).reduce((a,q,i)=>a+Math.hypot(q[0]-p[i][0],q[1]-p[i][1]),0);
 for(const e of RACE_EVENTS.filter(e=>e.points&&e.kind==='circuit')){const laps=eventLaps(e),race=len(e.points)*laps;
  assert.ok(laps>=1&&laps<=3,e.id);
  // Either within the target band, or already at the 1-lap floor / 3-lap ceiling.
  assert.ok((race>=RACE_TARGET_M*.55&&race<=RACE_TARGET_M*1.6)||laps===1||laps===3,`${e.id}: ${laps} x ${Math.round(len(e.points))} m`);}
 assert.equal(eventLaps(eventById('paper-route')),1,'a 2.3 km road lap is one lap, not a 15-minute race');
 assert.equal(eventLaps(eventById('gate-guard')),3);
 assert.equal(eventLaps(eventById('hangar-hop')),1);
 assert.equal(eventLaps(eventById('district-bx')),3,'districts without authored points keep three laps');
 assert.equal(eventLaps(undefined),3);
});

test('medal thresholds scale with the laps actually raced',()=>{
 const e=eventById('ramp-rat');assert.equal(eventLaps(e),2);
 assert.equal(medal(e,e.medals[0]*2),'Gold');assert.equal(medal(e,e.medals[2]*2+1),'Finished');
});

test('recovery faces along the racing line and repeats at one gate move further on',()=>{
 const world=createWorld();addBox(world,0,0,200,200,-1,0);
 // Gate 1 at the origin, gate 2 due east, but the line first runs north for 12 m (a wall-side aisle).
 const ai=[];for(let z=0;z>=-12;z-=3)ai.push({pos:[0,0,z],halfWidth:2});for(let x=3;x<=30;x+=3)ai.push({pos:[x,0,-12],halfWidth:2});
 const s=createSession({world,laps:3,start:{pos:[0,0,0],yaw:0},checkpoints:[[0,0,'Start',2],[30,-12,'East',2],[30,30,'South',2],[0,0,'Finish',2]],ai,secrets:[]},{mode:'kid'});
 s.gate=1;recover(s);
 const first=readout(s);assert.ok(Math.abs(first.x)<.01&&Math.abs(first.z)<.01,'lands on the line beside the gate');
 assert.ok(Math.abs(first.yaw)<.05,`faces north along the line, not east at the gate (yaw ${first.yaw})`);
 recover(s);const second=readout(s);assert.ok(second.z<first.z-5,'second recovery at the same gate starts further along');
 for(let i=0;i<20;i++)recover(s);const far=readout(s);assert.ok(Math.hypot(far.x-30,far.z+12)>1,'never placed past the next gate');
 s.gate=2;recover(s);assert.equal(s.recoverStreak,0,'a new gate resets the streak');
});
