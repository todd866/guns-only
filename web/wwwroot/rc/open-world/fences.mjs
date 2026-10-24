import {FENCE_SOURCE} from './fences-data.mjs';
import {DISTRICT_BOUNDS} from './district-zones.mjs';
import {BOUNDS} from './catalog.mjs';
export {FENCE_SOURCE};
// Parametric interval clipping. Clearances are authored playability allowances;
// source IDs/paths remain intact in fences-data, heights are fictional.
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function band(interval,p,d,lo,hi){
 if(!interval)return null;
 if(Math.abs(d)<1e-12)return p>=lo&&p<=hi?interval:null;
 let a=(lo-p)/d,b=(hi-p)/d;if(a>b)[a,b]=[b,a];
 const l=Math.max(interval[0],a),h=Math.min(interval[1],b);return l<=h?[l,h]:null;
}
function rect(a,b,q){return band(band([0,1],a[0],b[0]-a[0],q[0],q[2]),a[1],b[1]-a[1],q[1],q[3]);}
function disk(a,b,p,r){const dx=b[0]-a[0],dz=b[1]-a[1],x=a[0]-p[0],z=a[1]-p[1],A=dx*dx+dz*dz,B=2*(dx*x+dz*z),C=x*x+z*z-r*r,D=B*B-4*A*C;if(A<1e-12)return C<=0?[0,1]:null;if(D<0)return null;const v=Math.sqrt(D),lo=Math.max(0,(-B-v)/(2*A)),hi=Math.min(1,(-B+v)/(2*A));return lo<=hi?[lo,hi]:null;}
function corridor(a,b,u,v,r){const dx=v[0]-u[0],dz=v[1]-u[1],L=Math.hypot(dx,dz);if(L<1e-9)return [disk(a,b,u,r)];const project=p=>[(p[0]-u[0])*dx/L+(p[1]-u[1])*dz/L,-(p[0]-u[0])*dz/L+(p[1]-u[1])*dx/L];return [rect(project(a),project(b),[0,-r,L,r]),disk(a,b,u,r),disk(a,b,v,r)];}
export function fenceSegments({source=FENCE_SOURCE,roads=[],eventPoints=[],eventSegments=[],districtBounds=DISTRICT_BOUNDS,gateRadius=3,roadClearance=3,bounds=BOUNDS}={}){
 const paths=[...eventSegments,...roads.flatMap(r=>r.points.slice(1).map((b,i)=>[r.points[i],b]))],points=[...(source.gates??[]).map(g=>g.pos),...eventPoints],out=[];
 for(const way of source.ways??[])for(let i=1;i<way.points.length;i++){
 const a=way.points[i-1],b=way.points[i],inside=rect(a,b,bounds);if(!inside||Math.hypot(b[0]-a[0],b[1]-a[1])<1e-6)continue;
 const cuts=[...districtBounds.map(q=>rect(a,b,q)),...points.map(p=>disk(a,b,p,gateRadius))];
 for(const [u,v]of paths){if(Math.max(a[0],b[0])+roadClearance<Math.min(u[0],v[0])||Math.min(a[0],b[0])-roadClearance>Math.max(u[0],v[0])||Math.max(a[1],b[1])+roadClearance<Math.min(u[1],v[1])||Math.min(a[1],b[1])-roadClearance>Math.max(u[1],v[1]))continue;cuts.push(...corridor(a,b,u,v,roadClearance));}
 let kept=[inside];for(const cut of cuts.filter(Boolean)){kept=kept.flatMap(([l,h])=>cut[1]<=l||cut[0]>=h?[[l,h]]:[[l,Math.min(h,cut[0])],[Math.max(l,cut[1]),h]].filter(([x,y])=>y-x>1e-8));}
 for(const [l,h]of kept)if(h-l>1e-8)out.push({way:way.id,a:lerp(a,b,l),b:lerp(a,b,h)});
 }return out;
}
