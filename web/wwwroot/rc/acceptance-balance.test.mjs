import {buildActivities} from './open-world/activities.js';
import {prepareDistricts} from './open-world/districts.js';
// Actual OSM collision + authored props + real player physics. No GPU or screenshot claim.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as T from '../vendor/three.module.js';import {createStream} from './open-world/stream.mjs';import {buildLandmarks} from './open-world/landmarks.js';import {EVENTS,SPECIMENS,eventCourse,eventLaps} from './open-world/catalog.mjs';import {createRace,stepRace,driveInput} from './physics/race.mjs';import {createSession,stepSession} from './physics/session.mjs';
const data=name=>JSON.parse(fs.readFileSync(new URL('./assets/world/'+name,import.meta.url)));
const makeStream=()=>createStream({manifest:data('manifest.json'),elevation:data('playable-terrain.json'),fetchTile:async key=>data('tile-'+key.replace(',','-')+'.json')});
const stub=()=>({getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})});
test('existing bronze targets are attainable with source collisions and fixed reference driver',async(t)=>{
 const old=globalThis.document,oldFetch=globalThis.fetch;globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(String(url),import.meta.url)));globalThis.document={createElement:stub};const stream=makeStream();try{await prepareDistricts(stream.world);buildLandmarks(new T.Scene(),stream.world,undefined,data('overview.json').roads);const activities=buildActivities(new T.Scene(),stream.world);
 for(const e of EVENTS.filter(e=>!e.battle&&(!process.env.RC_EVENT||e.id===process.env.RC_EVENT))){const course={...eventCourse(e,stream.world),laps:eventLaps(e)};await stream.update(course.start.pos);const race=createRace(course,{mode:'bigKid',opponents:0}),pilot={session:race.player,skill:.9,node:0};race.retreat.at=Infinity;let steps=0;
 while(!race.player.finished&&steps++<120*(e.road?3000:600)){if(steps%120===1)await stream.update(race.player.car.pos);stepRace(race,driveInput(race,pilot),1/120);activities.update(steps/120,race.player.car.pos);activities.step(race.player.car,1/120);}
 t.diagnostic(JSON.stringify({event:e.id,gate:race.player.gate,lap:race.player.lap,pos:race.player.car.pos}));
 assert.ok(race.player.time<=e.medals[2]*course.laps,`${e.id}: existing bronze target ${e.medals[2]}s, driver ${race.player.time}s`);
 t.diagnostic(JSON.stringify({event:e.id,time:race.player.time,medals:e.medals,finished:race.player.finished}));
 assert.ok(race.player.finished,`${e.id}: gate ${race.player.gate}, position ${race.player.car.pos}`);
 }
 }finally{stream.dispose();globalThis.document=old;globalThis.fetch=oldFetch;}
});
