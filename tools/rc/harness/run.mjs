import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSession,stepSession,readout} from '../../../web/wwwroot/rc/physics/session.mjs';
import {carUp} from '../../../web/wwwroot/rc/physics/car.mjs';
import {courses,tapes} from './courses.mjs';
const DT=1/120;
// Harness runs Big Kid (no assists) so it measures the car itself; kid mode is tested in sim.test.mjs.
export function replay(tape,course=courses.flat,mode='bigKid'){
 const s=createSession(course,{mode}),frames=[];let tick=0;
 for(const segment of tape)for(let i=0;i<segment.ticks;i++){
  stepSession(s,segment.input,DT);const r=readout(s),c=s.car,right=[Math.cos(r.yaw),0,Math.sin(r.yaw)];
  frames.push({tick:++tick,t:tick*DT,input:segment.input,x:r.x,y:r.y,z:r.z,speed:r.speed,forward:r.forwardSpeed,lateral:c.vel[0]*right[0]+c.vel[2]*right[2],yaw:r.yaw,up:carUp(c)[1],slipping:c.wheels.filter(w=>w.slip).length,grounded:r.grounded,contacts:r.contacts,hits:s.hits});
 }
 return {state:s,frames,sha256:crypto.createHash('sha256').update(JSON.stringify(frames)).digest('hex')};
}
export function measure(name,result){
 const f=result.frames,first=f[0],last=f.at(-1);let maxY=0,maxSpeed=0,airTicks=0,maxSlip=0;
 let minUp=1;for(const s of f){maxY=Math.max(maxY,s.y);maxSpeed=Math.max(maxSpeed,s.speed);airTicks+=Number(!s.contacts);maxSlip=Math.max(maxSlip,Math.abs(s.lateral));minUp=Math.min(minUp,s.up);}
 const metrics={maxSpeedMps:maxSpeed,maxCentreHeightM:maxY,airSeconds:airTicks*DT,maxLateralSpeedMps:maxSlip,impacts:last.hits,minUpY:minUp,wheelSlipTicks:f.reduce((n,x)=>n+x.slipping,0),endSpeedMps:last.speed,distanceM:result.state.travel};
 if(name==='acceleration')metrics.secondsTo9Mps=f.find(x=>x.forward>=9)?.t??null;
 if(name==='brake'){const start=f[239],stop=f.slice(240).find(x=>x.speed<.2);metrics.stopDistanceM=stop?Math.hypot(stop.x-start.x,stop.z-start.z):null;metrics.stopSeconds=stop?stop.t-start.t:null;}
 if(name==='turn'){const start=f[239],end=f[479];const yaw=end.yaw-start.yaw;metrics.meanTurnRadiusM=Math.abs(yaw)>1e-8?Math.hypot(end.x-start.x,end.z-start.z)/(2*Math.abs(Math.sin(yaw/2))):null;metrics.yawChangeRad=yaw;}
 return metrics;
}
export function suite(){
 const output={schema:1,dt:DT,epistemic:'Measured from this authored simulation only; not Re-Volt parity',reference:{status:'rvgl_installed_no_matched_capture',measurements:null},cases:{}};
 for(const [name,tape] of Object.entries(tapes)){const result=replay(tape,courses[name]??courses.flat);const twice=replay(tape,courses[name]??courses.flat);if(result.sha256!==twice.sha256)throw Error(`Nondeterministic replay: ${name}`);output.cases[name]={metrics:measure(name,result),sha256:result.sha256,ticks:result.frames.length};}
 return output;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const out=process.argv[2];const result=suite();if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/metrics.json`,JSON.stringify(result,null,2)+'\n');for(const [name,tape] of Object.entries(tapes))fs.writeFileSync(`${out}/${name}.jsonl`,replay(tape,courses[name]??courses.flat).frames.map(f=>JSON.stringify(f)).join('\n')+'\n');}
 console.log(JSON.stringify(result,null,2));
}
