import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import { createTownPlaza } from './town-plaza.js';
import { createStream } from './stream.mjs';
import { createSession, stepSession } from '../physics/session.mjs';
import { placeCar, rideHeight } from '../physics/car.mjs';
import { createSkate, stepSkate } from '../physics/skate.mjs';
import { PLAZA, PLAZA_PARK, PLAZA_FEATURES, PLAZA_BOUNDS, buildPlaza, plazaWorld, plazaLocal } from './town-plaza.mjs';
import { SCENERY_BOUNDS } from './district-zones.mjs';
import { elevationAt } from './elevation.mjs';
import { insideBase } from './boundary.mjs';
import { inResidential } from './residential-frame.mjs';
import { inside, segmentDistance, roadWidth } from './geometry.mjs';
import { desertScatter, roadsideDetail } from './roadside-detail.mjs';
import { locationById } from './catalog.mjs';

const data = name => JSON.parse(fs.readFileSync(new URL(`../assets/world/${name}.json`, import.meta.url)));
const stream = createStream({ manifest: data('manifest'), elevation: data('playable-terrain'), fetchTile: key => data(`tile-${key.replace(',','-')}`) });
await stream.update(PLAZA.center);
for (const t of buildPlaza()) stream.world.addTri(plazaWorld(t.a),plazaWorld(t.b),plazaWorld(t.c),t.surface);
const world = stream.world, frame = p => { const l = plazaLocal(p); return [l[0],l[2],l[1]]; };
const course = { world, checkpoints: [[-600,-200,'a'],[-599,-200,'b']], secrets: [], start: { pos: plazaWorld([0,0,0]), yaw: 0 } };
const height = (x,z) => world.raycast(plazaWorld([x,10,z]),[0,-1,0],12)?.point[1] - PLAZA.center[1];
function run(x,z,seconds,dx=0,dz=1,throttle=1,grab=false) {
  const s=createSession(course,{mode:'kid'});s.roam=true;
  placeCar(s.car,plazaWorld([x,height(x,z)+rideHeight()+.01,z]),Math.atan2(dx,-dz));
  const sk=createSkate(PLAZA_PARK),events=[],grinds=new Set(),landings=[];let peak=0;
  for(let f=0;f<seconds*120;f++){const drift=grab&&f<(seconds-.75)*120;stepSession(s,{throttle,steer:0,drift},1/120);const air=sk.air;events.push(...stepSkate(sk,s,{throttle,drift},1/120,frame));if(s.skateRide?.active)grinds.add(s.skateRide.active.rail.id);if(air&&!sk.air&&air.time>.3)landings.push({from:air.from,to:frame(s.car.pos)});peak=Math.max(peak,frame(s.car.pos)[2]);}
  return {s,sk,events,peak,grinds:[...grinds],landings,gaps:events.filter(e=>e.type==='gap').map(e=>e.name)};
}
const clean = r => { assert.equal(r.s.hits,0,'no wall strikes');assert.equal(r.s.recoveries,0,'no automatic rescues');assert.equal(r.events.filter(e=>e.type==='bail').length,0,'no bails'); };

test('the civic plaza fits the main-gate town streets, outside housing, roads and existing buildings',()=>{
  const b=PLAZA_BOUNDS,ring=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]];
  for(const {a,b,c} of buildPlaza())for(const p of [a,b,c])assert.ok(Math.abs(p[0])<=PLAZA.half[0]&&Math.abs(p[2])<=PLAZA.half[1],'all new frontage and scenery stays inside the cleared footprint');
  assert.equal(locationById('town-plaza').skate,'philly');assert.ok(!inResidential(PLAZA.center));
  for(const d of SCENERY_BOUNDS)assert.ok(!(b[0]<d[2]&&b[2]>d[0]&&b[1]<d[3]&&b[3]>d[1]));
  const terrain=data('playable-terrain');
  for(let x=-38;x<=38;x+=2)for(let z=-31;z<=31;z+=2){const p=plazaWorld([x,0,z]);assert.ok(insideBase(p[0],p[2]));assert.equal(elevationAt(terrain,p[0],p[2]),0,'flat datum needs no terrain pad');}
  const intersects=(a,b,c,d)=>{
    const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;
  };
  for(const tile of stream.loaded.values())for(const f of tile.features){const g=f.geometry,p=f.properties;
    if(g.type==='Polygon'&&(p.building||p.amenity==='parking')){
      const r=g.coordinates[0];assert.ok(!ring.some(p=>inside(...p,r))&&!r.some(p=>inside(...p,ring)),`footprint ${f.id}`);
      for(let i=1;i<r.length;i++)for(let j=1;j<ring.length;j++)assert.ok(!intersects(r[i-1],r[i],ring[j-1],ring[j]),`footprint edge ${f.id}`);
    }
    if(g.type==='LineString'&&(p.highway||p.aeroway))for(let i=1;i<g.coordinates.length;i++){
      const a=g.coordinates[i-1],c=g.coordinates[i];assert.ok(!inside(...a,ring)&&!inside(...c,ring));
      for(let j=1;j<ring.length;j++){
        const u=ring[j-1],v=ring[j];assert.ok(!intersects(a,c,u,v));
        const distance=Math.min(segmentDistance(...u,a,c),segmentDistance(...v,a,c),segmentDistance(...a,u,v),segmentDistance(...c,u,v));
        assert.ok(distance>roadWidth(p)/2+2,`road clearance ${f.id}: ${distance}`);
      }
    }
  }
});

