import {buildCorridorArt} from './corridor-art.js';
import {prepareResidentialCivic} from './residential-civic.js';
import {buildResidentialSchool} from './residential-school.js';
import {prepareResidential} from './residential-art.js';
import {prepareResidentialPark} from './residential-park.js';
import {prepareResidentialYards} from './residential-yards.js';
import {residentialRace} from './residential-course.mjs';
import {prepareResidentialDetails} from './residential-details.js';
import {residentialRoads,residentialNavigationRoads,RESIDENTIAL_LINK} from './residential-roads.mjs';
import {RESIDENTIAL_START,RESIDENTIAL_PARK,RESIDENTIAL_BOUNDS,inResidential,parkPoint} from './residential-frame.mjs';
import {ARRIVAL_START} from './arrival-frame.mjs';
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
import {createResidentialTerrain,boundsOfPoints} from './residential-terrain.mjs';
import {createTileRenderer} from './render.js';
import {buildLandmarks} from './landmarks.js';
import {LOCATIONS,EVENTS,locationById,eventById,eventCourse,loadProgress,saveProgress,discover,distance,nearestLocation,rcLink,recordFinish,SPECIMENS,canEnter,canEnterEvent,alienWorldUnlocked,collectSpecimens,expedition} from './catalog.mjs';
import {WORLD_LINKS,buildRoadGraph,roadRoute,recoveryPoint} from './navigation.mjs';
export async function loadOpenWorld(search){const q=new URLSearchParams(search),get=async name=>{const r=await fetch(`./assets/world/${name}`);if(!r.ok)throw Error(`World data unavailable (${r.status})`);return r.json();};const [manifest,overview,terrainData,elevation,residentialData,residentialTerrainData]=await Promise.all([get('manifest.json'),get('overview.json'),get('terrain.json'),get('playable-terrain.json'),get('residential.json'),get('residential-terrain.json')]);
 // The park collider is authored around the course anchor, rather than the
 // legacy civic polygon. Keep a ±20 m driving pad plus an 8 m apron.
 const parkPad=boundsOfPoints([parkPoint([-28,0,-28]),parkPoint([-28,0,28]),parkPoint([28,0,28]),parkPoint([28,0,-28])].map(p=>[p[0],p[2]]));
 const rawTerrain=createResidentialTerrain(residentialTerrainData,{bounds:RESIDENTIAL_BOUNDS,edgeFeather:128});
 const buildingPads=residentialData.buildings.filter(b=>b.kind==='school'||b.kind==='civic').map(b=>{const bounds=boundsOfPoints(b.points);if(!bounds)return null;const center=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];return {bounds,datum:rawTerrain.rawHeightAt(...center),feather:25};}).filter(Boolean);
 const defaultPads=[...(parkPad?[{bounds:parkPad,datum:0,feather:50}]:[]),...buildingPads];
 const residentialTerrain=createResidentialTerrain(residentialTerrainData,{bounds:RESIDENTIAL_BOUNDS,edgeFeather:128,pads:residentialTerrainData.pads??defaultPads});overview.bounds=[...BOUNDS];overview.residential=residentialData;overview.roads=residentialRoads(overview.roads,residentialData);overview.roads.push(...WORLD_LINKS);
 let storage;try{storage=localStorage;}catch{}const progress=loadProgress(storage),explicitEntry=q.has('event')||q.has('from')||q.has('at'),requested=eventById(q.get('event')),requestedPlace=requested&&locationById(requested.location),requestedBlocked=!!requested&&!canEnterEvent(progress,requested),locked=requestedBlocked&&requested?.location==='lab',defaultEvent=eventById('district-skatepark')??EVENTS[0],selected=requestedBlocked?EVENTS[0]:requested??(q.get('at')==='skatepark'||q.get('from')==='skatepark'?defaultEvent:explicitEntry?EVENTS[0]:defaultEvent),rawAt=locationById(q.get('from')??q.get('at')),safeAt=rawAt&&canEnter(progress,rawAt)?rawAt:null,at=safeAt??locationById(locked?'lab':requestedBlocked?'gate':q.has('event')?selected.location:explicitEntry?'gate':selected.location);
 const navigationRoads=residentialNavigationRoads(overview.roads);let render=null,terrain=null,activities=null,residentialSchool=null;const stream=createStream({manifest,elevation,residentialTerrain,fetchTile:key=>get(`tile-${key.replace(',','-')}.json`),onLoad:(key,t)=>render?.load(key,t),onDrop:key=>render?.drop(key)});const residentialPark=prepareResidentialPark(stream.world,residentialData,{terrain:residentialTerrain}),residentialYards=prepareResidentialYards(stream.world,residentialData,{terrain:residentialTerrain});const residentialCivic=prepareResidentialCivic(stream.world,residentialData,{terrain:residentialTerrain});const residentialDetails=prepareResidentialDetails(stream.world,residentialData,{terrain:residentialTerrain});const residential=prepareResidential(stream.world,{...residentialData,roads:[...residentialData.roads,RESIDENTIAL_LINK]},{terrain:residentialTerrain});
 // These independent startup jobs overlap network and parsing work. The stream remains the
 // readiness gate, while the district promise supplies collision before a course is exposed.
 // Node-side physics/content tests have no DOM; leave the optional hero cache for attach there.
 // In the browser this starts the independent downloads before the renderer waits on the world.
 const heroesReady=typeof document==='undefined'?Promise.resolve(false):prepareHeroes(),districtsReady=prepareDistricts(stream.world),streamReady=stream.update(at.pos);
 // Observe both startup jobs together so an early district failure cannot leave a later stream
 // rejection unhandled. This keeps the existing fail-closed error path while overlapping work.
 const [districts]=await Promise.all([districtsReady,streamReady]);if(!stream.ready(at.pos))throw Error('The base did not finish downloading. Please reload.');
 const course=selected.id==='district-skatepark'?residentialRace(selected,stream.world,eventCourse,residentialTerrain):selected.district?{...districts.courses.get(selected.district),event:selected}:eventCourse(selected,stream.world);course.recoveryPoint=pos=>{if(selected.id==='district-skatepark'&&q.get('mode')==='race'){const nodes=course.ai,i=nodes.reduce((best,n,k)=>Math.hypot(n.pos[0]-pos[0],n.pos[2]-pos[2])<Math.hypot(nodes[best].pos[0]-pos[0],nodes[best].pos[2]-pos[2])?k:best,0),p=nodes[i].pos,next=nodes[(i+1)%nodes.length].pos;return {pos:[...p],groundY:p[1],yaw:Math.atan2(next[0]-p[0],-(next[2]-p[2]))};}if(Math.hypot(pos[0]-RESIDENTIAL_PARK.anchor[0],pos[2]-RESIDENTIAL_PARK.anchor[2])<45)return {...RESIDENTIAL_START,groundY:.14};if(inResidential(pos)){const safe=recoveryPoint(navigationRoads,pos),terrainY=residentialTerrain.heightAt(safe.pos[0],safe.pos[2]),hit=stream.world.raycast([safe.pos[0],terrainY+2,safe.pos[2]],[0,-1,0],4);return {...safe,groundY:hit?.point[1]??terrainY};}if(pos[0]>9000||(selected.battle&&Math.hypot(pos[0]-selected.points[0][0],pos[2]-selected.points[0][1])<150)){const nodes=(selected.battle?[selected]:EVENTS.filter(e=>e.alien)).flatMap(e=>eventCourse(e,stream.world).ai);const i=nodes.reduce((best,n,k)=>Math.hypot(n.pos[0]-pos[0],n.pos[2]-pos[2])<Math.hypot(nodes[best].pos[0]-pos[0],nodes[best].pos[2]-pos[2])?k:best,0),p=nodes[i].pos,q=nodes[(i+1)%nodes.length].pos;return {pos:p,groundY:p[1]+.04,yaw:Math.atan2(q[0]-p[0],-(q[2]-p[2]))};}for(const id of Object.keys(DISTRICT_ZONES)){const b=districtBounds(id);if(pos[0]<b[0]||pos[0]>b[2]||pos[2]<b[1]||pos[2]>b[3])continue;const nodes=districts.courses.get(id).ai,i=nodes.reduce((best,n,k)=>Math.hypot(n.pos[0]-pos[0],n.pos[2]-pos[2])<Math.hypot(nodes[best].pos[0]-pos[0],nodes[best].pos[2]-pos[2])?k:best,0),p=nodes[i].pos,q=nodes[(i+1)%nodes.length].pos,hit=stream.world.raycast([p[0],p[1]+.7,p[2]],[0,-1,0],2);return {pos:p,groundY:hit?.point[1]??p[1],yaw:Math.atan2(q[0]-p[0],-(q[2]-p[2]))};}const safe=recoveryPoint(navigationRoads,pos);return {...safe,groundY:elevationAt(elevation,safe.pos[0],safe.pos[2])};};if(!q.has('event')||locked)course.start=at.id==='gate'?{pos:[...ARRIVAL_START.pos],yaw:ARRIVAL_START.yaw}:{pos:[at.pos[0],0,at.pos[2]+6],yaw:0};
 // The fresh open-world arrival uses the authored residential skatepark start. Explicit URLs
 // retain their requested entrance or race grid behavior.
 if((!q.has('event')||locked)&&at.id==='skatepark')course.start={pos:[...RESIDENTIAL_START.pos],yaw:RESIDENTIAL_START.yaw};
 // World challenge coins sit at landmarks, outside the rings. Discovery and coins are distinct.
 const eventBounds=course.outOfBounds;course.outOfBounds=pos=>(pos[0]>9000&&pos[1]<-3)||!!eventBounds?.(pos);
 course.coins=LOCATIONS.map(p=>({name:`WORLD_${p.id}`,x:p.pos[0]+4,y:.15,z:p.pos[2]+2}));course.secrets=SPECIMENS;
 let golf=null,golfVisual=null,bowlingVisual=null;const portal=createPortalTransition();let portalBusy=false;
 let corridor,landmarks,route=[],target=null,lastTile='',lastRoute=0,trafficAt=null;const graph=buildRoadGraph(navigationRoads);
 const routeFor=(pos,p)=>{const exit=districtExitRoute(pos,districts.courses);return [...exit.slice(0,-1),...roadRoute(graph,exit.at(-1),[p.pos[0],p.pos[2]])];};
 const api={lighting(day,pos){terrain?.update(day,pos[0]>9000);render?.update(day);corridor?.update(day,pos,render?.fixtures()??[]);},async portal(pos,time){if(portalBusy)return null;const trip=portal.step(pos,canEnter(progress,locationById('night-wave')),time);if(!trip)return null;portalBusy=true;try{if(!await stream.prepare(trip.position))return null;await stream.update(trip.position);if(!stream.ready(trip.position))return null;golf=null;target=null;route=[];return trip;}finally{portalBusy=false;}},step(car,dt){activities?.step(car,dt);},traffic(race){landmarks?.setRacing(!race.roam);if(!race.roam||Math.hypot(race.player.car.pos[0]-RESIDENTIAL_PARK.anchor[0],race.player.car.pos[2]-RESIDENTIAL_PARK.anchor[2])>40)trafficAt=updateTraffic(race,overview.roads,stream,trafficAt);},course,stream,residentialTerrain,overview,progress,selected,locked,at,search,activity:()=>golf,
  districtAt(pos){if(Math.hypot(pos[0]-RESIDENTIAL_PARK.anchor[0],pos[2]-RESIDENTIAL_PARK.anchor[2])<40)return {id:'skatepark',course:districts.courses.get('skatepark')};for(const id of Object.keys(DISTRICT_ZONES)){const b=districtBounds(id);if(pos[0]>=b[0]&&pos[0]<=b[2]&&pos[2]>=b[1]&&pos[2]<=b[3])return {id,course:districts.courses.get(id)};}return null;},
  startActivity(kind){golf=kind==='bowling'?createBowling():createGolf();return kind==='bowling'?BOWLING_TEE:golfTee(golf);},resetActivity(){if(!golf)return null;const tee=golf.kind==='bowling'?nextDelivery(golf):resetGolf(golf);if(golf.kind==='bowling'&&golf.done){progress.bowlingBest=Math.max(progress.bowlingBest,golf.score);saveProgress(storage,progress);}return tee;},
  stepActivity(dt,car){if(!golf)return null;const event=golf.kind==='bowling'?stepBowling(golf,car,dt):stepGolf(golf,car,dt);if(event?.cancelled){golf=null;return event;}if(event?.finished){if(golf.kind==='bowling')progress.bowlingBest=Math.max(progress.bowlingBest,event.score);else progress.golfBest=Math.min(progress.golfBest??Infinity,event.total);saveProgress(storage,progress);}return event;},route:()=>route,target:()=>target,
  async attach(scene){await heroesReady;terrain=createTerrain(scene,terrainData,BOUNDS);await districts.attach(scene);residential.attach(scene);residentialPark.attach(scene);residentialYards.attach(scene);residentialCivic.attach(scene);residentialSchool=buildResidentialSchool(scene,residentialData,{terrain:residentialTerrain});await residentialDetails.attach(scene);bowlingVisual=createBowlingVisual(scene);golfVisual=createGolfVisual(scene);render=createTileRenderer(scene,elevation,residentialTerrain);for(const [k,t]of stream.loaded){render.load(k,t);}activities=buildActivities(scene,stream.world,{alienUnlocked:()=>alienWorldUnlocked(progress)});landmarks=buildLandmarks(scene,stream.world,progress,overview.roads,heroTemplate('landmarks'));corridor=buildCorridorArt(scene);},
  update(time,pos,camera,onDiscover){landmarks?.update(time,pos,camera);activities?.update(time,pos);golfVisual?.update(golf?.kind==='golf'?golf:null);bowlingVisual?.update(golf);const key=pos.map((v,i)=>i===1?0:Math.floor(v/64)).join(',');if(key!==lastTile||stream.errors.size){lastTile=key;stream.update(pos);}for(const p of discover(progress,pos)){saveProgress(storage,progress);onDiscover?.(p);}if(target&&time-lastRoute>4){lastRoute=time;route=routeFor(pos,target);}},
  navigate(id,pos){const next=locationById(id);target=next&&canEnter(progress,next)?next:null;if(target)route=routeFor(pos,target);},
  near:pos=>{const p=nearestLocation(pos);return distance(pos,p.pos)<9?p:null;},
  async travel(id){const p=locationById(id);if(!p||!canEnter(progress,p))return null;
   const start=p.id==='skatepark'?RESIDENTIAL_START:p.id==='gate'?ARRIVAL_START:p.track&&districts.courses.has(p.track)?districts.courses.get(p.track).start:p.event?eventCourse(eventById(p.event),stream.world).start:{pos:[p.pos[0],p.pos[1],p.pos[2]+6],yaw:0};
   const pos=[...start.pos];if(!await stream.prepare(pos))return null;await stream.update(pos);if(!stream.ready(pos))return null;
   const datum=inResidential(pos)?residentialTerrain.heightAt(pos[0],pos[2]):elevationAt(elevation,pos[0],pos[2]),height=Math.max(pos[1],datum),hit=stream.world.raycast([pos[0],height+1,pos[2]],[0,-1,0],3);if(!hit)return null;
   pos[1]=hit.point[1];golf=null;target=null;route=[];lastTile='';return {...p,arrival:{pos,yaw:start.yaw}};},
  collect(seen){const before=expedition(progress),found=collectSpecimens(progress,seen);if(found.length)saveProgress(storage,progress);return {found,unlocked:!before.unlocked&&expedition(progress).unlocked};},
  save(){saveProgress(storage,progress);},finish(time){recordFinish(progress,selected.id,time);saveProgress(storage,progress);},
  eventURL(p,kind='race'){if(!canEnter(progress,p))return rcLink({track:'hub',at:p.id},search);return rcLink({track:'hub',event:p.event??(p.track?'district-'+p.track:'ramp-rat'),mode:kind},search);},
  dispose(){corridor?.dispose();residentialPark.dispose();residentialYards.dispose();residentialSchool?.dispose();residentialCivic.dispose();residentialDetails.dispose();residential.dispose();activities?.dispose();terrain?.dispose();districts.dispose();stream.dispose();render?.dispose();landmarks?.dispose();golfVisual?.dispose();bowlingVisual?.dispose();}
 };return api;
}
