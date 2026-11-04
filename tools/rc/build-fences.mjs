import fs from 'node:fs';
const input=process.argv[2]??'/Users/iantodd/.local/state/area51-nellis/osm-raw.json', output=process.argv[3]??'web/wwwroot/rc/open-world/fences-data.mjs';
const d=JSON.parse(fs.readFileSync(input)), nodes=new Map(d.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
const lat0=36.241303,lon0=-115.04465775,R=6371008.8, k=Math.PI/180;
const project=(lat,lon)=>[R*Math.cos(lat0*k)*(lon-lon0)*k,R*(lat0-lat)*k];
const ways=d.elements.filter(e=>e.type==='way'&&e.tags?.barrier==='fence').map(w=>({id:w.id,points:w.geometry.map(p=>project(p.lat,p.lon))}));
const gates=d.elements.filter(e=>e.type==='node'&&e.tags?.barrier==='gate').map(n=>({id:n.id,pos:project(n.lat,n.lon)}));
const source={origin:[lat0,lon0],radius:R,ways,gates};
fs.writeFileSync(output,`// Generated from local OSM fence ways; do not hand edit.\nexport const FENCE_SOURCE=${JSON.stringify(source)};\n`);
