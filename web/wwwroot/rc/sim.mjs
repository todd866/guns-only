// Prototype base route data (boxes, ramps, gates). The car physics lives in ./physics/.
// Original; no Re-Volt/RVGL code or data.
import { createWorld, addBox } from './physics/world.mjs';
import { cross, sub, dot } from './physics/math.mjs';
export const checkpoints = [[0,0,'Motor pool'],[0,-22,'Housing'],[0,-36,'Quarters exit'],[22,-36,'Flight line'],[38,-23,'Hangar approach'],[38,-8,'Hangar 02'],[38,22,'Containment'],[38,35,'Service exit'],[12,35,'Drain shortcut'],[0,0,'Finish']];
export const buildings = [
 ...[-15,15].flatMap(x=>[-12,-26].map(z=>({x,z,w:8,d:8,h:5,kind:'house'}))),
 {x:38,z:-8,w:18,d:22,h:8,kind:'hangar'},
 {x:38,z:23,w:18,d:18,h:5,kind:'lab'}
];
export const solids = [];
for(const b of buildings){
 if(b.kind==='house') solids.push({x:b.x,z:b.z,w:b.w,d:b.d,h:b.h});
 else { // Open front/back doors are a real continuous drivable route.
  solids.push({x:b.x-b.w/2,z:b.z,w:.4,d:b.d,h:b.h},{x:b.x+b.w/2,z:b.z,w:.4,d:b.d,h:b.h});
  for(const side of [-1,1]) for(const end of [-1,1]) solids.push({x:b.x+side*(b.w/4+1.3),z:b.z+end*b.d/2,w:b.w/2-2.6,d:.4,h:b.h});
 }
}
// One authored placement list serves presentation and collision. Vertical intervals
// allow the RC body beneath wings while blocking landing gear and low fuselages.
export const aircraft = [{x:42,z:-9},{x:22,z:-8},{x:45,z:-34}];
export const obstacles = [
 ...Array.from({length:11},(_,i)=>({x:-4.4,z:-40+i*8,w:.16,d:.16,h:1,kind:'bollard'})),
 {x:29,z:-27,w:1.2,d:1.2,h:.85,kind:'crate'},
 {x:30.4,z:-27,w:1.2,d:1.2,h:.85,kind:'crate'},
 {x:46,z:8,w:1.2,d:1.2,h:.85,kind:'crate'},
 {x:31,z:8,w:2.5,d:.5,h:.65,kind:'barrier'},
];
export const aircraftSolids=aircraft.flatMap(({x,z})=>[
 ...[-1,1].map(side=>({x:x+side,z:z+1,w:.28,d:.28,minY:0,h:.7,kind:'gear'})),
 {x,z:z+.6,w:10,d:2,minY:1.12,h:1.28,kind:'wing'},
 {x,z,w:1.5,d:5.8,minY:.5,h:1.9,kind:'fuselage'},
 {x,z:z-3.7,w:.75,d:1.6,minY:.78,h:1.65,kind:'nose'},
 {x,z:z+3.7,w:.15,d:1.8,minY:1.2,h:3.2,kind:'tail'},
 {x,z:z+3.6,w:4,d:1,minY:1.23,h:1.37,kind:'tailplane'},
]);
export const collisionSolids=[...solids,...aircraftSolids,...obstacles];
export function overlapsCarHeight(y,solid){return y+.4>(solid.minY??0)&&y-.23<solid.h;}
export const ramps=[{x:22,z:-24,w:4,d:7,h:1.1},{x:12,z:30,w:7,d:4,h:.8}];
export function ground(x,z){let h=Math.abs(x-38)<9&&Math.abs(z+8)<11?.04:0;for(const r of ramps)if(Math.abs(x-r.x)<r.w/2&&Math.abs(z-r.z)<r.d/2)h=Math.max(h,r.h*(.5-(z-r.z)/r.d));return h;}
export const HANGAR_FLOOR={x:38,z:-8,w:18,d:22,h:.04};
export const secrets=[33,38,43].map(x=>({x,z:25}));
export const bounds={x:58,z:48};

// Quad with winding flipped if needed so its normal faces `out`.
function quad(world,a,b,c,d,out,surface){
 const n=cross(sub(b,a),sub(c,a));
 if(dot(n,out)<0)world.addQuad(a,d,c,b,surface);else world.addQuad(a,b,c,d,surface);
}
export function buildBaseWorld(){
 const w=createWorld(4),B=bounds;
 quad(w,[-B.x-2,0,-B.z-2],[B.x+2,0,-B.z-2],[B.x+2,0,B.z+2],[-B.x-2,0,B.z+2],[0,1,0],'asphalt');
 // Hangar floor slab with chamfered edges, so the toy rolls on instead of hitting a step.
 const f=HANGAR_FLOOR,x0=f.x-f.w/2,x1=f.x+f.w/2,z0=f.z-f.d/2,z1=f.z+f.d/2,c=.3,h=f.h;
 quad(w,[x0,h,z0],[x1,h,z0],[x1,h,z1],[x0,h,z1],[0,1,0],'concrete');
 quad(w,[x0,h,z1],[x1,h,z1],[x1+c,0,z1+c],[x0-c,0,z1+c],[0,1,1],'concrete');
 quad(w,[x0,h,z0],[x1,h,z0],[x1+c,0,z0-c],[x0-c,0,z0-c],[0,1,-1],'concrete');
 quad(w,[x1,h,z0],[x1,h,z1],[x1+c,0,z1+c],[x1+c,0,z0-c],[1,1,0],'concrete');
 quad(w,[x0,h,z0],[x0,h,z1],[x0-c,0,z1+c],[x0-c,0,z0-c],[-1,1,0],'concrete');
 // Plywood ramps rise toward −z and drop off at the top.
 for(const r of ramps){
  const x0=r.x-r.w/2,x1=r.x+r.w/2,zl=r.z+r.d/2,zh=r.z-r.d/2;
  quad(w,[x0,0,zl],[x1,0,zl],[x1,r.h,zh],[x0,r.h,zh],[0,r.d,r.h],'wood');
  quad(w,[x0,0,zh],[x1,0,zh],[x1,r.h,zh],[x0,r.h,zh],[0,0,-1],'wood');
  for(const [x,o] of [[x0,-1],[x1,1]]){const a=[x,0,zl],b=[x,0,zh],t=[x,r.h,zh];if(dot(cross(sub(b,a),sub(t,a)),[o,0,0])<0)w.addTri(a,t,b,'wood');else w.addTri(a,b,t,'wood');}
 }
 for(const s of collisionSolids)addBox(w,s.x,s.z,s.w,s.d,s.minY??0,s.h,'concrete');
 // Perimeter walls.
 addBox(w,0,-B.z-.5,2*B.x+2,1,0,1.5);addBox(w,0,B.z+.5,2*B.x+2,1,0,1.5);
 addBox(w,-B.x-.5,0,1,2*B.z,0,1.5);addBox(w,B.x+.5,0,1,2*B.z,0,1.5);
 return w;
}
let cached=null;
export function baseCourse(){return {world:cached??=buildBaseWorld(),checkpoints,secrets,start:{pos:[0,0,5],yaw:0}};}
