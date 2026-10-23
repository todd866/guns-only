// Authored 22m forecourt joins two disconnected public road components. Not an OSM road claim.
export const WORLD_LINKS=[{kind:'service',points:[[10.9,-552.3],[-4.9,-567.1]],bounds:[-4.9,-567.1,10.9,-552.3]}];
// Road graph for the map's route. Quantisation only joins OSM's shared endpoints, not roads
// that cross on bridges. The short final approach leads from the road into an authored event.
import {DISTRICT_BOUNDS} from './district-zones.mjs';
const inBox=(p,b,pad=4)=>p[0]>=b[0]-pad&&p[0]<=b[2]+pad&&p[1]>=b[1]-pad&&p[1]<=b[3]+pad;
function crossesBox(a,b,box,pad=4){
  if(inBox(a,box,pad)||inBox(b,box,pad))return true;
  const dx=b[0]-a[0],dz=b[1]-a[1];
  for(const x of [box[0]-pad,box[2]+pad]){const t=(x-a[0])/(dx||Infinity);if(t>0&&t<1){const z=a[1]+t*dz;if(z>=box[1]-pad&&z<=box[3]+pad)return true;}}
  for(const z of [box[1]-pad,box[3]+pad]){const t=(z-a[1])/(dz||Infinity);if(t>0&&t<1){const x=a[0]+t*dx;if(x>=box[0]-pad&&x<=box[2]+pad)return true;}}
  return false;
}
export function buildRoadGraph(roads,bounds=DISTRICT_BOUNDS){const nodes=[],byKey=new Map();const node=p=>{const k=p.map(v=>Math.round(v*5)).join(',');if(!byKey.has(k)){byKey.set(k,nodes.length);nodes.push({p,edges:[]});}return byKey.get(k);};for(const r of roads){if(['footway','path','steps'].includes(r.kind))continue;for(let i=1;i<r.points.length;i++){const pa=r.points[i-1],pb=r.points[i];if(bounds.some(b=>crossesBox(pa,pb,b)))continue;const a=node(pa),b=node(pb),cost=Math.hypot(...pb.map((v,j)=>v-pa[j]));nodes[a].edges.push([b,cost]);nodes[b].edges.push([a,cost]);}}const out=nodes.filter(n=>n.edges.length);out.bounds=bounds;return out;}
function push(q,item){q.push(item);let i=q.length-1;while(i){const p=(i-1)>>1;if(q[p][0]<=item[0])break;q[i]=q[p];i=p;}q[i]=item;}
function pop(q){const first=q[0],last=q.pop();if(q.length){let i=0;while(i*2+1<q.length){let c=i*2+1;if(c+1<q.length&&q[c+1][0]<q[c][0])c++;if(q[c][0]>=last[0])break;q[i]=q[c];i=c;}q[i]=last;}return first;}
export function roadRoute(nodes,start,end){
 if(!nodes.length)return [start];
 const bounds=nodes.bounds||DISTRICT_BOUNDS,clear=(a,b)=>!bounds.some(box=>crossesBox(a,b,box));
 const nearest=p=>nodes.map((n,i)=>({i,d:Math.hypot(n.p[0]-p[0],n.p[1]-p[1])})).filter(q=>clear(p,nodes[q.i].p)).sort((x,y)=>x.d-y.d).slice(0,1);
 const ss=nearest(start), ee=nearest(end); if(!ss.length||!ee.length)return [start];
 const cost=new Float64Array(nodes.length).fill(Infinity),prev=new Int32Array(nodes.length).fill(-1),q=[];
 for(const x of ss){cost[x.i]=x.d*4;push(q,[cost[x.i],x.i]);}
 while(q.length){const [d,i]=pop(q);if(d>cost[i])continue;for(const [j,w]of nodes[i].edges)if(d+w<cost[j]){cost[j]=d+w;prev[j]=i;push(q,[d+w,j]);}}
 let best=null;for(const x of ee){if(!Number.isFinite(cost[x.i]))continue;const total=cost[x.i]+x.d*4;if(!best||total<best.total)best={i:x.i,total};}
 if(!best)return [start];const route=[];for(let i=best.i;i>=0;i=prev[i]){route.push(nodes[i].p);if(prev[i]<0)break;}const path=route.reverse();return [start,...path,...(clear(path.at(-1),end)?[end]:[])];}
export function routeRemaining(route,pos){if(!route?.length)return null;let nearest=0,d=Infinity;for(let i=0;i<route.length;i++){const dd=Math.hypot(route[i][0]-pos[0],route[i][1]-pos[1]);if(dd<d){d=dd;nearest=i;}}return [pos,...route.slice(nearest)];}

// Recovery is local, even when the selected race is on the other side of the base.
export function recoveryPoint(roads,pos){let best=null,dist=25;for(const road of roads){if(['footway','path','steps'].includes(road.kind))continue;for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((pos[0]-a[0])*dx+(pos[2]-a[1])*dz)/(dx*dx+dz*dz||1))),x=a[0]+t*dx,z=a[1]+t*dz,d=Math.hypot(x-pos[0],z-pos[2]);if(DISTRICT_BOUNDS.some(b=>inBox([x,z],b,1)))continue;if(d<dist){dist=d;best={pos:[x,0,z],groundY:0,yaw:Math.atan2(dx,-dz)};}}}return best??{pos:[pos[0],0,pos[2]]};}
