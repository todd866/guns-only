// Original fictional RC dynamics; SI units. No Re-Volt/RVGL code or data.
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
export const BASE_COURSE={ground,solids:collisionSolids,checkpoints,secrets:[33,38,43].map(x=>({x,z:25})),bounds:{x:58,z:48}};
export function createCar(){return {x:0,z:5,y:.23,vx:0,vz:0,vy:0,yaw:0,steer:0,pitch:0,roll:0,speed:0,grounded:true,time:0,gate:0,running:false,finished:false,hits:0,found:0,seen:[],travel:0};}
export function resetCar(s,course=BASE_COURSE){const p=course.checkpoints[Math.max(0,s.gate-1)];Object.assign(s,{x:p[0],z:p[1],y:course.ground(p[0],p[1])+.23,vx:0,vz:0,vy:0,yaw:0});if(s.running)s.time+=3;}
export function stepCar(s,input,dt=1/120,course=BASE_COURSE){
 const surface=course.ground;
 const throttle=Math.max(-1,Math.min(1,input.throttle||0));const steer=Math.max(-1,Math.min(1,input.steer||0));
 s.steer+=(steer-s.steer)*Math.min(1,dt*9);
 const fx=Math.sin(s.yaw),fz=-Math.cos(s.yaw),rx=Math.cos(s.yaw),rz=Math.sin(s.yaw);
 let forward=s.vx*fx+s.vz*fz,side=s.vx*rx+s.vz*rz;
 const grounded=s.y<=surface(s.x,s.z)+.25;
 if(grounded){forward+=throttle*(forward*throttle<0?24:13)*dt;forward*=Math.exp(-(input.brake?6:.55)*dt);forward=Math.max(-4.5,Math.min(11,forward));side*=Math.exp(-(input.brake?2.1:11)*dt);s.yaw+=s.steer*forward*.52/(1+Math.abs(forward)*.10)*dt;}
 s.vx=fx*forward+rx*side;s.vz=fz*forward+rz*side;
 const oldX=s.x,oldZ=s.z;
 s.x+=s.vx*dt;s.z+=s.vz*dt;s.vy-=9.81*dt;s.y+=s.vy*dt;
 const floor=surface(s.x,s.z)+.23;
 if(s.y<floor){s.vy=Math.min(3.2,Math.max(0,(floor-s.y)*26));s.y=floor;s.grounded=true;}else s.grounded=s.y<floor+.035;
 for(const b of course.solids){if(!overlapsCarHeight(s.y,b))continue;const dx=s.x-b.x,dz=s.z-b.z,ox=b.w/2+.23-Math.abs(dx),oz=b.d/2+.23-Math.abs(dz);if(ox>0&&oz>0){if(ox<oz){s.x+=Math.sign(dx||1)*ox;s.vx*=-.28;}else{s.z+=Math.sign(dz||1)*oz;s.vz*=-.28;}if(s.speed>2)s.hits++;}}
 if(Math.abs(s.x)>course.bounds.x){s.x=Math.sign(s.x)*course.bounds.x;s.vx*=-.3;}if(Math.abs(s.z)>course.bounds.z){s.z=Math.sign(s.z)*course.bounds.z;s.vz*=-.3;}
 s.speed=Math.hypot(s.vx,s.vz);s.travel+=Math.hypot(s.x-oldX,s.z-oldZ);
 const front=surface(s.x+fx*.32,s.z+fz*.32),back=surface(s.x-fx*.32,s.z-fz*.32);
 s.pitch+=(Math.atan2(front-back,.64)-s.pitch)*Math.min(1,dt*12);
 s.roll+=(-s.steer*forward*.018-s.roll)*Math.min(1,dt*8);
 if(s.running)s.time+=dt;
 const gate=course.checkpoints[s.gate];if(!s.finished&&s.y<surface(s.x,s.z)+1.6&&Math.hypot(s.x-gate[0],s.z-gate[1])<2.4){if(!s.running){s.running=true;s.time=0;}s.gate++;if(s.gate===course.checkpoints.length){s.running=false;s.finished=true;s.gate=course.checkpoints.length-1;}}
 for(const [i,p] of course.secrets.entries())if(s.y<2&&!s.seen.includes(i)&&Math.hypot(s.x-p.x,s.z-p.z)<3.3){s.seen.push(i);s.found++;}
}
