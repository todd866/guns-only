import test from 'node:test';import assert from 'node:assert/strict';
import {roadVerges} from './road-verges.mjs';
const road={id:'test',properties:{highway:'unclassified',name:'Depot Road'},geometry:{type:'LineString',coordinates:[[1400,600],[1700,600]]}};
test('verges are deterministic, outside driving width, bounded and owned once across tile seams',()=>{
 const tile={features:[road]},a=roadVerges(tile,[1408,512,1536,768]),b=roadVerges(tile,[1536,512,1792,768]);assert.ok(a.strips.length&&a.markers.length);assert.deepEqual(a,roadVerges(tile,[1408,512,1536,768]));
 const seen=new Set();for(const p of [...a.markers,...b.markers]){assert.ok(Math.abs(p.z-600)>=8.9-1e-8);const k=`${p.x},${p.z}`;assert.ok(!seen.has(k));seen.add(k);}
 for(const s of a.strips)for(const p of s.ring)assert.ok(Math.abs(p[1]-600)>5.5);
 assert.ok(roadVerges({features:Array(40).fill(road)},[1408,512,1792,768]).markers.length<=16);
 assert.equal(roadVerges(tile,[1408,512,1792,768],[1400,500,1800,800]).markers.length,0);
});
test('junction mouths, parking/aprons and building clearances remain open',()=>{
 const crossing={properties:{highway:'service'},geometry:{type:'LineString',coordinates:[[1540,500],[1540,700]]}};
 const a=roadVerges({features:[road,crossing]},[1408,512,1792,768]);
 for(const p of a.markers)assert.ok(Math.abs(p.x-1540)>=7||Math.abs(p.z-600)>=9.5);
 const apron={properties:{aeroway:'apron'},geometry:{type:'Polygon',coordinates:[[[1390,500],[1800,500],[1800,800],[1390,800],[1390,500]]]}};
 const blocked=roadVerges({features:[road,apron]},[1408,512,1792,768]);assert.equal(blocked.strips.length,0);assert.equal(blocked.markers.length,0);assert.equal(blocked.services.length,0);
});

test('real outer tiles keep placement and streamed geometry budgets bounded',async()=>{
 const fs=await import('node:fs'),T=await import('../../vendor/three.module.js'),{createTileRenderer}=await import('./render.js');const scene=new T.Scene(),renderer=createTileRenderer(scene);
 try{for(const [x,z] of [[0,-2],[-2,2],[-4,1],[0,0],[-5,-5]]){const tile=JSON.parse(fs.readFileSync(new URL(`../assets/world/tile-${x}-${z}.json`,import.meta.url)));const v=roadVerges(tile,[x*256,z*256,(x+1)*256,(z+1)*256]);assert.ok(v.markers.length<=16&&v.services.length<=1);renderer.load(`${x},${z}`,tile);const root=scene.children.at(-1);assert.ok(root.children.length<=16);root.traverse(o=>{if(o.isMesh)for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));});renderer.drop(`${x},${z}`);assert.equal(scene.children.length,0);}}
 finally{renderer.dispose();}
});
