import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {buildSupport} from './open-world/support.js';
import {createWorld} from './physics/world.mjs';
import {EVENTS} from './open-world/catalog.mjs';

test('support props are finite, bounded, disposable, and outside courses',()=>{
  const scene=new T.Scene(),world=createWorld(),support=buildSupport(scene,world),meshes=[];scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  assert.ok(meshes.length<=12,`support uses ${meshes.length} meshes`);let tris=0,disposed=0;
  for(const m of meshes){tris+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;m.geometry.addEventListener('dispose',()=>disposed++);for(const v of m.geometry.attributes.position.array)assert.ok(Number.isFinite(v));}
  assert.ok(tris<15000,`support uses ${tris} triangles`);const b=new T.Box3().setFromObject(scene);assert.ok(b.min.x>1000&&b.max.x<1110);assert.ok(b.min.z>-340&&b.max.z<-300);assert.ok(world.tris.length>0);
  for(const e of EVENTS.filter(e=>e.points))for(const [ex,ez] of e.points)assert.ok(Math.hypot(1050-ex,-320-ez)>25,`support overlaps ${e.id}`);
  support.dispose();assert.equal(scene.children.length,0);assert.equal(disposed,meshes.length);
});
