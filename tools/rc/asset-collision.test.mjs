import test from 'node:test';
import assert from 'node:assert/strict';
import {proxySolid} from '../../web/wwwroot/rc/asset-collision.mjs';
test('world-space elevated proxy retains its underside and absolute top',()=>{
 assert.deepEqual(proxySolid('bench',{min:{x:30,y:.7,z:-12},max:{x:32,y:1.1,z:-10}}),
  {name:'bench',x:31,z:-11,w:2,d:2,minY:.7,h:1.1});
});
test('malformed bounds cannot enter the live collision course',()=>{
 for(const max of [{x:0,y:1,z:1},{x:1,y:NaN,z:1},{x:1,y:1,z:-1}])
  assert.throws(()=>proxySolid('broken',{min:{x:0,y:0,z:0},max}),/Invalid collision/);
});
