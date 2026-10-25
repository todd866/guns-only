import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { courseFromGlb, parseGlb, walkNodes } from './physics/district.mjs';
import { createSession, stepSession, readout } from './physics/session.mjs';
import { carUp, placeCar, rideHeight } from './physics/car.mjs';

import {PARK_HIP_LINE,bankLocal} from './open-world/park-lines.mjs';
import {loadOpenWorld} from './open-world/runtime.js';
import {RESIDENTIAL_PARK,parkPoint} from './open-world/residential-frame.mjs';

const bytes = fs.readFileSync(new URL('./assets/districts/skatepark.glb', import.meta.url));
const course = courseFromGlb(bytes);

test('skatepark GLB includes the two convex hip faces beside the central banks', () => {
  const names = [];
  walkNodes(parseGlb(bytes), n => { if (n.name) names.push(n.name); });
  assert.ok(names.includes('COL_concrete_central_hip_1'));
  assert.ok(names.includes('COL_concrete_central_hip_-1'));
  // The glTF frame places the west hip around x=-7, z=-3; its face is rideable,
  // not a vertical wall, and rises toward the central deck.
  const low = course.world.raycast([-7, 3, -3.5], [0, -1, 0], 4);
  const face = course.world.raycast([-7, 3, -3], [0, -1, 0], 4);
  assert.ok(low && face, 'hip has continuous collision coverage');
  assert.ok(face.normal[1] > 0.75 && face.normal[1] < .99, `hip normal ${face.normal}`);
  assert.ok(face.point[1] > low.point[1] + .02, 'hip rises from its toe');
});

test('the optional hip line also has a clear landing in the complete open world',async()=>{
  const oldFetch=globalThis.fetch;let world;
  globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url),import.meta.url)));
  try{
    world=await loadOpenWorld('');
    const session=createSession(world.course,{mode:'kid'});session.roam=true;
    placeCar(session.car,parkPoint([PARK_HIP_LINE.entry[0],.14+rideHeight(),PARK_HIP_LINE.entry[2]]),PARK_HIP_LINE.yaw-RESIDENTIAL_PARK.yaw);
    const {anchor,yaw}=RESIDENTIAL_PARK,c=Math.cos(yaw),s=Math.sin(yaw);
    const local=p=>[(p[0]-anchor[0])*c-(p[2]-anchor[2])*s,p[1],(p[0]-anchor[0])*s+(p[2]-anchor[2])*c];
    let flight=0,longest=0,landing=false;
    for(let frame=0;frame<360;frame++){
      stepSession(session,{throttle:.65,steer:0},1/120);
      if(!session.car.grounded)flight++;else{longest=Math.max(longest,flight);if(flight>24)landing=true;flight=0;}
    }
    const position=bankLocal(local(session.car.pos));
    assert.ok(longest>24&&landing,'ordinary throttle crosses the hip in the complete world');
    assert.ok(position[1]<-2,'the adjoining bank has a clear runout');
    assert.ok(carUp(session.car)[1]>.9&&session.car.speed>2);
    assert.equal(session.recoveries,0);assert.equal(session.hits,0);
  }finally{world?.dispose();globalThis.fetch=oldFetch;}
});

for(const throttle of [.45,.65,1])test(`ordinary throttle ${throttle} transfers across the hip and drives out`,t=>{
  const session=createSession(course,{mode:'kid'});session.roam=true;
  const {entry,yaw}=PARK_HIP_LINE;
  placeCar(session.car,[entry[0],.14+rideHeight(),entry[2]],yaw);
  let previous=false,flight=null,transfer=null,peakClearance=0;
  for(let frame=0;frame<360;frame++){
    stepSession(session,{throttle,steer:0},1/120);
    const car=session.car,p=car.pos,local=bankLocal(p);
    if(previous&&!car.grounded&&!transfer){
      const onHip=local[0]<-2.75&&local[0]>-4.65&&local[1]>1.2&&local[1]<3.1;
      if(onHip)flight={frame,from:[...p],local,speed:car.speed};
    }
    if(flight&&!car.grounded){
      const ground=course.world.raycast([p[0],p[1]+.1,p[2]],[0,-1,0],4);
      if(ground)peakClearance=Math.max(peakClearance,p[1]-ground.point[1]-rideHeight());
    }
    if(flight&&car.grounded&&car.contacts>=2){transfer={...flight,to:[...p],landing:local,air:(frame-flight.frame)/120,speedAfter:car.speed};flight=null;}
    previous=car.grounded;
  }
  assert.ok(transfer,'the full exported collider produces a transfer');
  const distance=Math.hypot(transfer.to[0]-transfer.from[0],transfer.to[2]-transfer.from[2]);
  assert.ok(distance>1.1&&distance<4,'a transfer spans several car lengths, not a seam bounce');
  assert.ok(transfer.air>.2&&transfer.air<.8,'continuous airborne interval is a visible, controlled hop');
  assert.ok(peakClearance>.16,'the car clears the bank');
  assert.ok(transfer.local[1]>1.2&&transfer.landing[1]<1.2,'crosses from the diagonal hip onto its western side');
  if(throttle<1)assert.ok(transfer.landing[0]>-4.65&&transfer.landing[0]<-2.75,'moderate throttle lands on the adjoining west bank');
  assert.ok(transfer.speedAfter>transfer.speed*.8,'landing preserves momentum');
  assert.ok(carUp(session.car)[1]>.9&&session.car.speed>2,'upright and driving along the runout');
  assert.equal(session.recoveries,0);assert.equal(session.hits,0,'clear runout without hull strikes');
  t.diagnostic(JSON.stringify({throttle,distance,air:transfer.air,peakClearance}));
});
