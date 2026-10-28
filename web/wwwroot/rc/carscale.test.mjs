import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {loadBuggyAsset} from './assets.js';
import {poseCar} from './vehicle-pose.mjs';
import {makeVehicleBody} from './vehicle-bodies.js';
import {JET_KINDS,fitJetShell} from './jets.js';
import {BUGGY,createCar,rideHeight,stepCar,carUp} from './physics/car.mjs';
import {VEHICLE_KINDS,vehicleParams} from './physics/vehicles.mjs';
import {createWorld} from './physics/world.mjs';
import {bump} from './physics/race.mjs';
import {assistInput,createAssist} from './physics/assists.mjs';

const flat=createWorld();flat.addQuad([-30,0,-30],[-30,0,30],[30,0,30],[30,0,-30]);
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<.001,`${label}: ${a} versus ${b}`);
test('a pitching chassis lands wheels-down even with steering held',()=>{
 const c=createCar(BUGGY,[0,.75,0]),a=createAssist('bigKid');c.vel=[1.5,3.2,-6];c.ang=[10,0,0];
 for(let f=0;f<180&&!c.contacts;f++)stepCar(c,assistInput(a,c,{throttle:1,steer:1},1/120,flat),flat);
 assert.ok(c.contacts>0,'returns to the ground');assert.ok(carUp(c)[1]>.75,'steering does not weaken tumble recovery');
 assert.ok(c.speed>6,'landing retains forward momentum');
});
test('car-to-car contacts follow each chassis width and length',()=>{
 for(const kind of VEHICLE_KINDS)for(const axis of [0,2]){
  const p=vehicleParams(kind),a=createCar(p,[0,rideHeight(p),0]),at=[0,rideHeight(p),0];at[axis]=p.size[axis]+.005;
  const b=createCar(p,at);bump([a,b]);assert.deepEqual(a.pos,[0,rideHeight(p),0]);assert.deepEqual(b.pos,at);
  b.pos[axis]-=.015;bump([a,b]);close(b.pos[axis]-a.pos[axis],p.size[axis],kind+' contact envelope');
 }
});
test('1:10 envelopes retain the motor, mass and wheelbase; suspension settles above its hull',()=>{
 close(BUGGY.wheelRadius*2,.116,'buggy tyre diameter');close(BUGGY.wheels[1].at[0]*2+BUGGY.wheelWidth,.28,'buggy width');
 assert.equal(BUGGY.mass,1.8);assert.equal(BUGGY.driveForce,26);assert.equal(BUGGY.topSpeed,14);close(BUGGY.size[2],.42,'length');
 const monster=vehicleParams('monster');close(monster.wheelRadius*2,.14,'monster tyre diameter');close(monster.wheels[1].at[0]*2+monster.wheelWidth,.37,'monster width');
 for(const kind of VEHICLE_KINDS){
  const p=vehicleParams(kind),c=createCar(p,[0,.6,0]);
  for(let f=0;f<480;f++)stepCar(c,{},flat,1/120);
  close(c.pos[1],rideHeight(p),kind+' rest');assert.equal(c.contacts,4);assert.ok(carUp(c)[1]>.999);
  assert.ok(p.hull.every(h=>c.pos[1]+h.at[1]-h.r>.025),kind+' belly clearance');
 }
});

test('the shipped GLB wheels match every chassis and touch the ground independently of BUGGY tuning',async()=>{
 const fetchBefore=globalThis.fetch,documentBefore=globalThis.document;
 globalThis.fetch=async()=>new Response(fs.readFileSync(new URL('./assets/buggy.glb',import.meta.url)));
 globalThis.document={baseURI:'http://fixture/rc/'};
 try{
  for(const kind of VEHICLE_KINDS){
   const {car:group,wheels}=await loadBuggyAsset('./assets/buggy.glb'),p=vehicleParams(kind),c=createCar(p,[0,rideHeight(p),0]);
   poseCar(group,wheels,c);group.updateMatrixWorld(true);
   for(const [i,w] of wheels.entries()){
    const b=new T.Box3().setFromObject(w.wheel),centre=w.pivot.getWorldPosition(new T.Vector3());
    close(centre.x,p.wheels[i].at[0],kind+' track');close(centre.z,p.wheels[i].at[2],kind+' wheelbase');
    close(b.min.y,0,kind+' ground contact');close(b.max.y-b.min.y,2*p.wheelRadius,kind+' drawn diameter');
    close(b.max.x-b.min.x,p.wheelWidth,kind+' drawn width');
   }
   c.steer=.4;poseCar(group,wheels,c);group.updateMatrixWorld(true);
   for(const w of wheels)close(new T.Box3().setFromObject(w.wheel).min.y,0,kind+' steered ground contact');
   if(kind!=='buggy'){fitJetShell(group,'viper','#dd762c');group.getObjectByName('JetShell').removeFromParent();group.add(makeVehicleBody(kind));poseCar(group,wheels,c);}
   const body=group.getObjectByName(kind==='buggy'?'Body':'VehicleBody'),b=new T.Box3().setFromObject(body),width=p.wheels[1].at[0]*2+p.wheelWidth;
   assert.ok(b.max.x-b.min.x<width+.005,kind+' shell fits track');assert.ok(b.max.z-b.min.z<.44,kind+' shell length');
  }
  for(const kind of JET_KINDS){
   const {car:group,wheels}=await loadBuggyAsset('./assets/buggy.glb');fitJetShell(group,kind,'#dd762c');poseCar(group,wheels,createCar(BUGGY,[0,rideHeight(),0]));
   group.updateMatrixWorld(true);const b=new T.Box3().setFromObject(group.getObjectByName('JetShell'));
   close(b.max.x-b.min.x,.32,kind+' wingspan');close(b.max.z-b.min.z,.42,kind+' length');assert.ok(b.min.y>0,kind+' shell clearance');
  }
 }finally{globalThis.fetch=fetchBefore;if(documentBefore===undefined)delete globalThis.document;else globalThis.document=documentBefore;}
});
