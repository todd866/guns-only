import test from 'node:test';import assert from 'node:assert/strict';
import {createCar,stepCar,resetCar,checkpoints,solids,aircraft} from './sim.mjs';
const run=(s,input,n)=>{for(let i=0;i<n;i++)stepCar(s,input);return s;};
test('fixed input tape is deterministic, acceleration capped, braking works',()=>{const a=createCar(),b=createCar();run(a,{throttle:1},180);run(b,{throttle:1},180);assert.deepEqual(a,b);assert.ok(a.speed>8&&a.speed<=11);const speed=a.speed;run(a,{brake:true},90);assert.ok(a.speed<speed*.1);});
test('steer sign follows car heading; reverse is bounded',()=>{const a=createCar();run(a,{throttle:1,steer:1},100);assert.ok(a.x>0);run(a,{throttle:-1},600);assert.ok(a.speed<=4.51);});
test('collision resolves outside house',()=>{const a=createCar();Object.assign(a,{x:-15,z:-6,y:.23,vz:-10,speed:10});run(a,{throttle:1},60);assert.ok(a.z>=-7.78);assert.ok(a.hits>0);});
test('ramp launches and gravity lands the car',()=>{const a=createCar();Object.assign(a,{x:22,z:-20,vz:-8});let max=0,air=false;for(let i=0;i<240;i++){stepCar(a,{throttle:1});max=Math.max(max,a.y);air ||= !a.grounded;}assert.ok(max>1);assert.ok(air);assert.ok(a.y<.4);});
test('full route driven by steering controller finishes without teleporting',()=>{const a=createCar();let target=0;for(let i=0;i<120*140&&!a.finished;i++){target=a.gate;const [x,z]=checkpoints[target];const desired=Math.atan2(x-a.x,-(z-a.z));const error=Math.atan2(Math.sin(desired-a.yaw),Math.cos(desired-a.yaw));stepCar(a,{throttle:a.speed>4?0:.65,steer:Math.max(-1,Math.min(1,error*2))});}assert.ok(a.finished,JSON.stringify(a));assert.ok(a.time>10&&a.time<140);assert.equal(a.hits,0);});
test('recovery penalizes timing; secrets require proximity',()=>{const a=createCar();a.running=true;a.gate=3;resetCar(a);assert.equal(a.time,3);assert.equal(a.x,0);Object.assign(a,{x:33,z:25});stepCar(a,{});stepCar(a,{});assert.equal(a.found,1);});

test('ground car drives beneath hangar wing while gear remains solid',()=>{
 const a=createCar();Object.assign(a,{x:38,z:-14,y:.23,yaw:Math.PI});run(a,{throttle:1},180);
 assert.ok(a.z>-5,JSON.stringify(a));assert.equal(a.hits,0);
 const b=createCar();Object.assign(b,{x:aircraft[0].x-1,z:-11,y:.23,yaw:Math.PI});run(b,{throttle:1},120);
 assert.ok(b.z<=-8.37,JSON.stringify(b));assert.ok(b.hits>0);
});
test('airborne car hits wing slab; ground car hits low fuselage',()=>{
 const a=createCar();Object.assign(a,{x:38,z:-10,y:1.2,vy:0,vz:8,yaw:Math.PI,speed:8});run(a,{throttle:0},10);assert.ok(a.hits>0);
 const b=createCar();Object.assign(b,{x:42,z:-13,y:.23,yaw:Math.PI});run(b,{throttle:1},100);assert.ok(b.z<-12,JSON.stringify(b));
});
test('bollards and crates block without sealing the road',()=>{
 for(const target of [{x:-4.4,z:-40,w:.16,d:.16},{x:29,z:-27,w:1.2,d:1.2}]){
 const a=createCar();Object.assign(a,{x:target.x,z:target.z+2,y:.23});run(a,{throttle:1},100);assert.ok(a.z>=target.z+target.d/2+.23-.001,JSON.stringify(a));assert.ok(a.hits>0);
 }
});

test('side entry onto ramp cannot create an extreme vertical impulse',()=>{
 const a=createCar();Object.assign(a,{x:19.5,z:-26.8,y:.23,vx:10,yaw:Math.PI/2});let max=0;
 for(let i=0;i<240;i++){stepCar(a,{throttle:1});max=Math.max(max,a.y);}
 assert.ok(max<2,`ramp peak ${max}`);
});
test('flying over a checkpoint or specimen does not count',()=>{
 const a=createCar();Object.assign(a,{x:0,z:0,y:15});stepCar(a,{});assert.equal(a.gate,0);
 Object.assign(a,{x:33,z:25,y:15});stepCar(a,{});assert.equal(a.found,0);
});
