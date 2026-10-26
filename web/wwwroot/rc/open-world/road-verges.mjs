import {roadWidth,segmentDistance,inside} from './geometry.mjs';
import {inEventArea} from './catalog.mjs';
import {SCENERY_BOUNDS} from './district-zones.mjs';

// Grade the existing road edges, not the driving surface. Stable source-distance
// sampling and half-open tile ownership keep props identical across streaming seams.
export function roadVerges(tile,bounds,residentialBounds=null,includeStrips=true){
 const strips=[],markers=[],services=[],seen=new Set(),excluded=[...SCENERY_BOUNDS,...(residentialBounds?[residentialBounds]:[])];
 const owned=(x,z)=>x>=bounds[0]&&x<bounds[2]&&z>=bounds[1]&&z<bounds[3];
 const safe=(x,z,source,margin,ownClearance=1.38)=>{
  if(inEventArea(x,z,24)||excluded.some(b=>x>b[0]-4&&x<b[2]+4&&z>b[1]-4&&z<b[3]+4))return false;
  for(const f of tile.features){const p=f.properties,g=f.geometry;const b=f.bbox;if(b&&(x<b[0]-roadWidth(p)-margin||x>b[2]+roadWidth(p)+margin||z<b[1]-roadWidth(p)-margin||z>b[3]+roadWidth(p)+margin))continue;
   if(g.type==='LineString'&&(p.highway||p.aeroway))for(let i=1;i<g.coordinates.length;i++)if(segmentDistance(x,z,g.coordinates[i-1],g.coordinates[i])<roadWidth(p)/2+(f===source?ownClearance:margin))return false;
   if(g.type==='Polygon'&&(p.building||p.aeroway||p.amenity==='parking')&&(inside(x,z,g.coordinates[0])||g.coordinates[0].some((a,i,r)=>i>0&&segmentDistance(x,z,r[i-1],a)<margin)))return false;
  }return true;
 };
 for(const f of tile.features){const p=f.properties,pts=f.geometry.coordinates;if(f.geometry.type!=='LineString'||!p.highway||['footway','path','track','steps','cycleway'].includes(p.highway))continue;
  const w=roadWidth(p);let distance=0;
  for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(!len)continue;const nx=-dz/len,nz=dx/len;
   // Segmented strips leave junction mouths clear rather than painting across them.
   if(includeStrips)for(let d=0;d<len;d+=6){const end=Math.min(d+6,len),mid=(d+end)/2;
    for(const side of [-1,1]){const x=a[0]+dx*mid/len+nx*(w/2+1.4)*side,z=a[1]+dz*mid/len+nz*(w/2+1.4)*side;
     if(x<bounds[0]-5||x>bounds[2]+5||z<bounds[1]-5||z>bounds[3]+5)continue;
     if(![d,mid,end].every(t=>safe(a[0]+dx*t/len+nx*(w/2+1.4)*side,a[1]+dz*t/len+nz*(w/2+1.4)*side,f,3)))continue;
     const point=(t,offset)=>[a[0]+dx*t/len+nx*offset*side,a[1]+dz*t/len+nz*offset*side];
     strips.push({ring:[point(d,w/2+.05),point(end,w/2+.05),point(end,w/2+2.8),point(d,w/2+2.8)],edge:[point(d,w/2-.22),point(end,w/2-.22)],major:w>=9});
    }
   }
   for(let d=Math.ceil((distance+1)/48)*48-distance;d<len;d+=48){
    for(const side of [-1,1]){const offset=w/2+3.4,x=a[0]+dx*d/len+nx*offset*side,z=a[1]+dz*d/len+nz*offset*side,key=`${x.toFixed(2)},${z.toFixed(2)}`;
     if(!owned(x,z)||seen.has(key)||!safe(x,z,f,4,2.5))continue;seen.add(key);
     if(markers.length<16)markers.push({x,z,nx:nx*side,nz:nz*side});
     // One small roadside utility station per tile, only on a named through road.
     if(p.name&&w>=9&&!services.length&&Math.round(distance+d)%240===0){const sx=x+nx*side*3,sz=z+nz*side*3;if(safe(sx,sz,f,6,3)&&owned(sx,sz))services.push({x:sx,z:sz,nx:nx*side,nz:nz*side});}
    }
   }distance+=len;
  }
 }
 return {strips,markers,services};
}
