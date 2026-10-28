import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {createStream} from './stream.mjs';
import {createUnderBridge} from './under-bridge.js';
import {NY,brickHeight} from './under-bridge.mjs';
import {createWorld} from '../physics/world.mjs';
import {createSession,stepSession} from '../physics/session.mjs';
import {placeCar,rideHeight} from '../physics/car.mjs';
import {createSkate,stepSkate} from '../physics/skate.mjs';
import {NY_PARK as PARK,buildUnderBridge,bridgeWorld as W,bridgeLocal as L} from './under-bridge.mjs';
const world=createWorld(4);world.addQuad(W([-150,0,-150]),W([-150,0,150]),W([150,0,150]),W([150,0,-150]),'dirt');for(const t of buildUnderBridge())world.addTri(W(t.a),W(t.b),W(t.c),t.surface);
const frame=p=>{const l=L(p);return [l[0],l[2],l[1]];};
function run(x,z,dx,dz,seconds=3,throttle=1,drift=false,collision=world){
 const s=createSession({world:collision,checkpoints:[[500,1160,'a'],[501,1160,'b']],secrets:[],start:{pos:W([0,0,0]),yaw:0}},{mode:'kid'});s.roam=true;
 const p=W([x,6.8,z]);p[1]=collision.raycast(p,[0,-1,0],12).point[1]+rideHeight()+.01;placeCar(s.car,p,Math.atan2(dx,-dz));
 const sk=createSkate(PARK);sk.left=seconds;const events=[],landings=[],path=[],flight=[];let peak=0;
 for(let f=0;f<(seconds+4)*120&&!sk.over;f++){const input={throttle,steer:0,drift};stepSession(s,input,1/120);const air=sk.air;if(!s.car.contacts)flight.push(frame(s.car.pos));events.push(...stepSkate(sk,s,input,1/120,frame));if(air&&!sk.air&&air.time>.3)landings.push({kind:air.kind,time:air.time,from:air.from,to:frame(s.car.pos)});if(f%24===0)path.push(frame(s.car.pos));peak=Math.max(peak,L(s.car.pos)[1]);}
 return {s,sk,events,landings,peak,path,flight,gaps:events.filter(e=>e.type==='gap').map(e=>e.name)};
}
const clean=r=>{assert.equal(r.s.hits,0,'no wall hits');assert.equal(r.s.recoveries,0,'no rescue');assert.ok(!r.events.some(e=>e.type==='bail'),'no bail');};
const ground=(x,z,ceiling=6.8)=>world.raycast(W([x,ceiling,z]),[0,-1,0],15);
const lineCases=[
  {line:[...PARK.start.at,...PARK.start.toward,3],gaps:['BANK TO LEDGE'],letters:['S']},
  {line:[-18,-5,0,-1,5],gaps:['BRICK AIR']},
  {line:[0,-5,0,-1,5],gaps:['BRICK AIR','BETWEEN THE PILLARS'],letters:['K']},
  {line:[24,-15.8,0,1,2.3],gaps:['ABUTMENT DROP']},
  {line:[4,-5,0,1,3],gaps:['SUBWAY SET'],letters:['A']},
  {line:[22,-7,0,1,3],gaps:['CAB CLEARANCE'],letters:['T']},
  {line:[-11,0,0,1,3],gaps:['FOUNTAIN HOP'],letters:['E']},
  {line:[11,5,0,1,2.5],gaps:['HYDRANT HOP']},
  {line:[-24,7,-1,0,1.8],gaps:['GRANITE DROP']},
  {line:[-6,19,1,0,2],gaps:['MANUAL PAD']},
  {line:[9,-19.2,1,0,2.5],gaps:[],tape:true},
];

