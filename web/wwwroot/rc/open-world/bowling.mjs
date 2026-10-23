// Toy-scale bowling: the RC car is the ball. Authored arcade pin impulses, SI coordinates.
export const BOWLING_TEE={pos:[-1020,0,1258],yaw:0};
export const pinRack=()=>Array.from({length:10},(_,i)=>{const row=Math.floor((Math.sqrt(8*i+1)-1)/2),col=i-row*(row+1)/2;return {pos:[-1020+(col-row/2)*.46,1236-row*.46],vel:[0,0],down:false,fall:0};});
export function createBowling(){return {kind:'bowling',pins:pinRack(),delivery:1,launched:false,settling:0,done:false,score:0};}
export function nextDelivery(g){if(g.done)return null;if(g.delivery===1){g.delivery=2;g.launched=false;g.settling=0;for(const pin of g.pins)pin.vel=[0,0];return BOWLING_TEE;}g.done=true;return null;}
export function stepBowling(g,car,dt){
 if(g.done)return null;if(Math.hypot(car.pos[0]+1020,car.pos[2]-1247)>65)return {cancelled:true};
 const speed=Math.hypot(car.vel[0],car.vel[2]);
 const knock=(pin,vx,vz)=>{if(!pin.down){pin.down=true;pin.vel=[vx,vz];g.score++;g.launched=true;g.settling=0;}};
 for(const pin of g.pins){if(pin.down)continue;const dx=pin.pos[0]-car.pos[0],dz=pin.pos[1]-car.pos[2],dist=Math.hypot(dx,dz);if(dist<.43&&speed>.4&&car.pos[1]<.9){knock(pin,car.vel[0]*.65,car.vel[2]*.65);car.vel[0]*=.92;car.vel[2]*=.92;}}
 if(car.pos[2]<1234)g.launched=true;
 for(const pin of g.pins){if(!pin.down)continue;pin.fall=Math.min(1,pin.fall+dt*3);pin.pos=pin.pos.map((v,i)=>v+pin.vel[i]*dt);const drag=Math.exp(-2*dt);pin.vel=pin.vel.map(v=>v*drag);
  for(const other of g.pins){if(other.down)continue;const dx=other.pos[0]-pin.pos[0],dz=other.pos[1]-pin.pos[1],dist=Math.hypot(dx,dz);if(dist<.55&&Math.hypot(...pin.vel)>.3)knock(other,pin.vel[0]*.65+dx*2,pin.vel[1]*.65+dz*2);}
 }
 if(g.launched){g.settling+=dt;if(g.settling>3){if(g.score===10||g.delivery===2){g.done=true;return {finished:true,score:g.score,strike:g.score===10&&g.delivery===1};}return {tee:nextDelivery(g),delivery:2};}}
 return null;
}
