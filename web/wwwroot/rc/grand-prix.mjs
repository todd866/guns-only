const KEY='guns-only.rc.cup.v1';
export function createCup(id,events,drivers){if(events.length!==4||new Set(events).size!==4||new Set(drivers).size!==drivers.length)throw Error('Invalid cup');return {version:1,id,events:[...events],drivers:[...drivers],results:[]};}
export const nextCupEvent=s=>s?.events[s.results.length]??null;
export function recordCupRace(s,event,order){const i=s.events.indexOf(event);if(i<0||i>s.results.length||order.length!==s.drivers.length||new Set(order).size!==order.length||order.some(d=>!s.drivers.includes(d)))throw Error('Invalid cup result');s.results[i]=[...order];return cupStandings(s);}
export function cupStandings(s){const rows=s.drivers.map(id=>({id,points:s.results.reduce((sum,r)=>sum+([9,6,3,1][r.indexOf(id)]??0),0)})).sort((a,b)=>b.points-a.points);let rank=0;rows.forEach((r,i)=>{if(i===0||r.points!==rows[i-1].points)rank=i+1;r.rank=rank;});return rows;}
export function saveCup(s,storage){try{storage.setItem(KEY,JSON.stringify(s));return true;}catch{return false;}}
export function loadCup(storage){try{const v=JSON.parse(storage.getItem(KEY));if(v.version!==1||typeof v.id!=='string'||!Array.isArray(v.events)||!Array.isArray(v.drivers)||!Array.isArray(v.results)||v.results.length>4)return null;const s=createCup(v.id,v.events,v.drivers);v.results.forEach((r,i)=>recordCupRace(s,s.events[i],r));return s;}catch{return null;}}
