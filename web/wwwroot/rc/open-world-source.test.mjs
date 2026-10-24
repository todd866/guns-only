import {prepareDistricts} from './open-world/districts.js';
// Actual OSM collision + authored props + real player physics. No GPU or screenshot claim.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as T from '../vendor/three.module.js';import {createStream} from './open-world/stream.mjs';import {buildLandmarks} from './open-world/landmarks.js';import {buildActivities} from './open-world/activities.js';import {EVENTS,SPECIMENS,eventCourse} from './open-world/catalog.mjs';import {createRace,stepRace,driveInput} from './physics/race.mjs';import {createSession,stepSession} from './physics/session.mjs';
const data=name=>JSON.parse(fs.readFileSync(new URL('./assets/world/'+name,import.meta.url)));
const makeStream=()=>createStream({manifest:data('manifest.json'),elevation:data('playable-terrain.json'),fetchTile:async key=>data('tile-'+key.replace(',','-')+'.json')});
const stub=()=>({getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})});
test('every event is driveable with real source buildings and authored landmark collision',async()=>{
 const old=globalThis.document,oldFetch=globalThis.fetch;globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url),import.meta.url)));globalThis.document={createElement:stub};const stream=makeStream();let landmarks,activities;try{await prepareDistricts(stream.world);const scene=new T.Scene();landmarks=buildLandmarks(scene,stream.world,undefined,data('overview.json').roads);activities=buildActivities(scene,stream.world);
 for(const e of EVENTS.filter(event=>!event.battle)){const course=eventCourse(e,stream.world);await stream.update(course.start.pos);const race=createRace(course,{mode:'bigKid',opponents:0}),pilot={session:race.player,skill:.9,node:0};race.retreat.at=Infinity;let steps=0;
 while(!race.player.finished&&steps++<120*(e.road?1000:600)){if(steps%120===1)await stream.update(race.player.car.pos);stepRace(race,driveInput(race,pilot),1/120);activities.update(steps/120,race.player.car.pos);activities.step(race.player.car,1/120);}
 assert.ok(race.player.finished,`${e.id}: gate ${race.player.gate}, position ${race.player.car.pos}`);
 }
 }finally{landmarks?.dispose();activities?.dispose();stream.dispose();globalThis.document=old;globalThis.fetch=oldFetch;}
});
test('every specimen can be reached through its source-tile approach',async()=>{const old=globalThis.document;globalThis.document={createElement:stub};const stream=makeStream();let landmarks;try{landmarks=buildLandmarks(new T.Scene(),stream.world,undefined,data('overview.json').roads);for(const p of SPECIMENS){await stream.update([p.x,0,p.z]);const course=eventCourse(EVENTS[0],stream.world);course.secrets=SPECIMENS;course.start={pos:[p.x,0,p.z+8],yaw:0};const session=createSession(course,{mode:'bigKid'});session.roam=true;for(let i=0;i<240;i++)stepSession(session,{throttle:1},1/120);assert.ok(session.seen.includes(SPECIMENS.indexOf(p)),p.id);}}finally{landmarks?.dispose();stream.dispose();globalThis.document=old;}});
