// Trace one race's player recoveries: where the car was, where recover() put it, which gate.
// node tools/rc/experiments/race-stuck.mjs <event> [mode] [skill] [seconds]
import fs from 'node:fs';
import * as T from '../../../web/wwwroot/vendor/three.module.js';
const RC=new URL('../../../web/wwwroot/rc/',import.meta.url);
globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url),RC)));
globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
const {loadOpenWorld}=await import(new URL('open-world/runtime.js',RC));
const {buildLandmarks}=await import(new URL('open-world/landmarks.js',RC));
const {createRace,stepRace,driveInput}=await import(new URL('physics/race.mjs',RC));
const [id,mode='kid',skill='.5',secs='240']=process.argv.slice(2);
const world=await loadOpenWorld('?event='+id+'&mode=race');buildLandmarks(new T.Scene(),world.stream.world,world.progress,world.overview.roads);
const race=createRace({...world.course,laps:3},{mode,opponents:7}),s=race.player,pilot={session:s,skill:Number(skill),node:0};
console.log('gates',JSON.stringify(world.course.checkpoints.map(c=>[Math.round(c[0]),Math.round(c[1]),c[2],c[3]])));
let rec=0,prev=[...s.car.pos];
for(let i=0;i<120*Number(secs)&&!s.finished;i++){
 if(i%120===0)await world.stream.update(s.car.pos);
 const before=[...s.car.pos],stuck=s.stuckTime;if(i%(120*5)===0&&s.car.speed<.3&&i>120*8){const near=race.rivals.map(r=>Math.hypot(r.session.car.pos[0]-s.car.pos[0],r.session.car.pos[2]-s.car.pos[2])).sort((a,b)=>a-b)[0];console.log('slow',JSON.stringify({t:+s.time.toFixed(0),lap:s.lap,gate:s.gate,node:pilot.node,pos:s.car.pos.map(v=>+v.toFixed(1)),nearestRival:+near.toFixed(1),rivals:race.rivals.map(r=>r.session.lap+':'+r.session.gate).join(' ')}));}if(pilot.session.recoveries!==(pilot.lastRec??0)){pilot.lastRec=pilot.session.recoveries;const [x,,z]=pilot.session.car.pos;pilot.node=race.line.reduce((b,p,k)=>Math.hypot(p[0]-x,p[1]-z)<Math.hypot(race.line[b][0]-x,race.line[b][1]-z)?k:b,0);}stepRace(race,{...driveInput(race,pilot),fire:process.env.FIRE&&race.pickups.held.has(s.car)&&i%240===0},1/120);
 if(s.recoveries!==rec){rec=s.recoveries;if(rec<=12||rec%50===0)console.log(JSON.stringify({t:+s.time.toFixed(1),rec,lap:s.lap,gate:s.gate,node:pilot.node,from:before.map(v=>+v.toFixed(1)),to:s.car.pos.map(v=>+v.toFixed(1)),stuck:+stuck.toFixed(2),speed:+s.car.speed.toFixed(2)}));}
}
console.log(JSON.stringify({finished:s.finished,time:s.time,rec,lap:s.lap,gate:s.gate}));
