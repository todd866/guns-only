import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import {buildCorridorArt} from './corridor-art.js';
import {DISTRICT_ENTRANCES} from './district-entrances.mjs';

test('corridor architecture keeps district access volumes clear and rendering bounded',()=>{
 const scene=new T.Scene(),art=buildCorridorArt(scene);let meshes=0,triangles=0;
 art.root.traverse(o=>{if(!o.isMesh)return;meshes++;const p=o.geometry.attributes.position;for(const v of p.array)assert.ok(Number.isFinite(v));triangles+=(o.geometry.index?.count??p.count)/3;});
 assert.ok(meshes<=12,`${meshes} architecture batches`);assert.ok(triangles<5000,`${triangles} triangles`);assert.ok(art.pools.isMesh,'light pools share one batch');
 for(const [id,name] of [['bx','ExchangeDetails'],['school','SchoolDetails']]){
  const d=DISTRICT_ENTRANCES.find(d=>d.id===id),b=d.doorbox,box=new T.Box3(new T.Vector3(b[0]+.01,.1,b[2]+.01),new T.Vector3(b[3]-.01,b[4]-.01,b[5]-.01));
  art.root.getObjectByName(name).traverse(o=>{if(!o.isMesh)return;const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry,p=g.attributes.position;for(let i=0;i<p.count;i+=3){const t=new T.Triangle(...[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,i+j)));assert.ok(!box.intersectsTriangle(t),`${id} visible geometry obstructs entrance`);}if(g!==o.geometry)g.dispose();});
 }
 assert.equal(art.lights.length,2);art.update(0,art.fixtures[0].pos.toArray());assert.ok(art.lights.some(l=>l.intensity>0));assert.ok(art.lights.every(l=>!l.castShadow));art.update(1,[0,0,0]);assert.ok(art.lights.every(l=>l.intensity===0));assert.equal(art.pools.visible,false);
 art.update(0,[9999,0,9999]);assert.ok(art.root.children.every(r=>!r.visible));art.dispose();assert.equal(scene.children.length,0);
});
