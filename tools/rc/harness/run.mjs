import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createCar,stepCar} from '../../../web/wwwroot/rc/sim.mjs';
import {courses,tapes} from './courses.mjs';
const DT=1/120;
export function replay(tape,course=courses.flat){
 const state=createCar(),frames=[];let tick=0;
 for(const segment of tape)for(let i=0;i<segment.ticks;i++){
  stepCar(state,segment.input,DT,course);
  frames.push({tick:++tick,t:tick*DT,input:segment.input,x:state.x,y:state.y,z:state.z,vx:state.vx,vz:state.vz,vy:state.vy,speed:state.speed,yaw:state.yaw,grounded:state.grounded,hits:state.hits});
 }
 return {state,frames,sha256:crypto.createHash('sha256').update(JSON.stringify(frames)).digest('hex')};
}
export function measure(name,result){
 const f=result.frames,first=f[0],last=f.at(-1);let maxY=0,maxSpeed=0,airTicks=0,maxSlip=0;
 for(const s of f){maxY=Math.max(maxY,s.y);maxSpeed=Math.max(maxSpeed,s.speed);airTicks+=Number(!s.grounded);const side=s.vx*Math.cos(s.yaw)+s.vz*Math.sin(s.yaw);maxSlip=Math.max(maxSlip,Math.abs(side));}
 const metrics={maxSpeedMps:maxSpeed,maxCentreHeightM:maxY,airSeconds:airTicks*DT,maxLateralSpeedMps:maxSlip,impacts:last.hits,endSpeedMps:last.speed,distanceM:result.state.travel};
 if(name==='acceleration')metrics.secondsTo9Mps=f.find(x=>x.speed>=9)?.t??null;
 if(name==='brake'){const start=f[239],stop=f.slice(240).find(x=>x.speed<.2);metrics.stopDistanceM=stop?Math.hypot(stop.x-start.x,stop.z-start.z):null;metrics.stopSeconds=stop?stop.t-start.t:null;}
 if(name==='turn'){const start=f[239],end=f[479];const yaw=end.yaw-start.yaw;metrics.meanTurnRadiusM=Math.abs(yaw)>1e-8?Math.hypot(end.x-start.x,end.z-start.z)/(2*Math.abs(Math.sin(yaw/2))):null;metrics.yawChangeRad=yaw;}
 return metrics;
}
export function suite(){
 const output={schema:1,dt:DT,epistemic:'Measured from this authored simulation only; not Re-Volt parity',reference:{status:'blocked_no_installed_game_data',measurements:null},cases:{}};
 for(const [name,tape] of Object.entries(tapes)){const result=replay(tape,courses[name]??courses.flat);const twice=replay(tape,courses[name]??courses.flat);if(result.sha256!==twice.sha256)throw Error(`Nondeterministic replay: ${name}`);output.cases[name]={metrics:measure(name,result),sha256:result.sha256,ticks:result.frames.length};}
 return output;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const out=process.argv[2];const result=suite();if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/metrics.json`,JSON.stringify(result,null,2)+'\n');for(const [name,tape] of Object.entries(tapes))fs.writeFileSync(`${out}/${name}.jsonl`,replay(tape,courses[name]??courses.flat).frames.map(f=>JSON.stringify(f)).join('\n')+'\n');}
 console.log(JSON.stringify(result,null,2));
}