test('Under the Bridge riding surfaces face upward at their designed heights',()=>{
  const checks=[[-24,0,.76],[-24,7,.64],[-24,11,.34],[4,-5,.64],[4,0,1.24],[4,2.35,1],[4,3.05,.76],[4,3.75,.52],[4,4.45,.28],[4,5.15,.04],
    [22,.5,1.14],[22,6.3,1.8],[11,10,.64],[11,15,.64],[-11,6,.565],[-11,15,.08],[-11,18.1,.74],[-11,18.8,.39],[-11,17.4,.41],
    [24,-17,3.24],[14,-19.2,1.64],[-2,19,.64],[12,2,.64],[-6,19,.34],[8,2,.34],[-29,12,.54],[27.6,15,.955]];
  for(const [x,z,want] of checks){const hit=ground(x,z);assert.ok(hit&&Math.abs(hit.point[1]-want)<.025,`${x},${z}: ${hit?.point[1]} want ${want}`);assert.ok(hit.normal[1]>0);}
  for(const x of [-27,-24,-18,-10,0,10,18,24,27])for(const z of [-13.75,-13,-12,-11,-10,-9.1]){
    const hit=ground(x,z);assert.ok(Math.abs(hit.point[1]-brickHeight(x,z))<.03,`brick ${x},${z}`);assert.ok(hit.normal[1]>0);
  }
  assert.ok(Math.abs(ground(0,-16,10).point[1]-8.2)<.01,'road deck is solid from above');
  const roof=world.raycast(W([0,6,-16]),[0,1,0],3);assert.ok(roof&&Math.abs(roof.point[1]-7.7)<.01&&roof.normal[1]<0,'road soffit collides from below');
  for(const x of [-29,-6,6,29])assert.ok(world.raycast(W([x-1,.15,-19.5]),[1,0,0],1),'rear pier foundation reaches the flat ground');
  assert.ok(Math.abs(ground(...PARK.start.at).point[1]-PARK.start.height)<.01,'run starts on the floor');
});

test('every named rail sits on real geometry within five centimetres along its entire polyline',()=>{
  assert.ok(PARK.rails.length>=50);assert.equal(new Set(PARK.rails.map(r=>r.id)).size,PARK.rails.length);
  for(const r of PARK.rails){assert.ok(['rail','ledge','coping','edge'].includes(r.kind));assert.ok(r.pts.length>=2);
    for(let i=1;i<r.pts.length;i++)for(const t of [0,.01,.25,.5,.75,.99,1]){
      const a=r.pts[i-1],b=r.pts[i],p=a.map((v,k)=>v+(b[k]-v)*t),dx=b[0]-a[0],dz=b[1]-a[1],n=Math.hypot(dx,dz);assert.ok(n>.001);
      const heights=[0,.015,-.015].map(d=>ground(p[0]-dz/n*d,p[1]+dx/n*d,p[2]+.2)?.point[1]);
      assert.ok(heights.some(h=>Math.abs(h-p[2])<.05),`${r.id} at ${t}: ${heights} want ${p[2]}`);
    }
  }
});
function verifyLine(r,c){
  clean(r);assert.ok(r.sk.over,'line finishes on a real landing');
  for(const g of c.gaps)assert.ok(r.gaps.includes(g),`${g}: ${r.gaps}`);
  for(const l of c.letters??[])assert.ok(r.sk.letters.includes(l),l);
  if(c.tape)assert.ok(r.sk.tape,'tape reached via access bank');
  const crosses=(axis,at,height)=>r.flight.some(p=>Math.abs(p[axis]-at)<.15&&p[2]>height);
  for(const gap of c.gaps){
    if(gap==='BANK TO LEDGE')assert.ok(r.landings.some(a=>a.from[1]<3&&a.to[1]>5&&a.to[1]<9&&a.to[2]>.64),'lands on the actual granite ledge');
    if(gap==='ABUTMENT DROP')assert.ok(r.landings.some(a=>a.to[1]>-14&&a.to[1]<-9&&a.to[2]>.4),'drops onto brick, not the flat floor');
    if(gap==='CAB CLEARANCE')assert.ok(crosses(1,6.3,1.95)&&r.landings.some(a=>a.from[1]<4&&a.to[1]>8),'clears the cab roof and far bumper');
    if(gap==='BRICK AIR')assert.ok(r.peak>3.7&&r.peak<7,'big air clears banks and road soffit');
    if(gap==='BETWEEN THE PILLARS')assert.ok(r.landings.some(a=>Math.abs(a.from[0])<1&&Math.abs(a.to[0])<1&&a.from[1]<-13&&a.to[1]>-13),'returns through the central pier opening');
    if(gap==='SUBWAY SET')assert.ok(crosses(1,4,.55)&&r.landings.some(a=>a.from[1]<3&&a.to[1]>5.5),'flies over the staircase to the flat');
    if(gap==='FOUNTAIN HOP')assert.ok(crosses(1,11.9,.85)&&r.landings.some(a=>a.to[1]>13&&a.to[1]<17&&a.to[2]<.4),'clears the rim and lands in the drained basin');
    if(gap==='HYDRANT HOP')assert.ok(crosses(1,15,.8)&&r.landings.some(a=>a.from[1]<13&&a.to[1]>16),'clears the whole hydrant');
    if(gap==='GRANITE DROP')assert.ok(r.landings.some(a=>a.from[0]>-28.5&&a.to[0]<-28.5&&a.to[2]<.3),'leaves the ledge and lands on the west apron');
    if(gap==='MANUAL PAD')assert.ok(r.landings.some(a=>a.from[0]>1&&a.from[2]>.64&&a.to[0]>3&&a.to[2]<.3),'leaves the manual pad top and lands on the plaza');
  }
}
for(const c of lineCases)test(`held throttle drives ${c.gaps.join(' / ')||'the abutment tape approach'}`,()=>verifyLine(run(...c.line),c));

