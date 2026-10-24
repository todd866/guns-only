import test from 'node:test';
import assert from 'node:assert/strict';
import {createRace} from '../physics/race.mjs';
import {createWorld} from '../physics/world.mjs';
import {eventCourse,EVENTS} from './catalog.mjs';
import {updateTraffic} from './traffic.mjs';
test('free-drive arrival distributes patrols along the road without moving the player',()=>{
 const race=createRace(eventCourse(EVENTS[0],createWorld()),{roam:true,opponents:7});
 const pos=[...race.player.car.pos],roads=[{kind:'service',points:[[pos[0],pos[2]-100],[pos[0],pos[2]+100]]}],stream={ready:()=>true};
 const previous=updateTraffic(race,roads,stream,null);
 assert.deepEqual(race.player.car.pos,pos);
 for(const r of race.rivals)assert.ok(Math.hypot(r.session.car.pos[0]-pos[0],r.session.car.pos[2]-pos[2])>18);
 const positions=race.rivals.map(r=>[...r.session.car.pos]);updateTraffic(race,roads,stream,previous);
 assert.deepEqual(race.rivals.map(r=>r.session.car.pos),positions,'nearby patrols are not repeatedly repositioned');
 const competitive=createRace(eventCourse(EVENTS[0],createWorld()),{opponents:7});const grid=competitive.rivals.map(r=>[...r.session.car.pos]);
 updateTraffic(competitive,roads,stream,null);assert.deepEqual(competitive.rivals.map(r=>r.session.car.pos),grid,'race grids remain intact');
});

test('short authored grids expand to the requested field without moving existing slots',()=>{
 const course=eventCourse(EVENTS[0],createWorld());
 course.grid=[{pos:[0,0,0],yaw:0},{pos:[1,0,0],yaw:0},{pos:[0,0,1.1],yaw:0},{pos:[1,0,1.1],yaw:0}];
 const race=createRace(course,{opponents:7});assert.equal(race.rivals.length,7);assert.equal(course.grid.length,4);
 const positions=[race.player,...race.rivals.map(r=>r.session)].map(s=>s.car.pos);
 assert.equal(new Set(positions.map(p=>p.join(','))).size,8);
 assert.deepEqual(positions.slice(1,5).map(p=>[p[0],p[2]]),[[0,0],[1,0],[0,1.1],[1,1.1]]);
});

test('one-marker grids expand safely and roam starts at its authored arrival point',()=>{
 const course=eventCourse(EVENTS[0],createWorld());course.grid=[course.start];
 assert.equal(createRace(course,{opponents:7}).rivals.length,7);
 const roam=createRace(course,{opponents:7,roam:true});assert.equal(roam.player.car.pos[0],course.start.pos[0]);assert.equal(roam.player.car.pos[2],course.start.pos[2]);
});

test('patrol placement retries unavailable roads and never stacks sparse ready points',()=>{
 const course=eventCourse(EVENTS[0],createWorld());course.grid=[course.start];
 const race=createRace(course,{roam:true,opponents:7}),pos=race.player.car.pos;
 assert.ok(race.rivals.every(r=>Math.hypot(r.session.car.pos[0]-pos[0],r.session.car.pos[2]-pos[2])>.5));
 const roads=[{kind:'service',points:[[pos[0],pos[2]-100],[pos[0],pos[2]+100]]}];
 assert.equal(updateTraffic(race,roads,{ready:()=>false},null),null);
 const sparse={ready:p=>p[2]>pos[2]+20&&p[2]<pos[2]+29};
 const previous=updateTraffic(race,roads,sparse,null);
 const positions=race.rivals.map(r=>[r.session.car.pos[0],r.session.car.pos[2]]);
 assert.equal(new Set(positions.map(p=>p.join(','))).size,7);
 updateTraffic(race,roads,{ready:()=>true},previous);
 assert.ok(race.rivals.every(r=>r.trafficPlaced));
});
