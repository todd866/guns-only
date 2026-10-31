import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {createWorld} from '../physics/world.mjs';
import {buildResidentialArt} from './residential-art.js';
import {RESIDENTIAL_START,RESIDENTIAL_PARK,RESIDENTIAL_BOUNDS} from './residential-frame.mjs';
import {residentialRace} from './residential-course.mjs';
import {eventCourse,eventById} from './catalog.mjs';
import {courseFromGlb} from '../physics/district.mjs';
import {placeDistrictCourse} from './district-placement.mjs';
import {createRace} from '../physics/race.mjs';
import {createCar,stepCar,rideHeight} from '../physics/car.mjs';
import {RESIDENTIAL_LINK} from './residential-roads.mjs';
import {buildResidentialSchool} from './residential-school.js';
const data=JSON.parse(fs.readFileSync(new URL('../assets/world/residential.json',import.meta.url)));
test('metre-scale neighbourhood supports park, starter grid and complete path circuit',()=>{
 const world=createWorld(),scene=new T.Scene(),art=buildResidentialArt(scene,world,data);
 try{
  assert.deepEqual(data.bounds,RESIDENTIAL_BOUNDS);assert.ok(data.bounds[2]-data.bounds[0]>1000);
  const buffer=fs.readFileSync(new URL('../assets/districts/skatepark.glb',import.meta.url)),park=placeDistrictCourse(courseFromGlb(buffer),RESIDENTIAL_PARK);
  for(const t of park.world.tris)world.addTri(t.a,t.b,t.c,t.surface);
  const supported=p=>{const hit=world.raycast([p[0],p[1]+.5,p[2]],[0,-1,0],1);assert.ok(hit&&hit.normal[1]>.85,`supported driving surface at ${p}`);return hit;};
  const floor=supported(RESIDENTIAL_START.pos);assert.ok(Math.abs(floor.point[1]-.14)<.01);
  const course=residentialRace(eventById('district-skatepark'),world,eventCourse);
  for(const node of course.ai)supported(node.pos);
  for(const slot of course.grid)supported(slot.pos);
  const race=createRace(course,{opponents:7});assert.equal(race.rivals.length,7);
  assert.ok(Math.hypot(race.player.car.pos[0]-course.start.pos[0],race.player.car.pos[2]-course.start.pos[2])<4);
  const roam=createRace({...course,start:RESIDENTIAL_START},{opponents:7,roam:true});
  assert.ok(roam.rivals.every(r=>Math.hypot(r.session.car.pos[0]-roam.player.car.pos[0],r.session.car.pos[2]-roam.player.car.pos[2])>20),'free-drive arrival is not piled into the race grid');
 }finally{art.dispose();}
});
test('school courtyard remains open and both exterior and courtyard walls face drivers',()=>{
 const school=data.buildings.find(b=>b.kind==='school'&&b.holes?.length===1);assert.ok(school);
 const world=createWorld(),scene=new T.Scene(),art=buildResidentialArt(scene,world,{bounds:data.bounds,roads:[],buildings:[school]}),details=buildResidentialSchool(scene,{buildings:[school]});
 try{
  const hole=school.holes[0],center=hole.reduce((s,p)=>[s[0]+p[0]/hole.length,s[1]+p[1]/hole.length],[0,0]);
  scene.updateMatrixWorld(true);const ray=new T.Raycaster(new T.Vector3(center[0],20,center[1]),new T.Vector3(0,-1,0));
  const hits=ray.intersectObjects(scene.children,true);assert.ok(hits.length);assert.ok(hits[0].point.y<.1,'roof must not seal the courtyard');
  for(const [ring,holeSide]of [[school.points,false],[hole,true]]){
   // Edge 1 of each ring is solid; edge 0 of each holds a door into the high school (high-school.mjs), checked below.
   const a=ring[1],b=ring[2],area=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0),sign=(area>0?1:-1)*(holeSide?-1:1),dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz),nx=sign*dz/l,nz=-sign*dx/l,m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   assert.ok(world.raycast([m[0]+nx*.3,1,m[1]+nz*.3],[-nx,0,-nz],.5),'wall faces the accessible side');
  }
  // And the doors are open: drive straight through the middle of the pool door.
  {const ring=school.points,a=ring[0],b=ring[1],m=[(a[0]+b[0])/2,(a[1]+b[1])/2],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);
   for(const s of [1,-1])assert.equal(world.raycast([m[0]+s*dz/l*.4,1,m[1]-s*dx/l*.4],[-s*dz/l,0,s*dx/l],.8),null,'a door is an opening');}
 }finally{details.dispose();art.dispose();}
});

