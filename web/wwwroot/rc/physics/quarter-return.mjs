// Arcade transition response, deliberately authored for play rather than realism.
// Head-on up a straight quarter: slow rolls onto the deck, fast gets one up/turn/return.
// A bowl wall always returns, so a held throttle rides the bowl back and forth.
// An oblique launch off a quarter or the hip is a transfer: a bounded hop that faces
// along its travel and meets the face below. No position changes or repeat boosts.
import {dot,cross,add,sub,scale,norm,rotate,unrotate} from './math.mjs';
import {carForward,carUp,rideHeight} from './car.mjs';
import {TRANSITION_SURFACES} from './world.mjs';
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const horizontal=v=>norm([v[0],0,v[2]]);
// Where a ballistic hop from here first meets the world, traced with the car's centre: close
// enough to judge which face it comes down on.
function landing(world,pos,vel){
 let p=pos;
 for(let t=.04;t<2.4;t+=.04){
  const q=[pos[0]+vel[0]*t,pos[1]+vel[1]*t-4.905*t*t,pos[2]+vel[2]*t],d=sub(q,p),len=Math.hypot(...d);
  const hit=len>1e-6&&world.raycast(p,scale(d,1/len),len);
  if(hit)return hit;p=q;
 }
 return null;
}
// A transfer must come down on floor, a deck or a face sloping away along its travel, never
// into a wall ahead. Shorten it first, then turn it a little, until it does.
function safeTransfer(world,pos,vel){
 const good=v=>{const h=landing(world,pos,v);return h&&(h.normal[1]>.9||dot(horizontal(h.normal),horizontal(v))>.3);};
 for(const k of [.9,.8,.7,.55,.4])for(const a of [0,.26,-.26,.52,-.52]){
  const c=Math.cos(a),s=Math.sin(a),v=[(vel[0]*c-vel[2]*s)*k,vel[1],(vel[0]*s+vel[2]*c)*k];
  if(good(v))return v;
 }
 return vel;
}
export function stepQuarterReturn(state,car,raw,dt,world){
 const wheels=car.wheels.filter(w=>w.contact&&TRANSITION_SURFACES.has(w.surface)&&w.contactNormal);
 if(!state.arc){
  // Kick turn: a car that stalls nose-up on a bowl or vert wall pops off it and turns to face
  // back down, instead of sliding back fakie into a throttle that drives it up again.
  const wall=wheels.filter(w=>w.surface==='bowl'||w.surface==='vert');
  if(wall.length>=2&&!state.armed&&(raw.throttle??0)>.2&&!raw.brake){
   const n=norm(wall.reduce((sum,w)=>add(sum,w.contactNormal),[0,0,0])),inward=horizontal(n);
   if(n[1]<.85&&n[1]>.05&&dot(horizontal(carForward(car)),inward)<-.5&&car.forwardSpeed<.5&&car.vel[1]<.3){
    car.vel=add(scale(inward,1.2),scale(n,1.4));
    state.arc={kind:'return',returning:true,kick:true,yaw:Math.atan2(-inward[0],inward[2]),turn:raw.steer<-.15?-1:1,time:0};
   }
  }
 }
 if(!state.arc){
  if(wheels.length>=2&&car.forwardSpeed>1){
   const n=norm(wheels.reduce((sum,w)=>add(sum,w.contactNormal),[0,0,0]));
   const inward=horizontal(n),forward=horizontal(carForward(car));
   // At the steep upper transition and climbing. A quarter returns only within ~25 degrees
   // of head-on; on a bowl wall any climb counts, since a car carving up at an angle points
   // sideways by the time it is vertical.
   const vert=wheels.some(w=>w.surface==='vert'),bowl=vert||wheels.some(w=>w.surface==='bowl'),hip=wheels.some(w=>w.surface==='hip');
   if(n[1]<.72&&n[1]>.01&&car.vel[1]>1){
    const kind=bowl?'return':!hip&&dot(forward,inward)<-.9?'face':'transfer';
    state.armed={kind,vert,hip,inward,yaw:Math.atan2(-inward[0],inward[2]),speed:Math.max(0,car.forwardSpeed),age:0};
   }else if(hip&&(!state.armed||state.armed.hip)&&car.vel[1]>.4&&car.forwardSpeed>2.5){
    // The hip's low corner is gentle: rolled over at speed it still launches a real transfer.
    state.armed={kind:'transfer',hip:true,inward,yaw:0,speed:car.forwardSpeed,age:0};
   }
  }
  if(state.armed){
   state.armed.age+=dt;
   // A wheel can ride the wall's end cap for a moment after the last transition contact.
   // Over the hip's crest the last wheel leaves just as the climb tops out.
   if(state.armed.age>.25||car.vel[1]<(state.armed.hip?-.8:0))state.armed=null;
   else if(car.contacts===0){
    const a=state.armed;
    if(a.kind==='transfer'){
     // Keep the horizontal carry, cap the rise: the hop lands on the adjoining face or
     // floor rather than sailing across the bowl into the far wall.
     car.vel[1]=clamp(car.vel[1],a.hip?2.4:1.6,3.2);
     if(world)car.vel=safeTransfer(world,car.pos,car.vel);
     state.arc={kind:'transfer',yaw:Math.atan2(car.vel[0],-car.vel[2]),time:0};
    }else{
     // Playability threshold: the slower golf chassis must reach the return arc too.
     const returning=a.kind==='return'||a.speed>=Math.min(5.8,car.params.topSpeed*.41),bowl=a.kind==='return';
     const tangent=sub([car.vel[0],0,car.vel[2]],scale(a.inward,dot(car.vel,a.inward)));
     const carry=bowl?.5:1.2,drift=Math.hypot(...tangent)>carry?scale(norm(tangent),carry):tangent;
     const sideways=returning?.65:-1.8;
     // A bowl keeps a short, even rhythm between its facing walls.
     // A vert wall carries the most: big, readable air above the coping.
     const [lo,hi]=a.vert?[5.5,8]:bowl?[4.2,5.45]:returning?[5.5,8.5]:[2.2,3.4];
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
   const clearance=ground.dist-.3-rideHeight(car.params);
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
