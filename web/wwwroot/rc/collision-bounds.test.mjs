import test from 'node:test';import assert from 'node:assert/strict';
import {createWorld} from './physics/world.mjs';

test('small queries avoid narrow-phase vertex reads for distant faces in the same cell',()=>{
 let reads=0;const watch=p=>new Proxy(p,{get(target,key){if(['0','1','2'].includes(key))reads++;return target[key];}});
 const world=createWorld(16);world.addTri(watch([12,0,12]),watch([12,0,15]),watch([15,0,12]));reads=0;
 assert.equal(world.raycast([1,.2,1],[0,-1,0],1),null);assert.deepEqual(world.sphereContacts([1,.05,1],.1),[]);
 assert.equal(reads,0,'disjoint faces should not allocate narrow-phase vectors');
});
test('bounds filtering retains edge, corner, negative-coordinate and diagonal hits',()=>{
 const world=createWorld(16);world.addQuad([-16,0,-16],[-16,0,16],[16,0,16],[16,0,-16]);
 for(const [x,z]of[[-16,-16],[-16,0],[0,0],[16,0],[16,16],[15.999,-15.999]]){
  const hit=world.raycast([x,1,z],[0,-1,0],1);assert.ok(hit,`floor at ${x},${z}`);assert.equal(hit.dist,1);
  assert.ok(world.sphereContacts([x,.05,z],.1).length,`sphere at ${x},${z}`);
 }
 const diagonal=world.raycast([-17,1,-17],[1,-1,1],2);assert.ok(diagonal);assert.deepEqual(diagonal.point,[-16,0,-16]);
 assert.equal(world.raycast([0,1,0],[0,-1,0],.99),null);
});
