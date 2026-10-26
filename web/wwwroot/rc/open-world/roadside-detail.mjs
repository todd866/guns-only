import {roadWidth,segmentDistance,inside} from './geometry.mjs';
import {inEventArea} from './catalog.mjs';
import {SCENERY_BOUNDS} from './district-zones.mjs';

// Sparse planting in the graded verge, never in a roadway, apron, building,
// authored district or event clearing. A fixed tile budget bounds streaming cost.
export function roadsideDetail(tile,bounds,residentialBounds=null){
 const out=[],excluded=[...SCENERY_BOUNDS,...(residentialBounds?[residentialBounds]:[])];
 const safe=(x,z)=>{
  if(x<bounds[0]||x>=bounds[2]||z<bounds[1]||z>=bounds[3]||inEventArea(x,z,24))return false;
  if(excluded.some(b=>x>b[0]-3&&x<b[2]+3&&z>b[1]-3&&z<b[3]+3))return false;
  for(const f of tile.features){const p=f.properties,g=f.geometry;
   if(g.type==='LineString'&&(p.highway||p.aeroway))for(let i=1;i<g.coordinates.length;i++)if(segmentDistance(x,z,g.coordinates[i-1],g.coordinates[i])<roadWidth(p)/2+2.5)return false;
   if(g.type==='Polygon'&&(p.building||p.aeroway||p.amenity==='parking')&&inside(x,z,g.coordinates[0]))return false;
  }return true;
 };
 for(const f of tile.features){if(!f.properties.highway||['path','footway','track'].includes(f.properties.highway)||f.geometry.type!=='LineString')continue;
  const pts=f.geometry.coordinates,w=roadWidth(f.properties);
  for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<12)continue;
   for(let d=12;d<len;d+=32)for(const side of [-1,1]){const x=a[0]+dx*d/len-dz/len*(w/2+4.5)*side,z=a[1]+dz*d/len+dx/len*(w/2+4.5)*side;
    if(safe(x,z)){out.push({x,z,size:.45+((Math.floor(x*3+z*7)%7+7)%7)*.035});if(out.length>=48)return out;}
   }
  }
 }return out;
}
