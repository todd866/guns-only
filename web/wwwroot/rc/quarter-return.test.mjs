import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {courseFromGlb} from './physics/district.mjs';
import {createSession,stepSession} from './physics/session.mjs';
import {placeCar,rideHeight,carUp,carYaw} from './physics/car.mjs';
import {bankPoint,bankLocal} from './open-world/park-lines.mjs';
import {vehicleParams,VEHICLE_KINDS} from './physics/vehicles.mjs';
import {loadOpenWorld} from './open-world/runtime.js';
import {RESIDENTIAL_PARK} from './open-world/residential-frame.mjs';
import {placeDistrictCourse} from './open-world/district-placement.mjs';
const native=courseFromGlb(fs.readFileSync(new URL('./assets/districts/skatepark.glb',import.meta.url)));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function driveQuarter({side='east',throttle=.8,mode='kid',placement=null,kind='buggy',connected=null}={}){
 const params=vehicleParams(kind),course=connected??(placement?placeDistrictCourse(native,placement):native),s=createSession(course,{mode,params});s.roam=true;
 const yaw=Math.PI/2-.274+(side==='west'?Math.PI:0),p=bankPoint(side==='east'?1.5:-8,side==='east'?1:.5);p[1]+=.001+rideHeight(params);
 const angle=placement?.yaw??0,c=Math.cos(angle),sn=Math.sin(angle),anchor=placement?.anchor??[0,0,0];
 const world=p=>[anchor[0]+c*p[0]+sn*p[2],anchor[1]+p[1],anchor[2]-sn*p[0]+c*p[2]];
 const local=p=>bankLocal([c*(p[0]-anchor[0])-sn*(p[2]-anchor[2]),p[1]-anchor[1],sn*(p[0]-anchor[0])+c*(p[2]-anchor[2])]);
 placeCar(s.car,world(p),yaw-angle);
 let air=0,landing=null,peak=0;
 for(let frame=0;frame<720;frame++){
  stepSession(s,{throttle,steer:0},1/120);peak=Math.max(peak,s.car.pos[1]-anchor[1]);
  if(!s.car.grounded)air++;else{
   if(air>24&&s.car.contacts>=2){landing={position:local(s.car.pos),yaw:carYaw(s.car)+angle,up:carUp(s.car)[1],speed:s.car.speed};break;}
   if(s.car.contacts>=2)air=0;
  }
 }
 assert.ok(landing,'ordinary throttle produces an airborne interval and real landing');
 for(let frame=0;frame<60;frame++){stepSession(s,{throttle:0,brake:true,steer:0},1/120);assert.ok(carUp(s.car)[1]>.72,'landing stays wheels-down');}
 assert.equal(s.hits,0);assert.equal(s.recoveries,0);
 return {landing,peak,yaw,car:s.car};
}

for(const side of ['east','west']){
 test(`${side} quarter: slow approach exits onto the upper deck`,()=>{
  const {landing,yaw,peak}=driveQuarter({side,throttle:.3});
  assert.ok(Math.abs(wrap(landing.yaw-yaw))<.4,'deck exit keeps approach heading');
  assert.ok(side==='east'?landing.position[0]>8.3:landing.position[0]<-16.1,'lands beyond the lip');
  assert.ok(landing.up>.9&&peak<3,'slow exit is a small wheels-down hop');
 });
 for(const mode of ['kid','bigKid'])test(`${side} quarter: fast ${mode} approach turns and returns`,()=>{
  const {landing,yaw,peak}=driveQuarter({side,throttle:1,mode});
  assert.ok(Math.abs(wrap(landing.yaw-yaw-Math.PI))<.35,'faces back into the park');
  assert.ok(side==='east'?landing.position[0]<7.6:landing.position[0]>-15.5,'lands back on the transition');
  assert.ok(landing.up>.75&&landing.speed>2,'comes down wheels-first with useful momentum');
  assert.ok(peak>2.5&&peak<6,'visible bounded airtime');
 });
}
test('quarter return follows a rotated/translated district placement',()=>{
 const {landing,yaw}=driveQuarter({placement:{anchor:[47,3,-29],yaw:.63},throttle:1});
 assert.ok(Math.abs(wrap(landing.yaw-yaw-Math.PI))<.35);
 assert.ok(landing.position[0]<7.6&&landing.up>.75);
});


for(const kind of VEHICLE_KINDS)for(const mode of ['kid','bigKid'])test(`${kind} ${mode}: speed selects deck exit or return`,()=>{
 const slow=driveQuarter({kind,mode,throttle:.3}),fast=driveQuarter({kind,mode,throttle:1});
 assert.ok(Math.abs(wrap(slow.landing.yaw-slow.yaw))<.4&&slow.landing.position[0]>8.3,'slow exits forward');
 assert.ok(Math.abs(wrap(fast.landing.yaw-fast.yaw-Math.PI))<.4&&fast.landing.position[0]<7.6,'fast returns');
 assert.ok(fast.peak>2.5&&fast.peak<6&&fast.landing.up>.75,'bounded wheels-first landing');
});
test('quarter return works in the complete connected residential world',async()=>{
 const fetchBefore=globalThis.fetch;let world;
 globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url),import.meta.url)));
 try{world=await loadOpenWorld('');const result=driveQuarter({connected:world.course,placement:RESIDENTIAL_PARK,throttle:1});assert.ok(result.landing.position[0]<7.6&&result.landing.up>.75);}
 finally{world?.dispose();globalThis.fetch=fetchBefore;}
});

// The skateboard form (docs/design/adventure) must ride the same quarter: slow exits, fast returns.
test('board kid: speed selects deck exit or return', () => {
  const slow = driveQuarter({ kind: 'board', mode: 'kid', throttle: .3 }), fast = driveQuarter({ kind: 'board', mode: 'kid', throttle: 1 });
  assert.ok(Math.abs(wrap(slow.landing.yaw - slow.yaw)) < .4 && slow.landing.position[0] > 8.3, 'slow exits forward');
  assert.ok(Math.abs(wrap(fast.landing.yaw - fast.yaw - Math.PI)) < .4 && fast.landing.position[0] < 7.6, 'fast returns');
});
