// "Is it Mario Kart?" probe: one Kid-mode race per event on the real world, player bot fires whenever
// it holds an item and a rival is ahead. Per race: place over time (worst/best/changes), hits taken and
// given, rival-on-rival hits, share of time a rival is 3-15 m ahead, seconds to first exchange.
// node tools/rc/experiments/race-fun.mjs [ids] [mode] [skill]
import fs from 'node:fs';
import * as T from '../../../web/wwwroot/vendor/three.module.js';
const RC=new URL('../../../web/wwwroot/rc/',import.meta.url);
globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url),RC)));
globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
const {loadOpenWorld}=await import(new URL('open-world/runtime.js',RC));
const {buildLandmarks}=await import(new URL('open-world/landmarks.js',RC));
const {createRace,stepRace,driveInput,placeOf,raceDistance}=await import(new URL('physics/race.mjs',RC));
const {eventById,eventLaps}=await import(new URL('open-world/catalog.mjs',RC));
const ids=(process.argv[2]??'gate-guard,ramp-rat,playplace,splash-down,district-skatepark,district-housing,district-bx,district-school').split(','),mode=process.argv[3]??'kid',skill=Number(process.argv[4]??.6);
for(const id of ids){
 const world=await loadOpenWorld('?event='+id+'&mode=race');buildLandmarks(new T.Scene(),world.stream.world,world.progress,world.overview.roads);
 const race=createRace({...world.course,laps:eventLaps(eventById(id))},{mode,opponents:7}),s=race.player,pilot={session:s,skill,node:0};
 const places=[],seen=new Set();let ahead=0,samples=0,fired=0,first=null,lastFire=-9;
 for(let i=0;i<120*600&&!s.finished;i++){
  if(i%120===0)await world.stream.update(s.car.pos);
  if(s.recoveries!==(pilot.lastRec??0)){pilot.lastRec=s.recoveries;const [x,,z]=s.car.pos;pilot.node=race.line.reduce((b,p,k)=>Math.hypot(p[0]-x,p[1]-z)<Math.hypot(race.line[b][0]-x,race.line[b][1]-z)?k:b,0);}
  const me=raceDistance(s),gaps=race.rivals.map(r=>raceDistance(r.session)-me),target=gaps.some(g=>g>3&&g<25);
  const fire=race.pickups.held.has(s.car)&&target&&race.clock-lastFire>1.5;if(fire){fired++;lastFire=race.clock;}
  stepRace(race,{...driveInput(race,pilot),fire},1/120);
  if(process.env.TRACE&&i%(120*5)===0&&s.running)console.error(`t${(i/120).toFixed(0)} place ${placeOf(race,s)} gate ${s.lap}.${s.gate} pos ${s.car.pos.map(v=>v.toFixed(1))} speed ${s.car.speed.toFixed(1)} spin ${race.pickups.effects.get(s.car)?.spin?.toFixed(2)} rec ${s.recoveries} up ${(s.car.q?1:0)}`);
  if(i%120===0&&s.running){samples++;if(gaps.some(g=>g>3&&g<15))ahead++;places.push(placeOf(race,s));}
 }
 const ev=race.events.filter(e=>e.car),taken=ev.filter(e=>e.car===s.car).length,given=ev.filter(e=>e.by===s.car).length,rivalRival=ev.filter(e=>e.car!==s.car&&e.by&&e.by!==s.car).length;
 for(const e of ev){if(first===null&&(e.car===s.car||e.by===s.car))first=null;}
 let changes=0;for(let k=1;k<places.length;k++)if(places[k]!==places[k-1])changes++;
 const t=s.time,mid=places.slice(Math.floor(places.length*.2),Math.floor(places.length*.8));
 console.log(JSON.stringify({event:id,mode,time:+t.toFixed(0),finish:places.at(-1),worst:Math.max(...places),best:Math.min(...places),midRange:mid.length?`${Math.min(...mid)}-${Math.max(...mid)}`:null,placeChanges:changes,hitsTaken:taken,hitsGiven:given,fired,rivalOnRival:rivalRival,targetAheadPct:samples?Math.round(100*ahead/samples):0,placeTrace:places.filter((_,k)=>k%10===0).join('')}));
 world.stream.dispose?.();
}
