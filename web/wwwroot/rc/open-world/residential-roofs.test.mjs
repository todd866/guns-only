import test from 'node:test';
import assert from 'node:assert/strict';
import {roofProfile,splitRoofTriangle} from './residential-roofs.mjs';

const area=t=>Math.abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[2][0]-t[0][0])*(t[1][1]-t[0][1]))/2;
test('a pitched roof has continuous planar slopes and keeps its footprint',()=>{
  for(const angle of [0,.37,1.25]){
    const rotate=([x,z])=>[x*Math.cos(angle)-z*Math.sin(angle)-3100,x*Math.sin(angle)+z*Math.cos(angle)-800];
    const ring=[[0,0],[12,0],[12,8],[0,8]].map(rotate),profile=roofProfile(ring,3.1);
    const source=[[ring[0],ring[1],ring[2]],[ring[0],ring[2],ring[3]]];
    const triangles=source.flatMap(t=>splitRoofTriangle(t,profile));
    assert.ok(Math.abs(triangles.reduce((sum,t)=>sum+area(t),0)-96)<1e-7,'ridge split preserves area');
    for(const t of triangles){
      const sides=t.map(p=>profile.across(p)-profile.ridge);
      assert.ok(Math.min(...sides)>-1e-7||Math.max(...sides)<1e-7,'no triangle bridges both roof slopes');
      const centre=[0,1].map(i=>t.reduce((n,p)=>n+p[i]/3,0));
      const meanHeight=t.reduce((n,p)=>n+profile.height(p)/3,0);
      assert.ok(Math.abs(profile.height(centre)-meanHeight)<1e-7,'every face is one plane');
    }
    for(const p of ring)assert.ok(Math.abs(profile.height(p)-3.1)<1e-7,'eaves meet the walls');
    assert.ok(Math.abs(profile.height(rotate([6,4]))-4.38)<1e-7,'ridge has a restrained residential pitch');
  }
});
