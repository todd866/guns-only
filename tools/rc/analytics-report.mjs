// Offline aggregation of selected immutable RC telemetry chunks; never fetches production data.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
const median = values => { const v = values.filter(Number.isFinite).sort((a,b)=>a-b); return v.length ? (v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2 : null; };
const percent = (n,d) => d ? Math.round(n/d*1000)/10 : null;
const quantile = (values, q) => { const v = values.filter(Number.isFinite).sort((a,b)=>a-b); if (!v.length) return null; const i = (v.length-1)*q, lo = Math.floor(i), hi = Math.ceil(i); return v[lo]+(v[hi]-v[lo])*(i-lo); };
// "Feels infinite" metrics. PROXY: discovery is not a telemetry event; catalog.discover() only
// updates saved state. The `visit` event (place id, emitted when the car comes within range of a
// catalog location and the place changes) is used instead, counted once per distinct id per session.
// Revisits of the same id are ignored, so gaps are between first visits. Rows are ordered by t.
export const DISCOVERY_PROXY = 'visit events (first visit to each distinct place id per session); catalog discover() is not a telemetry event';
function discoveryMetrics(rows, sessions) {
  const per = [];
  for (const id of sessions) {
    const visits = rows.filter(r => r.session === id && r.code === 'visit' && typeof r.place === 'string' && Number.isFinite(r.t)).sort((a,b) => a.t-b.t || a.event-b.event);
    const firstSeen = new Map();
    for (const r of visits) if (!firstSeen.has(r.place)) firstSeen.set(r.place, r.t);
    const times = [...firstSeen.values()].sort((a,b)=>a-b), gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push(Math.round((times[i]-times[i-1])/10)/100);
    per.push({ session: id, placesDiscovered: times.length, discoveryGapsSec: gaps.sort((a,b)=>a-b), longestQuietSec: gaps.length ? gaps[gaps.length-1] : null, lastDiscoveryMs: times.length ? times[times.length-1] : null });
  }
  const gaps = per.flatMap(p => p.discoveryGapsSec), TEN_MIN = 600000;
  const lateQuiet = per.filter(p => p.lastDiscoveryMs === null || p.lastDiscoveryMs <= TEN_MIN).length;
  return { proxy: DISCOVERY_PROXY, sessions: per.length,
    placesPerSession: { median: median(per.map(p=>p.placesDiscovered)), p90: quantile(per.map(p=>p.placesDiscovered), 0.9) },
    medianGapSec: median(gaps), p90GapSec: quantile(gaps, 0.9),
    noDiscoveryAfter10MinPercent: percent(lateQuiet, per.length),
    perSession: per.map(({ lastDiscoveryMs, ...rest }) => rest) };
}
export function formatDiscovery(d) {
  const f = v => v === null || v === undefined ? 'n/a' : v;
  return ['Discovery (feel-infinite) metrics', `  proxy: ${d.proxy}`, `  sessions: ${d.sessions}`,
    `  places per session: median ${f(d.placesPerSession.median)}, p90 ${f(d.placesPerSession.p90)}`,
    `  gap between discoveries: median ${f(d.medianGapSec)} s, p90 ${f(d.p90GapSec)} s`,
    `  sessions with no discovery after first 10 min: ${f(d.noDiscoveryAfter10MinPercent)}%`,
    ...d.perSession.map(p => `  ${p.session}: places ${p.placesDiscovered}, longest quiet ${f(p.longestQuietSec)} s`)].join('\n');
}
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
    again:{count:again,choices,finishedOutcomes:outcomes,percentOfChoices:percent(again,choices),percentOfFinishes:percent(again,outcomes)}, byModeTrack:modes, discovery:discoveryMetrics(rows,[...sessions.keys()]) };
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
  try{const summary=summarizeRC(readRows(process.argv.slice(2)));console.log(JSON.stringify(summary,null,2));console.log('\n'+formatDiscovery(summary.discovery));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
