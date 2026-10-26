import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {roofProfile,roadLamps,litWindow} from './world-finish.mjs';
import {inside,buildingInfo,roadWidth,segmentDistance} from './geometry.mjs';
import {roadVerges} from './road-verges.mjs';
import {createTileRenderer} from './render.js';
const dir=new URL('../assets/world/',import.meta.url);
test('all-source roof details have one owner, stay within roofs and respect geometry budgets',()=>{
 const ids=new Set();let count=0,triangles=0;
 for(const name of fs.readdirSync(dir).filter(n=>/^tile-.*json$/.test(n))){const tile=JSON.parse(fs.readFileSync(new URL(name,dir))),[x,z]=tile.tile,b=[x*256,z*256,(x+1)*256,(z+1)*256];
  for(const f of tile.features){const faces=roofProfile(f,b);if(!faces.length)continue;assert.ok(!ids.has(f.id),f.id);ids.add(f.id);count++;triangles+=faces.length;assert.ok(faces.length<=30);assert.deepEqual(faces,roofProfile(f,b));const info=buildingInfo(f);
   for(const face of faces)for(const p of face.points){assert.ok(p.every(Number.isFinite));assert.ok(p[1]>=info.h&&p[1]<=info.h+1.7);assert.ok(inside(p[0],p[2],info.ring),`${f.id}: roof detail remains inside footprint`);}
  }
 }
 assert.ok(count>100);assert.ok(triangles<30000,`${triangles} total roof triangles`);
});
test('road lamps clear all road segments, stay spaced, and cap at four per tile',()=>{
 for(const name of fs.readdirSync(dir).filter(n=>/^tile-.*json$/.test(n))){const tile=JSON.parse(fs.readFileSync(new URL(name,dir))),[x,z]=tile.tile,lamps=roadLamps(tile,[x*256,z*256,(x+1)*256,(z+1)*256]);assert.ok(lamps.length<=4);
  for(const p of lamps){for(const q of lamps)if(q!==p)assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>60);for(const f of tile.features){if(f.geometry.type!=='LineString'||!(f.properties.highway||f.properties.aeroway))continue;for(let i=1;i<f.geometry.coordinates.length;i++)assert.ok(segmentDistance(p.x,p.z,f.geometry.coordinates[i-1],f.geometry.coordinates[i])>=roadWidth(f.properties)/2+2.49);}}
 }
 assert.equal(Array.from({length:70},(_,i)=>litWindow('way/1',i,0)).filter(Boolean).length,14);
});
test('streamed night effects share materials, switch off by day and dispose with tiles',()=>{
 const scene=new T.Scene(),renderer=createTileRenderer(scene);
 try{for(const [x,z] of [[-2,1],[-4,1],[0,-2]]){const tile=JSON.parse(fs.readFileSync(new URL(`tile-${x}-${z}.json`,dir)));renderer.load(`${x},${z}`,tile);}
  const fixtures=renderer.fixtures();assert.ok(fixtures.length>0&&fixtures.length<=12);assert.equal(scene.children.filter(o=>o.isLight).length,0,'no per-tile dynamic lights');renderer.update(0);
  const pools=[],glazing=[];scene.traverse(o=>{if(o.name==='RoadLightPools')pools.push(o);if(o.material?.emissive?.getHexString()==='edc792')glazing.push(o);});assert.ok(pools.length);assert.equal(new Set(pools.map(o=>o.material)).size,1);assert.ok(pools.every(o=>o.material.uniforms.night.value===1));assert.ok(glazing.length&&glazing.every(o=>o.material.emissiveIntensity===.65));renderer.update(1);assert.ok(pools.every(o=>o.material.uniforms.night.value===0));assert.ok(glazing.every(o=>o.material.emissiveIntensity===0));
  for(const [x,z] of [[-2,1],[-4,1],[0,-2]])renderer.drop(`${x},${z}`);assert.equal(renderer.fixtures().length,0);assert.equal(scene.children.length,0);
 }finally{renderer.dispose();}
});
