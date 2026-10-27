import {protectGameControls} from './control-surfaces.mjs';
protectGameControls();
import {fetchAssetBuffer} from './asset-buffer.mjs';
import {bindRCTouchControls} from './touch-controls.mjs';
import {DRIVE_KEYS,drivingInput} from './driving-input.mjs';
import {drawDetailedMinimap} from './open-world/minimap.js';
import {createCup,loadCup,saveCup,recordCupRace,nextCupEvent,cupStandings} from './grand-prix.mjs';
import {createRaceMenu,CUP_COURSES} from './race-menu.js';
import {createAlienMarshal} from './alien-marshal.js';
import {createGamepadInput} from './gamepad.mjs';
import {frameSeconds} from './frame-time.mjs';
import {makeVehicleBody} from './vehicle-bodies.js';
import {vehicleParams} from './physics/vehicles.mjs';
import * as T from '../vendor/three.module.js';
import {buildings,solids,aircraft,obstacles,collisionSolids,ramps,checkpoints,baseCourse} from './sim.mjs';
import {recover,readout} from './physics/session.mjs';
import {createRace as createRaceBase,stepRace,placeOf,retreatActive} from './physics/race.mjs';
import {TRACK_FEATURES,placeFeatures} from './physics/features.mjs';
import {modifiers,MISSILES,beamDir} from './physics/pickups.mjs';
import {heldMissilePose} from './pickup-visuals.mjs';
import {VISUAL_SCALE,BUGGY,createCar,placeCar,rideHeight} from './physics/car.mjs';
import {addBox} from './physics/world.mjs';
import {courseFromGlb} from './physics/district.mjs';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {LIGHTING,isIndoor,applyLighting,followSun,clearcoat,studioEnvironment,createEffects,createRacingLine,setupPolish} from './visuals.js';
import { SoundKit } from './audio.js';
import {JET_KINDS,fitJetShell,paintNoseArt,artTier,NOSE_ART} from './jets.js';
import {createRCTelemetry} from './telemetry.mjs';
import {createWorldSky} from './open-world/sky.js';
import {loadOpenWorld} from './open-world/runtime.js';
import {createWorldUI} from './open-world/ui.js';
import {loadProgress,canEnter,expedition,SPECIMENS,rcLink,nearestLocation,locationById} from './open-world/catalog.mjs';
let bodyKind='jet';try{bodyKind=loadProgress(localStorage).body;}catch{}
function createRace(course,options){return createRaceBase({...course,laps:course.event?.kind==='sprint'?1:3},{...options,params:vehicleParams(bodyKind==='jet'?'buggy':bodyKind)});}
const audio=new SoundKit();
const liveSolids=[...collisionSolids],hangarFallback=[],housingFallback=[],aircraftFallback=[];
// ?track=<district> drives an exported Blender district.
// Default is the connected base; ?track=base is the original greybox route.
const entry=new URLSearchParams(location.search);
const legacyTrack=entry.get('track');
if(legacyTrack&&legacyTrack!=='hub'){
 entry.set('track','hub');
 if(['housing','bx','school'].includes(legacyTrack))entry.set('event','district-'+legacyTrack);
 else entry.delete('event');
 history.replaceState(null,'','?'+entry);
}
let track='hub',district=null,districtError=null,openWorld=null;
try{openWorld=await loadOpenWorld(location.search);}catch(error){
 const brief=document.getElementById('brief');
 brief.hidden=false;brief.dataset.loadFailed='true';brief.replaceChildren();
 const title=document.createElement('h1');title.textContent='Base unavailable';
 const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>location.reload();
 brief.append(title,retry);console.error('Saucer Springs could not load',error);
 throw error;
}
async function loadDistrict(name){const buffer=await fetchAssetBuffer(`./assets/districts/${name}.glb`);return {course:courseFromGlb(buffer),gltf:await new GLTFLoader().parseAsync(buffer,'./assets/districts/')};}
if(track&&track!=='hub'){for(let attempt=0;attempt<2&&!district;attempt++){try{district=await loadDistrict(track);}catch(error){districtError=error;console.error('Saucer Springs district load failed',error);}}if(!district)track=null;}
const course=openWorld?.course??district?.course??baseCourse(),cps=course.checkpoints;
// Asset collision proxies join the triangle world the car drives on.
function addSolid(b){liveSolids.push(b);addBox(course.world,b.x,b.z,b.w,b.d,b.minY??0,b.h);}
let assetState='prototype';
const artReview=new URLSearchParams(location.search).get('art')==='review';
const $=id=>document.getElementById(id),canvas=$('view');
for(const a of document.querySelectorAll('#tracks a')){
 const id=a.dataset.track;
 a.href=rcLink(id==='hub'?{track:'hub'}:{track:'hub',event:`district-${id}`,mode:'drive'},location.search);
 a.setAttribute('aria-current',String(id===(openWorld?.selected.district??track)));
}
if(districtError){const note=document.createElement('p');note.textContent=openWorld?'':`The requested area did not download. ${track==='housing'?'Base Housing':'Motor pool'} is available; reload to retry.`;$('brief')?.append(note);}
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new T.Scene();scene.background=new T.Color('#b2c6c5');scene.fog=new T.Fog('#b2c6c5',65,150);
const camera=new T.PerspectiveCamera(63,1,.06,210);
const hemi=new T.HemisphereLight(0xd5edf1,0x5a624a,1.5);scene.add(hemi);const sun=new T.DirectionalLight(0xffd6a0,3.2);sun.position.set(-30,55,-25);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-65,right:65,top:55,bottom:-55,near:1,far:150});sun.shadow.bias=-.0003;scene.add(sun);
// Local shadow coverage keeps tyre contact legible at RC scale.
const contactSun=new T.DirectionalLight(0xffe4bd,.65);contactSun.castShadow=true;contactSun.shadow.mapSize.set(1024,1024);Object.assign(contactSun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.1,far:30});contactSun.shadow.bias=-.00015;contactSun.shadow.normalBias=.015;scene.add(contactSun,contactSun.target);
const studio=new T.Scene();studio.background=new T.Color('#879b9f');
for(const [x,y,z,w,h,d,c] of [[0,6,0,10,.1,10,0xffe9cc],[-5,2,0,.1,4,8,0x536b70],[5,3,0,.1,3,6,0xdceeff]]){const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshBasicMaterial({color:c}));m.position.set(x,y,z);studio.add(m);}
const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(studio,.05).texture;scene.environmentIntensity=.45;pmrem.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
// Districts get the polished presentation: per-track lighting, a car-following sun shadow, and a
// brighter studio environment for clear-coat reflections.
if(track){applyLighting({renderer,hemi,sun,contactSun},isIndoor(track)?LIGHTING.indoor:LIGHTING.outdoor);if(openWorld){Object.assign(sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38});sun.shadow.camera.updateProjectionMatrix();sun.userData.dir.set(-.65,1,.45).normalize();}scene.environment=studioEnvironment(renderer);scene.environmentIntensity=.6;scene.add(sun.target);}
const fx=createEffects(scene);
const marshal=createAlienMarshal(scene,{scale:.32});let marshalSession=null,marshalRecovery=0,marshalUntil=0,marshalLap=1,marshalLapUntil=0;
// Polished look (HDRI light, bloom, SMAA) on district tracks.
// Default on district tracks (key-to-steer latency measured equal to classic, 7-13 ms); ?gfx=classic
// keeps the old renderer, ?gfx=ao adds screen-space AO.
let polish=null;if(track&&new URLSearchParams(location.search).get('gfx')!=='classic')setupPolish({renderer,scene,camera,indoor:isIndoor(track),world:!!openWorld}).then(p=>{polish=p;polish.resize(innerWidth,innerHeight);
 // The HDRI now carries the ambient light: drop the old hemisphere fill and rebalance exposure.
 if(!openWorld){hemi.intensity*=.35;sun.intensity*=.85;renderer.toneMappingExposure=.82;}}).catch(e=>console.warn('polish off',e));
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
 if(openWorld)await openWorld.attach(scene);
 const root=district?.gltf.scene;if(root){root.traverse(o=>{if(/^(COL_|GATE_|START_|AI_|PICKUP_|SPEC_|CAM_)/.test(o.name))o.visible=false;else if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(root);}
 // District backdrops (ridge, skyline) sit 470–660 m out: draw to 900 m with a light desert haze.
 scene.background=new T.Color('#a9d4ee');scene.fog=new T.Fog('#c9dde6',openWorld?280:180,openWorld?680:950);camera.far=openWorld?40000:900;camera.updateProjectionMatrix();
}
let car=new T.Group();scene.add(car);const shell=box(0,.15,0,.44,.16,.75,'#e6a53c',car);box(0,.3,.04,.33,.20,.32,'#273d45',car);box(0,.22,.39,.55,.05,.15,'#253436',car);box(0,.43,.29,.016,.45,.016,'#313d3b',car);for(const x of [-.15,.15])box(x,.19,-.39,.10,.06,.025,'#fff4be',car);
let wheels=[];for(const x of [-.29,.29])for(const z of [-.25,.25]){const pivot=new T.Group();pivot.position.set(x,-.08,z);car.add(pivot);const wheel=new T.Mesh(new T.CylinderGeometry(.15,.15,.13,16),material('#202a2a'));wheel.rotation.z=Math.PI/2;wheel.castShadow=true;pivot.add(wheel);const hub=sphere(0,0,0,.08,'#b1b6a8',pivot,.9,1,1);wheels.push({pivot,wheel,front:z<0});}
// Validated original assets are the normal entry; prototype remains an explicit diagnostic fallback.
// Start stays disabled in the HTML until the page below is wired, so an early click is never lost.
function readyModes(){for(const id of ['start','menu-race','menu-furball'])$(id).disabled=false;if(!race.roam)$('start').textContent='▶ Go';}
if(new URLSearchParams(location.search).get('assets')==='prototype')queueMicrotask(readyModes);
if(new URLSearchParams(location.search).get('assets')!=='prototype'){
 assetState='loading';$('start').disabled=true;
 import('./assets.js').then(async({loadBuggyAsset,loadHangarAsset,loadStaticAsset})=>{
  const [buggy,hangar]=await Promise.all([loadBuggyAsset('./assets/buggy.glb'),track?null:loadHangarAsset('./assets/hangar-slice.glb')]);
  const base=artReview&&!track?await Promise.all([loadStaticAsset('./assets/aircraft.glb','Aircraft_Root'),loadStaticAsset('./assets/quarters.glb','Quarters_Root')]):null;
  // Commit the complete visual/collision set together; a failed load retains the prototype.
  scene.remove(car);car=fitJetShell(buggy.car,'viper','#f28c28');paintNoseArt(car.getObjectByName('JetShell'),{tier:artTier(aceKills)});wheels=buggy.wheels;if(track)clearcoat(car);scene.add(car);
  if(hangar){scene.add(hangar.hangar);
  const floor=hangar.hangar.getObjectByName('Floor');floor.material=material('#9ca59b').clone();floor.material.roughness=.68;
  for(const z of [-14,-2]){const lamp=new T.SpotLight(0xffd29a,110,22,1.1,.75,1.4);lamp.position.set(35,6,z);lamp.target.position.set(38,0,z+2);scene.add(lamp,lamp.target);}
  sign('02 / ENGINEERING',38,4.3,-19.2,4).rotation.y=Math.PI;
  for(const node of hangarFallback)node.visible=false;
  hangar.collision.forEach(addSolid);}
  if(base){for(const node of [...housingFallback,...aircraftFallback])node.visible=false;for(const a of aircraft){const model=base[0].clone(true);model.position.set(a.x,0,a.z);scene.add(model);addSolid({x:a.x,z:a.z-2.6,w:.3,d:.45,h:.75,minY:0});}for(const b of buildings.filter(b=>b.kind==='house')){const model=base[1].clone(true);model.position.set(b.x,0,b.z);scene.add(model);}}
  if(artReview&&hangar){const {applyArtReview}=await import('./art-review.js');applyArtReview({scene,car,hangar:hangar.hangar,renderer,sun,contactSun});}
  assetState='blender';ui.apply();
 }).catch(error=>{assetState='failed';console.error('RC Blender asset rejected:',error);$('brief').hidden=false;const warning=document.createElement('p');warning.textContent='Asset loading failed; prototype fallback is available.';$('brief').append(warning);}).finally(readyModes);
}
// Gates are inflatable toy-race arches: the next one glows, the rest stay quiet.
const archMat=new T.MeshStandardMaterial({color:'#ff7a2f',roughness:.55}),archLit=new T.MeshStandardMaterial({color:'#ffb347',emissive:'#ff7a00',emissiveIntensity:.7,roughness:.5}),stripeMat=new T.MeshStandardMaterial({color:'#fff4e0',roughness:.6});
const gates=cps.slice(0,-1).map(([x,z,,half=2.5],i)=>{const g=new T.Group(),m=course.gates?.[i],y=m?m.pos[1]:(course.event?.points?.[i]?.[2]??0);g.position.set(x,y,z);if(m)g.rotation.y=Math.atan2(-m.forward[0],-m.forward[2]);else if(cps[i][4])g.rotation.y=Math.atan2(-cps[i][4][0],-cps[i][4][1]);scene.add(g);
 const r=half+.15,arch=new T.Mesh(new T.TorusGeometry(r,.14,12,32,Math.PI),archMat);arch.scale.y=Math.min(1,1.6/r);arch.castShadow=true;g.add(arch);
 for(const dx of [-r,r]){const foot=new T.Mesh(new T.CylinderGeometry(.2,.24,.18,16),stripeMat);foot.position.set(dx,.09,0);g.add(foot);}
 g.userData.arch=arch;g.userData.label=sign(String(i+1).padStart(2,'0'),x,y+r*arch.scale.y+.35,z,1.1);return g;});
// Lifetime Furball kills: they unlock nose art that is painted on the player's jet automatically.
let aceKills=0;try{aceKills=Number(localStorage.getItem('guns-only.rc.kills'))||0;}catch{}
let mode='kid';try{if(localStorage.getItem('guns-only.rc.mode')==='bigKid')mode='bigKid';}catch{}
// ?rivals=0 for a solo time trial.
const rivalCount=Math.max(0,Math.min(7,Number(new URLSearchParams(location.search).get('rivals')??7)));
// Start in the connected base; explicit race destinations start on their grid.
const urlMode=openWorld?.locked?'drive':openWorld?.selected.battle?'furball':new URLSearchParams(location.search).get('mode'),startRoam=urlMode!=='race'&&urlMode!=='furball';
let race=createRace(course,{mode,opponents:urlMode==='furball'?Math.max(3,rivalCount):rivalCount,roam:startRoam,furball:urlMode==='furball'}),s=race.player,paused=true,keys=new Set(),acc=0,last=performance.now(),best=0;let bestKey=`guns-only.rc.best.v3.${track??'base'}.${openWorld?.selected.id??'lap'}.${mode}`;try{best=Number(localStorage.getItem(bestKey))||0;}catch{}
const telemetryTrack=openWorld?`hub:${openWorld.selected.id}`:track;
const telemetry=createRCTelemetry({track:telemetryTrack,mode});
let lastTelemetryFlush=performance.now();
// Course features (boost pads, kicker ramps) are placed once into the world and shared by every race.
const trackFeatures=track&&TRACK_FEATURES[track]?placeFeatures(course,race.line,TRACK_FEATURES[track]):null;race.features=trackFeatures;
const format=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;
let started=false;
for(const event of ['pointerdown','keydown'])window.addEventListener(event,()=>audio.start(),{once:true});
// Escape opens the menu (once racing has started): resume, change track, race or free drive, kid, mute.
function pause(value){paused=value;document.body.classList.toggle('paused',value);if(!value)audio.start();keys.clear();touchControls?.reset();fireQueued=false;$('pause').textContent=paused?'▶':'⏸';
 if(started&&!$('result').hidden)return;if(started){$('brief').hidden=!paused;if(!paused)$('options').open=false;$('brief-title').textContent=paused?'PAUSED':'SAUCER SPRINGS AFB';$('resume').hidden=!paused;$('start').hidden=race.roam;$('start').textContent='Return to base';if(paused)$('resume').focus();else canvas.focus();}}
let lastThrottle=0;
let touchControls=null,touchState={steer:0,throttle:0,brake:false};
// Drive = free drive on this track. On the very first press it starts whatever the URL chose (?mode=race|furball).
$('start').onclick=()=>{telemetry.firstInput('button');audio.start();$('brief').hidden=true;$('result').hidden=true;const first=!started;started=true;if(first){pause(false);if(!race.roam)startCountdown();$('start').textContent='▶ Drive';}else{freeDrive();pause(false);}canvas.focus();};
$('resume').onclick=()=>{pause(false);canvas.focus();};
$('menu-race').onclick=()=>{if(openWorld&&race.roam){const p=nearestLocation(s.car.pos);location.href=openWorld.eventURL(p.event||p.track?p:locationById('ramp'));return;}telemetry.firstInput('button');audio.start();started=true;$('brief').hidden=true;$('result').hidden=true;pause(false);startRace();canvas.focus();};
$('menu-furball').onclick=()=>{if(openWorld){location.href=openWorld.eventURL(locationById('ramp'),'furball');return;}telemetry.firstInput('button');audio.start();started=true;$('brief').hidden=true;$('result').hidden=true;goFurball();pause(false);canvas.focus();};$('pause').onclick=()=>pause(!paused);$('reset').onclick=()=>recover(s);
function setMode(m){telemetry.setMode(m);bestKey=`guns-only.rc.best.v3.${track??'base'}.${openWorld?.selected.id??'lap'}.${m}`;best=0;try{best=Number(localStorage.getItem(bestKey))||0;}catch{}mode=race.mode=s.mode=s.assist.mode=m;s.autoUnstick=m==='kid';$('mode').textContent=m==='kid'?'Kid · B':'Big Kid · B';$('menu-kid').textContent=m==='kid'?'Kid':'Big Kid';$('menu-kid').setAttribute('aria-pressed',String(m==='kid'));try{localStorage.setItem('guns-only.rc.mode',m);}catch{}}
$('mode').onclick=$('menu-kid').onclick=()=>setMode(mode==='kid'?'bigKid':'kid');setMode(mode);
// Mute (M), remembered in this browser.
let muted=false;try{muted=localStorage.getItem('guns-only.rc.muted')==='1';}catch{}
function setMuted(m,report=true){muted=m;if(report)telemetry.mute(m);audio.setMuted(m);$('mute').textContent=m?'🔇 M':'🔊 M';$('menu-mute').textContent=m?'🔇':'🔊';for(const id of ['mute','menu-mute']){$(id).setAttribute('aria-label','Mute sound');$(id).setAttribute('aria-pressed',String(m));}try{localStorage.setItem('guns-only.rc.muted',m?'1':'0');}catch{}}
$('mute').onclick=()=>setMuted(!muted);$('menu-mute').onclick=()=>setMuted(!muted);setMuted(muted,false);
function exit(){telemetry.raceQuit('exit');telemetry.endSession();telemetry.flush({force:true});if(window.parent!==window)window.parent.postMessage({type:'guns-only-rc-exit'},location.origin);else location.href='../';}
$('exit').onclick=exit;
window.addEventListener('keydown',e=>{
 if(document.querySelector('.rc-race-menu[open]'))return;
 if(e.code==='Escape'){e.preventDefault();if(!e.repeat)ui.panel()?ui.close():pause(!paused);return;}
 if(ui.panel()||['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName))return;
 if(e.code==='Tab'){if(!paused&&e.target===canvas&&!e.shiftKey){e.preventDefault();if(!e.repeat)$('atlas').click();}return;}
 if(e.target!==canvas&&e.target!==document.body)return;
 if(e.code==='KeyG'){if(!e.repeat)ui.open('garage');return;}
 if(e.code==='KeyE'){if(!e.repeat)enterLocation();return;}
 if(DRIVE_KEYS.includes(e.code)){if(paused)return;e.preventDefault();telemetry.firstInput('keyboard');keys.add(e.code);}
 if(e.repeat)return;if(e.code==='KeyR'&&!paused)recover(s);if((e.code==='KeyF'||(e.code==='Enter'&&e.target===canvas))&&!paused)fireQueued=true;if(e.code==='KeyB')setMode(mode==='kid'?'bigKid':'kid');if(e.code==='KeyM')setMuted(!muted);if(e.code==='KeyO')exit();
});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>pause(true));document.addEventListener('visibilitychange',()=>{if(document.hidden){pause(true);telemetry.flush({force:true});}});
touchControls=bindRCTouchControls({enabled:()=>started&&!paused&&!document.body.classList.contains('modal-open'),onChange:value=>{touchState=value;},onFire:()=>{telemetry.firstInput('touch');fireQueued=true;}});
$('touch').addEventListener('pointerdown',()=>{if(started&&!paused)telemetry.firstInput('touch');},{capture:true});
window.addEventListener('pagehide',()=>touchControls.destroy());
window.addEventListener('storage',e=>{if(e.key==='guns-only.telemetry-sharing.v1')telemetry.flush({force:true});});
window.addEventListener('pagehide',()=>{telemetry.raceQuit('pagehide');telemetry.endSession();telemetry.flush({force:true});});
function resize(){renderer.setSize(innerWidth,innerHeight,false);polish?.resize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();camera.position.set(course.start.pos[0],course.start.pos[1]+2,course.start.pos[2]+8);
// Pose a drawn car from its physics body. Wheels follow the suspension: the centre sits
// restLength−compression below its attach point.
function poseCar(group,wheelSet,c){group.position.set(...c.pos);group.quaternion.set(...c.q);group.scale.setScalar(VISUAL_SCALE);
 wheelSet.forEach((w,i)=>{const ws=c.wheels[i];w.pivot.rotation.y=w.front?-c.steer:0;w.wheel.rotation.x=ws.spin;w.wheel.scale.setScalar(c.params.wheelRadius/BUGGY.wheelRadius);w.pivot.position.y=-(c.params.restLength-ws.compression)/VISUAL_SCALE;});}
// Rivals are clones of the current buggy; on the Blender asset each wears its own jet shell (F-15, A-10, F-22, Su-27, F-16).
// Rivals are tinted clones of whichever buggy is current (prototype, then the Blender asset).
// Rivals wear aggressor-squadron colours (Nellis nod): ghost blue, desert tan, splinter grey, flanker blue, arctic white.
const RIVAL_PAINT=['#5d7fa3','#c9a46c','#8c969c','#3f5f8a','#dfe6ea'];let rivalVis=[],rivalSource=null;
function syncRivals(){if(rivalSource===car&&rivalVis.length===race.rivals.length)return;rivalVis.forEach(v=>{disposeJet(v.group);scene.remove(v.group);});rivalSource=car;
 rivalVis=race.rivals.map((_,i)=>{const group=car.clone(true);group.getObjectByName('VehicleBody')?.removeFromParent();if(!group.getObjectByName('JetShell'))fitJetShell(group,JET_KINDS[(i+1)%5],RIVAL_PAINT[i%5]);if(group.getObjectByName('JetShell')){fitJetShell(group,JET_KINDS[(i+1)%5],RIVAL_PAINT[i%5]);clearcoat(group);paintNoseArt(group.getObjectByName('JetShell'),{});}else group.traverse(o=>{if(o.isMesh&&o.material?.color){const hsl={};o.material.color.getHSL(hsl);if(hsl.s>.35&&hsl.l>.3){o.material=o.material.clone();o.material.color.set(RIVAL_PAINT[i%5]);}}});scene.add(group);
  const named=['FL','FR','RL','RR'].map(n=>({pivot:group.getObjectByName('Steer_'+n),wheel:group.getObjectByName('Wheel_'+n),front:n[0]==='F'}));
  return {group,wheels:named.every(w=>w.pivot&&w.wheel)?named:[]};});}
// Pickup presentation: gift crates, balloons, oil puddles, bubble shields.
let fireQueued=false;const ICON={zoom:'🔥 Afterburner',balloon:'💧 Water balloon',oil:'🛢 Hydraulic leak',bubble:'✨ Chaff',foxtwo:'🎯 Fox Two',pitbull:'🐶 Pitbull',foxone:'📡 Fox One',zuni:'🚀 Zuni'};
const crates=race.pickups.spots.map(sp=>{const g=new T.Group();g.position.set(...sp.pos);box(0,0,0,.22,.22,.22,'#ff5aa5',g);box(0,0,0,.235,.05,.235,'#ffe066',g);box(0,0,0,.05,.235,.235,'#ffe066',g);scene.add(g);return g;});
const fxPool=new Map();function fxMesh(key,make){if(!fxPool.has(key)){const m=make();scene.add(m);fxPool.set(key,m);}const m=fxPool.get(key);m.visible=true;return m;}
function beamMesh(){const g=new T.PlaneGeometry(.1,25);g.translate(0,12.5,0);g.rotateX(-Math.PI/2);
 const m=new T.Mesh(g,new T.MeshBasicMaterial({color:'#5ff8ff',transparent:true,opacity:.45,depthWrite:false,blending:T.AdditiveBlending}));m.userData.noAO=true;return m;}
function missileMesh(){const g=new T.Group(),body=new T.Mesh(new T.CylinderGeometry(.035,.035,.26,10),new T.MeshStandardMaterial({color:'#f4f4f0',roughness:.5}));body.rotation.x=Math.PI/2;g.add(body);
 const nose=new T.Mesh(new T.ConeGeometry(.035,.08,10),new T.MeshStandardMaterial({color:'#e8352e',roughness:.4}));nose.rotation.x=Math.PI/2;nose.position.z=.17;g.add(nose);
 for(const r of [0,Math.PI/2]){const fin=new T.Mesh(new T.BoxGeometry(.12,.005,.05),new T.MeshStandardMaterial({color:'#e8352e'}));fin.rotation.z=r;fin.position.z=-.11;g.add(fin);}g.traverse(o=>{o.castShadow=true;});return g;}
const balloonMat=new T.MeshStandardMaterial({color:'#4fc3ff',roughness:.2}),oilMat=new T.MeshStandardMaterial({color:'#1b1b22',roughness:.05,metalness:.6}),bubbleMat=new T.MeshPhysicalMaterial({color:'#bfefff',transparent:true,opacity:.28,roughness:0,depthWrite:false});
function drawPickups(now){const pk=race.pickups;
 crates.forEach((g,i)=>{const sp=pk.spots[i];g.visible=sp.ready<=0;g.rotation.y=now*.002+i;g.position.y=sp.pos[1]+Math.sin(now*.003+i)*.04;});
 for(const m of fxPool.values())m.visible=false;
 // Foam toy missiles: white body, red nose, a puff of smoke behind; the dangled one hangs off the bumper.
 const drawMissile=(key,pos,dir)=>{const m=fxMesh(key,missileMesh);m.position.set(...pos);m.rotation.set(0,Math.atan2(dir[0],dir[2]),0);};
 pk.missiles.forEach((m,i)=>{drawMissile('m'+i,m.pos,m.dir);if(!paused)fx.puff(m.pos);});
 // Fox One radar beam: shown while your beam-rider is in the air; steering sweeps it.
 if(pk.missiles.some(m=>m.kind==='foxone'&&m.owner===s.car)){const b=fxMesh('beam',beamMesh),d=beamDir(s.car);b.position.set(s.car.pos[0],s.car.pos[1]+.08,s.car.pos[2]);b.rotation.set(0,Math.atan2(-d[0],-d[2]),0);}
 // Carried missiles sit on a small rear bumper rack. The rack point matches the
 // defensive trailer collision, so a held Pitbull never visually circles the car.
 [...(pk.dangle??[])].forEach((c,i)=>{const n=pk.ammo.get(c)??1;for(let k=0;k<n;k++){const p=heldMissilePose(c,k,n);drawMissile(`rack${i}_${k}`,p.pos,p.dir);}});
 pk.balloons.forEach((b,i)=>fxMesh('b'+i,()=>new T.Mesh(new T.SphereGeometry(.07,12,8),balloonMat)).position.set(...b.pos));
 pk.slicks.forEach((o,i)=>{const m=fxMesh('o'+i,()=>{const d=new T.Mesh(new T.CircleGeometry(.5,20),oilMat);d.rotation.x=-Math.PI/2;return d;});m.position.set(o.pos[0],o.pos[1]-.12,o.pos[2]);});
 [race.player.car,...race.rivals.map(r=>r.session.car)].forEach((c,i)=>{if(modifiers(pk,c).shielded)fxMesh('s'+i,()=>new T.Mesh(new T.SphereGeometry(.34,20,14),bubbleMat)).position.set(...c.pos);});
 // Brevity codes: an empty pickup slot reads WINCHESTER once you have fired something.
 const held=pk.held.get(s.car);if(held)drawPickups.used=true;const ammo=pk.ammo.get(s.car);$('item').textContent=held?`${ICON[held]}${ammo>1?' ×'+ammo:''} · F`:'Winchester';$('item').hidden=!held&&!drawPickups.used;}
// Free Drive keeps district guidance in both difficulties. Competitive Big Kid races hide it.
const drivingLine=createRacingLine(scene,race.line,course.world);
// Skill shortcuts get their own (narrower) line, so you can see the hard way through.
const altLines=(course.alts??[]).map(a=>createRacingLine(scene,a.nodes,course.world,{closed:false,width:.34}));
const districtGuides=new Map();let activeDistrictGuide=null;
function drawLine(now){
 const enabled=(mode==='kid'||race.roam)&&!s.finished&&!race.furball;
 const show=enabled&&(!race.roam||!openWorld);
 drivingLine.mesh.visible=show;if(show)drivingLine.update(s.car.pos,s.car.speed,now/1000);
 for(const l of altLines){l.mesh.visible=show;if(show)l.update(s.car.pos,s.car.speed,now/1000);}
 const nearby=enabled&&openWorld&&race.roam?openWorld.districtAt(s.car.pos):null;
 activeDistrictGuide=nearby?.id??null;
 if(nearby&&!districtGuides.has(nearby.id)){
  const line=nearby.course.ai.map(n=>[n.pos[0],n.pos[2],n.halfWidth||2]);
  districtGuides.set(nearby.id,createRacingLine(scene,line,course.world));
 }
 for(const [id,l]of districtGuides){l.mesh.visible=id===activeDistrictGuide;if(l.mesh.visible)l.update(s.car.pos,s.car.speed,now/1000);}
}
const place=()=>placeOf(race,s);
// Feature visuals: glowing Afterburner chevrons on the road; plywood kickers matching their collision.
const padTex=(()=>{const c=document.createElement('canvas');c.width=64;c.height=128;const g=c.getContext('2d');g.fillStyle='#ff7a1a';g.fillRect(0,0,64,128);g.fillStyle='#ffd23f';for(let y=8;y<128;y+=40){g.beginPath();g.moveTo(8,y+28);g.lineTo(32,y);g.lineTo(56,y+28);g.lineTo(56,y+38);g.lineTo(32,y+12);g.lineTo(8,y+38);g.fill();}const t=new T.CanvasTexture(c);t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;return t;})();
const padMeshes=(trackFeatures?.pads??[]).map(p=>{const m=new T.Mesh(new T.PlaneGeometry(1.4,1.4),new T.MeshStandardMaterial({map:padTex,emissive:'#ff6a00',emissiveMap:padTex,emissiveIntensity:.9,transparent:true,opacity:.92,polygonOffset:true,polygonOffsetFactor:-2}));m.rotation.set(-Math.PI/2,0,Math.atan2(p.fwd[0],p.fwd[2])+Math.PI,'YXZ');m.rotation.order='YXZ';m.rotation.y=Math.atan2(p.fwd[0],p.fwd[2])+Math.PI;m.position.set(p.pos[0],p.pos[1]+.02,p.pos[2]);m.userData.noAO=true;scene.add(m);return m;});
for(const k of trackFeatures?.kickers??[]){const W=.8,H=.28,L=1.8,S=.5,g=new T.BufferGeometry(),v=[];const P=(a,c,u)=>[k.pos[0]+k.fwd[0]*a+k.fwd[2]*c,k.pos[1]+u,k.pos[2]+k.fwd[2]*a-k.fwd[0]*c];
 const tri=(a,b,c)=>v.push(...a,...b,...c),quad=(a,b,c,d)=>{tri(a,b,c);tri(a,c,d);};
 quad(P(-L/2,-W,0),P(-L/2,W,0),P(L/2,W,H),P(L/2,-W,H));quad(P(L/2,-W,H),P(L/2,W,H),P(L/2+.6,W,0),P(L/2+.6,-W,0));
 for(const sgn of [-1,1]){quad(P(-L/2,sgn*W,0),P(L/2,sgn*W,H),P(L/2,sgn*(W+S),0),P(-L/2,sgn*(W+S),0));quad(P(L/2,sgn*W,H),P(L/2+.6,sgn*W,0),P(L/2+.6,sgn*(W+S),0),P(L/2,sgn*(W+S),0));}
 g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.computeVertexNormals();const m=new T.Mesh(g,new T.MeshStandardMaterial({color:'#c79a5e',roughness:.85,side:T.DoubleSide}));m.castShadow=m.receiveShadow=true;scene.add(m);}
// Radio-style callouts (brevity codes) flash in the banner slot for a moment.
let calloutTimer=0;function callout(text){const b=$('banner');b.textContent='📻 '+text;b.hidden=false;b.dataset.callout='1';clearTimeout(calloutTimer);calloutTimer=setTimeout(()=>{delete b.dataset.callout;b.textContent='🎺 RETREAT · everyone stops for the flag';},1600);}
// The RACE ring sits on the start line during free drive; driving into it lines everyone up.
let roamArmedAt=30;
function goRoam(){if(openWorld&&!race.roam){location.href=rcLink({track:'hub',at:nearestLocation(s.car.pos).id},location.search);return;}roamArmedAt=s.travel+30;race.roam=true;for(const x of [race.player,...race.rivals.map(r=>r.session)])x.roam=true;}
// Furball: battle mode on this track. Balloons ride above every car; the kid gets extra ones.
// Back to the menu from a result card: the menu is the paused brief.
function toMenu(){telemetry.raceQuit('menu');$('result').hidden=true;pause(true);}
// Free drive on this track from anywhere (a race, a Furball, a result card).
function freeDrive(){telemetry.raceQuit('drive');if(openWorld){location.href=rcLink({track:'hub',at:nearestLocation(s.car.pos).id},location.search);return;}if(!race.roam||race.furball){race=createRace(course,{mode,opponents:rivalCount,roam:true,features:trackFeatures});s=race.player;reported=false;}goRoam();}
function goFurball(){race=createRace(course,{mode,opponents:Math.max(3,rivalCount),features:trackFeatures,furball:true});s=race.player;paintKillMarks();reported=false;Object.assign(sfx,{gate:0,coins:0,held:false,air:0,retreat:false,finished:false});startCountdown();callout('FURBALL!');}
function furballOver(w){if(reported)return;reported=true;const fb=race.furball,result=$('result'),name=x=>x===s?'You':race.rivals.find(r=>r.session===x)?.callsign??'Nobody',down=fb.out.has(s.car);telemetry.furballOutcome({balloonsLeft:down?0:fb.lives.get(s.car),pops:fb.pops.get(s.car),kills:fb.kills.get(s.car),duration:s.time,winner:w===s});
 result.hidden=false;result.innerHTML=`<h1>${w===s?'Splash all bandits! Last jet flying!':down?`Shot down! ${name(w)} wins.`:`Knock it off! ${name(w)} wins.`}</h1><p>Pops ${fb.pops.get(s.car)??0} · Balloons left ${down?0:fb.lives.get(s.car)}</p><button id="again">🎈 Again</button> <button id="explore">▶ Drive</button> <button id="to-menu">⏸ Menu</button>`;
 pause(true);$('again').onclick=()=>{telemetry.choice('again');result.hidden=true;goFurball();pause(false);};$('explore').onclick=()=>{telemetry.choice('drive');result.hidden=true;race=createRace(course,{mode,opponents:rivalCount,roam:true,features:trackFeatures});s=race.player;goRoam();pause(false);};$('to-menu').onclick=toMenu;}
// Kill marks for this round go on every jet; lifetime unlocks only on the player's.
function paintKillMarks(){const k=c=>race.furball?.kills.get(c)??0;paintNoseArt(car.getObjectByName('JetShell'),{tier:artTier(aceKills),marks:k(s.car)});race.rivals.forEach((rv,i)=>{if(rivalVis[i])paintNoseArt(rivalVis[i].group.getObjectByName('JetShell'),{marks:k(rv.session.car)});});}
// Lives are weather balloons on long tethers, up over the rooftops, so you can see where
// everyone is across the base. A popped one breaks free and sails off into the sky.
const balloonVis=new Map(),floaters=[],tetherMat=new T.LineBasicMaterial({color:'#3a3f44',transparent:true,opacity:.6});
function weatherBalloon(colour){const m=new T.Mesh(new T.SphereGeometry(.3,18,12),new T.MeshStandardMaterial({color:new T.Color(colour).lerp(new T.Color('#ffffff'),.55),roughness:.45}));m.scale.y=1.12;
 const box=new T.Mesh(new T.BoxGeometry(.07,.09,.07),new T.MeshStandardMaterial({color:'#e8e2d0'}));box.position.y=-.55;m.add(box);return m;}
function drawLives(now,dt){const fb=race.furball,cs=[s.car,...race.rivals.map(r=>r.session.car)];
 for(const [c,v] of balloonVis)if(!fb||!cs.includes(c)){scene.remove(v.group);balloonVis.delete(c);}
 race.rivals.forEach((rv,i)=>{if(rivalVis[i])rivalVis[i].group.visible=!fb?.out.has(rv.session.car);});
 for(const f of floaters){f.vel[1]+=dt*.6;f.mesh.position.x+=f.vel[0]*dt;f.mesh.position.y+=f.vel[1]*dt;f.mesh.position.z+=f.vel[2]*dt;f.life-=dt;f.mesh.scale.multiplyScalar(1+dt*.08);if(f.life<=0)scene.remove(f.mesh);}
 for(let k=floaters.length-1;k>=0;k--)if(floaters[k].life<=0)floaters.splice(k,1);
 if(!fb)return;
 cs.forEach((c,ci)=>{let v=balloonVis.get(c);
  if(!v){const group=new T.Group(),colour=ci?RIVAL_PAINT[(ci-1)%5]:'#f28c28',balls=[],lines=[];
   for(let j=0;j<5;j++){const b=weatherBalloon(colour);group.add(b);balls.push(b);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,0,0,0],3));const l=new T.Line(g,tetherMat);l.frustumCulled=false;group.add(l);lines.push(l);}
   scene.add(group);balloonVis.set(c,v={group,balls,lines,n:fb.lives.get(c)});}
  const n=fb.out.has(c)?0:fb.lives.get(c);v.group.position.set(c.pos[0],c.pos[1],c.pos[2]);
  // Your own bunch flies straight over the chase camera, out of sight; the HUD counts it, and a
  // popped one still sails up past the screen.
  v.group.visible=c!==s.car;
  v.balls.forEach((b,j)=>{const a=j*1.26+now*.0004,h=3+j*.38;b.position.set(Math.cos(a)*.45+Math.sin(now*.0011+j)*.12,h,Math.sin(a)*.45);b.visible=j<n;
   const p=v.lines[j].geometry.attributes.position;p.setXYZ(0,0,.25,0);p.setXYZ(1,b.position.x,h-.62,b.position.z);p.needsUpdate=true;v.lines[j].visible=j<n;});
  // Popped: the top balloon(s) cut loose and drift up and away.
  for(let j=n;j<v.n;j++){const m=weatherBalloon(ci?RIVAL_PAINT[(ci-1)%5]:'#f28c28');m.position.copy(v.balls[j].position).add(v.group.position);scene.add(m);floaters.push({mesh:m,vel:[(Math.random()-.5)*.8,1.4,(Math.random()-.5)*.8],life:6});}
  v.n=n;});}
