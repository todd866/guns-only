// Every 10 s of one race: player and each rival's progress (lap.gate), speed and distance to the player.
// node tools/rc/experiments/race-trace.mjs <event> [mode] [skill]
import fs from 'node:fs';
import * as T from '../../../web/wwwroot/vendor/three.module.js';
const RC=new URL('../../../web/wwwroot/rc/',import.meta.url);
globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url),RC)));
globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
const {loadOpenWorld}=await import(new URL('open-world/runtime.js',RC));
const {buildLandmarks}=await import(new URL('open-world/landmarks.js',RC));
const {createRace,stepRace,driveInput,packFactor,kidFinish,raceDistance}=await import(new URL('physics/race.mjs',RC));
const {eventById,eventLaps}=await import(new URL('open-world/catalog.mjs',RC));
const [id,mode='kid',skill='.5']=process.argv.slice(2);
const world=await loadOpenWorld('?event='+id+'&mode=race');buildLandmarks(new T.Scene(),world.stream.world,world.progress,world.overview.roads);
const race=createRace({...world.course,laps:eventLaps(eventById(id))},{mode,opponents:7}),s=race.player,pilot={session:s,skill:Number(skill),node:0};
console.log('line nodes',race.line.length,'rival skills',race.rivals.map(r=>r.skill).join(' '));
for(let i=0;i<120*400&&!s.finished;i++){
 if(i%120===0)await world.stream.update(s.car.pos);
 stepRace(race,{...driveInput(race,pilot),...(process.env.FLOOR?{throttle:1}:{}),fire:race.pickups.held.has(s.car)&&i%240===0},1/120);
 for(const r of race.rivals.slice(0,1)){if(r.session.gate!==r.lastG){r.lastG=r.session.gate;console.log(`  ${r.callsign} t${s.time.toFixed(1)} -> gate ${r.session.lap}.${r.session.gate} at ${r.session.car.pos.map(v=>v.toFixed(0)).filter((_,k)=>k!==1)} node ${r.node}`);}}
 if(i%(120*(Number(process.env.EVERY)||10))===0&&i){const p=s.car.pos;console.log(`kidFinish=${kidFinish(race)} mode=${race.mode} roam=${race.roam} furball=${!!race.furball} laps=${s.laps} dist=${raceDistance(s).toFixed(0)}/${race.courseLength?.toFixed(0)}`);console.log(`t${(i/120).toFixed(0)} you ${s.lap}.${s.gate} ${s.car.speed.toFixed(1)}m/s pace ${race.pace.toFixed(1)} held ${race.pickups.held.get(s.car)??"-"} | `+race.rivals.map(r=>`${r.callsign?.slice(0,4)} ${r.session.lap}.${r.session.gate} ${r.session.car.speed.toFixed(1)} ${race.pickups.held.get(r.session.car)??""}${(raceDistance(r.session)-raceDistance(s)).toFixed(1)}d ${Math.round(Math.hypot(r.session.car.pos[0]-p[0],r.session.car.pos[2]-p[2]))}m`).join(' | '));}
}
console.log('finished',s.finished,s.time.toFixed(1));
