import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {loadOpenWorld} from './open-world/runtime.js';
import {buildLandmarks} from './open-world/landmarks.js';
import {createRace,stepRace,driveInput,raceDistance} from './physics/race.mjs';
const localFetch=async url=>new Response(fs.readFileSync(new URL(String(url),import.meta.url)));
test('real gate and housing races keep seven rivals contesting three laps',async t=>{
 const oldFetch=globalThis.fetch,oldDocument=globalThis.document;
 globalThis.fetch=localFetch;globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})})};
 try{for(const id of ['gate-guard','district-housing']){
  const world=await loadOpenWorld('?event='+id+'&mode=race');
  const art=buildLandmarks(new T.Scene(),world.stream.world,world.progress,world.overview.roads);
  try{for(const mode of ['kid','bigKid']){
   const race=createRace({...world.course,laps:3},{mode,opponents:7}),pilot={session:race.player,skill:.85,node:0};
   let samples=0,near=0,contests=0,hits=0,exchanges=0,previous=null;
   for(let i=0;i<120*240&&!race.player.finished;i++){
    if(i%120===0)await world.stream.update(race.player.car.pos);
    stepRace(race,driveInput(race,pilot),1/120);
    hits+=race.events.filter(e=>e.car&&e.by&&(e.type==='boom'||e.type==='splash')).length;race.events.length=0;
    if(i>1200&&i%120===0){samples++;const gaps=race.rivals.map(r=>Math.hypot(r.session.car.pos[0]-race.player.car.pos[0],r.session.car.pos[2]-race.player.car.pos[2]));if(gaps.some(d=>d<10))near++;if(gaps.some(d=>d<3))contests++;const lead=raceDistance(race.rivals[0].session)-raceDistance(race.player);if(previous!==null&&Math.sign(lead)!==Math.sign(previous))exchanges++;previous=lead;}
   }
   t.diagnostic(JSON.stringify({id,mode,finished:race.player.finished,near,samples,contests,hits,exchanges,time:race.player.time}));
   assert.ok(race.player.finished,`${id}/${mode}: finish`);assert.ok(near/samples>.6,`${id}/${mode}: nearby ${near}/${samples}`);assert.ok(contests>3,`${id}/${mode}: close contests`);assert.ok(hits>0,`${id}/${mode}: rival item hits`);
  }}finally{art.dispose();world.dispose();}
 }}finally{globalThis.fetch=oldFetch;globalThis.document=oldDocument;}
});
