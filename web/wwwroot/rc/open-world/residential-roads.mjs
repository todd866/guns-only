import {RESIDENTIAL_BOUNDS} from './residential-frame.mjs';
export const RESIDENTIAL_LINK={kind:'service',points:[[-2421.504,-1060.355],[-2313.3,-995.5]]};
// Remove underlying source roads where the authored neighbourhood replaces them.
// Split crossing segments so the rest of the base retains its connected graph.
export function residentialRoads(roads,data){
 const out=[],b=RESIDENTIAL_BOUNDS;
 for(const road of roads)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],z=road.points[i],d=z.map((v,k)=>v-a[k]);let lo=0,hi=1,hit=true;
  for(let k=0;k<2;k++){if(Math.abs(d[k])<1e-9){if(a[k]<b[k]||a[k]>b[k+2])hit=false;}else{const u=(b[k]-a[k])/d[k],v=(b[k+2]-a[k])/d[k];lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));}}
  const p=t=>a.map((v,k)=>v+d[k]*t),add=(x,y)=>{if(y-x>1e-7)out.push({kind:road.kind,points:[p(x),p(y)]});};
  if(!hit||lo>hi)add(0,1);else{add(0,lo);add(hi,1);}
 }
 return [...out,...data.roads,RESIDENTIAL_LINK];
}

// RC cars can use the neighbourhood paths; retain road types for rendering.
export function residentialNavigationRoads(roads){return roads.map(r=>['path','footway'].includes(r.kind)&&r.points.every(p=>p[0]>=RESIDENTIAL_BOUNDS[0]&&p[0]<=RESIDENTIAL_BOUNDS[2]&&p[1]>=RESIDENTIAL_BOUNDS[1]&&p[1]<=RESIDENTIAL_BOUNDS[3])?{...r,kind:'service'}:r);}
