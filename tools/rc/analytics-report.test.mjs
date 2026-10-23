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
