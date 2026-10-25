// Arcade quarter-pipe response, deliberately authored for play rather than realism.
// A slow lip exit rolls onto the deck; a fast head-on approach gets one up/turn/return.
// No position changes, hidden ramps or repeat boosts. Hip/oblique transfers stay free.
import {dot,cross,add,sub,scale,norm,rotate,unrotate} from './math.mjs';
import {carForward,carUp} from './car.mjs';
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const horizontal=v=>norm([v[0],0,v[2]]);
export function stepQuarterReturn(state,car,raw,dt,world){
 const wheels=car.wheels.filter(w=>w.contact&&w.surface==='quarter'&&w.contactNormal);
 if(!state.arc){
  if(wheels.length>=2&&car.forwardSpeed>1){
   const n=norm(wheels.reduce((sum,w)=>add(sum,w.contactNormal),[0,0,0]));
   const inward=horizontal(n),forward=horizontal(carForward(car));
   // At the steep upper transition, moving into the face, within ~25 degrees.
   if(n[1]<.72&&n[1]>.01&&dot(forward,inward)<-.9&&car.vel[1]>1){
    state.armed={inward,yaw:Math.atan2(-inward[0],inward[2]),speed:Math.max(0,car.forwardSpeed),age:0};
   }
  }
  if(state.armed){
   state.armed.age+=dt;
   if(state.armed.age>.1||car.vel[1]<0)state.armed=null;
   else if(car.contacts===0){
    // Playability threshold: the slower golf chassis must reach the return arc too.
    const a=state.armed,returning=a.speed>=Math.min(5.8,car.params.topSpeed*.41);
    const tangent=sub([car.vel[0],0,car.vel[2]],scale(a.inward,dot(car.vel,a.inward)));
    const drift=Math.hypot(...tangent)>1.2?scale(norm(tangent),1.2):tangent;
    const sideways=returning?.65:-1.8;
    car.vel=[drift[0]+a.inward[0]*sideways,clamp(car.vel[1],returning?5.5:2.2,returning?8.5:3.4),drift[2]+a.inward[2]*sideways];
    state.arc={returning,yaw:a.yaw,turn:raw.steer<-.15?-1:1,time:0};state.armed=null;
   }
  }
 }
 const arc=state.arc;if(!arc)return null;
 arc.time+=dt;
 arc.supported=car.contacts>=2?(arc.supported??0)+dt:0;
 if((arc.time>.16&&arc.supported>.22)||arc.time>3){state.arc=null;return null;}
 const t=clamp(arc.time/.65,0,1),smooth=t*t*(3-2*t),yaw=arc.yaw+(arc.returning?Math.PI*arc.turn*smooth:0);
 let targetUp=[0,1,0];
 if(world&&arc.returning&&car.vel[1]<0){
  const ground=world.raycast(add(car.pos,[0,.3,0]),[0,-1,0],8);
  if(ground&&ground.normal[1]>.35){
   targetUp=ground.normal;
   const clearance=ground.dist-.3-.13;
   if(clearance<.8){
    // Soften the last part of the descent and carry the saved approach energy
    // down the transition. This prevents a toy-suspension bounce from undoing
    // the turn; gravity and the real ramp still determine contact and position.
    car.vel[1]=Math.max(car.vel[1],-(2.4+Math.max(0,clearance)*3));
    const inward=[-Math.sin(arc.yaw),0,Math.cos(arc.yaw)],blend=1-Math.exp(-7*dt);
    car.vel[0]+=(inward[0]*3-car.vel[0])*blend;car.vel[2]+=(inward[2]*3-car.vel[2])*blend;
   }
  }
 }
 const forward=[Math.sin(yaw),0,-Math.cos(yaw)];
 const targetForward=norm(sub(forward,scale(targetUp,dot(forward,targetUp))));
 const error=scale(add(cross(carForward(car),targetForward),cross(carUp(car),targetUp)),.5);
 // Bounded attitude acceleration: visibly rotate in flight and align to the landing face.
 let acceleration=sub(scale(error,144),scale(car.ang,20));
 const size=Math.hypot(...acceleration);if(size>100)acceleration=scale(acceleration,100/size);
 return rotate(car.q,unrotate(car.q,acceleration).map((v,i)=>v/car.invInertia[i]));
}