function startRace(){race=createRace(course,{mode,opponents:rivalCount,features:trackFeatures});s=race.player;reported=false;Object.assign(sfx,{gate:0,coins:0,held:false,air:0,retreat:false,finished:false});startCountdown();}
function drawRoam(){gates.forEach(g=>{g.visible=!race.roam&&!race.furball;});}
// Challenge coins (Re-Volt's stars): spinning gold discs; ones banked on an earlier visit show as
// faint ghosts. Banked coins live in this browser only (a per-viewer convenience).
const COIN_KEY=`guns-only.rc.coins.${track??'base'}`;let banked=new Set();try{banked=new Set(JSON.parse(localStorage.getItem(COIN_KEY)||'[]'));}catch{}
const coinGeo=new T.CylinderGeometry(.11,.11,.025,24);coinGeo.rotateX(Math.PI/2);
const coinMat=new T.MeshPhysicalMaterial({color:'#ffcc33',metalness:.9,roughness:.25,clearcoat:1,emissive:'#8a5a00',emissiveIntensity:.35});
const ghostMat=new T.MeshBasicMaterial({color:'#ffe9a8',transparent:true,opacity:.25,depthWrite:false});
const coinMeshes=(course.coins??[]).map(c=>{const m=new T.Mesh(coinGeo,banked.has(c.name)?ghostMat:coinMat);m.position.set(c.x,c.y+.12,c.z);m.castShadow=true;scene.add(m);return m;});
function drawCoins(now){(course.coins??[]).forEach((c,i)=>{const m=coinMeshes[i];m.rotation.y=now*.004+i;m.visible=!s.coins.includes(c.name);});
 for(const n of s.coins)if(!banked.has(n)){banked.add(n);try{localStorage.setItem(COIN_KEY,JSON.stringify([...banked]));}catch{}}
 const total=course.coins?.length??0;$('coins').hidden=!total;$('coins').textContent=`🪙 ${banked.size}/${total}`;}
