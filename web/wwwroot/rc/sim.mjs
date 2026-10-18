// Original fictional RC dynamics; SI units. No Re-Volt/RVGL code or data.
export const checkpoints = [[0,0,'Motor pool'],[0,-22,'Housing'],[22,-30,'Flight line'],[38,-8,'Hangar 02'],[38,22,'Containment'],[38,35,'Service exit'],[12,35,'Drain shortcut'],[0,0,'Finish']];
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
export const ramps=[{x:22,z:-24,w:4,d:7,h:1.1},{x:12,z:30,w:7,d:4,h:.8}];
export function ground(x,z){let h=0;for(const r of ramps)if(Math.abs(x-r.x)<r.w/2&&Math.abs(z-r.z)<r.d/2)h=Math.max(h,r.h*(.5-(z-r.z)/r.d));return h;}
export function createCar(){return {x:0,z:5,y:.23,vx:0,vz:0,vy:0,yaw:0,steer:0,pitch:0,roll:0,speed:0,grounded:true,time:0,gate:0,running:false,finished:false,hits:0,found:0,seen:[],travel:0};}
export function resetCar(s){const p=checkpoints[Math.max(0,s.gate-1)];Object.assign(s,{x:p[0],z:p[1],y:ground(p[0],p[1])+.23,vx:0,vz:0,vy:0,yaw:0});if(s.running)s.time+=3;}
export function stepCar(s,input,dt=1/120){
 const throttle=Math.max(-1,Math.min(1,input.throttle||0));const steer=Math.max(-1,Math.min(1,input.steer||0));
 s.steer+=(steer-s.steer)*Math.min(1,dt*9);
 const fx=Math.sin(s.yaw),fz=-Math.cos(s.yaw),rx=Math.cos(s.yaw),rz=Math.sin(s.yaw);
 let forward=s.vx*fx+s.vz*fz,side=s.vx*rx+s.vz*rz;
 const grounded=s.y<=ground(s.x,s.z)+.25;
 if(grounded){forward+=throttle*(forward*throttle<0?24:13)*dt;forward*=Math.exp(-(input.brake?6:.55)*dt);forward=Math.max(-4.5,Math.min(11,forward));side*=Math.exp(-(input.brake?2.1:11)*dt);s.yaw+=s.steer*forward*.52/(1+Math.abs(forward)*.10)*dt;}
 s.vx=fx*forward+rx*side;s.vz=fz*forward+rz*side;
 const oldX=s.x,oldZ=s.z;
 s.x+=s.vx*dt;s.z+=s.vz*dt;s.vy-=9.81*dt;s.y+=s.vy*dt;
 const floor=ground(s.x,s.z)+.23;
 if(s.y<floor){s.vy=Math.max(0,(floor-s.y)*26);s.y=floor;s.grounded=true;}else s.grounded=s.y<floor+.035;
 for(const b of solids){if(s.y-.15>b.h)continue;const dx=s.x-b.x,dz=s.z-b.z,ox=b.w/2+.23-Math.abs(dx),oz=b.d/2+.23-Math.abs(dz);if(ox>0&&oz>0){if(ox<oz){s.x+=Math.sign(dx||1)*ox;s.vx*=-.28;}else{s.z+=Math.sign(dz||1)*oz;s.vz*=-.28;}if(s.speed>2)s.hits++;}}
 if(Math.abs(s.x)>58){s.x=Math.sign(s.x)*58;s.vx*=-.3;}if(Math.abs(s.z)>48){s.z=Math.sign(s.z)*48;s.vz*=-.3;}
 s.speed=Math.hypot(s.vx,s.vz);s.travel+=Math.hypot(s.x-oldX,s.z-oldZ);
 const front=ground(s.x+fx*.32,s.z+fz*.32),back=ground(s.x-fx*.32,s.z-fz*.32);
 s.pitch+=(Math.atan2(front-back,.64)-s.pitch)*Math.min(1,dt*12);
 s.roll+=(-s.steer*forward*.018-s.roll)*Math.min(1,dt*8);
 if(s.running)s.time+=dt;
 const gate=checkpoints[s.gate];if(!s.finished&&Math.hypot(s.x-gate[0],s.z-gate[1])<2.4){if(!s.running){s.running=true;s.time=0;}s.gate++;if(s.gate===checkpoints.length){s.running=false;s.finished=true;s.gate=checkpoints.length-1;}}
 for(const [i,x] of [33,38,43].entries())if(!s.seen.includes(i)&&Math.hypot(s.x-x,s.z-25)<3.3){s.seen.push(i);s.found++;}
}