test('both scenery scatterers keep scrub off the plaza',()=>{
  for(const tile of stream.loaded.values()){
    const [x,z]=tile.tile,b=[x*256,z*256,(x+1)*256,(z+1)*256];
    for(const p of [...desertScatter(tile,b),...roadsideDetail(tile,b)])assert.ok(p.x<PLAZA_BOUNDS[0]||p.x>PLAZA_BOUNDS[2]||p.z<PLAZA_BOUNDS[1]||p.z>PLAZA_BOUNDS[3]);
  }
});

test('every riding feature has an upward face at its designed height',()=>{
  const checks=[[-18,-7.5,.14],[-18.6,-7.5,.12],[-18,-10.3,.7],[-18,-13, .08+(1.2-.08)/3],[-18,-2,.08],
    [0,-8,.55],[0,-12, .08+(1.2-.08)*2/3],[18,-5,1.5],[18,1,.08+(1.5-.08)*3/7],
    [-32.2,16,1.43],[25.8,16,1.18],[-29,15,1.08],[-29,20.3,.83],[-29,21,.58],[-29,21.8,.33],[29,15,.83],[29,20.3,.58],[29,21,.33],
    [-9,10,.83],[-9,13.5,1.09],[-9,20,.63],[-6,10,.48],[-6,20,.28],[7,16,.62],[7,11.5,.59],[20.5,18.5,.62],
    [-28.5,-24,.455],[-28.5,-20,.83],[-28.5,-17.8,.6425],[28.5,-20,.68],[-9.5,-22,.08+.92*3/5],[-9.5,-16,.4],
    [-24.8,0,.52],[-25.2,0,.26],[-18,7.5,.43],[-18,11.5,.4],[17,27,.78],[17,28.5,.43],[7,-20,.23],[0,8,.23]];
  for(const [x,z,h] of checks)assert.ok(Math.abs(height(x,z)-h)<.025,`${x},${z}: ${height(x,z)} != ${h}`);
  for(let i=0;i<4;i++){
    const hit=world.raycast(plazaWorld([18,1.2,-7.65+i*.7]),[0,-1,0],2);
    assert.ok(Math.abs(hit.point[1]-(1.05-i*.24))<.01,'subway treads beneath the awning');
  }
  for(const {a,b,c,mat} of buildPlaza())if(['bank','paver','paver-dark','basin','rim'].includes(mat)){
    assert.ok((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])>0,`${mat} riding face points upward`);
  }
});

test('all grind polylines sit on real upward-facing geometry within five centimetres',()=>{
  assert.ok(PLAZA_PARK.rails.length>=50);const ids=new Set();
  for(const rail of PLAZA_PARK.rails){assert.ok(!ids.has(rail.id));ids.add(rail.id);assert.ok(['rail','ledge','coping','edge'].includes(rail.kind));assert.ok(rail.pts.length>=2);
    for(let i=1;i<rail.pts.length;i++){
      const a=rail.pts[i-1],b=rail.pts[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*4);
      for(let j=0;j<=n;j++){const p=a.map((v,k)=>v+(b[k]-v)*j/n),hit=world.raycast(plazaWorld([p[0],p[2]+.06,p[1]]),[0,-1,0],.12);assert.ok(hit&&Math.abs(hit.point[1]-p[2])<=.05,`${rail.id} ${p}: ground ${hit?.point[1]}`);}
    }
  }
});