// Rival callsign tags float above each car.
function nameTag(text){const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle='#0d1b20cc';g.fillRect(0,8,256,48);g.fillStyle='#ffce73';g.font='bold 34px system-ui';g.textAlign='center';g.fillText(text,128,45);
 const sp=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),depthWrite:false,transparent:true}));sp.scale.set(.5,.125,1);scene.add(sp);return sp;}
let tags=[];function drawTags(){if(tags.length!==race.rivals.length){tags.forEach(t=>scene.remove(t));tags=race.rivals.map(rv=>nameTag(rv.callsign));}
 race.rivals.forEach((rv,i)=>{const p=rv.session.car.pos;tags[i].position.set(p[0],p[1]+.42,p[2]);});}
const standings=()=>[race.player,...race.rivals.map(r=>r.session)].sort((a,b)=>placeOf(race,a)-placeOf(race,b)).map(x=>x===s?'<b>YOU</b>':race.rivals.find(r=>r.session===x).callsign).join(' · ');
let cameraCar=null;
const desired=new T.Vector3(),target=new T.Vector3(),map=$('map').getContext('2d');
// Minimap fits the route's bounding box.
const mapBox=(()=>{const xs=cps.map(c=>c[0]),zs=cps.map(c=>c[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,k=Math.min(150/(Math.max(...xs)-Math.min(...xs)+10),130/(Math.max(...zs)-Math.min(...zs)+10));return track?{cx,cz,k}:{cx:0,cz:0,k:null};})();
function drawMap(){drawDetailedMinimap(map,{world:openWorld,course,race,player:s,yaw:readout(s).yaw});}
let reported=false;
// 3-2-1-GO: nobody moves until GO (Re-Volt start).
let countdown=-1,lastBeep=0;function startCountdown(){telemetry.raceStart({kind:race.furball?'furball':'race',track:telemetryTrack,mode});countdown=2.999;lastBeep=4;}
const sfx={gate:0,coins:0,held:false,air:0,retreat:false,finished:false};
function soundEvents(r,c){if(s.gate!==sfx.gate){if(s.gate>sfx.gate)audio.gate();sfx.gate=s.gate;}
 if(s.coins.length>sfx.coins){audio.coin();sfx.coins=s.coins.length;}
 const held=race.pickups.held.has(c);if(held&&!sfx.held)audio.pickup();sfx.held=held;
 if(c.wallImpact>1.5)audio.impact(c.wallImpact);
 if(!c.contacts)sfx.air+=1/60;else{if(sfx.air>.25)audio.landing(Math.abs(c.vel[1])+2);sfx.air=0;}
 const rt=retreatActive(race);if(rt&&!sfx.retreat)audio.bugle();sfx.retreat=rt;
 if(s.finished&&!sfx.finished)audio.finish();sfx.finished=s.finished;}
function disposeJet(group){const jet=group.getObjectByName('JetShell'),geos=new Set(),materials=new Set();jet?.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geos)g.dispose();for(const m of materials){m.map?.dispose();m.dispose();}}
function applyShell(kind,colour,body='jet'){if(assetState!=='blender')return;const old=car.getObjectByName('VehicleBody');if(old){old.removeFromParent();const mats=new Set();old.traverse(o=>{o.geometry?.dispose();if(o.material)mats.add(o.material);});for(const m of mats)m.dispose();}disposeJet(car);fitJetShell(car,kind,colour);if(body!=='jet'){disposeJet(car);car.getObjectByName('JetShell')?.removeFromParent();if(body==='buggy'){for(const n of ['Mesh_Body_shell','RakedCanopy','Mesh_Body_ivory','Mesh_Body_graphite']){const o=car.getObjectByName(n);if(o)o.visible=true;}const shell=car.getObjectByName('Mesh_Body_shell');if(shell){shell.material=shell.material.clone();shell.material.color.set(colour);}}else car.add(makeVehicleBody(body,colour));}clearcoat(car);paintNoseArt(car.getObjectByName('JetShell'),{tier:artTier(aceKills)});if(bodyKind!==body){bodyKind=body;const pos=[...s.car.pos];Object.assign(s.car,createCar(vehicleParams(body==='jet'?'buggy':body),pos,readout(s).yaw));}rivalSource=null;}

let portalTravelling=false;
async function travelTo(id){if(!race.roam)return false;keys.clear();touchControls?.reset();fireQueued=false;lastThrottle=0;const p=await openWorld?.travel(id);if(!p)return false;const {pos,yaw}=p.arrival;placeCar(s.car,[pos[0],pos[1]+rideHeight(s.car.params)+.02,pos[2]],yaw);acc=0;cameraCar=null;camera.position.set(pos[0]-Math.sin(yaw)*2,pos[1]+.8,pos[2]+Math.cos(yaw)*2);roamArmedAt=s.travel+30;keys.clear();touchControls?.reset();fireQueued=false;return true;}
function enterLocation(){if(!openWorld||paused||!race.roam)return;if(openWorld.activity()&&!openWorld.activity().done){const tee=openWorld.resetActivity();if(tee)placeCar(s.car,[tee.pos[0],rideHeight(s.car.params)+.02,tee.pos[2]],tee.yaw);else if(openWorld.activity()?.done){audio.finish();callout(`BOWLING · ${openWorld.activity().score}/10`);}return;}const p=openWorld.near(s.car.pos);if(!p)return;if(p.game){const tee=openWorld.startActivity(p.game);placeCar(s.car,[tee.pos[0],rideHeight(s.car.params)+.02,tee.pos[2]],tee.yaw);callout(p.game==='golf'?'CAR GOLF · 3 HOLES':'STRIKE · 2 DELIVERIES');return;}if(p.kind==='discovery'||!canEnter(openWorld.progress,p))ui.open('map');else location.href=openWorld.eventURL(p);}
const ui=createWorldUI({world:openWorld,getState:()=>({pos:s.car.pos,yaw:readout(s).yaw,paused,roam:race.roam,started}),pause,applyShell,travel:travelTo,interact:enterLocation,search:location.search});
let cupStorage;try{cupStorage=sessionStorage;}catch{}let cup=loadCup(cupStorage);const cupId=new URLSearchParams(location.search).get('cup');if(!cupId||!CUP_COURSES[Number(cupId)]||cup?.id!==cupId||!cup.events.includes(openWorld?.selected.id)||(cup&&cup.events.indexOf(openWorld?.selected.id)>cup.results.length))cup=null;
function cupURL(event,id){const q=new URLSearchParams(location.search);q.set('track','hub');q.set('event',event);q.set('mode','race');q.set('cup',id);return '?'+q;}
const raceMenu=createRaceMenu({progress:()=>ui.progress,search:location.search,onStartCup:index=>{const c=CUP_COURSES[index];cup=createCup(String(index),c.courses.map(c=>c[0]),['YOU',...race.rivals.map(r=>r.callsign)]);saveCup(cup,cupStorage);location.href=cupURL(cup.events[0],cup.id);}});$('choose-course').onclick=()=>{pause(true);raceMenu.open();};
if(openWorld){$('brief-title').textContent=new URLSearchParams(location.search).has('event')&&!openWorld.locked?openWorld.selected.name:'SAUCER SPRINGS AFB';$('start').title='Explore Saucer Springs; E enters an event, Tab opens the base map';}
$('return-world').hidden=!!openWorld;$('return-world').onclick=()=>{location.href=rcLink({track:'hub',from:new URLSearchParams(location.search).get('from')??track},location.search);};
window.addEventListener('pagehide',()=>{openWorld?.dispose();worldSky?.dispose();});
// pagehide tears the world and touch controls down, so a back/forward-cache restore must reload.
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
const worldSky=openWorld?createWorldSky({scene,sun,hemi,contactSun,renderer}):null;let worldElapsed=0;
const pollGamepad=createGamepadInput();const frameMs=[];function frame(now){const pad=pollGamepad(navigator.getGamepads?.());if(pad.start){if(!started)$('start').click();else if(!ui.panel())pause(!paused);}if(!paused&&!ui.panel()&&pad.fire)fireQueued=true;if(!started&&!$('start').disabled){started=true;paused=false;$('brief').hidden=true;$('pause').textContent='⏸';if(!race.roam)startCountdown();}const dt=frameSeconds(now,last);telemetry.observeFrame(Math.max(0,now-last),!paused&&countdown<=0&&!document.hidden);frameMs.push(Math.max(0,now-last));if(frameMs.length>600)frameMs.shift();last=now;
 if(!paused&&!ui.panel()&&countdown>0){countdown-=dt;const n=Math.ceil(countdown);if(n<lastBeep){lastBeep=n;n>0?audio.beep():audio.beep(true);}$('countdown').hidden=countdown<=-.6;$('countdown').textContent=countdown>0?String(n):'GO!';if(countdown<=0&&countdown>-.6){}acc=0;}
 if(!paused&&!ui.panel()&&countdown<=0&&(!openWorld||openWorld.stream.ready(s.car.pos))){$('countdown').hidden=countdown<=-.6;if(countdown>-.6)countdown-=dt;acc+=dt;while(acc>=1/120){const drive=drivingInput(keys,{...pad,steer:touchState.steer||pad.steer,throttle:touchState.throttle||pad.throttle,brake:touchState.brake||pad.brake}),throttleIn=drive.throttle;if(fireQueued&&race.pickups.held.get(s.car)){const it=race.pickups.held.get(s.car);telemetry.itemUse(it);it==='zoom'?audio.boost():audio.fire();}stepRace(race,{...drive,fire:fireQueued},1/120);if(openWorld)for(const session of [s,...race.rivals.map(r=>r.session)])openWorld.step(session.car,1/120);if(openWorld&&race.roam){const activity=openWorld.stepActivity(1/120,s.car);if(activity?.tee)placeCar(s.car,[activity.tee.pos[0],rideHeight(s.car.params)+.02,activity.tee.pos[2]],activity.tee.yaw);if(activity?.sunk){audio.coin();callout('IN THE CUP');}if(activity?.finished){audio.finish();callout(activity.score!=null?`${activity.strike?'STRIKE!':'BOWLING'} · ${activity.score}/10`:`CAR GOLF · ${activity.total} HITS · BEST ${openWorld.progress.golfBest}`);}}fireQueued=false;acc-=1/120;lastThrottle=throttleIn||pad.throttle;soundEvents(readout(s),s.car);}}
 document.body.classList.toggle('race-mode',!race.roam&&started&&!paused);document.body.classList.toggle('driving',started&&!paused);
 const r=readout(s),c=s.car,p=BUGGY;
 if(marshalSession!==s){marshalSession=s;marshalRecovery=s.recoveries;marshalLap=s.lap;marshalUntil=marshalLapUntil=0;}
 if(s.recoveries!==marshalRecovery){marshalRecovery=s.recoveries;marshalUntil=now+1600;}
 if(s.lap!==marshalLap){marshalLap=s.lap;marshalLapUntil=now+2400;}
 const rescue=now<marshalUntil,showLap=now<marshalLapUntil;
 marshal.root.visible=started&&(countdown>-.6||rescue||showLap||retreatActive(race)||s.finished);
 const mx=rescue?0:Math.sin(r.yaw)*2.4+Math.cos(r.yaw)*.8,mz=rescue?0:-Math.cos(r.yaw)*2.4+Math.sin(r.yaw)*.8;
 marshal.root.position.set(r.x+mx,r.y+(rescue?1.3:.64),r.z+mz);marshal.root.rotation.y=Math.PI-r.yaw;
 marshal.update({time:now/1000,car:c,countdown:countdown>0?Math.ceil(countdown):countdown>-.6?0:-1,recovering:rescue,retreat:retreatActive(race),finish:s.finished,lap:showLap?s.lap:undefined,laps:s.laps,alienUnlocked:!!openWorld?.progress.discovered.includes('lab')&&canEnter(openWorld.progress,locationById('lab'))});
 if(openWorld){if(!paused){openWorld.traffic(race);const collected=openWorld.collect(s.seen);if(collected.unlocked){callout('DREAMLAND UNLOCKED');openWorld.navigate('lab',c.pos);}else if(collected.found.length){callout(collected.found.at(-1).name+' badge found');audio.coin();}}openWorld.update(now/1000,c.pos,camera,p=>callout(p.short+' discovered'));if(race.roam&&!paused&&!portalTravelling){portalTravelling=true;openWorld.portal(c.pos,now/1000).then(trip=>{if(!trip)return;placeCar(s.car,[trip.position[0],rideHeight(s.car.params)+.06,trip.position[2]],Math.PI);acc=0;document.body.classList.remove('portal-flash');void document.body.offsetWidth;document.body.classList.add('portal-flash');callout(trip.to==='alien'?'BEYOND THE PORTAL':'SAUCER SPRINGS AFB');}).finally(()=>{portalTravelling=false;});}const waiting=!openWorld.stream.ready(c.pos);$('stream-status').hidden=!waiting;if(waiting)acc=0;}ui.update(now);
 contactSun.position.set(r.x-4,r.y+(artReview&&Math.abs(r.x-38)<9&&Math.abs(r.z+8)<11?4:8),r.z-5);contactSun.target.position.set(r.x,r.y,r.z);
 audio.update({speed:r.speed,throttle:lastThrottle,slip:c.wheels.filter(w=>w.slip).length/4,surface:c.wheels.find(w=>w.surface)?.surface,paused:paused||countdown>0});if(track)followSun(sun,car.position);if(worldSky){if(!paused)worldElapsed+=dt;const light=worldSky.update(worldElapsed,c.pos,c.pos[0]>9000||(!!openWorld.selected.night&&!openWorld.locked));openWorld.lighting(light.day,c.pos);}
 if(!paused){for(const cc of [c,...race.rivals.map(rv=>rv.session.car)])fx.carFeedback(cc,dt);for(const e of race.events.splice(0))if(e.type==='splash'){fx.splash(e.car?.pos??e.pos);audio.splash();}else if(e.type==='boom'){fx.boom(e.car?.pos??e.pos);audio.impact(5);}else if(e.type==='winchester'&&e.car===s.car){callout('WINCHESTER');audio.radio();}else if(e.type==='downed'){fx.boom(e.car.pos);let msg=e.by===s.car?'SPLASH ONE':e.left===2&&!race.furball.out.has(s.car)?'LAST MAN STANDING':null;if(e.by===s.car){const was=artTier(aceKills);aceKills++;try{localStorage.setItem('guns-only.rc.kills',aceKills);}catch{}if(artTier(aceKills)>was)msg+=` · NOSE ART: ${NOSE_ART[was].name}`;}paintKillMarks();if(msg){callout(msg);audio.radio();}}else if(e.type==='furball-over')furballOver(e.winner);}fx.update(dt);
 poseCar(car,wheels,c);syncRivals();race.rivals.forEach((rv,i)=>poseCar(rivalVis[i].group,rivalVis[i].wheels,rv.session.car));
 // Low chase camera behind the heading; pulled in front of any wall between it and the car.
 if(cameraCar)camera.position.add(new T.Vector3(r.x-cameraCar[0],r.y-cameraCar[1],r.z-cameraCar[2]));cameraCar=[r.x,r.y,r.z];
 const back=1.28+Math.min(.22,r.speed*.014),eye=[r.x,r.y+.12,r.z];desired.set(r.x-Math.sin(r.yaw)*back,r.y+.49,r.z+Math.cos(r.yaw)*back);
 const ray=[desired.x-eye[0],desired.y-eye[1],desired.z-eye[2]],dist=Math.hypot(...ray),hit=course.world.raycast(eye,ray.map(v=>v/dist),dist);
 if(hit){const k=Math.max(.15,hit.dist-.12)/dist;desired.set(eye[0]+ray[0]*k,eye[1]+ray[1]*k,eye[2]+ray[2]*k);}
 camera.fov+=((60+Math.min(5,r.speed*.3))-camera.fov)*Math.min(1,dt*3);camera.updateProjectionMatrix();camera.position.lerp(desired,1-Math.exp(-dt*7));
 // Sweep the smoothed position too: damping must not carry the camera through a wall.
 const actualRay=[camera.position.x-eye[0],camera.position.y-eye[1],camera.position.z-eye[2]],actualDistance=Math.hypot(...actualRay);if(actualDistance>.01){const obstruction=course.world.raycast(eye,actualRay.map(v=>v/actualDistance),actualDistance);if(obstruction){const k=Math.max(.08,obstruction.dist-.08)/actualDistance;camera.position.set(eye[0]+actualRay[0]*k,eye[1]+actualRay[1]*k,eye[2]+actualRay[2]*k);}}
 target.set(r.x+Math.sin(r.yaw)*1.05,r.y+.18,r.z-Math.cos(r.yaw)*1.05);camera.lookAt(target);
 if(ui.panel()==='garage'){const a=now*.00022;camera.position.set(r.x+Math.sin(a)*1.05,r.y+.48,r.z+Math.cos(a)*1.05);camera.fov=48;camera.updateProjectionMatrix();camera.lookAt(r.x,r.y+.08,r.z);}
 gates.forEach((g,i)=>{const next=i===(s.gate===cps.length-1?0:s.gate);g.userData.arch.material=next?archLit:archMat;g.userData.label.visible=false;g.userData.label.quaternion.copy(camera.quaternion);});aliens.forEach((a,i)=>{a.position.y=.4+Math.sin(now*.0015+i)*.07;});
 $('speed').textContent=Math.round(r.speed*3.6);$('clock').hidden=race.roam&&!race.furball;$('clock').textContent=format(race.furball?race.furball.left:s.time);drawLives(now,dt);drawPickups(now);drawLine(now);drawRoam(now);drawCoins(now);$('gate').textContent=race.furball?`FURBALL · 🎈${race.furball.out.has(s.car)?0:race.furball.lives.get(s.car)} · ${race.rivals.filter(r=>!race.furball.out.has(r.session.car)).length} bandits`:race.roam?(openWorld?nearestLocation(s.car.pos).short:'FREE DRIVE'):`${race.rivals.length?`P${place()}/${race.rivals.length+1} · `:''}${s.laps>1?`LAP ${s.lap}/${s.laps}`:`${Math.min(s.gate+1,cps.length)}/${cps.length}`}`;if(!$('banner').dataset.callout)$('banner').hidden=!retreatActive(race);$('secret').hidden=!course.secrets.length;$('secret').textContent=openWorld?`◇ ${openWorld.progress.specimens.length}/${SPECIMENS.length} badges${expedition(openWorld.progress).complete?' ★':''}`:`◇ ${s.found}/${course.secrets.length}`;drawMap();polish?polish.render():renderer.render(scene,camera);
 if(s.finished&&!reported){reported=true;openWorld?.finish(s.time,s.lapTimes);telemetry.raceFinish({place:place(),time:s.time,gap:null,recoveries:s.recoveries,altTaken:null});if(!best||s.time<best){best=s.time;try{localStorage.setItem(bestKey,best);}catch{}}const result=$('result');result.hidden=false;result.innerHTML=`<h1>${openWorld?.selected.location==='lab'&&expedition(openWorld.progress).complete?'DREAMLAND CLEARED':race.rivals.length?['Sierra Hotel! You won!','Second place. Good hustle, Airman!','Third place. On the podium!','Fourth place. Next sortie!','Fifth place. Next sortie!','Sixth place. Next sortie!','Seventh place. Next sortie!','Eighth place. Next sortie!'][place()-1]:'Lap complete!'}</h1><p>${race.rivals.length?standings()+'<br>':''}${format(s.time)} · Best ${format(best)} · Badges ${openWorld?openWorld.progress.specimens.length:s.found}/${course.secrets.length}${course.coins?.length?` · Coins ${banked.size}/${course.coins.length}`:''}</p><button id="again">🏁 Again</button> <button id="explore">▶ Drive</button> <button id="to-menu">⏸ Menu</button>`;pause(true);$("again").onclick=()=>{telemetry.choice('again');s=(race=createRace(course,{mode,opponents:rivalCount,features:trackFeatures})).player;reported=false;Object.assign(sfx,{gate:0,coins:0,held:false,air:0,retreat:false,finished:false});startCountdown();result.hidden=true;pause(false);};$('explore').onclick=()=>{telemetry.choice('drive');result.hidden=true;goRoam();pause(false);};$('to-menu').onclick=toMenu;if(cup){const order=[s,...race.rivals.map(r=>r.session)].sort((a,b)=>placeOf(race,a)-placeOf(race,b)).map(x=>x===s?'YOU':race.rivals.find(r=>r.session===x).callsign);recordCupRace(cup,openWorld.selected.id,order);saveCup(cup,cupStorage);const scores=document.createElement('p');scores.textContent=cupStandings(cup).map(r=>`${r.rank}. ${r.id} ${r.points}`).join(' · ');result.append(scores);const next=nextCupEvent(cup);if(next){const button=document.createElement('button');button.textContent='Next race';button.onclick=()=>location.href=cupURL(next,cup.id);result.prepend(button);}else{result.querySelector('h1').textContent=CUP_COURSES[Number(cup.id)].cup+' Cup · '+cupStandings(cup).find(r=>r.id==='YOU').rank;}}}
 if(now-lastTelemetryFlush>=15_000){lastTelemetryFlush=now;telemetry.flush();}
 requestAnimationFrame(frame);}
// Read-only diagnostics for QA. Simulation tests use the same public step function.
window.__gunsOnlyRC={give:(item,n)=>{race.pickups.held.set(s.car,item);if(n>1)race.pickups.ammo.set(s.car,n);else race.pickups.ammo.delete(s.car);},frames:()=>{const a=[...frameMs].sort((x,y)=>x-y);return {p50:a[a.length>>1],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};},audio:()=>Object.keys(audio.samples||{}),line:()=>race.line.map(p=>[p[0],p[1]]),snapshot:()=>({...readout(s),rivals:race.rivals.map(rv=>({name:rv.callsign,x:rv.session.car.pos[0],z:rv.session.car.pos[2],finished:rv.session.finished})),drifting:!!s.assist.drift?.active,time:s.time,lap:s.lap,laps:s.laps,lapTimes:[...s.lapTimes],gate:s.gate,running:s.running,finished:s.finished,hits:s.hits,found:s.found,seen:[...s.seen],travel:s.travel,recoveries:s.recoveries,mode,paused,guide:drivingLine.mesh.visible?'course':activeDistrictGuide,assets:assetState,item:race.pickups.held.get(s.car)??null,place:place(),track,world:openWorld?{...openWorld.stream.stats(),ready:openWorld.stream.ready(s.car.pos),discovered:[...openWorld.progress.discovered],event:openWorld.selected.id,locked:openWorld.locked,golf:openWorld.activity(),golfBest:openWorld.progress.golfBest,bowlingBest:openWorld.progress.bowlingBest,specimens:[...openWorld.progress.specimens],expedition:expedition(openWorld.progress)}:null,vehicle:{topSpeed:s.car.params.topSpeed,wheelRadius:s.car.params.wheelRadius,mass:s.car.params.mass},body:ui.progress.body,shell:ui.progress.shell,paint:ui.progress.paint,audioSilent:audio.silent}),renderer:()=>renderer.info.render,checkpoints:()=>cps.map(c=>[c[0],c[1]])};requestAnimationFrame(frame);
