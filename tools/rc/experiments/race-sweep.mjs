// Every race on the real streamed world, as main.js sets it up (7 rivals, 3 laps / 1 for sprints),
// driven by the AI line follower at a kid skill (Kid mode) and a strong skill (Big Kid).
// Reports what a player meets: can it be finished, where they place, does the pack stay close,
// do rivals get stuck. Sim-only (no GPU). node tools/rc/experiments/race-sweep.mjs [out.jsonl] [id,...]
import fs from 'node:fs';
import * as T from '../../../web/wwwroot/vendor/three.module.js';
const RC=new URL('../../../web/wwwroot/rc/',import.meta.url);
globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url),RC)));
globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
const {loadOpenWorld}=await import(new URL('open-world/runtime.js',RC));
const {buildLandmarks}=await import(new URL('open-world/landmarks.js',RC));
const {createRace,stepRace,driveInput,placeOf}=await import(new URL('physics/race.mjs',RC));
const {RACE_EVENTS,eventLaps}=await import(new URL('open-world/catalog.mjs',RC));
const out=process.argv[2],only=process.argv[3]?.split(',');
const events=RACE_EVENTS.filter(e=>!e.battle&&e.kind!=='arena'&&(!only||only.includes(e.id)));
for(const e of events){
 let world;
 try{world=await loadOpenWorld('?event='+e.id+'&mode=race');buildLandmarks(new T.Scene(),world.stream.world,world.progress,world.overview.roads);}
 catch(err){const row={event:e.id,error:String(err?.message??err)};console.log(JSON.stringify(row));if(out)fs.appendFileSync(out,JSON.stringify(row)+'\n');continue;}
 for(const [mode,skill] of [['kid',.5],['bigKid',.85]]){
  const laps=eventLaps(e),race=createRace({...world.course,laps},{mode,opponents:7}),pilot={session:race.player,skill,node:0};
  const limit=120*Math.max(240,(e.medals?.[2]??120)*laps*3);let i=0,samples=0,near=0,maxBehind=0;
  for(;i<limit&&!race.player.finished;i++){
   if(i%120===0)await world.stream.update(race.player.car.pos);
   if(pilot.session.recoveries!==(pilot.lastRec??0)){pilot.lastRec=pilot.session.recoveries;const [x,,z]=pilot.session.car.pos;pilot.node=race.line.reduce((b,p,k)=>Math.hypot(p[0]-x,p[1]-z)<Math.hypot(race.line[b][0]-x,race.line[b][1]-z)?k:b,0);}stepRace(race,{...driveInput(race,pilot),...(process.env.FLOOR?{throttle:1}:{}),fire:race.pickups.held.has(race.player.car)&&i%240===0},1/120);
   if(i%120===0&&i>120*10){samples++;const p=race.player.car.pos,d=race.rivals.map(r=>Math.hypot(r.session.car.pos[0]-p[0],r.session.car.pos[2]-p[2]));if(Math.min(...d)<25)near++;}
  }
  const s=race.player,place=typeof placeOf==='function'?placeOf(race,s):null;
  const row={event:e.id,kind:e.kind,laps,mode,skill,finished:s.finished,time:+s.time.toFixed(1),medals:e.medals,place,lap:s.lap,gate:s.gate,gates:world.course.checkpoints.length,
   recoveries:s.recoveries,nearPct:samples?Math.round(100*near/samples):null,rivalsFinished:race.rivals.filter(r=>r.session.finished).length,
   rivalRecoveries:race.rivals.map(r=>r.session.recoveries),rivalGates:race.rivals.map(r=>`${r.session.lap}:${r.session.gate}`)};
  console.log(JSON.stringify(row));if(out)fs.appendFileSync(out,JSON.stringify(row)+'\n');
 }
 world.stream.dispose?.();
}
