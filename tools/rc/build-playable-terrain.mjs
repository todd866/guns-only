// Offline USGS terrain adaptation: preserve authored routes/venues, contour natural clearings.
import fs from 'node:fs';
import {BOUNDS,LOCATIONS,EVENTS} from '../../web/wwwroot/rc/open-world/catalog.mjs';
import {DISTRICT_BOUNDS} from '../../web/wwwroot/rc/open-world/district-zones.mjs';
import {FENCE_SOURCE} from '../../web/wwwroot/rc/open-world/fences-data.mjs';
import {roadWidth} from '../../web/wwwroot/rc/open-world/geometry.mjs';
const root='web/wwwroot/rc/assets/world/',dem=JSON.parse(fs.readFileSync(root+'terrain.json')),manifest=JSON.parse(fs.readFileSync(root+'manifest.json'));
const step=16,origin=[Math.floor(BOUNDS[0]/256)*256,Math.floor(BOUNDS[1]/256)*256],width=Math.ceil((BOUNDS[2]-origin[0])/256)*16+1,height=Math.ceil((BOUNDS[3]-origin[1])/256)*16+1,mask=new Uint8Array(width*height);
function box(b,pad=32){const x0=Math.max(0,Math.floor((b[0]-pad-origin[0])/step)),x1=Math.min(width-1,Math.ceil((b[2]+pad-origin[0])/step)),z0=Math.max(0,Math.floor((b[1]-pad-origin[1])/step)),z1=Math.min(height-1,Math.ceil((b[3]+pad-origin[1])/step));for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)mask[z*width+x]=1;}
const seen=new Set();for(const t of manifest.tiles){const tile=JSON.parse(fs.readFileSync(root+'tile-'+t.join('-')+'.json'));for(const f of tile.features){if(seen.has(f.id))continue;seen.add(f.id);const p=f.properties,g=f.geometry;if(g.type==='Polygon'){box(f.bbox,40);continue;}if(g.type==='LineString'&&(p.highway||p.aeroway)){const r=roadWidth(p)/2+24;for(let i=1;i<g.coordinates.length;i++){const a=g.coordinates[i-1],b=g.coordinates[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8);for(let j=0;j<=n;j++){const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n;box([x,z,x,z],r);}}}}}
for(const way of FENCE_SOURCE.ways)for(let i=1;i<way.points.length;i++){const a=way.points[i-1],b=way.points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8);for(let j=0;j<=n;j++){const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n;box([x,z,x,z],16);}}
for(const b of DISTRICT_BOUNDS)box(b,80);for(const p of LOCATIONS)box([p.pos[0],p.pos[2],p.pos[0],p.pos[2]],150);for(const e of EVENTS)for(const p of e.points)box([p[0],p[1],p[0],p[1]],50);
// Full static aircraft, support and dressing footprints, including remote parked assets.
for(const b of [[450,-400,850,100],[1350,-600,1700,-400],[-750,-180,-500,-100],[-1500,1950,-1250,2100]])box(b,50);
for(let j=0;j<height;j++)for(let i=0;i<width;i++){const x=origin[0]+i*step,z=origin[1]+j*step;if(x<BOUNDS[0]+48||x>BOUNDS[2]-48||z<BOUNDS[1]+48||z>BOUNDS[3]-48)mask[j*width+i]=1;}
// Eight-neighbour distance transform bounds transition slope, no sharp walls at road edges.
const dist=new Float64Array(mask.length).fill(1e9);for(let k=0;k<mask.length;k++)if(mask[k])dist[k]=0;
for(let pass=0;pass<2;pass++){const start=pass?mask.length-1:0,end=pass?-1:mask.length,inc=pass?-1:1;for(let k=start;k!==end;k+=inc){const x=k%width,z=Math.floor(k/width);for(const [dx,dz]of pass?[[1,0],[0,1],[1,1],[-1,1]]:[[-1,0],[0,-1],[-1,-1],[1,-1]])if(x+dx>=0&&x+dx<width&&z+dz>=0&&z+dz<height)dist[k]=Math.min(dist[k],dist[k+dx+dz*width]+step*Math.hypot(dx,dz));}}
const rad=Math.PI/180,R=6371008.8,x0=(dem.pixelCenter.lon-dem.origin.lon)*rad*R*Math.cos(dem.origin.lat*rad),z0=(dem.origin.lat-dem.pixelCenter.lat)*rad*R;
function sample(x,z){const u=(x-x0)/dem.stepM.eastX,v=(z-z0)/dem.stepM.southZ,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*dem.width+i;return dem.valuesM[k]*(1-a)*(1-b)+dem.valuesM[k+1]*a*(1-b)+dem.valuesM[k+dem.width]*(1-a)*b+dem.valuesM[k+dem.width+1]*a*b;}
const values=Array.from(dist,(d,k)=>{const raw=sample(origin[0]+k%width*step,origin[1]+Math.floor(k/width)*step),t=Math.min(1,d/400),blend=t*t*(3-2*t);return Math.round(Math.max(-d*.1,Math.min(d*.1,raw*blend))*100)/100;});
const out={version:1,step,origin,width,height,values,source:'terrain.json / USGS 3DEP',epistemic:'surrogate',adaptation:'Protected road/building/activity pads at zero; 400m smooth blend, 10% distance envelope; 16m grid. Not survey-grade terrain.'};fs.writeFileSync(root+'playable-terrain.json',JSON.stringify(out)+'\n');console.log({width,height,nonzero:values.filter(v=>v!==0).length,min:values.reduce((a,b)=>Math.min(a,b),Infinity),max:values.reduce((a,b)=>Math.max(a,b),-Infinity)});