const lines=[
  ['FOUNTAIN GAP',-18,-27,5,'S'],['PLINTH HOP',0,-25,4,'K'],['OVER THE SUBWAY',18,-25,4.5,null],
  ['LEDGE TO LEDGE',-9,0,3.5,'A'],['THE BIG FOUR',-29,8,3,'T'],['EAST THREE',29,8,3,null],['PLANTER POP',7,0,4,'E'],
  ['ARCADE THREE',-28.5,-27,3.5],['MARKET STEPS',28.5,-27,3.5],['PLANTER TO PLANTER',-9.5,-26,3],
  ['FOUNTAIN TO COURT',-18,1,4],['CIVIC DROP',17,30.75,3.5,null,0,-1],
];
for(const [gap,x,z,seconds,letter,dx=0,dz=1]of lines)test(`held throttle from rest: ${gap}${letter?` and ${letter}`:''}`,()=>{
  assert.ok(Math.abs(height(x,z)-.08)<.01,'run-up starts on ordinary plaza floor');
  const ray=[-dx*1.36,.43,-dz*1.36],dist=Math.hypot(...ray);
  assert.equal(world.raycast(plazaWorld([x,.08+rideHeight()+.14,z]),ray.map(v=>v/dist),dist),null,'room behind the run-up for the default chase camera');
  const r=run(x,z,seconds,dx,dz);assert.ok(r.gaps.includes(gap),r.gaps.join(','));assert.deepEqual(r.grinds,[],'rails do not hijack the jump line');if(letter)assert.ok(r.sk.letters.includes(letter));clean(r);
  if(gap==='FOUNTAIN GAP'){assert.deepEqual(PLAZA_PARK.start,{at:[x,z],toward:[0,1]});assert.ok(r.peak>1.8);assert.ok(r.sk.score>=PLAZA_PARK.goals.find(g=>g.id==='high').score);}
  if(gap==='OVER THE SUBWAY'){assert.ok(r.sk.tape);assert.ok(r.sk.goals.has('subway'));assert.ok(r.landings.some(a=>a.to[1]>=-7&&a.to[1]<=-3&&a.to[2]>1.5),'lands on the subway awning');}
});

test('holding throttle from the default start links the fountain, court air and manual pad',()=>{
  const r=run(...PLAZA_PARK.start.at,8);clean(r);
  for(const gap of ['FOUNTAIN GAP','FOUNTAIN TO COURT'])assert.ok(r.gaps.includes(gap));
  assert.ok(frame(r.s.car.pos)[1]>30,'the whole line has a clear run-out');assert.ok(r.sk.letters.includes('S'));
});

test('the whole square has a skate feature within eight metres, including raised decks and perimeter',t=>{
  let worst=0;
  const buildings=PLAZA_FEATURES.filter(f=>f.kind==='building'),features=PLAZA_FEATURES.filter(f=>!['building','tree','prop'].includes(f.kind));
  for(let x=-38;x<=38;x+=.5)for(let z=-31;z<=31;z+=.5){
    if(buildings.some(({bounds:[x0,z0,x1,z1]})=>x>=x0&&x<=x1&&z>=z0&&z<=z1))continue;
    const distance=Math.min(...features.map(({bounds:[x0,z0,x1,z1]})=>Math.hypot(Math.max(x0-x,0,x-x1),Math.max(z0-z,0,z-z1))));
    assert.ok(distance<=8,`empty floor at ${x},${z}: ${distance.toFixed(2)} m`);worst=Math.max(worst,distance);
  }
  assert.equal(new Set(lines.map(l=>l[0])).size,PLAZA_PARK.gaps.length,'every named gap has a driven line');
  assert.ok(PLAZA_FEATURES.filter(f=>!['building','tree','prop'].includes(f.kind)).length>=40);
  assert.ok(buildPlaza().length<6000,'frontage and street furniture stay inexpensive');
  t.diagnostic(`farthest sample from a skate feature: ${worst.toFixed(2)} m`);
});

