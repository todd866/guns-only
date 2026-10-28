import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createStream } from './stream.mjs';
import { createSession, stepSession } from '../physics/session.mjs';
import { placeCar, rideHeight } from '../physics/car.mjs';
import { createSkate, stepSkate } from '../physics/skate.mjs';
import { PLAZA, PLAZA_PARK, PLAZA_BOUNDS, buildPlaza, plazaWorld, plazaLocal } from './town-plaza.mjs';
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
function run(x,z,seconds,dx=0,dz=1,throttle=1) {
  const s=createSession(course,{mode:'kid'});s.roam=true;
  placeCar(s.car,plazaWorld([x,height(x,z)+rideHeight()+.01,z]),Math.atan2(dx,-dz));
  const sk=createSkate(PLAZA_PARK),events=[],grinds=new Set(),landings=[];let peak=0;
  for(let f=0;f<seconds*120;f++){stepSession(s,{throttle,steer:0},1/120);const air=sk.air;events.push(...stepSkate(sk,s,{throttle},1/120,frame));if(s.skateRide?.active)grinds.add(s.skateRide.active.rail.id);if(air&&!sk.air&&air.time>.3)landings.push({from:air.from,to:frame(s.car.pos)});peak=Math.max(peak,frame(s.car.pos)[2]);}
  return {s,sk,events,peak,grinds:[...grinds],landings,gaps:events.filter(e=>e.type==='gap').map(e=>e.name)};
}
const clean = r => { assert.equal(r.s.hits,0,'no wall strikes');assert.equal(r.s.recoveries,0,'no automatic rescues');assert.equal(r.events.filter(e=>e.type==='bail').length,0,'no bails'); };

test('the civic plaza fits the main-gate town streets, outside housing, roads and existing buildings',()=>{
  const b=PLAZA_BOUNDS,ring=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]];
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
  const checks=[[-18,-7.5,.12],[-18,-10.3,.7],[-18,-13, .08+(1.2-.08)/3],[-18,-2,.08],
    [0,-8,.55],[0,-12, .08+(1.2-.08)*2/3],[18,-5,1.5],[18,1,.08+(1.5-.08)*3/7],
    [-32.2,16,1.43],[25.8,16,1.18],[-29,15,1.08],[-29,20.3,.83],[-29,21,.58],[-29,21.8,.33],[29,15,.83],[29,20.3,.58],[29,21,.33],
    [-9,10,.83],[-9,13.5,1.09],[-9,20,.63],[-6,10,.48],[-6,20,.28],[7,16,.62],[7,11.5,.59],[17,22,.62]];
  for(const [x,z,h] of checks)assert.ok(Math.abs(height(x,z)-h)<.025,`${x},${z}: ${height(x,z)} != ${h}`);
});

test('all grind polylines sit on real upward-facing geometry within five centimetres',()=>{
  assert.ok(PLAZA_PARK.rails.length>=24);const ids=new Set();
  for(const rail of PLAZA_PARK.rails){assert.ok(!ids.has(rail.id));ids.add(rail.id);assert.ok(['rail','ledge','coping','edge'].includes(rail.kind));assert.ok(rail.pts.length>=2);
    for(let i=1;i<rail.pts.length;i++){
      const a=rail.pts[i-1],b=rail.pts[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*4);
      for(let j=0;j<=n;j++){const p=a.map((v,k)=>v+(b[k]-v)*j/n);assert.ok(Math.abs(height(p[0],p[1])-p[2])<=.05,`${rail.id} ${p}: ground ${height(p[0],p[1])}`);}
    }
  }
});

const lines=[
  ['FOUNTAIN GAP',-18,-27,5,'S'],['PLINTH HOP',0,-25,4,'K'],['OVER THE SUBWAY',18,-25,4.5,null],
  ['LEDGE TO LEDGE',-9,0,3.5,'A'],['THE BIG FOUR',-29,8,3,'T'],['EAST THREE',29,8,3,null],['PLANTER POP',7,0,4,'E'],
];
for(const [gap,x,z,seconds,letter]of lines)test(`held throttle from rest: ${gap}${letter?` and ${letter}`:''}`,()=>{
  const r=run(x,z,seconds);assert.ok(r.gaps.includes(gap),r.gaps.join(','));assert.deepEqual(r.grinds,[],'rails do not hijack the jump line');if(letter)assert.ok(r.sk.letters.includes(letter));clean(r);
  if(gap==='FOUNTAIN GAP'){assert.deepEqual(PLAZA_PARK.start,{at:[x,z],toward:[0,1]});assert.ok(r.peak>1.8);assert.ok(r.sk.score>=PLAZA_PARK.goals.find(g=>g.id==='high').score);}
  if(gap==='OVER THE SUBWAY'){assert.ok(r.sk.tape);assert.ok(r.sk.goals.has('subway'));assert.ok(r.landings.some(a=>a.to[1]>=-7&&a.to[1]<=-3&&a.to[2]>1.5),'lands on the subway awning');}
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
  for(const [x,id] of [[-32.2,'big-four-w'],[25.8,'east-three-w']]){
    const r=run(x,8,4);clean(r);assert.deepEqual(r.grinds,[id]);
    assert.ok(r.events.some(e=>e.type==='trick'&&e.name==='50-50'));assert.ok(r.sk.score>100);assert.equal(r.s.skateRide.active,null);
  }
});
