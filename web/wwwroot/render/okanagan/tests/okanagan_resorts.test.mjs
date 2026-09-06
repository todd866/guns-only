import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createOkanaganRawSampler, geographicToWorld, terrainHierarchy, isOkanaganLake } from "../okanagan_world.js";
import { createResortExclusion } from "../resorts.js";

const root=new URL("../../../content/packs/okanagan-fire/environment/",import.meta.url);
const read=name=>readFile(new URL(name,root),"utf8").then(JSON.parse);

test("all mountain detail nodes and nested Peachland nodes use the same raw sampler",async()=>{
  const terrain=await read("okanagan-central.cdem.json"),sample=createOkanaganRawSampler(terrain);
  for(const {grid,parent} of terrainHierarchy(terrain).filter(({grid})=>grid.id!=="okanagan-valley")) {
    const b=grid.bounds, row=Math.floor(grid.rows*.45),col=Math.floor(grid.columns*.47);
    const p=geographicToWorld(b.south+(b.north-b.south)*row/(grid.rows-1),b.west+(b.east-b.west)*col/(grid.columns-1));
    assert.ok(Math.abs(sample(p.x,p.z)-grid.elevationsM[row][col])<1e-6,grid.id);
    const lat=(b.south+b.north)/2;
    const a=geographicToWorld(lat,b.west-1e-8),c=geographicToWorld(lat,b.west+1e-8);
    assert.ok(Math.abs(sample(a.x,a.z)-sample(c.x,c.z))<.02,`${grid.id} western seam`);
    assert.ok(b.west>=parent.bounds.west && b.east<=parent.bounds.east);
  }
});

test("mapped resort villages, lifts and clearings remain separate from invented scenery",async()=>{
  const data=await read("okanagan-resorts.osm.json");
  assert.match(data.license,/odbl/);
  assert.deepEqual(data.resorts.map(r=>r.id),["big-white","silverstar","apex","baldy"]);
  for(const resort of data.resorts) {
    assert.ok(resort.lifts.length>=4);
    assert.ok(resort.runs.length>=40);
    if(resort.id!=="baldy")assert.ok(resort.buildings.length>250);
    const exclusion=createResortExclusion(resort,geographicToWorld);
    const run=resort.runs.find(r=>!r.area),[lon,lat]=run.points[Math.floor(run.points.length/2)];
    const p=geographicToWorld(lat,lon);assert.equal(exclusion(p.x,p.z),true);
    for(const road of resort.roads)for(const path of road.paths)for(const [lon,lat] of path) {
      assert.ok(lon>=resort.bounds.west-1e-7&&lon<=resort.bounds.east+1e-7&&lat>=resort.bounds.south-1e-7&&lat<=resort.bounds.north+1e-7);
    }
  }
  assert.ok(data.resorts[0].lifts.some(l=>l.name==="Lara's Gondola"));
  assert.ok(data.resorts[1].lifts.some(l=>l.name==="Comet Express"));
  assert.ok(data.resorts[2].lifts.some(l=>l.name==="Quickdraw"));
});

test("Rattlesnake Island remains land in the lake polygon",async()=>{
  const world=await read("okanagan-central.world.json");
  assert.equal(isOkanaganLake(world,-119.71709,49.747988),false);
  assert.equal(isOkanaganLake(world,-119.71,49.773),true);
});
