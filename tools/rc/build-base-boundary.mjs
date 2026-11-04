import fs from 'node:fs';
import path from 'node:path';

const raw=JSON.parse(fs.readFileSync('/Users/iantodd/.local/state/area51-nellis/osm-raw.json','utf8'));
const rel=new Map(raw.elements.filter(e=>e.type==='relation').map(e=>[e.id,e]));
const origin={lat:36.241303,lon:-115.04465775,R:6371008.8};
const project=p=>[+(Math.PI/180*(p.lon-origin.lon)*origin.R*Math.cos(origin.lat*Math.PI/180)).toFixed(3),+(-Math.PI/180*(p.lat-origin.lat)*origin.R).toFixed(3)];
const ring=(id,way)=>{const m=rel.get(id).members.find(x=>x.role==='outer'&&x.ref===way);return m.geometry.map(project);};
const data={source:'OpenStreetMap contributors (ODbL)',ids:{mainRelation:16282210,mainOuter:758208019,areaIII:19616628,areaIIIOuter:1377332778},projection:'x east, z south; origin 36.241303,-115.04465775; R 6371008.8',elevationDatumM:569.1,rings:{main:ring(16282210,758208019),areaIII:ring(19616628,1377332778)}};
const api=`// Generated from local OSM extract by tools/rc/build-base-boundary.mjs.\nexport const BASE_BOUNDARY=${JSON.stringify(data)};\n\nconst pointIn=(x,z,r)=>{let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};\nexport function insideBase(x,z){return pointIn(x,z,BASE_BOUNDARY.rings.main)||pointIn(x,z,BASE_BOUNDARY.rings.areaIII);}\nfunction clip(a,b,minX,minZ,maxX,maxZ){let t0=0,t1=1,dx=b[0]-a[0],dz=b[1]-a[1];for(const [p,q] of [[-dx,a[0]-minX],[dx,maxX-a[0]],[-dz,a[1]-minZ],[dz,maxZ-a[1]]]){if(p===0){if(q<0)return null;continue;}const t=q/p;if(p<0){if(t>t1)return null;if(t>t0)t0=t;}else{if(t<t0)return null;if(t<t1)t1=t;}}return [[a[0]+dx*t0,a[1]+dz*t0],[a[0]+dx*t1,a[1]+dz*t1]];}\nexport function boundarySegmentsWithin(bounds){const [minX,minZ,maxX,maxZ]=bounds,out=[];for(const r of Object.values(BASE_BOUNDARY.rings))for(let i=1;i<r.length;i++){const s=clip(r[i-1],r[i],minX,minZ,maxX,maxZ);if(s)out.push(s);}return out;}\n`;
const out=process.argv[2];if(out)fs.writeFileSync(path.resolve(out),api);else process.stdout.write(api);
