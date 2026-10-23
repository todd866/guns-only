import {DISTRICT_ZONES,districtBounds,districtOffset} from './district-zones.mjs';
import {DISTRICT_ENTRANCES} from './district-entrances.mjs';
// Join the district's authored driving line to the open doorway before using OSM roads.
export function districtExitRoute(pos,courses){for(const [id,d]of Object.entries(DISTRICT_ZONES)){const b=districtBounds(id);if(pos[0]<b[0]||pos[0]>b[2]||pos[2]<b[1]||pos[2]>b[3])continue;const c=DISTRICT_ENTRANCES.find(e=>e.id===id).corridor,inner=[d.anchor[0],districtOffset(id)[2]+c[2]],end=[d.anchor[0],d.anchor[2]],start=[pos[0],pos[2]];
 if(Math.abs(start[0]-inner[0])<2.5&&start[1]>=inner[1])return [start,end];
 const nodes=courses.get(id).ai.map(n=>[n.pos[0],n.pos[2]]),nearest=p=>nodes.reduce((a,n,i)=>Math.hypot(n[0]-p[0],n[1]-p[1])<Math.hypot(nodes[a][0]-p[0],nodes[a][1]-p[1])?i:a,0),a=nearest(start),z=nearest(inner),route=[start];for(let i=a;;i=(i+1)%nodes.length){route.push(nodes[i]);if(i===z)break;}return [...route,inner,end];}return [[pos[0],pos[2]]];}
