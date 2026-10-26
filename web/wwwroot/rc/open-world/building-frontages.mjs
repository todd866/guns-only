import {buildingInfo,inside,segmentDistance,roadWidth} from './geometry.mjs';
// Authored fictional facility identities on existing source footprints. These
// four route anchors deliberately differ; this is not a kit spread over all OSM.
export const FRONTAGES=Object.freeze({
 'way/1263962297':'administration',
 'way/555832330':'workshop',
 'way/559181447':'repair',
 'way/559181442':'dining',
});
export function exteriorRing(ring){
 const area=ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a[0]*b[1]-b[0]*a[1];},0);
 return area<0?[...ring].reverse():ring;
}
function frontageFrame(feature,features){
 const style=FRONTAGES[feature.id],info=style&&buildingInfo(feature);if(!info)return null;
 const {cx,cz,h}=info;
 const roads=features.filter(f=>f.geometry.type==='LineString'&&f.properties.highway);
 const ring=exteriorRing(info.ring),edges=[];
 for(let i=1;i<ring.length;i++){
  const a=ring[i-1],b=ring[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<8)continue;
  const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];let gap=Infinity;
  for(const r of roads)for(let j=1;j<r.geometry.coordinates.length;j++)gap=Math.min(gap,segmentDistance(...mid,r.geometry.coordinates[j-1],r.geometry.coordinates[j])-roadWidth(r.properties)/2);
  edges.push({a,b,len,gap});
 }
 const e=edges.sort((a,b)=>a.gap-b.gap||b.len-a.len)[0];if(!e||e.gap<2||e.gap>100)return null;
 return {style,info,ring,e};
}
export function frontageWindowMask(feature,features){
 const frame=frontageFrame(feature,features);if(!frame)return ()=>false;
 const {e,style,info}=frame,w=Math.min(e.len-2,style==='administration'?12:24);
 return (x,z,y)=>segmentDistance(x,z,e.a,e.b)<.05&&Math.abs(((x-e.a[0])*(e.b[0]-e.a[0])+(z-e.a[1])*(e.b[1]-e.a[1]))/e.len-e.len/2)<w/2+1.5&&y<(style==='administration'?info.h:3.1);
}
export function buildingFrontage(feature,features,bounds){
 const frame=frontageFrame(feature,features);if(!frame)return [];
 const {style,info,ring,e}=frame,{cx,cz,h}=info;
 if(cx<bounds[0]||cx>=bounds[2]||cz<bounds[1]||cz>=bounds[3])return [];
 const ux=(e.b[0]-e.a[0])/e.len,uz=(e.b[1]-e.a[1])/e.len,nx=uz,nz=-ux;
 const parts=[];
 // Cuboids are oriented in the actual wall frame. No free-standing low props,
 // no new collider; projection is at most 0.55 m and never into a road.
 const box=(kind,u,y,off,w,height,depth,shade=1)=>{
  const point=(a,b,c)=>[e.a[0]+ux*a+nx*c,b,e.a[1]+uz*a+nz*c];
  const x0=u-w/2,x1=u+w/2,y0=y,y1=y+height,z0=off-depth/2,z1=off+depth/2;
  const v=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].map(p=>point(...p));
  // Local u/Y/outward frame is left handed: these orders face outwards.
  const faces=[[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]].map(ids=>ids.map(i=>v[i]));
  parts.push({kind,shade,faces});
 };
 const center=e.len/2,w=Math.min(e.len-2,style==='administration'?12:24);
 if(style==='repair'||style==='workshop'){
  const bays=style==='repair'?3:2,bay=style==='repair'?4.2:3;
  for(let i=0;i<bays;i++){
   const u=center+(i-(bays-1)/2)*(bay+1.2);
   box('glass',u,.12,.08,bay,2.65,.12,.7);
   for(let y=.45;y<2.7;y+=.32)box('trim',u,y,.16,bay,.045,.05,.65);
   for(const side of [-1,1])box('trim',u+side*(bay/2+.1),0,.15,.18,3,.24,.85);
   box('roof',u,2.92,.24,bay+.55,.23,.48,.7);
  }
  box('stripe',center,h-.65,.12,w,.32,.18,.85);
  // Sawtooth-like ventilation ridge is confined to the source roof.
  for(let i=-1;i<=1;i++)if(inside(e.a[0]+ux*(center+i*3)-nx*2,e.a[1]+uz*(center+i*3)-nz*2,ring)){
   box('glass',center+i*3,h,-2,2.2,.65,1.4,.65);
   box('trim',center+i*3,h+.65,-2,2.4,.12,1.6,.9);
  }
 }else if(style==='dining'){
  // Low terracotta brows and three blue-green storefront bays distinguish the
  // dining corner from the adjacent roll-up-door motor service building.
  for(let i=-1;i<=1;i++){
   const u=center+i*5.4;box('glass',u,.25,.09,4.5,2.3,.12);
   box('roof',u,2.65,.26,4.9,.24,.54,.8);
   box('trim',u,.25,.16,4.7,.18,.25);
   for(const dx of [-2.25,0,2.25])box('trim',u+dx,.25,.18,.09,2.4,.12);
  }
  box('roof',center,h-.35,.12,w,.35,.25,.75);
  box('trim',center,h,-.2,7,.65,.5,.98);
 }else{
  // A tall central glazed entry and paired masonry fins make the long
  // administration frontage recognisable without widening its footprint.
  box('glass',center,.15,.08,4.8,Math.min(h-1,4.6),.1,.85);
  for(const dx of [-2.6,2.6])box('trim',center+dx,0,.18,.38,h+.25,.36);
  box('roof',center,Math.min(h-.6,3.3),.25,7,.26,.55,.75);
  box('trim',center,h,-.15,6.2,.55,.4);
  for(const dx of [-5,-4,4,5])box('glass',center+dx,1,.10,.24,h-1.6,.12,.7);
 }
 return parts;
}
