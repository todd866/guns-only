import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {SPECIMENS,EVENTS,eventCourse,loadProgress,saveProgress,collectSpecimens,dreamlandUnlocked,recordFinish,expedition} from './open-world/catalog.mjs';
import {createRace,stepRace,driveInput} from './physics/race.mjs';
import {createStream} from './open-world/stream.mjs';import {createSession,stepSession} from './physics/session.mjs';
import {loadOpenWorld} from './open-world/runtime.js';import {daylight} from './open-world/daylight.mjs';

test('all specimens can be collected with ordinary inputs, persist across reloads and unlock the finale once',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};let progress=loadProgress(storage);
 const stream=createStream({manifest:{tiles:[]},fetchTile:()=>{}});
 for(const specimen of SPECIMENS){const course=eventCourse(EVENTS[0],stream.world);course.secrets=SPECIMENS;course.start={pos:[specimen.x,0,specimen.z+8],yaw:0};const s=createSession(course,{mode:'bigKid'});s.roam=true;
  for(let i=0;i<180;i++)stepSession(s,{throttle:1},1/120);
  assert.ok(s.seen.includes(SPECIMENS.indexOf(specimen)),specimen.id);assert.equal(collectSpecimens(progress,s.seen).length,1);assert.equal(collectSpecimens(progress,s.seen).length,0);saveProgress(storage,progress);progress=loadProgress(storage);
 }
 assert.ok(dreamlandUnlocked(progress));assert.equal(expedition(progress).complete,false);recordFinish(progress,'dreamland',55);saveProgress(storage,progress);assert.ok(expedition(loadProgress(storage)).complete);stream.dispose();
});

test('invalid saved IDs, duplicates and invalid records cannot invent progress',()=>{
 const p=loadProgress({getItem:()=>JSON.stringify({discovered:['gate','gate','made-up'],specimens:['gate','gate','lab','made-up'],wins:{dreamland:-1,'ramp-rat':'1',whoops:50}})});
 assert.deepEqual(p.discovered,['gate']);assert.deepEqual(p.specimens,['gate']);assert.deepEqual(p.wins,{whoops:50});recordFinish(p,'dreamland',1);assert.equal(p.wins.dreamland,undefined);assert.equal(expedition(p).complete,false);
});

test('Dreamland deep links respect the same specimen lock as event entry',async()=>{
 const oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage;let state=loadProgress();
 globalThis.localStorage={getItem:()=>JSON.stringify(state),setItem(k,v){state=JSON.parse(v);}};
 globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url).replace('./assets/','./assets/'),new URL('./',import.meta.url))));
 try{let world=await loadOpenWorld('?event=dreamland&mode=race');assert.equal(world.locked,true);assert.equal(world.at.id,'lab');assert.notEqual(world.selected.id,'dreamland');world.dispose();state.specimens=SPECIMENS.map(p=>p.id);world=await loadOpenWorld('?event=dreamland&mode=race');assert.equal(world.locked,false);assert.equal(world.selected.id,'dreamland');assert.equal(world.selected.night,true);const race=createRace(world.course,{mode:'bigKid',opponents:0}),pilot={session:race.player,skill:.9,node:0};race.retreat.at=Infinity;for(let i=0;i<120*180&&!race.player.finished;i++)stepRace(race,driveInput(race,pilot),1/120);assert.ok(race.player.finished);world.finish(race.player.time);assert.ok(expedition(loadProgress(globalThis.localStorage)).complete);world.dispose();}finally{globalThis.fetch=oldFetch;globalThis.localStorage=oldStorage;}
});

test('day/night cycle is periodic and keeps readable ambient light at night',()=>{assert.deepEqual(daylight(0),daylight(1200));assert.equal(daylight(0).day,1);assert.equal(daylight(600).day,0);assert.equal(daylight(0,true).day,0);assert.ok(daylight(600).ambient>=.8);});