test('all city frontages have outward solid walls and stop a car driven toward the doors',()=>{
  const blocks=[[-38,-33,-24,-4],[-38,-33,3,9],[33,38,-24,-4],[33,38,3,9],[-12,12,-31,-28],[-4,4,23,31]];
  for(const [x0,x1,z0,z1] of blocks){
    for(const t of [.01,.2,.4,.6,.8,.99])for(const y of [.3,1,4])for(const [x,z,dx,dz] of [[x0-.1,z0+(z1-z0)*t,1,0],[x1+.1,z0+(z1-z0)*t,-1,0],[x0+(x1-x0)*t,z0-.1,0,1],[x0+(x1-x0)*t,z1+.1,0,-1]]){
      const hit=world.raycast(plazaWorld([x,y,z]),[dx,0,dz],.2);assert.ok(hit&&hit.dist<=.11,`solid face at ${x},${y},${z}`);
    }
  }
  for(const [x,z,dx,dz,axis,wall,side] of [[-30.5,-10,-1,0,0,-33,1],[-30.5,6,-1,0,0,-33,1],[30.5,-10,1,0,0,33,-1],[30.5,6,1,0,0,33,-1],[0,-25.5,0,-1,1,-28,1],[0,20.5,0,1,1,23,-1]]){
    const r=run(x,z,2,dx,dz),at=frame(r.s.car.pos);assert.ok(r.s.hits>0,'the solid wall registers contact');assert.ok((at[axis]-wall)*side>0,'car stays outside');
  }
});

test('the park, frontage, furniture and signs remain one disposable batched mesh',t=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
  let plaza;const scene=new T.Scene();
  try{
    let collision=0;plaza=createTownPlaza(scene,{addTri(){collision++;}});const meshes=[];plaza.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
    assert.equal(meshes.length,1);assert.equal(collision,buildPlaza().length);assert.ok(!Array.isArray(meshes[0].material));
    const p=meshes[0].geometry.attributes.position;for(const v of p.array)assert.ok(Number.isFinite(v));
    t.diagnostic(`${collision} collision triangles; ${p.count/3} rendered triangles including signs; 1 mesh`);
  }finally{plaza?.dispose();globalThis.document=old;}
  assert.equal(scene.children.length,0);
});

test('the tape is on the roof, unreachable by driving beneath it',()=>{
  const r=run(18,-5.5,1.3,0,-1);assert.ok(r.sk.tape,'a car on the awning collects the tape');
  const s=createSession(course,{mode:'kid'});s.roam=true;placeCar(s.car,plazaWorld([18,.08+rideHeight(),-4.5]),0);
  const sk=createSkate(PLAZA_PARK);for(let f=0;f<50;f++){stepSession(s,{throttle:1},1/120);stepSkate(sk,s,{throttle:1},1/120,frame);}assert.equal(sk.tape,false);
});


test('held throttle grinds both long granite tiers, transfers the gap and banks the combo',t=>{
  const r=run(-10.5,0,5.5);clean(r);
  assert.deepEqual(r.grinds,['tier-upper-a','tier-upper-b']);assert.ok(r.gaps.includes('LEDGE TO LEDGE'));
  assert.ok(r.sk.goals.has('combo'));assert.ok(r.sk.score>4500);assert.ok(r.events.filter(e=>e.type==='trick'&&e.name==='50-50').length===2);
  t.diagnostic(`ledge transfer: ${r.sk.score} points, ${r.sk.best} tricks; High is one fountain air, Pro needs another line, Sick needs linked tricks`);
  assert.ok(r.sk.score<PLAZA_PARK.goals.find(g=>g.id==='pro').score);
});

test('held throttle from the stair bank catches a handrail and exits cleanly',()=>{
  for(const [x,z,id] of [[-32.2,6,'big-four-w'],[25.8,8,'east-three-w']]){
    const r=run(x,z,4);clean(r);assert.deepEqual(r.grinds,[id]);
    assert.ok(r.events.some(e=>e.type==='trick'&&e.name==='50-50'));assert.ok(r.sk.score>100);assert.equal(r.s.skateRide.active,null);
  }
});


test('linking the ledges with held grab/manual earns Sick Score in a real driven line',t=>{
  const r=run(-10.5,0,7,0,1,1,true);clean(r);
  for(const id of ['high','pro','sick','combo'])assert.ok(r.sk.goals.has(id),id);
  assert.deepEqual(r.grinds,['tier-upper-a','tier-upper-b']);assert.ok(r.sk.left>110);
  t.diagnostic(`grab/manual ledge line: ${r.sk.score} points, ${r.sk.best} tricks`);
});
