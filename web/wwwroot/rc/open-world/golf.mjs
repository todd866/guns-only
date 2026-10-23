// Authored arcade rolling-ball physics, not measured golf-ball data. Metres and seconds.
export const GOLF_HOLES=[-345,-330,-315].map(x=>({tee:[x,2784],cup:[x,2764],par:3}));
export function createGolf(){return {kind:'golf',hole:0,strokes:0,scores:[],ball:[...GOLF_HOLES[0].tee],velocity:[0,0],touching:false,cooldown:0,sinking:0,done:false};}
export const golfTee=g=>{const p=GOLF_HOLES[g.hole].tee;return {pos:[p[0],0,p[1]+2],yaw:0};};
export function resetGolf(g){if(g.done)return null;g.strokes++;g.ball=[...GOLF_HOLES[g.hole].tee];g.velocity=[0,0];g.touching=false;g.sinking=0;return golfTee(g);}
export function stepGolf(g,car,dt){
 if(g.done)return null;
 if(Math.hypot(car.pos[0]+330,car.pos[2]-2776)>90)return {cancelled:true};
 if(g.sinking>0){g.sinking-=dt;if(g.sinking<=0){g.scores.push(g.strokes);if(g.hole===GOLF_HOLES.length-1){g.done=true;return {finished:true,total:g.scores.reduce((a,b)=>a+b,0)};}g.hole++;g.strokes=0;g.ball=[...GOLF_HOLES[g.hole].tee];g.velocity=[0,0];g.touching=false;return {tee:golfTee(g)};}return null;}
 g.cooldown=Math.max(0,g.cooldown-dt);
 const dx=g.ball[0]-car.pos[0],dz=g.ball[1]-car.pos[2],d=Math.hypot(dx,dz),near=d<.7&&car.pos[1]<.9;
 if(near&&d>.001){const nx=dx/d,nz=dz/d,approach=(car.vel[0]-g.velocity[0])*nx+(car.vel[2]-g.velocity[1])*nz;
  if(approach>.1){const impulse=Math.min(10,approach*1.05);g.velocity[0]+=nx*impulse;g.velocity[1]+=nz*impulse;car.vel[0]*=.86;car.vel[2]*=.86;if(!g.touching&&g.cooldown===0){g.strokes++;g.cooldown=.6;}}
 }
 g.touching=near;
 const speed=Math.hypot(...g.velocity),drag=Math.max(0,1-dt*.8-(speed?dt*.25/speed:0));g.velocity=g.velocity.map(v=>v*drag);g.ball=g.ball.map((v,i)=>v+g.velocity[i]*dt);
 const hole=GOLF_HOLES[g.hole];
 if(Math.hypot(g.ball[0]-hole.cup[0],g.ball[1]-hole.cup[1])<.8&&Math.hypot(...g.velocity)<4&&g.strokes>0){g.ball=[...hole.cup];g.velocity=[0,0];g.sinking=1.2;return {sunk:true};}
 // A ball out of the authored green returns to the tee with a penalty; it never traps a child.
 if(Math.abs(g.ball[0]-hole.tee[0])>35||Math.abs(g.ball[1]-hole.tee[1])>50)return {tee:resetGolf(g),reset:true};
 return null;
}
