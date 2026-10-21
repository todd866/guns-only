import * as T from '../vendor/three.module.js';
import {buildings,solids,aircraft,obstacles,collisionSolids,ramps,checkpoints,baseCourse} from './sim.mjs';
import {recover,readout} from './physics/session.mjs';
import {createRace,stepRace,progress,retreatActive} from './physics/race.mjs';
import {modifiers} from './physics/pickups.mjs';
import {VISUAL_SCALE,BUGGY} from './physics/car.mjs';
import {addBox} from './physics/world.mjs';
import {courseFromGlb} from './physics/district.mjs';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import { MotorAudio } from './audio.js';
const audio=new MotorAudio();
const liveSolids=[...collisionSolids],hangarFallback=[],housingFallback=[],aircraftFallback=[];
// ?track=<district> drives an exported Blender district; no track = the prototype base route.
const track=(new URLSearchParams(location.search).get('track')||'').match(/^[a-z0-9-]+$/)?.[0]??null;
let district=null;
if(track){const buffer=await (await fetch(`./assets/districts/${track}.glb`)).arrayBuffer();district={course:courseFromGlb(buffer),gltf:await new GLTFLoader().parseAsync(buffer,'./assets/districts/')};}
const course=district?.course??baseCourse(),cps=course.checkpoints;
// Asset collision proxies join the triangle world the car drives on.
function addSolid(b){liveSolids.push(b);addBox(course.world,b.x,b.z,b.w,b.d,b.minY??0,b.h);}
let assetState='prototype';
const artReview=new URLSearchParams(location.search).get('art')==='review';
const $=id=>document.getElementById(id),canvas=$('view');
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new T.Scene();scene.background=new T.Color('#b2c6c5');scene.fog=new T.Fog('#b2c6c5',65,150);
const camera=new T.PerspectiveCamera(63,1,.06,210);
scene.add(new T.HemisphereLight(0xd5edf1,0x5a624a,1.5));const sun=new T.DirectionalLight(0xffd6a0,3.2);sun.position.set(-30,55,-25);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-65,right:65,top:55,bottom:-55,near:1,far:150});sun.shadow.bias=-.0003;scene.add(sun);
// Local shadow coverage keeps tyre contact legible at RC scale.
const contactSun=new T.DirectionalLight(0xffe4bd,.65);contactSun.castShadow=true;contactSun.shadow.mapSize.set(1024,1024);Object.assign(contactSun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.1,far:30});contactSun.shadow.bias=-.00015;contactSun.shadow.normalBias=.015;scene.add(contactSun,contactSun.target);
const studio=new T.Scene();studio.background=new T.Color('#879b9f');
for(const [x,y,z,w,h,d,c] of [[0,6,0,10,.1,10,0xffe9cc],[-5,2,0,.1,4,8,0x536b70],[5,3,0,.1,3,6,0xdceeff]]){const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshBasicMaterial({color:c}));m.position.set(x,y,z);studio.add(m);}
const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(studio,.05).texture;scene.environmentIntensity=.45;pmrem.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
const mats=new Map();function material(c,glow=false){const key=c+glow;if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color:c,roughness:.8,...(glow?{emissive:c,emissiveIntensity:.8}:{})}));return mats.get(key);}
function box(x,y,z,w,h,d,color,parent=scene){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function sphere(x,y,z,r,color,parent=scene,sx=1,sy=1,sz=1){const m=new T.Mesh(new T.SphereGeometry(r,14,10),material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;}
function sign(text,x,y,z,width=4){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#172e33';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#e5c58a';ctx.lineWidth=8;ctx.strokeRect(5,5,502,118);ctx.fillStyle='#f8ebce';ctx.font='bold 44px monospace';ctx.textAlign='center';ctx.fillText(text,256,79);const m=new T.Mesh(new T.PlaneGeometry(width,width/4),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),side:T.DoubleSide}));m.position.set(x,y,z);scene.add(m);return m;}
// Deterministic original surface grain at toy-eye distance; no downloaded textures.
for(const [color,repeat] of [['#555f60',18],['#8b9389',12],['#7d8766',30],['#9ca59b',8]]){
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,128,128);let seed=717;
 for(let i=0;i<3000;i++){seed=(seed*1664525+1013904223)>>>0;const x=(artReview?seed>>>16:seed)%128;seed=(seed*1664525+1013904223)>>>0;const y=(artReview?seed>>>16:seed)%128;ctx.fillStyle=artReview?(i%2?'#ffffff08':'#00000008'):(i%2?'#ffffff16':'#00000014');ctx.fillRect(x,y,1,1);}
 const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(repeat,repeat);tex.colorSpace=T.SRGBColorSpace;material(color).map=tex;material(color).color.set('#ffffff');
}
let aliens=[];
if(!track){
box(0,-.2,0,130,.4,110,'#7d8766');
box(0,.008,0,7,.025,90,'#555f60');box(22,.01,-36,48,.025,8,'#555f60');box(38,.01,1,9,.025,80,'#657072');box(20,.01,34,44,.025,8,'#555f60');box(20,.008,-8,60,.02,30,'#8b9389');
for(let z=-42;z<45;z+=5)box(0,.03,z,.10,.015,2,'#ded4ad');for(let x=5;x<45;x+=5)box(x,.035,34,2,.015,.1,'#ded4ad');
// Scale cues: kerbs, drain grates, bollards, grass tufts, human-size doors.
for(const x of [-3.7,3.7])for(let z=-42;z<44;z+=2)box(x,.09,z,.25,.18,1.9,'#b9b6a3');
for(const o of obstacles){
 box(o.x,o.h/2,o.z,o.w,o.h,o.d,o.kind==='bollard'?'#dbc17f':o.kind==='crate'?'#99825d':'#c2bca7');
 if(o.kind==='bollard')box(o.x,.82,o.z,.18,.14,.18,'#283635');
 if(o.kind==='crate')for(const dx of [-.4,.4])box(o.x+dx,o.h/2,o.z,.07,o.h+.02,o.d+.02,'#4c5750');
 if(o.kind==='barrier')for(const dx of [-.8,0,.8])box(o.x+dx,.45,o.z-.26,.3,.2,.025,'#d4a848');
}
for(let i=0;i<180;i++){const x=Math.sin(i*91.7)*55,z=Math.cos(i*38.2)*45;if(Math.abs(x)>8&&!(x>25&&x<49))box(x,.12,z,.06,.24,.07,'#6c7953');}
for(const b of buildings){const firstChild=scene.children.length;if(b.kind==='house'){
 box(b.x,2.5,b.z,b.w,5,b.d,'#c1b49a');const roof=new T.Mesh(new T.ConeGeometry(6.15,2,4),material('#686e68'));roof.rotation.y=Math.PI/4;roof.position.set(b.x,5.8,b.z);roof.castShadow=true;scene.add(roof);
 for(const dx of [-2.5,2.5])for(const z of [b.z-4.02,b.z+4.02])box(b.x+dx,2.6,z,1.3,1.7,.06,'#49636a');box(b.x,1.1,b.z+4.04,1.2,2.2,.08,'#58655f');box(b.x,5.7,b.z,1,.3,1,'#7f8176');
 }else{
 for(const s of solids.filter(s=>Math.abs(s.x-b.x)<b.w/2+.1&&Math.abs(s.z-b.z)<=b.d/2))box(s.x,s.h/2,s.z,s.w,s.h,s.d,b.kind==='lab'?'#909d95':'#7c8b86');
 box(b.x,b.h+.12,b.z,b.w+.5,.25,b.d+.5,b.kind==='lab'?'#536661':'#71817c');
 for(let z=b.z-b.d/2;z<=b.z+b.d/2;z+=3)for(const side of [-1,1])box(b.x+side*b.w/2,b.h/2,z,.18,b.h,.16,'#b4b9a4');
 sign(b.kind==='lab'?'09 / RESTRICTED':'HANGAR 02',b.x,b.h-1,b.z-b.d/2-.24,6).rotation.y=Math.PI;
 box(b.x,.03,b.z,b.w,.06,b.d,'#9ca59b');
 for(const x of [b.x-6,b.x+6])box(x,b.h-.3,b.z,.15,.12,b.d-2,'#e6d5ad');
 }if(b.kind==='house')housingFallback.push(...scene.children.slice(firstChild));if(b.kind==='hangar')hangarFallback.push(...scene.children.slice(firstChild));}
function plane(x,z){const g=new T.Group();g.position.set(x,1.2,z);scene.add(g);sphere(0,0,0,1,'#acb5ad',g,1,.7,4.7);box(0,0,.6,10,.16,2,'#929f96',g);box(0,.1,3.6,4,.13,1,'#919e94',g);box(0,1,3.7,.15,2,1.8,'#77867f',g);sphere(0,.55,-1.4,.75,'#354e58',g,.65,.7,1.8);for(const dx of [-1,1])box(dx,-.85,1,.2,.7,.2,'#263032',g);aircraftFallback.push(g);}
for(const a of aircraft)plane(a.x,a.z);
for(const r of ramps){const g=new T.BufferGeometry();const x=r.w/2,z=r.d/2,h=r.h;g.setAttribute('position',new T.Float32BufferAttribute([-x,0,z,x,0,z,x,h,-z,-x,0,z,x,h,-z,-x,h,-z],3));g.computeVertexNormals();const m=new T.Mesh(g,new T.MeshStandardMaterial({color:'#bc8b50',side:T.DoubleSide,roughness:.9}));m.position.set(r.x,.015,r.z);m.receiveShadow=true;scene.add(m);for(const dx of [-x+.12,x-.12]){const rail=box(r.x+dx,h/2+.025,r.z,.12,.035,Math.hypot(r.d,h),'#ead099');rail.rotation.x=Math.atan2(h,r.d);}}
// Secret lab: three original containment specimens, reachable through the hangar service doors.
for(const [i,x] of [33,38,43].entries()){
 box(x,.12,25,1.7,.24,1.7,'#334e4b');const tube=new T.Mesh(new T.CylinderGeometry(.8,.8,2.6,20,1,true),new T.MeshPhysicalMaterial({color:'#72ffce',transparent:true,opacity:.18,roughness:.15,side:T.DoubleSide,depthWrite:false}));tube.position.set(x,1.55,25);scene.add(tube);const a=new T.Group();a.position.set(x,.4,25);scene.add(a);sphere(0,1.35,0,.42,'#99b99e',a,1.1,1.3,.9);sphere(0,.6,0,.35,'#779882',a,.7,1.4,.7);for(const side of [-1,1]){sphere(side*.19,1.4,-.31,.14,'#152a28',a,1,1.4,.4);box(side*.14,.12,0,.12,.5,.13,'#779882',a);box(side*.34,.6,0,.09,.6,.10,'#779882',a);}aliens.push(a);const light=new T.PointLight('#70ffc5',8,5);light.position.set(x,2,25);scene.add(light);sign('SPECIMEN '+(i+1),x,2.9,25,1.8);}
for(let x=-55;x<57;x+=4)for(const z of [-47,47]){box(x,1.2,z,.08,2.4,.08,'#646f66');box(x,1.8,z,4,.035,.035,'#9ca89c');box(x,.6,z,4,.035,.035,'#9ca89c');}
sign('RAPIER / MOTOR POOL',0,2.6,7,5);sign('QUARTERS',-6,1.4,-18,3);sign('FLIGHT LINE →',6,1.1,-35,3);
}else{
 // District visuals: VIS_* meshes render; collision and markers stay invisible.
 const root=district.gltf.scene;root.traverse(o=>{if(/^(COL_|GATE_|START_|AI_|PICKUP_|SPEC_|CAM_)/.test(o.name))o.visible=false;else if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(root);
 scene.background=new T.Color('#a9d4ee');scene.fog=new T.Fog('#a9d4ee',80,260);
}
let car=new T.Group();scene.add(car);const shell=box(0,.15,0,.44,.16,.75,'#e6a53c',car);box(0,.3,.04,.33,.20,.32,'#273d45',car);box(0,.22,.39,.55,.05,.15,'#253436',car);box(0,.43,.29,.016,.45,.016,'#313d3b',car);for(const x of [-.15,.15])box(x,.19,-.39,.10,.06,.025,'#fff4be',car);
let wheels=[];for(const x of [-.29,.29])for(const z of [-.25,.25]){const pivot=new T.Group();pivot.position.set(x,-.08,z);car.add(pivot);const wheel=new T.Mesh(new T.CylinderGeometry(.15,.15,.13,16),material('#202a2a'));wheel.rotation.z=Math.PI/2;wheel.castShadow=true;pivot.add(wheel);const hub=sphere(0,0,0,.08,'#b1b6a8',pivot,.9,1,1);wheels.push({pivot,wheel,front:z<0});}
// Validated original assets are the normal entry; prototype remains an explicit diagnostic fallback.
if(new URLSearchParams(location.search).get('assets')!=='prototype'){
 assetState='loading';$('start').disabled=true;
 import('./assets.js').then(async({loadBuggyAsset,loadHangarAsset,loadStaticAsset})=>{
  const [buggy,hangar]=await Promise.all([loadBuggyAsset('./assets/buggy.glb'),track?null:loadHangarAsset('./assets/hangar-slice.glb')]);
  const base=artReview&&!track?await Promise.all([loadStaticAsset('./assets/aircraft.glb','Aircraft_Root'),loadStaticAsset('./assets/quarters.glb','Quarters_Root')]):null;
  // Commit the complete visual/collision set together; a failed load retains the prototype.
  scene.remove(car);car=buggy.car;wheels=buggy.wheels;scene.add(car);
  if(hangar){scene.add(hangar.hangar);
  const floor=hangar.hangar.getObjectByName('Floor');floor.material=material('#9ca59b').clone();floor.material.roughness=.68;
  for(const z of [-14,-2]){const lamp=new T.SpotLight(0xffd29a,110,22,1.1,.75,1.4);lamp.position.set(35,6,z);lamp.target.position.set(38,0,z+2);scene.add(lamp,lamp.target);}
  sign('02 / ENGINEERING',38,4.3,-19.2,4).rotation.y=Math.PI;
  for(const node of hangarFallback)node.visible=false;
  hangar.collision.forEach(addSolid);}
  if(base){for(const node of [...housingFallback,...aircraftFallback])node.visible=false;for(const a of aircraft){const model=base[0].clone(true);model.position.set(a.x,0,a.z);scene.add(model);addSolid({x:a.x,z:a.z-2.6,w:.3,d:.45,h:.75,minY:0});}for(const b of buildings.filter(b=>b.kind==='house')){const model=base[1].clone(true);model.position.set(b.x,0,b.z);scene.add(model);}}
  if(artReview&&hangar){const {applyArtReview}=await import('./art-review.js');applyArtReview({scene,car,hangar:hangar.hangar,renderer,sun,contactSun});}
  assetState='blender';
 }).catch(error=>{assetState='failed';console.error('RC Blender asset rejected:',error);$('brief').hidden=false;const warning=document.createElement('p');warning.textContent='Asset loading failed; prototype fallback is available.';$('brief').append(warning);}).finally(()=>{$('start').disabled=false;});
}
const gates=cps.slice(0,-1).map(([x,z,,half=2.5],i)=>{const g=new T.Group(),m=course.gates?.[i];g.position.set(x,m?m.pos[1]:0,z);if(m)g.rotation.y=Math.atan2(-m.forward[0],-m.forward[2]);scene.add(g);for(const dx of [-half,half]){box(dx,.7,0,.12,1.4,.12,'#ffcd65',g);box(dx,1.2,0,.5,.25,.05,'#ffcd65',g);}g.userData.label=sign(String(i+1).padStart(2,'0'),x,(m?m.pos[1]:0)+1.8,z,1.5);return g;});
let mode='kid';try{if(localStorage.getItem('guns-only.rc.mode')==='bigKid')mode='bigKid';}catch{}
// ?rivals=0 for a solo time trial.
const rivalCount=Math.max(0,Math.min(5,Number(new URLSearchParams(location.search).get('rivals')??3)));
let race=createRace(course,{mode,opponents:rivalCount}),s=race.player,paused=true,keys=new Set(),acc=0,last=performance.now(),best=0;try{best=Number(localStorage.getItem('guns-only.rc.best'))||0;}catch{}
const format=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;
function pause(value){paused=value;if(!value)audio.start();keys.clear();$('pause').textContent=paused?'Resume · Esc':'Pause · Esc';}
$('start').onclick=()=>{audio.start();$('brief').hidden=true;pause(false);canvas.focus();};$('pause').onclick=()=>pause(!paused);$('reset').onclick=()=>recover(s);
function setMode(m){mode=race.mode=s.mode=s.assist.mode=m;$('mode').textContent=m==='kid'?'Kid · B':'Big Kid · B';try{localStorage.setItem('guns-only.rc.mode',m);}catch{}}
$('mode').onclick=()=>setMode(mode==='kid'?'bigKid':'kid');setMode(mode);
function exit(){if(window.parent!==window)window.parent.postMessage({type:'guns-only-rc-exit'},location.origin);else location.href='../';}
$('exit').onclick=exit;
window.addEventListener('keydown',e=>{if(['KeyW','KeyS','KeyA','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}if(e.repeat)return;if(e.code==='Escape')pause(!paused);if(e.code==='KeyR')recover(s);if(e.code==='KeyF'||e.code==='Enter')fireQueued=true;if(e.code==='KeyB')setMode(mode==='kid'?'bigKid':'kid');if(e.code==='KeyO')exit();});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>pause(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);});
for(const button of document.querySelectorAll('[data-key]')){button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(button.dataset.key);};for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(button.dataset.key));}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();camera.position.set(0,2,8);
// Pose a drawn car from its physics body. Wheels follow the suspension: the centre sits
// restLength−compression below its attach point.
function poseCar(group,wheelSet,c){group.position.set(...c.pos);group.quaternion.set(...c.q);group.scale.setScalar(VISUAL_SCALE);
 wheelSet.forEach((w,i)=>{const ws=c.wheels[i];w.pivot.rotation.y=w.front?-c.steer:0;w.wheel.rotation.x=ws.spin;w.pivot.position.y=-(BUGGY.restLength-ws.compression)/VISUAL_SCALE;});}
// Rivals are tinted clones of whichever buggy is current (prototype, then the Blender asset).
// Rivals wear aggressor-squadron colours (Nellis nod): ghost blue, desert tan, splinter grey, flanker blue, arctic white.
const RIVAL_PAINT=['#5d7fa3','#c9a46c','#8c969c','#3f5f8a','#dfe6ea'];let rivalVis=[],rivalSource=null;
function syncRivals(){if(rivalSource===car&&rivalVis.length===race.rivals.length)return;rivalVis.forEach(v=>scene.remove(v.group));rivalSource=car;
 rivalVis=race.rivals.map((_,i)=>{const group=car.clone(true);group.traverse(o=>{if(o.isMesh&&o.material?.color){const hsl={};o.material.color.getHSL(hsl);if(hsl.s>.35){o.material=o.material.clone();o.material.color.set(RIVAL_PAINT[i%5]);}}});scene.add(group);
  const named=['FL','FR','RL','RR'].map(n=>({pivot:group.getObjectByName('Steer_'+n),wheel:group.getObjectByName('Wheel_'+n),front:n[0]==='F'}));
  return {group,wheels:named.every(w=>w.pivot&&w.wheel)?named:[]};});}
// Pickup presentation: gift crates, balloons, oil puddles, bubble shields.
let fireQueued=false;const ICON={zoom:'🔥 Afterburner',balloon:'💧 Water balloon',oil:'🛢 Hydraulic leak',bubble:'✨ Chaff'};
const crates=race.pickups.spots.map(sp=>{const g=new T.Group();g.position.set(...sp.pos);box(0,0,0,.22,.22,.22,'#ff5aa5',g);box(0,0,0,.235,.05,.235,'#ffe066',g);box(0,0,0,.05,.235,.235,'#ffe066',g);scene.add(g);return g;});
const fxPool=new Map();function fxMesh(key,make){if(!fxPool.has(key)){const m=make();scene.add(m);fxPool.set(key,m);}const m=fxPool.get(key);m.visible=true;return m;}
const balloonMat=new T.MeshStandardMaterial({color:'#4fc3ff',roughness:.2}),oilMat=new T.MeshStandardMaterial({color:'#1b1b22',roughness:.05,metalness:.6}),bubbleMat=new T.MeshPhysicalMaterial({color:'#bfefff',transparent:true,opacity:.28,roughness:0,depthWrite:false});
function drawPickups(now){const pk=race.pickups;
 crates.forEach((g,i)=>{const sp=pk.spots[i];g.visible=sp.ready<=0;g.rotation.y=now*.002+i;g.position.y=sp.pos[1]+Math.sin(now*.003+i)*.04;});
 for(const m of fxPool.values())m.visible=false;
 pk.balloons.forEach((b,i)=>fxMesh('b'+i,()=>new T.Mesh(new T.SphereGeometry(.07,12,8),balloonMat)).position.set(...b.pos));
 pk.slicks.forEach((o,i)=>{const m=fxMesh('o'+i,()=>{const d=new T.Mesh(new T.CircleGeometry(.5,20),oilMat);d.rotation.x=-Math.PI/2;return d;});m.position.set(o.pos[0],o.pos[1]-.12,o.pos[2]);});
 [race.player.car,...race.rivals.map(r=>r.session.car)].forEach((c,i)=>{if(modifiers(pk,c).shielded)fxMesh('s'+i,()=>new T.Mesh(new T.SphereGeometry(.34,20,14),bubbleMat)).position.set(...c.pos);});
 const held=pk.held.get(s.car);$('item').textContent=held?`${ICON[held]} · F`:'';$('item').hidden=!held;}
const place=()=>1+race.rivals.filter(rv=>progress(rv.session)>progress(s)).length;
const desired=new T.Vector3(),target=new T.Vector3(),map=$('map').getContext('2d');
// Minimap fits the route's bounding box.
const mapBox=(()=>{const xs=cps.map(c=>c[0]),zs=cps.map(c=>c[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,k=Math.min(150/(Math.max(...xs)-Math.min(...xs)+10),130/(Math.max(...zs)-Math.min(...zs)+10));return track?{cx,cz,k}:{cx:0,cz:0,k:null};})();
function drawMap(){map.clearRect(0,0,180,160);const point=mapBox.k?(x,z)=>[90+(x-mapBox.cx)*mapBox.k,80+(z-mapBox.cz)*mapBox.k]:(x,z)=>[90+x*1.35,80+z*1.5];map.fillStyle='#91a99c';if(!track)for(const b of buildings){const [x,y]=point(b.x-b.w/2,b.z-b.d/2);map.fillRect(x,y,b.w*1.35,b.d*1.5);}map.strokeStyle='#e8bf66';map.setLineDash([3,4]);map.beginPath();cps.forEach(([x,z],i)=>{const p=point(x,z);i?map.lineTo(...p):map.moveTo(...p);});map.stroke();map.setLineDash([]);const p=point(cps[s.gate][0],cps[s.gate][1]);map.fillStyle='#ffcc66';map.beginPath();map.arc(...p,4,0,Math.PI*2);map.fill();map.fillStyle='#fff';map.beginPath();map.arc(...point(s.car.pos[0],s.car.pos[2]),3,0,Math.PI*2);map.fill();}
let reported=false;
function frame(now){const dt=Math.min((now-last)/1000,.1);last=now;if(!paused){acc+=dt;while(acc>=1/120){stepRace(race,{throttle:Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),steer:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),brake:keys.has('Space'),fire:fireQueued},1/120);fireQueued=false;acc-=1/120;}}
 const r=readout(s),c=s.car,p=BUGGY;
 contactSun.position.set(r.x-4,r.y+(artReview&&Math.abs(r.x-38)<9&&Math.abs(r.z+8)<11?4:8),r.z-5);contactSun.target.position.set(r.x,r.y,r.z);
 audio.update(r.speed,paused);poseCar(car,wheels,c);syncRivals();race.rivals.forEach((rv,i)=>poseCar(rivalVis[i].group,rivalVis[i].wheels,rv.session.car));
 // Low chase camera behind the heading; pulled in front of any wall between it and the car.
 const back=1.05+r.speed*.03,eye=[r.x,r.y+.12,r.z];desired.set(r.x-Math.sin(r.yaw)*back,r.y+.42,r.z+Math.cos(r.yaw)*back);
 const ray=[desired.x-eye[0],desired.y-eye[1],desired.z-eye[2]],dist=Math.hypot(...ray),hit=course.world.raycast(eye,ray.map(v=>v/dist),dist);
 if(hit){const k=Math.max(.15,hit.dist-.12)/dist;desired.set(eye[0]+ray[0]*k,eye[1]+ray[1]*k,eye[2]+ray[2]*k);}
 camera.position.lerp(desired,1-Math.exp(-dt*7));target.set(r.x+Math.sin(r.yaw)*.8,r.y+.15,r.z-Math.cos(r.yaw)*.8);camera.lookAt(target);
 gates.forEach((g,i)=>{g.visible=i===(s.gate===cps.length-1?0:s.gate);g.userData.label.visible=g.visible;g.userData.label.quaternion.copy(camera.quaternion);});aliens.forEach((a,i)=>{a.position.y=.4+Math.sin(now*.0015+i)*.07;});
 $('speed').textContent=Math.round(r.speed*3.6);$('clock').textContent=format(s.time);drawPickups(now);$('gate').textContent=`${race.rivals.length?`P${place()}/${race.rivals.length+1} · `:''}${Math.min(s.gate+1,cps.length)}/${cps.length} · ${/^GATE_/.test(cps[s.gate][2])?(s.gate===cps.length-1?'Finish':`Steerpoint ${s.gate+1}`):cps[s.gate][2]}`;$('banner').hidden=!retreatActive(race);$('secret').textContent=`◇ ${s.found}/${course.secrets.length}`;drawMap();renderer.render(scene,camera);
 if(s.finished&&!reported){reported=true;if(!best||s.time<best){best=s.time;try{localStorage.setItem('guns-only.rc.best',best);}catch{}}const result=$('result');result.hidden=false;result.innerHTML=`<h1>${race.rivals.length?['Sierra Hotel! You won!','Second place. Good hustle, Airman!','Third place. On the podium!','Fourth place. Next sortie!','Fifth place. Next sortie!','Sixth place. Next sortie!'][place()-1]:'Lap complete!'}</h1><p>${format(s.time)} · Best ${format(best)} · Specimens ${s.found}/${course.secrets.length}</p><button id="again">Run again</button> <button id="explore">Keep exploring</button>`;pause(true);$("again").onclick=()=>{s=(race=createRace(course,{mode,opponents:rivalCount})).player;reported=false;result.hidden=true;pause(false);};$('explore').onclick=()=>{result.hidden=true;pause(false);};}
 requestAnimationFrame(frame);}
// Read-only diagnostics for QA. Simulation tests use the same public step function.
window.__gunsOnlyRC={line:()=>race.line.map(p=>[p[0],p[1]]),snapshot:()=>({...readout(s),time:s.time,gate:s.gate,running:s.running,finished:s.finished,hits:s.hits,found:s.found,seen:[...s.seen],travel:s.travel,recoveries:s.recoveries,mode,paused,assets:assetState,item:race.pickups.held.get(s.car)??null,place:place()}),renderer:()=>renderer.info.render,checkpoints:()=>cps.map(c=>[c[0],c[1]])};requestAnimationFrame(frame);
