import test from 'node:test';import assert from 'node:assert/strict';
import {roadsideDetail} from './roadside-detail.mjs';
const road={properties:{highway:'service'},geometry:{type:'LineString',coordinates:[[1400,600],[1660,600]]}};
test('roadside clusters respect road clearances, exclusions, tile ownership and hard budget',()=>{
 const tile={features:[road]},bounds=[1408,512,1664,768],a=roadsideDetail(tile,bounds);
 assert.ok(a.length>0);assert.deepEqual(a,roadsideDetail(tile,bounds));
 for(const p of a){assert.ok(Math.abs(p.z-600)>=7);assert.ok(p.x>=1408&&p.x<1664);}
 assert.equal(roadsideDetail(tile,bounds,bounds).length,0);
 const apron={properties:{aeroway:'apron'},geometry:{type:'Polygon',coordinates:[[[1400,500],[1700,500],[1700,800],[1400,800],[1400,500]]]}};
 assert.equal(roadsideDetail({features:[road,apron]},bounds).length,0);
 assert.ok(roadsideDetail({features:Array(30).fill(road)},bounds).length<=48);
});
