import {buildActivities} from './open-world/activities.js';
// Geometry/collision acceptance in Node. The canvas is a label stub: this is NOT a render test.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {buildLandmarks} from './open-world/landmarks.js';import {createTileRenderer} from './open-world/render.js';
import {createStream} from './open-world/stream.mjs';import {EVENTS,eventCourse,LOCATIONS} from './open-world/catalog.mjs';
import {createRace,stepRace,driveInput} from './physics/race.mjs';
const canvas=()=>({width:1,height:1,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})});
test('world art builds finite batched meshes; all authored races remain driveable with their real collision',()=>{
 const old=globalThis.document;globalThis.document={createElement:canvas};try{
 const scene=new T.Scene(),stream=createStream({manifest:{tiles:[]},fetchTile:()=>{}}),activities=buildActivities(scene,stream.world),landmarks=buildLandmarks(scene,stream.world);let triangles=0,meshes=0;
 scene.traverse(o=>{if(!o.isMesh)return;meshes++;assert.ok(o.geometry);const p=o.geometry.attributes.position;assert.ok(p);for(const v of p.array)assert.ok(Number.isFinite(v));triangles+=(o.geometry.index?.count??p.count)/3;});/* 630: Under the Bridge adds one batched park mesh and three location meshes to the 626 budget. */assert.ok(meshes<630,`${meshes} draw meshes`);/* 320k: the adventure playground adds one ~16.8k-triangle batched mesh to a world that sat at 299.6k; measured p95 17.5 ms standing in it (headless M5). */assert.ok(triangles<320000,`${triangles} triangles`);assert.equal(landmarks.rings.size,LOCATIONS.length);
 for(const e of EVENTS.filter(e=>!e.battle)){const course=eventCourse(e,stream.world),race=createRace(course,{opponents:0,mode:'bigKid'}),pilot={session:race.player,skill:.9,node:0};race.retreat.at=Infinity;let steps=0;while(!race.player.finished&&steps++<120*(e.road?1000:180))stepRace(race,driveInput(race,pilot),1/120);const s=race.player;assert.ok(s.finished,`${e.id} trapped at gate ${s.gate}, ${s.car.pos}`);}
 for(const p of LOCATIONS){const x=p.pos[0],z=p.pos[2]+6;assert.ok(stream.world.raycast([x,2,z],[0,-1,0],3),`${p.id} spawn`);}
 }finally{globalThis.document=old;}});
test('real OSM tiles build without invalid geometry and are disposed on unload',()=>{const old=globalThis.document;globalThis.document={createElement:canvas};try{const scene=new T.Scene(),render=createTileRenderer(scene);for(const [x,z]of [[-3,-1],[2,0],[-5,4]]){const tile=JSON.parse(fs.readFileSync(new URL(`./assets/world/tile-${x}-${z}.json`,import.meta.url)));render.load(`${x},${z}`,tile);}scene.traverse(o=>{if(o.isMesh)for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));});assert.ok(scene.children.length===3);render.dispose();assert.equal(scene.children.length,0);}finally{globalThis.document=old;}});
