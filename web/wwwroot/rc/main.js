import * as T from '../vendor/three.module.js';
import {buildings,solids,ramps,checkpoints,createCar,stepCar,resetCar} from './sim.mjs';
import { MotorAudio } from './audio.js';
const audio=new MotorAudio();
const $=id=>document.getElementById(id),canvas=$('view');
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new T.Scene();scene.background=new T.Color('#b2c6c5');scene.fog=new T.Fog('#b2c6c5',65,150);
const camera=new T.PerspectiveCamera(63,1,.06,210);
scene.add(new T.HemisphereLight(0xd5edf1,0x5a624a,2.3));const sun=new T.DirectionalLight(0xffd6a0,3.2);sun.position.set(-30,55,-25);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-65,right:65,top:55,bottom:-55,near:1,far:150});sun.shadow.bias=-.0003;scene.add(sun);
const mats=new Map();function material(c,glow=false){const key=c+glow;if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color:c,roughness:.8,...(glow?{emissive:c,emissiveIntensity:.8}:{})}));return mats.get(key);}
function box(x,y,z,w,h,d,color,parent=scene){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function sphere(x,y,z,r,color,parent=scene,sx=1,sy=1,sz=1){const m=new T.Mesh(new T.SphereGeometry(r,14,10),material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;}
function sign(text,x,y,z,width=4){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#172e33';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#e5c58a';ctx.lineWidth=8;ctx.strokeRect(5,5,502,118);ctx.fillStyle='#f8ebce';ctx.font='bold 44px monospace';ctx.textAlign='center';ctx.fillText(text,256,79);const m=new T.Mesh(new T.PlaneGeometry(width,width/4),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),side:T.DoubleSide}));m.position.set(x,y,z);scene.add(m);return m;}
// Deterministic original surface grain at toy-eye distance; no downloaded textures.
for(const [color,repeat] of [['#555f60',18],['#8b9389',12],['#7d8766',30],['#9ca59b',8]]){
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,128,128);let seed=717;
 for(let i=0;i<3000;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%128;seed=(seed*1664525+1013904223)>>>0;const y=seed%128;ctx.fillStyle=i%2?'#ffffff16':'#00000014';ctx.fillRect(x,y,1,1);}
 const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(repeat,repeat);tex.colorSpace=T.SRGBColorSpace;material(color).map=tex;
}
box(0,-.2,0,130,.4,110,'#7d8766');
box(0,.008,0,7,.025,90,'#555f60');box(22,.01,-36,48,.025,8,'#555f60');box(38,.01,1,9,.025,80,'#657072');box(20,.01,34,44,.025,8,'#555f60');box(20,.008,-8,60,.02,30,'#8b9389');
for(let z=-42;z<45;z+=5)box(0,.03,z,.10,.015,2,'#ded4ad');for(let x=5;x<45;x+=5)box(x,.035,34,2,.015,.1,'#ded4ad');
// Scale cues: kerbs, drain grates, bollards, grass tufts, human-size doors.
for(const x of [-3.7,3.7])for(let z=-42;z<44;z+=2)box(x,.09,z,.25,.18,1.9,'#b9b6a3');
for(let z=-40;z<43;z+=8){box(-4.4,.5,z,.16,1,.16,'#dbc17f');box(-4.4,.82,z,.18,.14,.18,'#283635');}
for(let i=0;i<180;i++){const x=Math.sin(i*91.7)*55,z=Math.cos(i*38.2)*45;if(Math.abs(x)>8&&!(x>25&&x<49))box(x,.12,z,.06,.24,.07,'#6c7953');}
for(const b of buildings){if(b.kind==='house'){
 box(b.x,2.5,b.z,b.w,5,b.d,'#c1b49a');const roof=new T.Mesh(new T.ConeGeometry(6.15,2,4),material('#686e68'));roof.rotation.y=Math.PI/4;roof.position.set(b.x,5.8,b.z);roof.castShadow=true;scene.add(roof);
 for(const dx of [-2.5,2.5])for(const z of [b.z-4.02,b.z+4.02])box(b.x+dx,2.6,z,1.3,1.7,.06,'#49636a');box(b.x,1.1,b.z+4.04,1.2,2.2,.08,'#58655f');box(b.x,5.7,b.z,1,.3,1,'#7f8176');
 }else{
 for(const s of solids.filter(s=>Math.abs(s.x-b.x)<b.w/2+.1&&Math.abs(s.z-b.z)<=b.d/2))box(s.x,s.h/2,s.z,s.w,s.h,s.d,b.kind==='lab'?'#909d95':'#7c8b86');
 box(b.x,b.h+.12,b.z,b.w+.5,.25,b.d+.5,b.kind==='lab'?'#536661':'#71817c');
 for(let z=b.z-b.d/2;z<=b.z+b.d/2;z+=3)for(const side of [-1,1])box(b.x+side*b.w/2,b.h/2,z,.18,b.h,.16,'#b4b9a4');
 sign(b.kind==='lab'?'09 / RESTRICTED':'HANGAR 02',b.x,b.h-1,b.z-b.d/2-.24,6).rotation.y=Math.PI;
 box(b.x,.03,b.z,b.w,.06,b.d,'#9ca59b');
 for(const x of [b.x-6,b.x+6])box(x,b.h-.3,b.z,.15,.12,b.d-2,'#e6d5ad');
 }}
function plane(x,z){const g=new T.Group();g.position.set(x,1.2,z);scene.add(g);sphere(0,0,0,1,'#acb5ad',g,1,.7,4.7);box(0,0,.6,10,.16,2,'#929f96',g);box(0,.1,3.6,4,.13,1,'#919e94',g);box(0,1,3.7,.15,2,1.8,'#77867f',g);sphere(0,.55,-1.4,.75,'#354e58',g,.65,.7,1.8);for(const dx of [-1,1])box(dx,-.85,1,.2,.7,.2,'#263032',g);}
plane(38,-9);plane(22,-8);plane(45,-34);
for(const r of ramps){const g=new T.BufferGeometry();const x=r.w/2,z=r.d/2,h=r.h;g.setAttribute('position',new T.Float32BufferAttribute([-x,0,z,x,0,z,x,h,-z,-x,0,z,x,h,-z,-x,h,-z],3));g.computeVertexNormals();const m=new T.Mesh(g,new T.MeshStandardMaterial({color:'#bc8b50',side:T.DoubleSide,roughness:.9}));m.position.set(r.x,.015,r.z);m.receiveShadow=true;scene.add(m);for(const dx of [-x+.12,x-.12]){const rail=box(r.x+dx,h/2+.025,r.z,.12,.035,Math.hypot(r.d,h),'#ead099');rail.rotation.x=Math.atan2(h,r.d);}}
// Secret lab: three original containment specimens, reachable through the hangar service doors.
const aliens=[];for(const [i,x] of [33,38,43].entries()){
 box(x,.12,25,1.7,.24,1.7,'#334e4b');const tube=new T.Mesh(new T.CylinderGeometry(.8,.8,2.6,20,1,true),new T.MeshPhysicalMaterial({color:'#72ffce',transparent:true,opacity:.18,roughness:.15,side:T.DoubleSide,depthWrite:false}));tube.position.set(x,1.55,25);scene.add(tube);const a=new T.Group();a.position.set(x,.4,25);scene.add(a);sphere(0,1.35,0,.42,'#99b99e',a,1.1,1.3,.9);sphere(0,.6,0,.35,'#779882',a,.7,1.4,.7);for(const side of [-1,1]){sphere(side*.19,1.4,-.31,.14,'#152a28',a,1,1.4,.4);box(side*.14,.12,0,.12,.5,.13,'#779882',a);box(side*.34,.6,0,.09,.6,.10,'#779882',a);}aliens.push(a);const light=new T.PointLight('#70ffc5',8,5);light.position.set(x,2,25);scene.add(light);sign('SPECIMEN '+(i+1),x,2.9,25,1.8);}
for(let x=-55;x<57;x+=4)for(const z of [-47,47]){box(x,1.2,z,.08,2.4,.08,'#646f66');box(x,1.8,z,4,.035,.035,'#9ca89c');box(x,.6,z,4,.035,.035,'#9ca89c');}
sign('RAPIER / MOTOR POOL',0,2.6,7,5);sign('QUARTERS',-6,1.4,-18,3);sign('FLIGHT LINE →',6,1.1,-35,3);
const car=new T.Group();scene.add(car);const shell=box(0,.15,0,.44,.16,.75,'#e6a53c',car);box(0,.3,.04,.33,.20,.32,'#273d45',car);box(0,.22,.39,.55,.05,.15,'#253436',car);box(0,.43,.29,.016,.45,.016,'#313d3b',car);for(const x of [-.15,.15])box(x,.19,-.39,.10,.06,.025,'#fff4be',car);
const wheels=[];for(const x of [-.29,.29])for(const z of [-.25,.25]){const pivot=new T.Group();pivot.position.set(x,-.08,z);car.add(pivot);const wheel=new T.Mesh(new T.CylinderGeometry(.15,.15,.13,16),material('#202a2a'));wheel.rotation.z=Math.PI/2;wheel.castShadow=true;pivot.add(wheel);const hub=sphere(0,0,0,.08,'#b1b6a8',pivot,.9,1,1);wheels.push({pivot,wheel,front:z<0});}
const gates=checkpoints.slice(0,-1).map(([x,z],i)=>{const g=new T.Group();g.position.set(x,0,z);scene.add(g);for(const dx of [-2.5,2.5]){box(dx,.7,0,.12,1.4,.12,'#ffcd65',g);box(dx,1.2,0,.5,.25,.05,'#ffcd65',g);}sign(String(i+1).padStart(2,'0'),x,1.8,z,1);return g;});
let s=createCar(),paused=true,keys=new Set(),acc=0,last=performance.now(),best=0;try{best=Number(localStorage.getItem('guns-only.rc.best'))||0;}catch{}
const format=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;
function pause(value){paused=value;if(!value)audio.start();keys.clear();$('pause').textContent=paused?'Resume · Esc':'Pause · Esc';}
$('start').onclick=()=>{audio.start();$('brief').hidden=true;pause(false);canvas.focus();};$('pause').onclick=()=>pause(!paused);$('reset').onclick=()=>resetCar(s);
function exit(){if(window.parent!==window)window.parent.postMessage({type:'guns-only-rc-exit'},location.origin);else location.href='../';}
$('exit').onclick=exit;
window.addEventListener('keydown',e=>{if(['KeyW','KeyS','KeyA','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}if(e.repeat)return;if(e.code==='Escape')pause(!paused);if(e.code==='KeyR')resetCar(s);if(e.code==='KeyO')exit();});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>pause(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);});
for(const button of document.querySelectorAll('[data-key]')){button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(button.dataset.key);};for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(button.dataset.key));}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();camera.position.set(0,2,8);
const desired=new T.Vector3(),target=new T.Vector3(),map=$('map').getContext('2d');
function drawMap(){map.clearRect(0,0,180,160);const point=(x,z)=>[90+x*1.35,80+z*1.5];map.fillStyle='#91a99c';for(const b of buildings){const [x,y]=point(b.x-b.w/2,b.z-b.d/2);map.fillRect(x,y,b.w*1.35,b.d*1.5);}map.strokeStyle='#e8bf66';map.setLineDash([3,4]);map.beginPath();checkpoints.forEach(([x,z],i)=>{const p=point(x,z);i?map.lineTo(...p):map.moveTo(...p);});map.stroke();map.setLineDash([]);const p=point(...checkpoints[s.gate]);map.fillStyle='#ffcc66';map.beginPath();map.arc(...p,4,0,Math.PI*2);map.fill();map.fillStyle='#fff';map.beginPath();map.arc(...point(s.x,s.z),3,0,Math.PI*2);map.fill();}
let reported=false;
function frame(now){const dt=Math.min((now-last)/1000,.1);last=now;if(!paused){acc+=dt;while(acc>=1/120){stepCar(s,{throttle:Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),steer:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),brake:keys.has('Space')});acc-=1/120;}}
 audio.update(s.speed,paused);car.position.set(s.x,s.y,s.z);car.rotation.set(s.pitch,-s.yaw,s.roll,'YXZ');for(const w of wheels){w.pivot.rotation.y=w.front?-s.steer*.45:0;w.wheel.rotation.x=s.travel/.15;w.pivot.position.y=-.08+Math.sin(s.travel*22)*Math.min(.012,s.speed*.002);}
 desired.set(s.x-Math.sin(s.yaw)*(2.4+s.speed*.035),s.y+1.05,s.z+Math.cos(s.yaw)*(2.4+s.speed*.035));// Keep the low chase camera in front of walls when backing into a building.
 for(let t=.1;t<=1;t+=.1){const x=s.x+(desired.x-s.x)*t,z=s.z+(desired.z-s.z)*t,y=s.y+(desired.y-s.y)*t;if(solids.some(b=>y<b.h&&Math.abs(x-b.x)<b.w/2+.1&&Math.abs(z-b.z)<b.d/2+.1)){desired.set(s.x+(desired.x-s.x)*Math.max(.1,t-.1),y,s.z+(desired.z-s.z)*Math.max(.1,t-.1));break;}}
 camera.position.lerp(desired,1-Math.exp(-dt*7));target.set(s.x+Math.sin(s.yaw)*1.4,s.y+.27,s.z-Math.cos(s.yaw)*1.4);camera.lookAt(target);
 gates.forEach((g,i)=>{g.visible=i===(s.gate===checkpoints.length-1?0:s.gate);});aliens.forEach((a,i)=>{a.position.y=.4+Math.sin(now*.0015+i)*.07;});
 $('speed').textContent=Math.round(s.speed*3.6);$('clock').textContent=format(s.time);$('gate').textContent=`${Math.min(s.gate+1,checkpoints.length)}/${checkpoints.length} · ${checkpoints[s.gate][2]}`;$('secret').textContent=`◇ ${s.found}/3`;drawMap();renderer.render(scene,camera);
 if(s.finished&&!reported){reported=true;if(!best||s.time<best){best=s.time;try{localStorage.setItem('guns-only.rc.best',best);}catch{}}const result=$('result');result.hidden=false;result.innerHTML=`<h1>Back at the motor pool.</h1><p>${format(s.time)} · Best ${format(best)} · Specimens ${s.found}/3</p><button id="again">Run again</button> <button id="explore">Keep exploring</button>`;pause(true);$('again').onclick=()=>{s=createCar();reported=false;result.hidden=true;pause(false);};$('explore').onclick=()=>{result.hidden=true;pause(false);};}
 requestAnimationFrame(frame);}
// Read-only diagnostics for QA. Simulation tests use the same public step function.
window.__gunsOnlyRC={snapshot:()=>({...s,seen:[...s.seen],paused}),renderer:()=>renderer.info.render};requestAnimationFrame(frame);
