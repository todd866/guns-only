// Racing-line audit: for every race, build the guide exactly as main.js does and report its
// length, a sprint's bogus closing segment, and samples draped far from the route height.
import fs from 'node:fs';
import * as T from '../../../web/wwwroot/vendor/three.module.js';
const RC=new URL('../../../web/wwwroot/rc/',import.meta.url);
globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url),RC)));
globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
const {loadOpenWorld}=await import(new URL('open-world/runtime.js',RC));
const {buildLandmarks}=await import(new URL('open-world/landmarks.js',RC));
const {createRace}=await import(new URL('physics/race.mjs',RC));
const {createRacingLine}=await import(new URL('visuals.js',RC));
const {RACE_EVENTS,eventLaps}=await import(new URL('open-world/catalog.mjs',RC));
const only=process.argv[2]?.split(',');
for(const e of RACE_EVENTS.filter(e=>!e.battle&&e.kind!=='arena'&&(!only||only.includes(e.id)))){
 try{
  const world=await loadOpenWorld('?event='+e.id+'&mode=race');buildLandmarks(new T.Scene(),world.stream.world,world.progress,world.overview.roads);
  const course=world.course;await world.stream.update(course.start.pos);
  for(const a of course.ai.filter((_,i)=>i%25===0))await world.stream.update(a.pos);
  const race=createRace({...course,laps:eventLaps(e)},{mode:'kid',opponents:0}),line=race.line;
  const close=Math.hypot(line.at(-1)[0]-line[0][0],line.at(-1)[1]-line[0][1]);
  const closed=e.kind!=='sprint',g=createRacingLine(new T.Scene(),line,course.world,{closed});const pos=g.mesh.geometry.attributes.position;
  // Height check: each drawn vertex vs the nearest route node's ground height.
  const ground=course.ai.map(a=>[a.pos[0],a.pos[2],course.world.raycast([a.pos[0],(a.pos[1]??0)+1.2,a.pos[2]],[0,-1,0],4)?.point[1]??(a.pos[1]??0)]);
  let high=0,worst=0,n=0;for(let i=0;i<pos.count;i+=6){n++;const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);let b=ground[0],bd=1e9;for(const q of ground){const d=(q[0]-x)**2+(q[1]-z)**2;if(d<bd){bd=d;b=q;}}const dy=y-b[2];if(Math.abs(dy)>0.6)high++;worst=Math.max(worst,Math.abs(dy));}
  console.log(JSON.stringify({event:e.id,kind:e.kind??'circuit',nodes:line.length,closingGapM:+close.toFixed(1),drawnClosed:closed,offRouteHeightPct:+(100*high/n).toFixed(1),worstDy:+worst.toFixed(2)}));
  world.stream.dispose?.();
 }catch(err){console.log(JSON.stringify({event:e.id,error:String(err?.message??err).slice(0,120)}));}
}
