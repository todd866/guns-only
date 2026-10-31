import test from 'node:test'; import assert from 'node:assert/strict';
import { summarizeRC } from './analytics-report.mjs';
const row=(event,code,data={})=>({k:'in',type:'rc',session:'rc-a',event,code,...data});
test('deduplicates retried chunks, joins out-of-order races, and separates censored sessions',()=>{
 const rows=[row(1,'session_start',{day:'2026-10-23'}),row(2,'race_start',{race_id:'r1',kind:'race',track:'bx',mode:'kid'}),row(3,'race_finish',{race_id:'r1',place:1}),row(4,'choice',{race_id:'r1',choice:'again'}),row(5,'race_start',{race_id:'r2',kind:'furball',track:'bx',mode:'kid'}),row(6,'race_quit',{race_id:'r2'}),row(7,'session_end',{duration:20000})];
 const r=summarizeRC([...rows.reverse(),...rows]);
 assert.equal(r.events,7);assert.equal(r.races.finishPercent,50);assert.equal(r.races.quit,1);assert.equal(r.again.percentOfFinishes,100);assert.equal(r.byModeTrack['race/kid/bx'].winPercent,100);assert.equal(r.medianEndedSessionMs,20000);
});
test('missing start and outcome do not become invented losses or zero durations',()=>{
 const r=summarizeRC([row(2,'race_finish',{race_id:'orphan',place:1}),row(3,'race_start',{race_id:'pending',kind:'race',mode:'bigKid',track:'school'})]);
 assert.equal(r.races.started,1);assert.equal(r.races.finished,0);assert.equal(r.races.unresolved,1);assert.equal(r.medianEndedSessionMs,null);assert.equal(r.again.percentOfChoices,null);assert.deepEqual(r.sessionsPerDay,{});
});

import { formatDiscovery } from './analytics-report.mjs';
const v=(session,event,t,place)=>({k:'in',type:'rc',session,event,code:'visit',t,place});
test('discovery metrics: 0, 1 and several places; duplicates once; out-of-order sorted',()=>{
 const rows=[
  {k:'in',type:'rc',session:'s0',event:1,code:'session_start',t:0},
  v('s1',1,5000,'gate'),
  v('s2',4,70000,'zoo'),v('s2',1,10000,'gate'),v('s2',2,40000,'gate'),v('s2',3,25000,'pond'),v('s2',5,700000,'zoo'),
 ];
 const d=summarizeRC(rows).discovery,by=Object.fromEntries(d.perSession.map(p=>[p.session,p]));
 assert.equal(by.s0.placesDiscovered,0);assert.deepEqual(by.s0.discoveryGapsSec,[]);assert.equal(by.s0.longestQuietSec,null);
 assert.equal(by.s1.placesDiscovered,1);assert.deepEqual(by.s1.discoveryGapsSec,[]);
 assert.equal(by.s2.placesDiscovered,3);assert.deepEqual(by.s2.discoveryGapsSec,[15,45]);assert.equal(by.s2.longestQuietSec,45);
 assert.equal(d.placesPerSession.median,1);assert.equal(d.placesPerSession.p90,2.6);assert.equal(d.medianGapSec,30);
 assert.equal(d.noDiscoveryAfter10MinPercent,100); // the 700000 ms zoo row is a revisit, not a new place
 assert.match(formatDiscovery(d),/places per session: median 1, p90 2\.6/);
});
test('discovery after 10 minutes counts as still discovering',()=>{
 const d=summarizeRC([v('a',1,1000,'gate'),v('a',2,700000,'zoo')]).discovery;
 assert.equal(d.noDiscoveryAfter10MinPercent,0);assert.equal(d.perSession[0].longestQuietSec,699);
});