test('the driven matrix covers all ten gaps, all five letters and the tape',()=>{
  assert.equal(PARK.gaps.length,10);assert.equal(new Set(PARK.gaps.map(g=>g.name)).size,10);
  assert.deepEqual(new Set(lineCases.flatMap(c=>c.gaps)),new Set(PARK.gaps.map(g=>g.name)));
  assert.deepEqual(new Set(lineCases.flatMap(c=>c.letters??[])),new Set(PARK.letters.map(l=>l.letter)));assert.ok(lineCases.some(c=>c.tape));
});

test('the batched visual park and real streamed terrain preserve every driven line',async()=>{
  const read=name=>JSON.parse(fs.readFileSync(new URL(`../assets/world/${name}`,import.meta.url)));
  const stream=createStream({manifest:read('manifest.json'),elevation:read('playable-terrain.json'),fetchTile:key=>read(`tile-${key.replace(',','-')}.json`)});
  const previous=globalThis.document;globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
  const scene=new T.Scene();let park;
  try{
    await stream.update(NY.center);assert.ok(stream.ready(NY.center));park=createUnderBridge(scene,stream.world);
    let meshes=0;park.root.traverse(o=>{if(!o.isMesh)return;meshes++;for(const attribute of Object.values(o.geometry.attributes))for(const v of attribute.array)assert.ok(Number.isFinite(v));});assert.equal(meshes,1);
    park.root.updateMatrixWorld(true);
    const ray=new T.Raycaster();ray.far=.3;
    for(const r of PARK.rails)for(let i=1;i<r.pts.length;i++)for(const t of [0,.25,.5,.75,1]){
      const a=r.pts[i-1],b=r.pts[i],p=a.map((v,k)=>v+(b[k]-v)*t),dx=b[0]-a[0],dz=b[1]-a[1],n=Math.hypot(dx,dz);
      const visible=[0,.015,-.015].some(dx=>[0,.015,-.015].some(dz=>{const pos=W([p[0]+dx,p[2]+.15,p[1]+dz]);ray.set(new T.Vector3(...pos),new T.Vector3(0,-1,0));return ray.intersectObject(park.root,true).some(h=>Math.abs(h.point.y-p[2])<.05);}));
      assert.ok(visible,`${r.id} has a visible top`);
    }
    for(const c of lineCases)verifyLine(run(...c.line,1,false,stream.world),c);
  }finally{park?.dispose();stream.dispose();globalThis.document=previous;}
  assert.equal(scene.children.length,0);
});
