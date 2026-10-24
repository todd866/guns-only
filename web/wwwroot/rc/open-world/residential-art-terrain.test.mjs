import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import { createWorld } from '../physics/world.mjs';
import { buildResidentialArt } from './residential-art.js';

test('residential art follows graded terrain without adding a flat grass collider', () => {
  const scene = new T.Scene(), world = createWorld(4);
  const terrain = {
    heightAt: (x) => x < 0 ? -1 : 1,
    triangles: () => [
      [[-8, -1, -8], [0, -1, -8], [0, 1, 0]],
      [[-8, -1, -8], [0, 1, 0], [-8, -1, 0]],
    ],
  };
  const art = buildResidentialArt(scene, world, {
    bounds: [-8, -8, 8, 8],
    roads: [{ kind: 'service', points: [[-8, -4], [8, -4]] }],
    greens: [{ points: [[-4, -4], [0, -4], [0, 0], [-4, 0]] }],
    buildings: [],
  }, { terrain });
  const grass = art.root.children.find(mesh => mesh.name === 'Residential_grass');
  const ys = [...grass.geometry.attributes.position.array].filter((_, i) => i % 3 === 1);
  assert.ok(Math.min(...ys) < -.9 && Math.max(...ys) > .9, 'grass vertices retain the grade');
  assert.ok(Math.abs(world.raycast([-4, 1, -4], [0, -1, 0], 4)?.point[1] + .975) < 1e-9, 'negative terrain remains collidable');
  art.dispose();
});

test('sloped road, rolled kerb and house foundation use graded world heights', () => {
 const scene=new T.Scene(), world=createWorld(4), terrain={heightAt:(x,z)=>x*.04+z*.02};
 const art=buildResidentialArt(scene,world,{roads:[{kind:'residential',points:[[-12,0],[12,0]]}],buildings:[{kind:'house',height:3,points:[[3,12],[7,12],[7,16],[3,16],[3,12]]}]},{terrain});
 for(const x of [-11,-6,0,5,11]){
  const road=world.raycast([x,5,0],[0,-1,0],10);
  assert.ok(Math.abs(road.point[1]-terrain.heightAt(x,0)-.025)<1e-8,'road follows grade');
  const kerb=world.raycast([x,5,4],[0,-1,0],10);
  assert.equal(kerb.surface,'kerb');
  assert.ok(Math.abs(kerb.point[1]-terrain.heightAt(x,4)-.1)<.03,'raised kerb follows grade');
 }
 const wall=art.root.children.find(m=>m.name.startsWith('Residential_stucco'));
 const p=wall.geometry.attributes.position.array, ys=[];for(let i=1;i<p.length;i+=3)ys.push(p[i]);
 assert.ok(Math.min(...ys)<=terrain.heightAt(3,12)+1e-6,'foundation reaches downhill ground');
 assert.ok(Math.max(...ys)-Math.min(...ys)<3.4,'gentle slope does not produce oversized foundation');
 art.dispose();
});
