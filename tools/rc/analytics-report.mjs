// Offline aggregation of selected immutable RC telemetry chunks; never fetches production data.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
const median = values => { const v = values.filter(Number.isFinite).sort((a,b)=>a-b); return v.length ? (v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2 : null; };
const percent = (n,d) => d ? Math.round(n/d*1000)/10 : null;
export function summarizeRC(input) {
  const unique = new Map();
  for (const r of input) if (r?.k === 'in' && r.type === 'rc' && typeof r.session === 'string' && Number.isSafeInteger(r.event)) unique.set(`${r.session}:${r.event}`, r);
  const rows = [...unique.values()], sessions = new Map(), races = new Map();
  for (const r of rows) {
    if (!sessions.has(r.session)) sessions.set(r.session, {});
    const s = sessions.get(r.session);
    if (r.code === 'session_start') s.start = r;
    if (r.code === 'session_end') s.end = r;
    if (r.code === 'first_input') s.first = r;
    if (typeof r.race_id === 'string') {
      const key = `${r.session}:${r.race_id}`;
      if (!races.has(key)) races.set(key, {});
      const race = races.get(key);
      if (r.code === 'race_start') race.start = r;
      if (['race_finish','furball_outcome','race_quit'].includes(r.code)) race.end = r;
      if (r.code === 'choice') race.choice = r.choice;
    }
  }
  const days = {}, modes = {};
  let starts=0, finishes=0, quits=0, again=0, choices=0, outcomes=0;
  for (const s of sessions.values()) if (/^\d{4}-\d{2}-\d{2}$/.test(s.start?.day)) days[s.start.day]=(days[s.start.day]??0)+1;
  for (const r of races.values()) {
    if (!r.start) continue; // An incomplete selection of chunks must not fabricate starts.
    starts++;
    if (r.end?.code === 'race_quit') { quits++; continue; }
    if (!['race_finish','furball_outcome'].includes(r.end?.code)) continue;
    finishes++; outcomes++;
    if (['again','drive'].includes(r.choice)) { choices++; if(r.choice==='again') again++; }
    const key=`${r.start.kind}/${r.end.mode??r.start.mode}/${r.start.track}`;
    const m=modes[key]??={finished:0,wins:0,knownResults:0}; m.finished++;
    const won=r.end.code==='furball_outcome'?r.end.winner:r.end.place==null?null:r.end.place===1;
    if(typeof won==='boolean'){m.knownResults++;if(won)m.wins++;}
  }
  for(const m of Object.values(modes)) m.winPercent=percent(m.wins,m.knownResults);
  const ss=[...sessions.values()];
  return { scope:'selected chunks only; opt-in sample, not all players', events:rows.length, sessions:sessions.size,
    sessionsWithStart:ss.filter(s=>s.start).length, sessionsWithEnd:ss.filter(s=>s.end).length,
    sessionsPerDay:days, medianEndedSessionMs:median(ss.map(s=>s.end?.duration)),
    medianFirstInputMs:median(ss.map(s=>s.first?.t)), races:{started:starts,finished:finishes,quit:quits,unresolved:starts-finishes-quits,finishPercent:percent(finishes,starts)},
    again:{count:again,choices,finishedOutcomes:outcomes,percentOfChoices:percent(again,choices),percentOfFinishes:percent(again,outcomes)}, byModeTrack:modes };
}
export function readRows(files) {
  if (!files.length || files.length>100) throw Error('Pass 1–100 local JSONL or JSONL.gz chunks');
  let bytes=0; const rows=[];
  for(const file of files){
    const size=fs.statSync(file).size; if(size>4*1024*1024)throw Error('Chunk exceeds 4 MiB');
    let data=fs.readFileSync(file); if(file.endsWith('.gz'))data=gunzipSync(data,{maxOutputLength:4*1024*1024});
    bytes+=data.length;if(bytes>32*1024*1024)throw Error('Selected chunks exceed 32 MiB');
    for(const line of data.toString('utf8').split('\n'))if(line.trim())rows.push(JSON.parse(line));
  }
  return rows;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(summarizeRC(readRows(process.argv.slice(2))),null,2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
