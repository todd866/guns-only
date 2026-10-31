import test from 'node:test';
import assert from 'node:assert/strict';
import {createStream,desiredTiles} from './open-world/stream.mjs';
const home=[0,0,0],away=[2048,0,0];
const tile=key=>({tile:key.split(',').map(Number),features:[]});
const manifest={tiles:[...desiredTiles(home),...desiredTiles(away)]};

test('failed travel preparation preserves the current visible and collidable neighbourhood',async()=>{
 const drops=[];const stream=createStream({manifest,fetchTile:async key=>{if(key==='8,0')throw Error('offline');return tile(key);},onDrop:key=>drops.push(key)});
 await stream.update(home);const before=[...stream.loaded.keys()];
 assert.equal(await stream.prepare(away),false);
 assert.deepEqual([...stream.loaded.keys()],before);assert.deepEqual(drops,[]);assert.ok(stream.ready(home));
 stream.dispose();
});

test('prepared travel commits without fetching twice and revisits work offline',async()=>{
 const calls=new Map();let offline=false;
 const stream=createStream({manifest,fetchTile:async key=>{assert.ok(!offline,'cached revisit must not fetch');calls.set(key,(calls.get(key)||0)+1);return tile(key);}});
 await stream.update(home);await stream.prepare(away);assert.ok(stream.ready(home));
 await stream.update(away);assert.ok(stream.ready(away));offline=true;
 await stream.update(home);assert.ok(stream.ready(home));assert.ok([...calls.values()].every(n=>n===1));assert.ok(stream.stats().tiles<=25);
 stream.dispose();
});

test('concurrent preparations deduplicate requests and never activate destination geometry',async()=>{
 let release;let requests=0;const stream=createStream({manifest:{tiles:[[8,0]]},fetchTile:async key=>{requests++;await new Promise(r=>release=r);return tile(key);}});
 await stream.update(home);const a=stream.prepare(away),b=stream.prepare(away);release();assert.ok(await a);assert.ok(await b);assert.equal(requests,1);assert.ok(!stream.loaded.has('8,0'));stream.dispose();
});

test('CPU cache stays bounded across the base and disposal ignores late responses',async()=>{
 const stream=createStream({manifest:{tiles:[]},fetchTile:async key=>tile(key),cacheLimit:32});
 for(let x=-2000;x<3000;x+=256)await stream.update([x,0,0]);
 assert.ok(stream.stats().cached<=32);assert.ok(stream.loaded.size<=25);stream.dispose();assert.equal(stream.stats().cached,0);
 let release;const late=createStream({manifest:{tiles:[[0,0]]},fetchTile:()=>new Promise(r=>release=r)});const pending=late.prepare(home);late.dispose();release(tile('0,0'));assert.equal(await pending,false);assert.equal(late.stats().cached,0);assert.equal(late.loaded.size,0);
});

test('a failed far tile stops keeping the stream busy once the car no longer needs it',async()=>{
 const stream=createStream({manifest,fetchTile:async key=>{if(key==='8,0')throw Error('offline');return tile(key);}});
 await stream.update(home);assert.equal(await stream.prepare(away),false);assert.ok(stream.errors.size>0);
 await stream.update(home);assert.equal(stream.errors.size,0,'stale errors would re-run the stream every frame');stream.dispose();
});
