import {createPortalTransition} from './portal-transition.mjs';
import {buildActivities} from './activities.js';
import {elevationAt} from './elevation.mjs';
import {prepareHeroes,heroTemplate} from './hero-assets.js';
import {districtExitRoute} from './district-navigation.mjs';
import {DISTRICT_ZONES,districtBounds} from './district-zones.mjs';
import {createTerrain} from './terrain.js';
import {BOUNDS} from './catalog.mjs';
import {prepareDistricts} from './districts.js';
import {createBowling,stepBowling,nextDelivery,BOWLING_TEE} from './bowling.mjs';
import {createBowlingVisual} from './bowling.js';
import {createGolf,stepGolf,resetGolf,golfTee} from './golf.mjs';
import {createGolfVisual} from './golf.js';
import {updateTraffic} from './traffic.mjs';
import {createStream} from './stream.mjs';
import {createTileRenderer} from './render.js';
import {buildLandmarks} from './landmarks.js';
import {LOCATIONS,EVENTS,locationById,eventById,eventCourse,loadProgress,saveProgress,discover,distance,nearestLocation,rcLink,recordFinish,SPECIMENS,canEnter,collectSpecimens,expedition} from './catalog.mjs';
import {WORLD_LINKS,buildRoadGraph,roadRoute,recoveryPoint} from './navigation.mjs';
export async function loadOpenWorld(search){const q=new URLSearchParams(search),get=async name=>{const r=await fetch(`./assets/world/${name}`);if(!r.ok)throw Error(`World data unavailable (${r.status})`);return r.json();};const [manifest,overview,terrainData,elevation]=await Promise.all([get('manifest.json'),get('overview.json'),get('terrain.json'),get('playable-terrain.json')]);overview.roads.push(...WORLD_LINKS);
 let storage;try{storage=localStorage;}catch{}const progress=loadProgress(storage),requested=eventById(q.get('event')),locked=requested?.location==='lab'&&!canEnter(progress,locationById('lab')),selected=locked?EVENTS[0]:requested??EVENTS[0],at=locationById(q.get('from')??q.get('at'))??locationById(locked?'lab':q.has('event')?selected.location:'gate');
 let render=null,terrain=null,activities=null;const stream=createStream({manifest,elevation,fetchTile:key=>get(`tile-${key.replace(',','-')}.json`),onLoad:(key,t)=>render?.load(key,t),onDrop:key=>render?.drop(key)});const districts=await prepareDistricts(stream.world);await stream.update(at.pos);if(!stream.ready(at.pos))throw Error('The base did not finish downloading. Please reload.');
 const course=selected.district?{...districts.courses.get(selected.district),event:selected}:eventCourse(selected,stream.world);course.recoveryPoint=pos=>{if(pos[0]>9000||(selected.battle&&Math.hypot(pos[0]-selected.points[0][0],pos[2]-selected.points[0][1])<150)){const nodes=(selected.battle?[selected]:EVENTS.filter(e=>e.alien)).flatMap(e=>eventCourse(e,stream.world).ai);const i=nodes.reduce((best,n,k)=>Math.hypot(n.pos[0]-pos[0],n.pos[2]-pos[2])<Math.hypot(nodes[best].pos[0]-pos[0],nodes[best].pos[2]-pos[2])?k:best,0),p=nodes[i].pos,q=nodes[(i+1)%nodes.length].pos;return {pos:p,groundY:p[1]+.04,yaw:Math.atan2(q[0]-p[0],-(q[2]-p[2]))};}for(const id of Object.keys(DISTRICT_ZONES)){const b=districtBounds(id);if(pos[0]<b[0]||pos[0]>b[2]||pos[2]<b[1]||pos[2]>b[3])continue;const nodes=districts.courses.get(id).ai,i=nodes.reduce((best,n,k)=>Math.hypot(n.pos[0]-pos[0],n.pos[2]-pos[2])<Math.hypot(nodes[best].pos[0]-pos[0],nodes[best].pos[2]-pos[2])?k:best,0),p=nodes[i].pos,q=nodes[(i+1)%nodes.length].pos,hit=stream.world.raycast([p[0],p[1]+.7,p[2]],[0,-1,0],2);return {pos:p,groundY:hit?.point[1]??p[1],yaw:Math.atan2(q[0]-p[0],-(q[2]-p[2]))};}const safe=recoveryPoint(overview.roads,pos);return {...safe,groundY:elevationAt(elevation,safe.pos[0],safe.pos[2])};};if(!q.has('event')||locked)course.start={pos:[at.pos[0],0,at.pos[2]+6],yaw:0};
 // World challenge coins sit at landmarks, outside the rings. Discovery and coins are distinct.
 const eventBounds=course.outOfBounds;course.outOfBounds=pos=>(pos[0]>9000&&pos[1]<-3)||!!eventBounds?.(pos);
 course.coins=LOCATIONS.map(p=>({name:`WORLD_${p.id}`,x:p.pos[0]+4,y:.15,z:p.pos[2]+2}));course.secrets=SPECIMENS;
 let golf=null,golfVisual=null,bowlingVisual=null;const portal=createPortalTransition();let portalBusy=false;
 let landmarks,route=[],target=null,lastTile='',lastRoute=0,trafficAt=null;const graph=buildRoadGraph(overview.roads);
 const routeFor=(pos,p)=>{const exit=districtExitRoute(pos,districts.courses);return [...exit.slice(0,-1),...roadRoute(graph,exit.at(-1),[p.pos[0],p.pos[2]])];};
 const api={lighting(day,pos){terrain?.update(day,pos[0]>9000);},async portal(pos,time){if(portalBusy)return null;const trip=portal.step(pos,canEnter(progress,locationById('lab')),time);if(!trip)return null;portalBusy=true;try{if(!await stream.prepare(trip.position))return null;await stream.update(trip.position);if(!stream.ready(trip.position))return null;golf=null;target=null;route=[];return trip;}finally{portalBusy=false;}},step(car,dt){activities?.step(car,dt);},traffic(race){landmarks?.setRacing(!race.roam);trafficAt=updateTraffic(race,overview.roads,stream,trafficAt);},course,stream,overview,progress,selected,locked,at,search,activity:()=>golf,
  districtAt(pos){for(const id of Object.keys(DISTRICT_ZONES)){const b=districtBounds(id);if(pos[0]>=b[0]&&pos[0]<=b[2]&&pos[2]>=b[1]&&pos[2]<=b[3])return {id,course:districts.courses.get(id)};}return null;},
  startActivity(kind){golf=kind==='bowling'?createBowling():createGolf();return kind==='bowling'?BOWLING_TEE:golfTee(golf);},resetActivity(){if(!golf)return null;const tee=golf.kind==='bowling'?nextDelivery(golf):resetGolf(golf);if(golf.kind==='bowling'&&golf.done){progress.bowlingBest=Math.max(progress.bowlingBest,golf.score);saveProgress(storage,progress);}return tee;},
  stepActivity(dt,car){if(!golf)return null;const event=golf.kind==='bowling'?stepBowling(golf,car,dt):stepGolf(golf,car,dt);if(event?.cancelled){golf=null;return event;}if(event?.finished){if(golf.kind==='bowling')progress.bowlingBest=Math.max(progress.bowlingBest,event.score);else progress.golfBest=Math.min(progress.golfBest??Infinity,event.total);saveProgress(storage,progress);}return event;},route:()=>route,target:()=>target,
  async attach(scene){await prepareHeroes();terrain=createTerrain(scene,terrainData,BOUNDS);await districts.attach(scene);bowlingVisual=createBowlingVisual(scene);golfVisual=createGolfVisual(scene);render=createTileRenderer(scene,elevation);for(const [k,t]of stream.loaded){render.load(k,t);}activities=buildActivities(scene,stream.world);landmarks=buildLandmarks(scene,stream.world,progress,overview.roads,heroTemplate('landmarks'));},
  update(time,pos,camera,onDiscover){landmarks?.update(time,pos,camera);activities?.update(time,pos);golfVisual?.update(golf?.kind==='golf'?golf:null);bowlingVisual?.update(golf);const key=pos.map((v,i)=>i===1?0:Math.floor(v/64)).join(',');if(key!==lastTile||stream.errors.size){lastTile=key;stream.update(pos);}for(const p of discover(progress,pos)){saveProgress(storage,progress);onDiscover?.(p);}if(target&&time-lastRoute>4){lastRoute=time;route=routeFor(pos,target);}},
  navigate(id,pos){target=locationById(id);if(target)route=routeFor(pos,target);},
  near:pos=>{const p=nearestLocation(pos);return distance(pos,p.pos)<9?p:null;},
  async travel(id){const p=locationById(id);if(!p||!progress.discovered.includes(id))return null;if(!await stream.prepare(p.pos))return null;await stream.update(p.pos);if(!stream.ready(p.pos))return null;golf=null;return p;},
  collect(seen){const before=expedition(progress),found=collectSpecimens(progress,seen);if(found.length)saveProgress(storage,progress);return {found,unlocked:!before.unlocked&&expedition(progress).unlocked};},
  save(){saveProgress(storage,progress);},finish(time){recordFinish(progress,selected.id,time);saveProgress(storage,progress);},
  eventURL(p,kind='race'){if(!canEnter(progress,p))return rcLink({track:'hub',at:p.id},search);return rcLink({track:'hub',event:p.event??(p.track?'district-'+p.track:'ramp-rat'),mode:kind},search);},
  dispose(){activities?.dispose();terrain?.dispose();districts.dispose();stream.dispose();render?.dispose();landmarks?.dispose();golfVisual?.dispose();bowlingVisual?.dispose();}
 };return api;
}