test('neighbourhood paths connect the park to the base road network',async()=>{
 const {residentialRoads,residentialNavigationRoads}=await import('./residential-roads.mjs');
 const {buildRoadGraph,roadRoute,recoveryPoint,WORLD_LINKS}=await import('./navigation.mjs');
 const base=JSON.parse(fs.readFileSync(new URL('../assets/world/overview.json',import.meta.url)));
 const roads=residentialNavigationRoads([...residentialRoads(base.roads,data),...WORLD_LINKS]);
 const start=[RESIDENTIAL_START.pos[0],RESIDENTIAL_START.pos[2]],end=[10.9,-552.3];
 const route=roadRoute(buildRoadGraph(roads),start,end);
 assert.ok(route.length>100,'connected multi-kilometre route, not a straight fallback');assert.deepEqual(route.at(-1),end);
 assert.ok(Math.hypot(route[1][0]-start[0],route[1][1]-start[1])<30,'starts on a nearby path');
 const path=data.roads.find(r=>r.kind==='footway'&&r.points.length>1),a=path.points[0],b=path.points[1];
 const pos=[(a[0]+b[0])/2,0,(a[1]+b[1])/2],recovered=recoveryPoint(roads,pos);
 assert.ok(Math.hypot(recovered.pos[0]-pos[0],recovered.pos[2]-pos[2])<.01,'recovery keeps a car on its local path');
});

test('runtime keeps plaza guidance separate from the nearby path race and recovers locally',async()=>{
 const {loadOpenWorld}=await import('./runtime.js');const previous=globalThis.fetch;
 globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url),new URL('../main.js',import.meta.url))));
 let roam,race;
 try{
  roam=await loadOpenWorld('');race=await loadOpenWorld('?event=district-skatepark&mode=race');
  assert.equal(race.course.checkpoints.length,7);
  assert.equal(race.course.checkpoints.at(-1)[2],'Finish');
  assert.deepEqual(race.course.checkpoints[0].slice(0,2),race.course.checkpoints.at(-1).slice(0,2),'ordered start and finish intentionally share the lap line');
  const guide=roam.districtAt(RESIDENTIAL_START.pos);
  assert.equal(guide.id,'skatepark');assert.notDeepEqual(guide.course.ai,race.course.ai,'plaza guidance is only used in free drive');
  const home=roam.course.recoveryPoint(RESIDENTIAL_START.pos);assert.equal(home.groundY,.14);
  const p=race.course.ai[20].pos,at=race.course.recoveryPoint(p);
  assert.ok(Math.hypot(at.pos[0]-p[0],at.pos[2]-p[2])<.01,'race recovery stays at its local path, not at the free-drive spawn');
  for(const ends of [RESIDENTIAL_LINK.points,[...RESIDENTIAL_LINK.points].reverse()]){
   const [a,b]=ends,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),car=createCar(undefined,[a[0],roam.residentialTerrain.heightAt(a[0],a[1])+rideHeight()+.05,a[1]],Math.atan2(dx,-dz));let along=0;
   for(let i=0;i<3600&&along<length;i++){if(i%120===0)await roam.stream.update(car.pos);stepCar(car,{throttle:.5,steer:0},roam.stream.world,1/120);along=((car.pos[0]-a[0])*dx+(car.pos[2]-a[1])*dz)/length;}
   assert.ok(along>=length,'ordinary inputs cross the base connector in both directions');
   assert.ok(Math.abs((car.pos[0]-a[0])*dz-(car.pos[2]-a[1])*dx)/length<1.5,'stays within the connector lane');
  }
 }finally{roam?.dispose();race?.dispose();globalThis.fetch=previous;}
});
