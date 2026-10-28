// Arcade transition response, deliberately authored for play rather than realism.
// Head-on up a straight quarter: slow rolls onto the deck, fast gets one up/turn/return.
// A bowl wall always returns, so a held throttle rides the bowl back and forth.
// An oblique launch off a quarter or the hip is a transfer: a bounded hop that faces
// along its travel and meets the face below. No position changes or repeat boosts.
import {dot,cross,add,sub,scale,norm,rotate,unrotate} from './math.mjs';
import {carForward,carUp} from './car.mjs';
import {TRANSITION_SURFACES} from './world.mjs';
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const horizontal=v=>norm([v[0],0,v[2]]);
export function stepQuarterReturn(state,car,raw,dt,world){
 const wheels=car.wheels.filter(w=>w.contact&&TRANSITION_SURFACES.has(w.surface)&&w.contactNormal);
 if(!state.arc){
  if(wheels.length>=2&&car.forwardSpeed>1){
   const n=norm(wheels.reduce((sum,w)=>add(sum,w.contactNormal),[0,0,0]));
   const inward=horizontal(n),forward=horizontal(carForward(car));
   // At the steep upper transition and climbing. A quarter returns only within ~25 degrees
   // of head-on; on a bowl wall any climb counts, since a car carving up at an angle points
   // sideways by the time it is vertical.
   const bowl=wheels.some(w=>w.surface==='bowl'),hip=wheels.some(w=>w.surface==='hip');
   if(n[1]<.72&&n[1]>.01&&car.vel[1]>1){
    const kind=bowl?'return':!hip&&dot(forward,inward)<-.9?'face':'transfer';
    state.armed={kind,inward,yaw:Math.atan2(-inward[0],inward[2]),speed:Math.max(0,car.forwardSpeed),age:0};
   }
  }
  if(state.armed){
   state.armed.age+=dt;
   // A wheel can ride the wall's end cap for a moment after the last transition contact.
   if(state.armed.age>.25||car.vel[1]<0)state.armed=null;
   else if(car.contacts===0){
    const a=state.armed;
    if(a.kind==='transfer'){
     // Keep the horizontal carry, cap the rise: the hop lands on the adjoining face or
     // floor rather than sailing across the bowl into the far wall.
     car.vel[1]=clamp(car.vel[1],1.6,3.2);
     state.arc={kind:'transfer',yaw:Math.atan2(car.vel[0],-car.vel[2]),time:0};
    }else{
     // Playability threshold: the slower golf chassis must reach the return arc too.
     const returning=a.kind==='return'||a.speed>=Math.min(5.8,car.params.topSpeed*.41),bowl=a.kind==='return';
     const tangent=sub([car.vel[0],0,car.vel[2]],scale(a.inward,dot(car.vel,a.inward)));
     const carry=bowl?.5:1.2,drift=Math.hypot(...tangent)>carry?scale(norm(tangent),carry):tangent;
     const sideways=returning?.65:-1.8;
     // A bowl keeps a short, even rhythm between its facing walls.
     const [lo,hi]=bowl?[4.2,5.6]:returning?[5.5,8.5]:[2.2,3.4];
     car.vel=[drift[0]+a.inward[0]*sideways,clamp(car.vel[1],lo,hi),drift[2]+a.inward[2]*sideways];
     state.arc={kind:returning?'return':'exit',returning,yaw:a.yaw,turn:raw.steer<-.15?-1:1,time:0};
    }
    state.armed=null;
   }
  }
 }
 const arc=state.arc;if(!arc)return null;
 arc.time+=dt;
 arc.supported=car.contacts>=2?(arc.supported??0)+dt:0;
 if((arc.time>.16&&arc.supported>.22)||arc.time>3){state.arc=null;return null;}
 let yaw=arc.yaw;
 if(arc.kind==='return'){const t=clamp(arc.time/.65,0,1);yaw+=Math.PI*arc.turn*t*t*(3-2*t);}
 // A transfer faces along its travel, so it meets the landing face nose-down the slope.
 else if(arc.kind==='transfer'&&Math.hypot(car.vel[0],car.vel[2])>.8)yaw=arc.yaw=Math.atan2(car.vel[0],-car.vel[2]);
 let targetUp=[0,1,0];
 if(world&&arc.kind!=='exit'&&car.vel[1]<0){
  const ground=world.raycast(add(car.pos,[0,.3,0]),[0,-1,0],8);
  if(ground&&ground.normal[1]>.35){
   targetUp=ground.normal;
   const clearance=ground.dist-.3-.13;
   if(arc.returning&&clearance<.8){
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
