import {NY,NY_PARK,bridgeLocal,bridgeWorld} from './open-world/under-bridge.mjs';
import {BOARDWALK,BOARDWALK_PARK,boardwalkLocal,boardwalkWorld} from './open-world/boardwalk.mjs';
import {protectGameControls} from './control-surfaces.mjs';
protectGameControls();
import {fetchAssetBuffer} from './asset-buffer.mjs';
import {bindRCTouchControls} from './touch-controls.mjs';
import {DRIVE_KEYS,drivingInput,flightInput,trickInput} from './driving-input.mjs';
import {toggleFlight,FLIGHT} from './physics/flight.mjs';
import {applyLivery} from './livery.js';
import {batchCarParts,unbatchCarParts} from './car-batch.js';
import {createRobot,stepRobot} from './physics/robot.mjs';
import {makeRobotBody,poseRobotBody,makeBoardRider,poseBoardRider} from './robot-body.js';
import {createAdventure} from './open-world/adventure.js';
import {vehicleParams} from './physics/vehicles.mjs';
import {createAdaptiveResolution,stepAdaptiveResolution} from './adaptive-resolution.mjs';
import {createPlaymates,stepPlaymates} from './physics/playmate.mjs';
import {drawDetailedMinimap} from './open-world/minimap.js';
import {createCup,loadCup,saveCup,recordCupRace,nextCupEvent,cupStandings} from './grand-prix.mjs';
import {createRaceMenu,CUP_COURSES} from './race-menu.js';
import {createAlienMarshal} from './alien-marshal.js';
import {createGamepadInput} from './gamepad.mjs';
import {frameSeconds} from './frame-time.mjs';
import {poseCar} from './vehicle-pose.mjs';
import {makeVehicleBody} from './vehicle-bodies.js';
import {vehicleParams} from './physics/vehicles.mjs';
import * as T from '../vendor/three.module.js';
import {buildings,solids,aircraft,obstacles,collisionSolids,ramps,checkpoints,baseCourse} from './sim.mjs';
import {recover,readout} from './physics/session.mjs';
import {createRace as createRaceBase,stepRace,placeOf,retreatActive} from './physics/race.mjs';
import {TRACK_FEATURES,placeFeatures} from './physics/features.mjs';
import {modifiers,MISSILES,beamDir,LASER} from './physics/pickups.mjs';
import {heldMissilePose} from './pickup-visuals.mjs';
import {BUGGY,createCar,placeCar,rideHeight} from './physics/car.mjs';
import {addBox} from './physics/world.mjs';
import {courseFromGlb} from './physics/district.mjs';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {LIGHTING,isIndoor,applyLighting,followSun,clearcoat,studioEnvironment,createEffects,createRacingLine,setupPolish} from './visuals.js';
import { SoundKit } from './audio.js';
import {JET_KINDS,fitJetShell,paintNoseArt,artTier,NOSE_ART} from './jets.js';
import {createRCTelemetry} from './telemetry.mjs';import {resultPanel,bindResultPanel,ordinal,placeTitle} from './result-panel.mjs';
import {createWorldSky} from './open-world/sky.js';
import {loadOpenWorld} from './open-world/runtime.js';
import {createWorldUI} from './open-world/ui.js';
import {loadProgress,canEnter,expedition,SPECIMENS,rcLink,nearestLocation,locationById,eventById,eventLaps} from './open-world/catalog.mjs';
import {setSkateRails} from './physics/grind.mjs';
import {PLAZA,PLAZA_PARK,plazaLocal,plazaWorld} from './open-world/town-plaza.mjs';import {PLAYGROUND,PLAYGROUND_PARK,playgroundLocal,playgroundWorld} from './open-world/playground.mjs';
import {MARSEILLE_PARK,marseilleLocal,marseilleWorld} from './open-world/marseille.mjs';
import {createSkate,stepSkate,INTRO_PARK} from './physics/skate.mjs';import {SKATESTREET,SKATESTREET_PARK,skatestreetLocal,skatestreetWorld} from './open-world/skatestreet.mjs';import {createNearDetail} from './open-world/near-detail.js';import {HANGAR,HANGAR_PARK,hangarLocal,hangarWorld} from './open-world/skate-hangar.mjs';import {SCHOOL_PARK,yardLocal,yardWorld} from './open-world/schoolyard.mjs';import {createSkateHud,goalCard} from './skate-hud.js';import {bankPoint,bankLocal} from './open-world/park-lines.mjs';import {RESIDENTIAL_PARK,parkPoint} from './open-world/residential-frame.mjs';
let bodyKind='jet';try{bodyKind=loadProgress(localStorage).body;}catch{}
function createRace(course,options){return createRaceBase({...course,laps:eventLaps(course.event)},{...options,params:vehicleParams(bodyKind==='jet'?'buggy':bodyKind)});}
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
let track='hub',district=null,districtError=null,openWorld=null;let adventure=null;
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
const renderer=new T.WebGLRenderer({canvas,antialias:true});const adaptive=createAdaptiveResolution({max:Math.min(devicePixelRatio,1.75),min:Math.min(devicePixelRatio,1)});renderer.setPixelRatio(adaptive.ratio);renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
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
 if(openWorld)adventure=createAdventure(scene,course.world);
 const root=district?.gltf.scene;if(root){root.traverse(o=>{if(/^(COL_|GATE_|START_|AI_|PICKUP_|SPEC_|CAM_)/.test(o.name))o.visible=false;else if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(root);}
 // District backdrops (ridge, skyline) sit 470–660 m out: draw to 900 m with a light desert haze.
 scene.background=new T.Color('#a9d4ee');scene.fog=new T.Fog('#c9dde6',openWorld?280:180,openWorld?680:950);camera.far=openWorld?40000:900;camera.updateProjectionMatrix();
}
let car=new T.Group();scene.add(car);const prototypeBody=new T.Group();prototypeBody.name='Body';car.add(prototypeBody);
const shell=box(0,.15,0,.44,.16,.75,'#e6a53c',prototypeBody);box(0,.3,.04,.33,.20,.32,'#273d45',prototypeBody);box(0,.22,.35,.55,.05,.05,'#253436',prototypeBody);box(0,.43,.29,.016,.45,.016,'#313d3b',prototypeBody);for(const x of [-.15,.15])box(x,.19,-.36,.10,.06,.025,'#fff4be',prototypeBody);
let wheels=[];for(const z of [-.25,.25])for(const x of [-.29,.29]){const name=(z<0?'F':'R')+(x<0?'L':'R'),pivot=new T.Group();pivot.name='Steer_'+name;car.add(pivot);const wheel=new T.Group();wheel.name='Wheel_'+name;wheel.userData.modelRadius=.15;wheel.userData.modelWidth=.13;pivot.add(wheel);const tyre=new T.Mesh(new T.CylinderGeometry(.15,.15,.13,16).rotateZ(Math.PI/2),material('#202a2a'));tyre.castShadow=true;wheel.add(tyre);sphere(0,0,0,.06,'#b1b6a8',wheel,1,1,1);wheels.push({pivot,wheel,front:z<0});}
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
  assetState='blender';telemetry.boot({assets:'blender',ms:performance.now()});ui.apply();openWorld?.loadBackground?.();if(openWorld&&new URLSearchParams(location.search).get('detail')!=='off')nearDetail=createNearDetail(scene,openWorld.stream.world);
 }).catch(error=>{assetState='failed';telemetry.boot({assets:'failed',ms:performance.now()});telemetry.error('assets',error?.message??error);console.error('RC Blender asset rejected:',error);$('brief').hidden=false;const warning=document.createElement('p');warning.textContent='Asset loading failed; prototype fallback is available.';$('brief').append(warning);}).finally(readyModes);
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
let nearDetail=null,lastTelemetryFlush=performance.now(),lastTelemetrySample=0,lastBeat=performance.now(),beatTravel=0,beatRecoveries=0,beatSession=null;
window.addEventListener('error',e=>telemetry.error('error',e.message));window.addEventListener('unhandledrejection',e=>telemetry.error('rejection',e.reason?.message??e.reason));
// Once a second: the place the car is at; once a minute: what the player is doing and how far they drove.
function sampleTelemetry(now){if(!started||document.hidden)return;const at=openWorld?.near(s.car.pos);if(at)telemetry.visit(at.id);if(beatSession!==s){beatSession=s;beatTravel=s.travel??0;beatRecoveries=s.recoveries??0;}if(now-lastBeat<60_000)return;lastBeat=now;const doing=paused?'paused':skate?'skate:'+skatePark:openWorld?.activity()&&!openWorld.activity().done?openWorld.activity().kind:race.furball?'furball':!race.roam?'race':'roam';telemetry.heartbeat({doing,place:openWorld?nearestLocation(s.car.pos).id:track,metres:Math.max(0,(s.travel??0)-beatTravel),recoveries:Math.max(0,(s.recoveries??0)-beatRecoveries)});beatTravel=s.travel??0;beatRecoveries=s.recoveries;}
// Course features (boost pads, kicker ramps) are placed once into the world and shared by every race.
const trackFeatures=track&&TRACK_FEATURES[track]?placeFeatures(course,race.line,TRACK_FEATURES[track]):null;race.features=trackFeatures;
const format=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;
let started=false;
for(const event of ['pointerdown','keydown'])window.addEventListener(event,()=>audio.start(),{once:true});
// Escape opens the menu (once racing has started): resume, change track, race or free drive, kid, mute.
function pause(value){paused=value;document.body.classList.toggle('paused',value);if(!value)audio.start();keys.clear();touchControls?.reset();fireQueued=false;$('pause').textContent=paused?'▶':'⏸';
 if(started&&!$('result').hidden)return;if(started){$('brief').hidden=!paused;$('brief-title').textContent=paused?'PAUSED':'SAUCER SPRINGS AFB';$('resume').hidden=!paused;$('start').hidden=race.roam;$('start').textContent='Return to base';if(paused)$('resume').focus();else canvas.focus();}}
let lastThrottle=0;
let skateTouchGrab=false,touchControls=null,touchState={steer:0,throttle:0,brake:false};
// Drive = free drive on this track. On the very first press it starts whatever the URL chose (?mode=race|furball).
$('start').onclick=()=>{telemetry.firstInput('button');audio.start();$('brief').hidden=true;$('result').hidden=true;const first=!started;started=true;if(first){pause(false);if(!race.roam)startCountdown();$('start').textContent='▶ Drive';}else{freeDrive();pause(false);}canvas.focus();};
$('resume').onclick=()=>{pause(false);canvas.focus();};
$('menu-race').onclick=()=>{if(openWorld&&race.roam){const p=nearestLocation(s.car.pos);location.href=openWorld.eventURL(p.event||p.track?p:locationById('ramp'));return;}telemetry.firstInput('button');audio.start();started=true;$('brief').hidden=true;$('result').hidden=true;pause(false);startRace();canvas.focus();};
$('menu-furball').onclick=()=>{if(openWorld){location.href=openWorld.eventURL(locationById('ramp'),'furball');return;}telemetry.firstInput('button');audio.start();started=true;$('brief').hidden=true;$('result').hidden=true;goFurball();pause(false);canvas.focus();};$('pause').onclick=()=>pause(!paused);$('reset').onclick=()=>{telemetry.recover('button');recover(s);};
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
 if(e.repeat)return;if(e.code==='KeyT'&&!paused&&race.roam&&!skate&&!s.flight.mode){transform();}if(e.code==='KeyR'&&!paused){telemetry.recover('key');recover(s);}if(e.code==='KeyF'&&!paused)fireQueued=true;if(e.code==='Enter'&&e.target===canvas&&!paused){if(race.roam&&!skate){const was=s.flight.mode,m=toggleFlight(s.flight,s.car,{roam:true});if(m!==was){audio.boost();callout(m==='fly'?'✈ AIRBORNE · Enter = parachute':'🪂 PARACHUTE');}}else fireQueued=true;}if(e.code==='KeyB')setMode(mode==='kid'?'bigKid':'kid');if(e.code==='KeyM')setMuted(!muted);if(e.code==='KeyO')exit();
});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>pause(true));document.addEventListener('visibilitychange',()=>{if(document.hidden){pause(true);telemetry.flush({force:true});}});
touchControls=bindRCTouchControls({enabled:()=>started&&!paused&&!document.body.classList.contains('modal-open'),onChange:value=>{touchState=value;},onGrab:value=>{skateTouchGrab=value;},onFire:()=>{telemetry.firstInput('touch');fireQueued=true;}});
$('touch').addEventListener('pointerdown',()=>{if(started&&!paused)telemetry.firstInput('touch');},{capture:true});
window.addEventListener('pagehide',()=>touchControls.destroy());
window.addEventListener('storage',e=>{if(e.key==='guns-only.telemetry-sharing.v1')telemetry.flush({force:true});});
window.addEventListener('pagehide',()=>{telemetry.raceQuit('pagehide');telemetry.endSession();telemetry.flush({force:true});});
function resize(){renderer.setSize(innerWidth,innerHeight,false);polish?.resize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();camera.position.set(course.start.pos[0],course.start.pos[1]+2,course.start.pos[2]+8);
// Rivals are clones of the current buggy; on the Blender asset each wears its own jet shell (F-15, A-10, F-22, Su-27, F-16).
// Rivals are tinted clones of whichever buggy is current (prototype, then the Blender asset).
// Rivals wear aggressor-squadron colours (Nellis nod): ghost blue, desert tan, splinter grey, flanker blue, arctic white.
const RIVAL_PAINT=['#5d7fa3','#c9a46c','#8c969c','#3f5f8a','#dfe6ea'];let rivalVis=[],rivalSource=null;
function syncRivals(){if(rivalSource===car&&rivalVis.length===race.rivals.length)return;rivalVis.forEach(v=>{disposeJet(v.group);scene.remove(v.group);});rivalSource=car;
 rivalVis=race.rivals.map((_,i)=>{const group=car.clone(true);unbatchCarParts(group);group.getObjectByName('VehicleBody')?.removeFromParent();fitJetShell(group,JET_KINDS[(i+1)%5],RIVAL_PAINT[i%5]);clearcoat(group);paintNoseArt(group.getObjectByName('JetShell'),{});batchCarParts(group);scene.add(group);
  const named=['FL','FR','RL','RR'].map(n=>({pivot:group.getObjectByName('Steer_'+n),wheel:group.getObjectByName('Wheel_'+n),front:n[0]==='F'}));
  return {group,wheels:named.every(w=>w.pivot&&w.wheel)?named:[]};});}
// Pickup presentation: gift crates, balloons, oil puddles, bubble shields.
let fireQueued=false;const ICON={zoom:'🔥 Afterburner',balloon:'💧 Water balloon',oil:'🛢 Hydraulic leak',bubble:'✨ Chaff',foxtwo:'🎯 Fox Two',pitbull:'🐶 Pitbull',foxone:'📡 Fox One',zuni:'🚀 Zuni',laser:'👽 Laser turret'};
const crates=race.pickups.spots.map(sp=>{const g=new T.Group();g.position.set(...sp.pos);box(0,0,0,.22,.22,.22,'#ff5aa5',g);box(0,0,0,.235,.05,.235,'#ffe066',g);box(0,0,0,.05,.235,.235,'#ffe066',g);scene.add(g);return g;});
const fxPool=new Map();function fxMesh(key,make){if(!fxPool.has(key)){const m=make();scene.add(m);fxPool.set(key,m);}const m=fxPool.get(key);m.visible=true;return m;}
function beamMesh(){const g=new T.PlaneGeometry(.1,25);g.translate(0,12.5,0);g.rotateX(-Math.PI/2);
 const m=new T.Mesh(g,new T.MeshBasicMaterial({color:'#5ff8ff',transparent:true,opacity:.45,depthWrite:false,blending:T.AdditiveBlending}));m.userData.noAO=true;return m;}
function missileMesh(){const g=new T.Group(),body=new T.Mesh(new T.CylinderGeometry(.035,.035,.26,10),new T.MeshStandardMaterial({color:'#f4f4f0',roughness:.5}));body.rotation.x=Math.PI/2;g.add(body);
 const nose=new T.Mesh(new T.ConeGeometry(.035,.08,10),new T.MeshStandardMaterial({color:'#e8352e',roughness:.4}));nose.rotation.x=Math.PI/2;nose.position.z=.17;g.add(nose);
 for(const r of [0,Math.PI/2]){const fin=new T.Mesh(new T.BoxGeometry(.12,.005,.05),new T.MeshStandardMaterial({color:'#e8352e'}));fin.rotation.z=r;fin.position.z=-.11;g.add(fin);}g.traverse(o=>{o.castShadow=true;});return g;}
// Laser turret: a little alien gunner climbs out of the roof behind a stubby cannon.
function alienGunner(){const g=new T.Group(),skin=new T.MeshStandardMaterial({color:'#7fe07a',roughness:.55}),dark=new T.MeshStandardMaterial({color:'#15181c',roughness:.3}),steel=new T.MeshStandardMaterial({color:'#5b6470',roughness:.4,metalness:.5});
 const body=new T.Mesh(new T.CapsuleGeometry(.035,.05,4,10),skin);body.position.y=.06;g.add(body);
 const head=new T.Mesh(new T.SphereGeometry(.05,16,12),skin);head.scale.set(1,1.15,1);head.position.y=.14;g.add(head);
 // The gunner sits turned round, grinning at the pack it is passing; the cannon still points forward.
 for(const x of [-.02,.02]){const eye=new T.Mesh(new T.SphereGeometry(.016,10,8),dark);eye.scale.set(1,1.5,.6);eye.position.set(x,.15,.042);g.add(eye);}
 const grin=new T.Mesh(new T.TorusGeometry(.016,.003,4,10,Math.PI),dark);grin.rotation.z=Math.PI;grin.position.set(0,.122,.047);g.add(grin);
 const stalk=new T.Mesh(new T.CylinderGeometry(.003,.003,.05,5),skin);stalk.position.set(0,.205,0);g.add(stalk);const bob=new T.Mesh(new T.SphereGeometry(.009,8,6),new T.MeshBasicMaterial({color:'#ff4fd8'}));bob.position.set(0,.232,0);g.add(bob);
 const arm=new T.Mesh(new T.CapsuleGeometry(.008,.05,3,6),skin);arm.position.set(.045,.1,.01);arm.rotation.z=-.9;arm.name='wave';g.add(arm);
 const mount=new T.Mesh(new T.BoxGeometry(.07,.035,.07),steel);mount.position.set(0,.03,-.06);g.add(mount);
 const barrel=new T.Mesh(new T.CylinderGeometry(.012,.014,.14,10),steel);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.045,-.13);g.add(barrel);
 const tip=new T.Mesh(new T.SphereGeometry(.014,8,6),new T.MeshBasicMaterial({color:'#ff3b30'}));tip.position.set(0,.045,-.2);g.add(tip);
 g.traverse(o=>{o.castShadow=true;});return g;}
function laserBeam(){const g=new T.CylinderGeometry(.03,.03,1,8,1,true);g.translate(0,.5,0);g.rotateX(Math.PI/2);const m=new T.Mesh(g,new T.MeshBasicMaterial({color:'#ff3b30',transparent:true,opacity:.85,depthWrite:false,blending:T.AdditiveBlending}));m.userData.noAO=true;return m;}
const balloonMat=new T.MeshStandardMaterial({color:'#4fc3ff',roughness:.2}),oilMat=new T.MeshStandardMaterial({color:'#1b1b22',roughness:.05,metalness:.6}),bubbleMat=new T.MeshPhysicalMaterial({color:'#bfefff',transparent:true,opacity:.28,roughness:0,depthWrite:false});
const SPARK=['#4fc3ff','#ffa020','#d84bff'];
// Flight HUD (owner, 2026-10-30), in the guns-only F-22's language: a horizon and pitch ladder
// that roll with the car, a heading tape, speed and height boxes, and power with the burner.
// Hidden on the ground; landing hands back to driving with a callout.
const hud=$('flight-hud'),hg=hud.getContext('2d');let hudMode=null;
function drawFlightHud(){const mode=race.roam?s.flight.mode:null;
 if(mode!==hudMode){if(hudMode&&!mode)callout('🛬 LANDED · back to driving');hudMode=mode;hud.hidden=!mode;}
 if(!mode)return;
 const dpr=Math.min(2,devicePixelRatio||1),W=innerWidth,H=innerHeight;if(hud.width!==Math.round(W*dpr)||hud.height!==Math.round(H*dpr)){hud.width=Math.round(W*dpr);hud.height=Math.round(H*dpr);}
 // Attitude from the view itself (the chase camera rides the car), so the ladder sits on the real horizon.
 const c=s.car,q=camera.quaternion,f=new T.Vector3(0,0,-1).applyQuaternion(q),rt=new T.Vector3(1,0,0).applyQuaternion(q),up=new T.Vector3(0,1,0).applyQuaternion(q);
 const pitch=Math.asin(Math.max(-1,Math.min(1,f.y))),roll=Math.atan2(-rt.y,up.y),heading=(Math.atan2(f.x,-f.z)*180/Math.PI+360)%360;
 const ground=course.world.raycast([c.pos[0],c.pos[1]+.05,c.pos[2]],[0,-1,0],400),agl=ground?ground.dist:null;
 const G='#7dff9c',ink=(w=2)=>{hg.lineWidth=w;hg.strokeStyle=G;hg.fillStyle=G;hg.shadowColor='rgba(0,20,8,.85)';hg.shadowBlur=4;};
 hg.setTransform(dpr,0,0,dpr,0,0);hg.clearRect(0,0,W,H);ink();hg.font='600 15px ui-monospace,Menlo,monospace';hg.textBaseline='middle';
 const cx=W/2,cy=H*.46,pxPerDeg=Math.min(W,H)*.012;
 // Pitch ladder and horizon, rolled about the waterline.
 hg.save();hg.translate(cx,cy);hg.rotate(-roll);
 for(let d=-90;d<=90;d+=10){const y=(pitch*180/Math.PI-d)*pxPerDeg;if(Math.abs(y)>H*.32)continue;const w=d===0?W*.22:W*.06;
  hg.setLineDash(d<0?[8,6]:[]);hg.beginPath();hg.moveTo(-w,y);hg.lineTo(-w*.25,y);hg.moveTo(w*.25,y);hg.lineTo(w,y);hg.stroke();
  if(d){hg.textAlign='right';hg.fillText(Math.abs(d),-w-6,y);hg.textAlign='left';hg.fillText(Math.abs(d),w+6,y);}}
 hg.setLineDash([]);hg.restore();
 // Waterline (where the nose points).
 hg.beginPath();hg.moveTo(cx-34,cy);hg.lineTo(cx-12,cy);hg.lineTo(cx-6,cy+8);hg.moveTo(cx+34,cy);hg.lineTo(cx+12,cy);hg.lineTo(cx+6,cy+8);hg.stroke();
 // Heading tape.
 const ty=H*.74;hg.textAlign='center';for(let d=-30;d<=30;d+=5){const hdg=Math.round(heading/5)*5+d,x=cx+(hdg-heading)*6;if(Math.abs(x-cx)>W*.22)continue;const v=((hdg%360)+360)%360;hg.beginPath();hg.moveTo(x,ty);hg.lineTo(x,ty+(v%10?6:12));hg.stroke();if(v%10===0)hg.fillText(String(v/10).padStart(2,'0'),x,ty+24);}
 hg.beginPath();hg.moveTo(cx,ty-4);hg.lineTo(cx-6,ty-14);hg.lineTo(cx+6,ty-14);hg.closePath();hg.fill();
 // Speed (left) and height above ground (right) boxes.
 const box=(x,label,value)=>{hg.strokeRect(x-44,cy-16,88,32);hg.textAlign='center';hg.font='600 20px ui-monospace,Menlo,monospace';hg.fillText(value,x,cy);hg.font='600 12px ui-monospace,Menlo,monospace';hg.fillText(label,x,cy+30);};
 box(cx-W*.28,'KM/H',String(Math.round((mode==='fly'?s.flight.speed:Math.hypot(...c.vel))*3.6)));box(cx+W*.28,'AGL M',agl==null?'---':agl.toFixed(agl<10?1:0));
 // Power and burner, lower left; the one key that matters, bottom centre.
 hg.font='600 14px ui-monospace,Menlo,monospace';hg.textAlign='left';const px=cx-W*.28-44,py=cy+70;
 if(mode==='fly'){hg.strokeRect(px,py,88,10);hg.fillRect(px,py,88*s.flight.power,10);hg.fillText(burning?'PWR  AB':'PWR',px,py+24);}else hg.fillText('🪂 CHUTE',px,py+12);
 hg.textAlign='center';hg.fillText(mode==='fly'?'⏎ parachute':'drifting down…',cx,H*.86);}
function drawPickups(now){const pk=race.pickups;
 crates.forEach((g,i)=>{const sp=pk.spots[i];g.visible=sp.ready<=0;g.rotation.y=now*.002+i;g.position.y=sp.pos[1]+Math.sin(now*.003+i)*.04;});
 for(const m of fxPool.values())m.visible=false;
 // Afterburner flame out of the tail, and the parachute canopy over a floating car.
 if(burning){const f=fxMesh('burner',()=>{const g=new T.Group(),outer=new T.Mesh(new T.ConeGeometry(.045,.32,12),new T.MeshBasicMaterial({color:'#ff5a0a',transparent:true,opacity:.88,depthWrite:false})),inner=new T.Mesh(new T.ConeGeometry(.024,.2,10),new T.MeshBasicMaterial({color:'#bfe4ff',transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false}));for(const m of [outer,inner]){m.rotation.x=Math.PI/2;g.add(m);}outer.position.z=.16;inner.position.z=.1;return g;});f.position.set(...s.car.pos);f.quaternion.set(...s.car.q);f.translateZ(.2);f.translateY(.03);f.scale.set(1,1,.8+Math.random()*.5);}
 if(s.flight.mode==='chute'){const c=fxMesh('chute',()=>{const g=new T.Group(),canopy=new T.Mesh(new T.SphereGeometry(.42,16,8,0,Math.PI*2,0,Math.PI/2.4),new T.MeshStandardMaterial({color:'#ff5a36',roughness:.7,side:T.DoubleSide}));canopy.position.y=.62;canopy.scale.y=.55;g.add(canopy);const stripe=new T.Mesh(new T.SphereGeometry(.425,16,8,0,Math.PI*2,Math.PI/5.2,Math.PI/14),new T.MeshStandardMaterial({color:'#fff4d6',roughness:.7,side:T.DoubleSide}));stripe.position.y=.62;stripe.scale.y=.55;g.add(stripe);const line=new T.LineSegments(new T.BufferGeometry().setFromPoints([[-.33,.6,-.25],[-.08,.05,-.1],[.33,.6,-.25],[.08,.05,-.1],[-.33,.6,.25],[-.08,.05,.1],[.33,.6,.25],[.08,.05,.1]].map(p=>new T.Vector3(...p))),new T.LineBasicMaterial({color:'#2b2b2b'}));g.add(line);return g;});c.position.set(...s.car.pos);c.rotation.set(0,-readout(s).yaw,Math.sin(now*.003)*.08);}
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
 [race.player.car,...race.rivals.map(r=>r.session.car)].forEach((c,i)=>{const m=modifiers(pk,c);if(!m.lasering)return;
  // Pops up over the first 0.4 s, waves while firing, ducks back in over the last 0.3 s.
  const g=fxMesh('alien'+i,alienGunner),t=LASER.seconds-m.laserLeft,rise=Math.min(1,t/.4,m.laserLeft/.3);g.position.set(...c.pos);g.quaternion.set(...c.q);g.translateY(.07+rise*.06-.06);g.scale.setScalar(.4+.6*rise);g.getObjectByName('wave').rotation.z=-.9+Math.sin(now*.02)*.6;});
 (pk.zaps??[]).forEach((z,i)=>{const b=fxMesh('zap'+i,laserBeam),d=[z.to[0]-z.from[0],z.to[1]-z.from[1],z.to[2]-z.from[2]],l=Math.hypot(...d);b.position.set(...z.from);b.lookAt(z.to[0],z.to[1],z.to[2]);b.scale.set(1,1,l);
  const f=fxMesh('flash'+i,()=>new T.Mesh(new T.SphereGeometry(.12,12,8),new T.MeshBasicMaterial({color:'#ffd0c8',transparent:true,opacity:.9,depthWrite:false,blending:T.AdditiveBlending})));f.position.set(...z.to);f.scale.setScalar(.6+z.life*4);});
 if((pk.zaps??[]).some(z=>z.owner===s.car&&z.life>.19))audio.fire();
 // Drift sparks off both rear wheels: blue, then orange, then purple as the mini-turbo charges.
 const tier=s.assist.driftTier||0;if(tier){const col=SPARK[tier-1],c=s.car,q=new T.Quaternion(...c.q);c.params.wheels.forEach((w,wi)=>{const at=c.wheels[wi].contactPoint;if(w.front||!at)return;for(let k=0;k<3;k++){const m=fxMesh(`spark${wi}_${k}`,()=>new T.Mesh(new T.SphereGeometry(.018,6,4),new T.MeshBasicMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending})));m.material.color.set(col);m.material.opacity=.95;const j=(now*.0037+k*.37+wi*.21)%1,p=new T.Vector3(Math.sign(w.at[0])*(.02+j*.05),.015+j*(.08-j*.06),.03+j*.18).applyQuaternion(q);m.position.set(at[0]+p.x,at[1]+p.y,at[2]+p.z);m.scale.setScalar((1.5-j)*(1+tier*.35));}});}
 [race.player.car,...race.rivals.map(r=>r.session.car)].forEach((c,i)=>{if(modifiers(pk,c).shielded)fxMesh('s'+i,()=>new T.Mesh(new T.SphereGeometry(.34,20,14),bubbleMat)).position.set(...c.pos);});
 // Brevity codes: an empty pickup slot reads WINCHESTER once you have fired something.
 const held=pk.held.get(s.car),laserOn=modifiers(pk,s.car);if(held)drawPickups.used=true;const ammo=pk.ammo.get(s.car);$('item').textContent=laserOn.lasering?`👽 LASER ${Math.ceil(laserOn.laserLeft)}s`:held?`${ICON[held]}${ammo>1?' ×'+ammo:''} · F`:'Winchester';$('item').hidden=!held&&!drawPickups.used&&!laserOn.lasering;}
// The racing line shows in both difficulties, in races and in Free Drive (owner, 2026-10-29).
// A sprint's guide stops at the finish: drawn closed it ran a bogus chord back to the start (Hangar Hop: 242 m).
const drivingLine=createRacingLine(scene,race.line,course.world,{closed:course.event?.kind!=='sprint'});
// Skill shortcuts get their own (narrower) line, so you can see the hard way through.
const altLines=(course.alts??[]).map(a=>createRacingLine(scene,a.nodes,course.world,{closed:false,width:.34}));
const districtGuides=new Map();let activeDistrictGuide=null;
function drawLine(now){
 const enabled=!s.finished&&!race.furball;
 const show=enabled&&(!race.roam||!openWorld);
 drivingLine.mesh.visible=show;if(show)drivingLine.update(s.car.pos,s.car.speed,now/1000);
 for(const l of altLines){l.mesh.visible=show;if(show)l.update(s.car.pos,s.car.speed,now/1000);}
 const nearby=enabled&&openWorld&&race.roam?openWorld.districtAt(s.car.pos):null;
 activeDistrictGuide=nearby?.id??null;
 if(nearby&&!districtGuides.has(nearby.id)){
  const line=nearby.course.ai.map(n=>[n.pos[0],n.pos[2],n.halfWidth||2]);
  districtGuides.set(nearby.id,createRacingLine(scene,line,course.world));
 }
 // Forza-style A to B: a destination picked in Places draws its road route as a racing line.
 const trip=enabled&&openWorld&&race.roam&&!s.flight.mode&&openWorld.target()?openWorld.route():null;
 if(trip!==tripSource){tripSource=trip;if(tripLine){tripLine.mesh.removeFromParent();tripLine.mesh.geometry.dispose();tripLine.mesh.material.dispose();tripLine=null;}if(trip?.length>1)tripLine=createRacingLine(scene,trip.map(p=>[p[0],p[1]]),course.world,{closed:false,width:.7,step:1});}
 if(tripLine){tripLine.mesh.visible=!!trip;if(trip)tripLine.update(s.car.pos,s.car.speed,now/1000);}
 for(const [id,l]of districtGuides){l.mesh.visible=id===activeDistrictGuide&&!tripLine;if(l.mesh.visible)l.update(s.car.pos,s.car.speed,now/1000);}
}
let tripSource=null,tripLine=null;
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
let calloutTimer=0;// Big Kid has no auto-unstick: after 3 s of throttle against something, say how to get out, once per episode.
let stuckHinted=false;function stuckHint(){if(mode!=='bigKid'||race.roam||paused||s.finished){stuckHinted=false;return;}if((s.stuckTime??0)<3){stuckHinted=false;return;}if(stuckHinted)return;stuckHinted=true;callout(navigator.maxTouchPoints>0?'Stuck? Tap Recover':'Stuck? Press R');}
function callout(text){const b=$('banner');b.textContent='📻 '+text;b.hidden=false;b.dataset.callout='1';clearTimeout(calloutTimer);calloutTimer=setTimeout(()=>{delete b.dataset.callout;b.textContent='🎺 RETREAT · everyone stops for the flag';},1600);}
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
 result.hidden=false;result.innerHTML=resultPanel({badge:w===s?'WIN':down?'OUT':null,badgeTitle:'Furball result',title:w===s?'Splash all bandits! Last jet flying!':down?`Shot down! ${name(w)} wins.`:`Knock it off! ${name(w)} wins.`,stats:[['Pops',String(fb.pops.get(s.car)??0)],['Balloons',String(down?0:fb.lives.get(s.car))]],again:'🎈 Again'});
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
const finishOrder=()=>[race.player,...race.rivals.map(r=>r.session)].sort((a,b)=>placeOf(race,a)-placeOf(race,b)).map(x=>x===s?'YOU':race.rivals.find(r=>r.session===x).callsign);
let cameraCar=null;
const desired=new T.Vector3(),target=new T.Vector3(),map=$('map').getContext('2d');
// Minimap fits the route's bounding box.
const mapBox=(()=>{const xs=cps.map(c=>c[0]),zs=cps.map(c=>c[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,k=Math.min(150/(Math.max(...xs)-Math.min(...xs)+10),130/(Math.max(...zs)-Math.min(...zs)+10));return track?{cx,cz,k}:{cx:0,cz:0,k:null};})();
function drawMap(){drawDetailedMinimap(map,{world:openWorld,course,race,player:s,yaw:readout(s).yaw});}
let reported=false;
// 3-2-1-GO: nobody moves until GO (Re-Volt start).
let countdown=-1,lastBeep=0;function startCountdown(){telemetry.raceStart({kind:race.furball?'furball':'race',track:telemetryTrack,mode});countdown=2.999;lastBeep=4;}
const sfx={gate:0,coins:0,held:false,air:0,retreat:false,finished:false};let pumpkinsSmashed=0;let attackHeld=false,robot=null,robotBody=null,boardRider=null,form='car',burning=false,trickCalled=false,camHeading=null,camEasing=false;const playmates=createPlaymates();
function soundEvents(r,c){if(s.assist.driftFired){audio.boost();if(s.assist.driftFired>1)callout(s.assist.driftFired>2?'ULTRA TURBO!':'SUPER TURBO!');}
 if(s.gate!==sfx.gate){if(s.gate>sfx.gate)audio.gate();sfx.gate=s.gate;}
 if(s.coins.length>sfx.coins){audio.coin();sfx.coins=s.coins.length;}
 const held=race.pickups.held.has(c);if(held&&!sfx.held)audio.pickup();sfx.held=held;
 if(c.wallImpact>1.5)audio.impact(c.wallImpact);
 if(!c.contacts)sfx.air+=1/60;else{if(sfx.air>.25)audio.landing(Math.abs(c.vel[1])+2);sfx.air=0;}
 const rt=retreatActive(race);if(rt&&!sfx.retreat)audio.bugle();sfx.retreat=rt;
 if(s.finished&&!sfx.finished)audio.finish();sfx.finished=s.finished;}
function disposeJet(group){const jet=group.getObjectByName('JetShell'),geos=new Set(),materials=new Set();jet?.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geos)g.dispose();for(const m of materials){m.map?.dispose();m.dispose();}}
// T cycles the toy's forms (docs/design/adventure): car -> walking robot -> skateboard -> car.
// The robot is its own controller; the board rides the car physics with board tuning, so every
// skate-park trick, grind and gap scores for it too.
function transform(){const r=readout(s),paint=openWorld?.progress?.paint??'#f28c28',carParams=()=>vehicleParams(bodyKind==='jet'||!bodyKind?'buggy':bodyKind);
 if(form==='car'){robot=createRobot([r.x,r.y-rideHeight(s.car.params)+.01,r.z],r.yaw);if(!robotBody){robotBody=makeRobotBody(paint);scene.add(robotBody);}robotBody.visible=true;car.visible=false;s.car.vel=[0,0,0];s.car.ang=[0,0,0];form='robot';callout('🤖 ROBOT · T for the board');}
 else if(form==='robot'){const p=vehicleParams('board'),pos=[robot.pos[0],robot.pos[1]+rideHeight(p)+.02,robot.pos[2]];Object.assign(s.car,createCar(p,pos,robot.yaw));robot=null;robotBody.visible=false;if(!boardRider){boardRider=makeBoardRider(paint);scene.add(boardRider);}boardRider.visible=true;form='board';callout('🛹 SKATEBOARD · T for the car');}
 else{const p=carParams(),pos=[...s.car.pos];pos[1]+=rideHeight(p)-rideHeight(s.car.params)+.02;Object.assign(s.car,createCar(p,pos,readout(s).yaw));boardRider.visible=false;car.visible=true;form='car';callout('🚗 CAR');}
 audio.pickup();telemetry.choice?.(form);}
function applyShell(kind,colour,body='jet',look={}){if(assetState!=='blender')return;unbatchCarParts(car);const old=car.getObjectByName('VehicleBody');if(old){old.removeFromParent();const mats=new Set();old.traverse(o=>{o.geometry?.dispose();if(o.material)mats.add(o.material);});for(const m of mats)m.dispose();}disposeJet(car);fitJetShell(car,kind,colour);if(body!=='jet'){disposeJet(car);car.getObjectByName('JetShell')?.removeFromParent();if(body==='buggy'){for(const n of ['Mesh_Body_shell','RakedCanopy','Mesh_Body_ivory','Mesh_Body_graphite']){const o=car.getObjectByName(n);if(o)o.visible=true;}const shell=car.getObjectByName('Mesh_Body_shell');if(shell){shell.material=shell.material.clone();shell.material.color.set(colour);}}else car.add(makeVehicleBody(body,colour));}clearcoat(car);paintNoseArt(car.getObjectByName('JetShell'),{tier:artTier(aceKills)});batchCarParts(car);applyLivery(car,{paint:colour,...look});if(bodyKind!==body){bodyKind=body;const params=vehicleParams(body==='jet'?'buggy':body),pos=[...s.car.pos];pos[1]+=rideHeight(params)-rideHeight(s.car.params);Object.assign(s.car,createCar(params,pos,readout(s).yaw));}rivalSource=null;}

let portalTravelling=false;
async function travelTo(id){if(!race.roam)return false;keys.clear();touchControls?.reset();fireQueued=false;lastThrottle=0;const p=await openWorld?.travel(id);if(!p)return false;const {pos,yaw}=p.arrival;placeCar(s.car,[pos[0],pos[1]+rideHeight(s.car.params)+.02,pos[2]],yaw);acc=0;cameraCar=null;camera.position.set(pos[0]-Math.sin(yaw)*2,pos[1]+.8,pos[2]+Math.cos(yaw)*2);roamArmedAt=s.travel+30;keys.clear();touchControls?.reset();fireQueued=false;return true;}
// Skate runs (THPS2) in the neighbourhood plaza: E in the park opens the goal card. Shift/RB
// grabs and reverts; on touch, Fire gives a short grab. Progress is remembered per browser.
// Each park: rules, the frame that maps world positions to its [u, v, h], its area, and the
// browser key that remembers its goals.
const SKATE_PARKS={
 ny:{park:NY_PARK,key:'guns-only.rc.skate.v1.ny',centre:NY.center,radius:40,
  frame:p=>{const l=bridgeLocal(p);return [l[0],l[2],l[1]];},world:([x,z,h])=>bridgeWorld([x,h,z])},
 venice:{park:BOARDWALK_PARK,key:'guns-only.rc.skate.v1.venice',centre:BOARDWALK.center,radius:39,
  frame:p=>{const l=boardwalkLocal(p);return [l[0],l[2],l[1]];},world:([x,z,h])=>boardwalkWorld([x,h,z])},
 playground:{park:PLAYGROUND_PARK,key:'guns-only.rc.skate.v1.playground',centre:PLAYGROUND.center,radius:44,
  frame:p=>{const l=playgroundLocal(p);return [l[0],l[2],l[1]];},world:([x,z,h])=>playgroundWorld([x,h,z])},
 philly:{park:PLAZA_PARK,key:'guns-only.rc.skate.v1.philly',centre:PLAZA.center,radius:49,
  frame:p=>{const l=plazaLocal(p);return [l[0],l[2],l[1]];},world:([x,z,h])=>plazaWorld([x,h,z])},
 marseille:{park:MARSEILLE_PARK,key:'guns-only.rc.skate.v1.marseille',centre:marseilleWorld([0,0,0]),radius:53,
  frame:p=>{const l=marseilleLocal(p);return [l[0],l[2],l[1]];},world:([x,z,h])=>marseilleWorld([x,h,z])},
 skatestreet:{park:SKATESTREET_PARK,key:'guns-only.rc.skate.v1.skatestreet',centre:SKATESTREET.center,radius:54,
  frame:p=>{const l=skatestreetLocal(p);return [l[0],l[2],l[1]];},world:([x,z,h])=>skatestreetWorld([x,h,z])},
 intro:{park:INTRO_PARK,key:'guns-only.rc.skate.v1.intro',centre:RESIDENTIAL_PARK.anchor,radius:34,
  frame:p=>{const {anchor:a,yaw}=RESIDENTIAL_PARK,c=Math.cos(yaw),n=Math.sin(yaw),x=(p[0]-a[0])*c-(p[2]-a[2])*n,z=(p[0]-a[0])*n+(p[2]-a[2])*c;return [...bankLocal([x,p[1],z]),p[1]];},
  world:([u,v,h])=>{const b=bankPoint(u,v);return parkPoint([b[0],h,b[2]]);}},
 school:{park:SCHOOL_PARK,key:'guns-only.rc.skate.v1.school',centre:yardWorld([0,0,0]),radius:36,
  frame:p=>{const l=yardLocal(p);return [l[0],l[2],l[1]];},world:([x,z,h])=>yardWorld([x,h,z])},
 hangar:{park:HANGAR_PARK,key:'guns-only.rc.skate.v1.hangar',centre:HANGAR.center,radius:36,
  frame:p=>{const l=hangarLocal(p);return [l[0],l[2],l[1]];},world:([x,z,h])=>hangarWorld([x,h,z])},
};
let skate=null,skatePark=null,skateHud=null,skateGrabUntil=0;
const skateSaved=id=>{const saved={goals:[],best:0,gaps:[]};try{Object.assign(saved,JSON.parse(localStorage.getItem(SKATE_PARKS[id].key)||'{}'));}catch{}return saved;};
const skateParkAt=()=>{if(!openWorld||!race.roam)return null;for(const [id,p] of Object.entries(SKATE_PARKS))if(Math.hypot(s.car.pos[0]-p.centre[0],s.car.pos[2]-p.centre[2])<p.radius)return id;return null;};
// A park that shares its spot with a race (the starting plaza's Neighbourhood Run) offers both.
function skateCard(id,run=null){const result=$('result'),saved=skateSaved(id),near=openWorld?.near(s.car.pos),race=near&&!near.game&&near.kind!=='discovery'&&canEnter(openWorld.progress,near)?near:null;result.innerHTML=goalCard({park:SKATE_PARKS[id].park,goals:saved.goals,best:saved.best,run,gapsFound:saved.gaps,race:race&&(eventById(race.event??(race.track?'district-'+race.track:''))?.name??race.name)});result.hidden=false;pause(true);if(race)$('skate-race').onclick=()=>{location.href=openWorld.eventURL(race);};$('skate-go').onclick=()=>{if(run)telemetry.choice('skate_again');startSkateRun(id);};$('skate-free').onclick=()=>{if(run)telemetry.choice('skate_free');result.hidden=true;pause(false);canvas.focus();};$('skate-go').focus();}
function startSkateRun(id){$('result').hidden=true;const def=SKATE_PARKS[id];skateHud?.stop();skateHud??=createSkateHud({scene,T});skatePark=id;skate=createSkate(def.park,skateSaved(id).goals);setSkateRails(s,def.park,def.world);skateHud.start(skate,def.world);telemetry.skateStart(id);const {at,toward}=def.park.start,p=def.world([...at,def.park.start.height??0]),q=def.world([at[0]+toward[0],at[1]+toward[1],0]),ground=course.world.raycast([p[0],p[1]+3,p[2]],[0,-1,0],6)?.point[1]??p[1];placeCar(s.car,[p[0],ground+rideHeight(s.car.params)+.02,p[2]],Math.atan2(q[0]-p[0],-(q[2]-p[2])));acc=0;cameraCar=null;pause(false);canvas.focus();}
function endSkate(reason='left'){if(skate)telemetry.skateEnd({reason,score:skate.score,bestCombo:skate.best,gaps:skate.gapsFound.size,goals:skate.goals.size,newGoals:skate.newGoals.length,letters:skate.letters.length});setSkateRails(s,null);skate=null;skatePark=null;skateHud?.stop();}
function skateStep(input){if(!skate)return;const def=SKATE_PARKS[skatePark];if(Math.hypot(s.car.pos[0]-def.centre[0],s.car.pos[2]-def.centre[2])>def.radius+26){endSkate();return;}if(fireQueued)skateGrabUntil=performance.now()+400;
 for(const e of stepSkate(skate,s,{...input,drift:input.drift||performance.now()<skateGrabUntil},1/120,def.frame)){skateHud.event(e);if(e.type==='gap'||e.type==='tape'||e.type==='letter')audio.coin();else if(e.type==='bail')audio.impact(4);else if(e.type==='goal')audio.gate();
  else if(e.type==='over'){const run=skate,id=skatePark,saved=skateSaved(id);audio.finish();saved.goals=[...run.goals];saved.best=Math.max(saved.best,run.score);saved.gaps=[...new Set([...saved.gaps,...run.gapsFound])];try{localStorage.setItem(def.key,JSON.stringify(saved));}catch{}endSkate('time');skateCard(id,run);return;}}}
function enterLocation(){if(!openWorld||paused||!race.roam)return;if(skateParkAt()&&!skate){skateCard(skateParkAt());return;}if(openWorld.activity()&&!openWorld.activity().done){const tee=openWorld.resetActivity();if(tee)placeCar(s.car,[tee.pos[0],rideHeight(s.car.params)+.02,tee.pos[2]],tee.yaw);else if(openWorld.activity()?.done){audio.finish();callout(`BOWLING · ${openWorld.activity().score}/10`);}return;}const p=openWorld.near(s.car.pos);if(!p)return;if(p.game){const tee=openWorld.startActivity(p.game);telemetry.activityStart(p.game);placeCar(s.car,[tee.pos[0],rideHeight(s.car.params)+.02,tee.pos[2]],tee.yaw);callout(p.game==='golf'?'CAR GOLF · 3 HOLES':'STRIKE · 2 DELIVERIES');return;}if(p.kind==='discovery'||!canEnter(openWorld.progress,p))ui.open('map');else location.href=openWorld.eventURL(p);}
const ui=createWorldUI({world:openWorld,getState:()=>({pos:s.car.pos,yaw:readout(s).yaw,paused,roam:race.roam,started,flying:!!s.flight.mode,skate:!!skateParkAt()&&!skate,skating:!!skate}),pause,applyShell,onGarage:g=>telemetry.garage(g),travel:travelTo,interact:enterLocation,search:location.search,onOpen:which=>{if(which==='map')telemetry.mapOpen();}});
let cupStorage;try{cupStorage=sessionStorage;}catch{}let cup=loadCup(cupStorage);const cupId=new URLSearchParams(location.search).get('cup');if(!cupId||!CUP_COURSES[Number(cupId)]||cup?.id!==cupId||!cup.events.includes(openWorld?.selected.id)||(cup&&cup.events.indexOf(openWorld?.selected.id)>cup.results.length))cup=null;
function cupURL(event,id){const q=new URLSearchParams(location.search);q.set('track','hub');q.set('event',event);q.set('mode','race');q.set('cup',id);return '?'+q;}
const raceMenu=createRaceMenu({progress:()=>ui.progress,search:location.search,onStartCup:index=>{const c=CUP_COURSES[index];cup=createCup(String(index),c.courses.map(c=>c[0]),['YOU',...race.rivals.map(r=>r.callsign)]);saveCup(cup,cupStorage);location.href=cupURL(cup.events[0],cup.id);}});$('choose-course').onclick=()=>{pause(true);raceMenu.open();};
if(openWorld){$('brief-title').textContent=new URLSearchParams(location.search).has('event')&&!openWorld.locked?openWorld.selected.name:'SAUCER SPRINGS AFB';$('start').title='Explore Saucer Springs; E enters an event, Tab opens the base map';}
$('return-world').hidden=!!openWorld;$('return-world').onclick=()=>{location.href=rcLink({track:'hub',from:new URLSearchParams(location.search).get('from')??track},location.search);};
window.addEventListener('pagehide',()=>{openWorld?.dispose();worldSky?.dispose();});
// pagehide tears the world and touch controls down, so a back/forward-cache restore must reload.
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
const worldSky=openWorld?createWorldSky({scene,sun,hemi,contactSun,renderer}):null;let worldElapsed=0;
// Frame cost breakdown for the frame-rate rigs (app vs Chrome): game update+physics vs render submit.
const prof={sim:0,render:0,n:0,calls:0,tris:0,add(r,g){this.render+=r;this.sim+=g;this.n++;},read(){const n=Math.max(1,this.n),o={update:+(this.sim/n).toFixed(2),render:+(this.render/n).toFixed(2),calls:Math.round(this.calls/n),tris:Math.round(this.tris/n),frames:this.n};this.sim=this.render=this.n=this.calls=this.tris=0;return o;}};
const pollGamepad=createGamepadInput();const frameMs=[];function frame(now){const pad=pollGamepad(navigator.getGamepads?.());if(pad.start){if(!started)$('start').click();else if(!ui.panel())pause(!paused);}if(!paused&&!ui.panel()&&pad.fire)fireQueued=true;if(!started&&!$('start').disabled){started=true;paused=false;$('brief').hidden=true;$('pause').textContent='⏸';if(!race.roam)startCountdown();}const dt=frameSeconds(now,last);telemetry.observeFrame(Math.max(0,now-last),!paused&&countdown<=0&&!document.hidden);frameMs.push(Math.max(0,now-last));if(frameMs.length>600)frameMs.shift();{const r=!paused&&started?stepAdaptiveResolution(adaptive,now-last):null;if(r){renderer.setPixelRatio(r);polish?.setPixelRatio?.(r);}}last=now;
 if(!paused&&!ui.panel()&&countdown>0){countdown-=dt;const n=Math.ceil(countdown);if(n<lastBeep){lastBeep=n;n>0?audio.beep():audio.beep(true);}$('countdown').hidden=countdown<=-.6;$('countdown').textContent=countdown>0?String(n):'GO!';if(countdown<=0&&countdown>-.6){}acc=0;}
 if(!paused&&!ui.panel()&&countdown<=0&&(!openWorld||openWorld.stream.ready(s.car.pos))){$('countdown').hidden=countdown<=-.6;if(countdown>-.6)countdown-=dt;acc+=dt;prof.simStart=performance.now();while(acc>=1/120){const drive=drivingInput(keys,{...pad,steer:touchState.steer||pad.steer,throttle:touchState.throttle||pad.throttle,brake:touchState.brake||pad.brake}),throttleIn=drive.throttle;if(fireQueued&&race.pickups.held.get(s.car)){const it=race.pickups.held.get(s.car);telemetry.itemUse(it);it==='zoom'?audio.boost():audio.fire();}if(skate&&fireQueued)skateGrabUntil=performance.now()+400;const skateInput=skate?{...drive,drift:drive.drift||skateTouchGrab||performance.now()<skateGrabUntil}:drive;const fl=flightInput(keys);fl.burner=fl.burner&&race.roam&&!skate;{const was=burning;burning=fl.burner&&(!!s.flight.mode||throttleIn>0);if(burning&&!was)audio.boost();}if(robot){stepRobot(robot,{throttle:drive.throttle,steer:drive.steer,jump:keys.has('Space')},course.world,1/120);}stepRace(race,robot?{throttle:0,steer:0,brake:true}:{...skateInput,...trickInput(keys),fire:fireQueued,flight:fl,boost:fl.burner&&!s.flight.mode?FLIGHT.burnerBoost:1},1/120);skateStep(skateInput);if(openWorld)for(const session of [s,...race.rivals.map(r=>r.session)])openWorld.step(session.car,1/120);if(openWorld&&race.roam){const activity=openWorld.stepActivity(1/120,s.car);if(activity?.tee)placeCar(s.car,[activity.tee.pos[0],rideHeight(s.car.params)+.02,activity.tee.pos[2]],activity.tee.yaw);if(activity?.sunk){audio.coin();callout('IN THE CUP');}if(activity?.finished){telemetry.activityEnd({game:openWorld.activity()?.kind??(activity.score!=null?'bowling':'golf'),score:activity.score,total:activity.total});audio.finish();callout(activity.score!=null?`${activity.strike?'STRIKE!':'BOWLING'} · ${activity.score}/10`:`CAR GOLF · ${activity.total} HITS · BEST ${openWorld.progress.golfBest}`);}}fireQueued=false;acc-=1/120;lastThrottle=throttleIn||pad.throttle;soundEvents(readout(s),s.car);}}
 document.body.classList.toggle('race-mode',!race.roam&&started&&!paused);document.body.classList.toggle('driving',started&&!paused);
 const r=robot?{...readout(s),x:robot.pos[0],y:robot.pos[1]+.12,z:robot.pos[2],yaw:robot.yaw,speed:Math.hypot(robot.vel[0],robot.vel[2])}:readout(s),c=s.car,p=BUGGY;if(robot&&robotBody)poseRobotBody(robotBody,robot);if(form==='board'&&boardRider){poseBoardRider(boardRider,s.car,s.car.steer/.42);car.visible=false;}
 if(marshalSession!==s){marshalSession=s;marshalRecovery=s.recoveries;marshalLap=s.lap;marshalUntil=marshalLapUntil=0;}
 if(s.recoveries!==marshalRecovery){marshalRecovery=s.recoveries;marshalUntil=now+1600;}
 if(s.lap!==marshalLap){marshalLap=s.lap;marshalLapUntil=now+2400;}
 const rescue=now<marshalUntil,showLap=now<marshalLapUntil;
 marshal.root.visible=started&&(countdown>-.6||rescue||showLap||retreatActive(race)||s.finished);
 const mx=rescue?0:Math.sin(r.yaw)*2.4+Math.cos(r.yaw)*.8,mz=rescue?0:-Math.cos(r.yaw)*2.4+Math.sin(r.yaw)*.8;
 marshal.root.position.set(r.x+mx,r.y+(rescue?1.3:.64),r.z+mz);marshal.root.rotation.y=Math.PI-r.yaw;
 marshal.update({time:now/1000,car:c,countdown:countdown>0?Math.ceil(countdown):countdown>-.6?0:-1,recovering:rescue,retreat:retreatActive(race),finish:s.finished,lap:showLap?s.lap:undefined,laps:s.laps,alienUnlocked:!!openWorld?.progress.discovered.includes('lab')&&canEnter(openWorld.progress,locationById('lab'))});
 nearDetail?.update(s.car.pos);if(openWorld){if(!paused){openWorld.traffic(race);if((s.assist.balanceTime??0)>.6&&!trickCalled){trickCalled=true;callout(s.assist.balance>0?'WHEELIE!':'STOPPIE!');}if(!s.assist.balance)trickCalled=false;if(race.roam&&!race.furball&&race.rivals.length){const e=stepPlaymates(playmates,{player:s,rivals:race.rivals,mode,time:now/1000,dt,ready:!skate&&!s.flight.mode&&s.car.speed>1.5&&!openWorld.target(),world:{places:openWorld.places(),route:(pos,place)=>openWorld.routeTo(pos,place)}});
 if(e?.start){const {rival,dest,spawn}=e.start;placeCar(rival.session.car,[spawn.pos[0],spawn.pos[1]+.05,spawn.pos[2]],spawn.yaw);openWorld.navigate(dest.id,s.car.pos);audio.radio();callout(`🏁 ${rival.callsign}: race you to ${dest.short}!`);telemetry.playmate({dest:dest.id,result:'start'});}
 if(e?.finish){const {winner,dest,rival}=e.finish;rival.follow={path:null};if(winner==='player'){audio.finish();callout(`🏆 You beat ${rival.callsign} to ${dest.short}!`);}else{openWorld.navigate(null,s.car.pos);callout(`${rival.callsign} got to ${dest.short} first · rematch soon`);}telemetry.playmate({dest:dest.id,result:winner});}
 if(e?.timeout){e.timeout.rival.follow=null;telemetry.playmate({dest:e.timeout.dest.id,result:'timeout'});}}
if(adventure){const here=robot?robot.pos:s.car.pos;const attackNow=robot&&keys.has('KeyF')&&!attackHeld;attackHeld=keys.has('KeyF');for(const ev of adventure.step(here,dt,robot?{robot,mode,input:{attack:attackNow,lock:keys.has('ShiftLeft')||keys.has('ShiftRight')}}:null)){if(ev.popped){audio.impact(5);}else if(ev.hurt){audio.impact(3);}else if(ev.knockout){callout('💫 Knocked out · back to the doorway');}if(ev.got==='small'){audio.coin();callout('🗝️ SMALL KEY');}else if(ev.got==='big'){audio.finish();callout('🔑 BIG KEY!');}else if(ev.plate){audio.gate();callout('A gate rumbles open somewhere…');}else if(ev.opened){audio.gate();}else if(ev.locked==='locked'){callout('🔒 Locked · find a small key');}else if(ev.locked==='big key'){callout('🔒 This lock needs the BIG KEY');}else if(ev.locked){callout('🔒 '+ev.locked);}}
 if(robotBody)robotBody.userData.lamp??=(()=>{const l=new T.PointLight('#bfe8ff',2.2,4.5,1.6);l.position.set(0,.27,-.06);robotBody.add(l);return l;})();if(robotBody?.userData.lamp)robotBody.userData.lamp.visible=!!robot&&adventure.inside(robot.pos);}
 const splats=openWorld.seasonStep(c.pos,c.vel,now/1000);if(splats.length){pumpkinsSmashed+=splats.length;audio.splat();callout(`SPLAT! 🎃 ${pumpkinsSmashed}`);telemetry.pumpkin(pumpkinsSmashed);}const collected=openWorld.collect(s.seen);if(collected.unlocked){callout('DREAMLAND UNLOCKED');openWorld.navigate('lab',c.pos);}else if(collected.found.length){callout(collected.found.at(-1).name+' badge found');audio.coin();}}openWorld.update(now/1000,c.pos,camera,p=>callout(p.short+' discovered'));for(const jet of openWorld.skySounds())audio.jet(jet);if(race.roam&&!paused&&!portalTravelling){portalTravelling=true;openWorld.portal(c.pos,now/1000).then(trip=>{if(!trip)return;placeCar(s.car,[trip.position[0],rideHeight(s.car.params)+.06,trip.position[2]],Math.PI);acc=0;document.body.classList.remove('portal-flash');void document.body.offsetWidth;document.body.classList.add('portal-flash');callout(trip.to==='alien'?'BEYOND THE PORTAL':'SAUCER SPRINGS AFB');}).finally(()=>{portalTravelling=false;});}const waiting=!openWorld.stream.ready(c.pos);$('stream-status').hidden=!waiting;if(waiting)acc=0;}ui.update(now);
 contactSun.position.set(r.x-4,r.y+(artReview&&Math.abs(r.x-38)<9&&Math.abs(r.z+8)<11?4:8),r.z-5);contactSun.target.position.set(r.x,r.y,r.z);
 audio.update({speed:r.speed,throttle:lastThrottle,slip:c.wheels.filter(w=>w.slip).length/4,surface:c.wheels.find(w=>w.surface)?.surface,paused:paused||countdown>0});if(track)followSun(sun,car.position);if(worldSky){if(!paused)worldElapsed+=dt;const light=worldSky.update(worldElapsed,c.pos,c.pos[0]>9000||(!!openWorld.selected.night&&!openWorld.locked));openWorld.lighting(light.day,c.pos);}
 if(!paused){for(const cc of [c,...race.rivals.map(rv=>rv.session.car)])fx.carFeedback(cc,dt);for(const e of race.events.splice(0))if(e.type==='splash'){fx.splash(e.car?.pos??e.pos);audio.splash();}else if(e.type==='boom'){fx.boom(e.car?.pos??e.pos);audio.impact(5);}else if(e.type==='winchester'&&e.car===s.car){callout('WINCHESTER');audio.radio();}else if(e.type==='downed'){fx.boom(e.car.pos);let msg=e.by===s.car?'SPLASH ONE':e.left===2&&!race.furball.out.has(s.car)?'LAST MAN STANDING':null;if(e.by===s.car){const was=artTier(aceKills);aceKills++;try{localStorage.setItem('guns-only.rc.kills',aceKills);}catch{}if(artTier(aceKills)>was)msg+=` · NOSE ART: ${NOSE_ART[was].name}`;}paintKillMarks();if(msg){callout(msg);audio.radio();}}else if(e.type==='furball-over')furballOver(e.winner);}fx.update(dt);
 poseCar(car,wheels,c);syncRivals();race.rivals.forEach((rv,i)=>poseCar(rivalVis[i].group,rivalVis[i].wheels,rv.session.car));
 // Low chase camera behind the heading; pulled in front of any wall between it and the car.
 if(cameraCar)camera.position.add(new T.Vector3(r.x-cameraCar[0],r.y-cameraCar[1],r.z-cameraCar[2]));cameraCar=[r.x,r.y,r.z];
 // A vert air points the nose at the sky, so its heading means nothing: hold the heading the car
 // launched on, rise with it and look at it through the turn, then ease back once it lands.
 const vertArc=s.assist.quarter?.arc?.vert?s.assist.quarter.arc:null,wantYaw=vertArc?vertArc.yaw+Math.PI:r.yaw;
 if(camHeading===null||(!vertArc&&!camEasing))camHeading=wantYaw;else{const d=Math.atan2(Math.sin(wantYaw-camHeading),Math.cos(wantYaw-camHeading));camHeading+=d*Math.min(1,dt*(vertArc?10:4));camEasing=!!vertArc||Math.abs(d)>.04;}
 const camYaw=camHeading;
 const back=1.36+Math.min(.24,r.speed*.015),eye=[r.x,r.y+.12,r.z];desired.set(r.x-Math.sin(camYaw)*back,r.y+.55,r.z+Math.cos(camYaw)*back);
 const ray=[desired.x-eye[0],desired.y-eye[1],desired.z-eye[2]],dist=Math.hypot(...ray),hit=course.world.raycast(eye,ray.map(v=>v/dist),dist);
 if(hit){const k=Math.max(.15,hit.dist-.12)/dist;desired.set(eye[0]+ray[0]*k,eye[1]+ray[1]*k,eye[2]+ray[2]*k);}
 camera.fov+=((60+Math.min(5,r.speed*.3))-camera.fov)*Math.min(1,dt*3);camera.updateProjectionMatrix();camera.position.lerp(desired,1-Math.exp(-dt*7));
 // Sweep the smoothed position too: damping must not carry the camera through a wall.
 const actualRay=[camera.position.x-eye[0],camera.position.y-eye[1],camera.position.z-eye[2]],actualDistance=Math.hypot(...actualRay);if(actualDistance>.01){const obstruction=course.world.raycast(eye,actualRay.map(v=>v/actualDistance),actualDistance);if(obstruction){const k=Math.max(.08,obstruction.dist-.08)/actualDistance;camera.position.set(eye[0]+actualRay[0]*k,eye[1]+actualRay[1]*k,eye[2]+actualRay[2]*k);}}
 const portrait=camera.aspect<.8,portraitAim=-.3-Math.max(0,740-innerHeight)*.003;
 if(vertArc)target.set(r.x,r.y+.1,r.z);else target.set(r.x+Math.sin(camYaw)*1.05,r.y+(portrait?portraitAim:.18),r.z-Math.cos(camYaw)*1.05);
 // Flying, the camera rides behind the car along its own nose and rolls with it, like a jet's
 // chase view, so the HUD horizon matches the real one. On the ground the camera stays level.
 if(s.flight.mode==='fly'){const q=new T.Quaternion(c.q[0],c.q[1],c.q[2],c.q[3]),fw=new T.Vector3(0,0,-1).applyQuaternion(q),cu=new T.Vector3(0,1,0).applyQuaternion(q);
  desired.set(r.x,r.y,r.z).addScaledVector(fw,-2.3).addScaledVector(cu,.55);camera.position.lerp(desired,1-Math.exp(-dt*9));camera.up.lerp(cu,1-Math.exp(-dt*6)).normalize();target.set(r.x,r.y,r.z).addScaledVector(fw,3);}
 else camera.up.lerp(new T.Vector3(0,1,0),1-Math.exp(-dt*6)).normalize();
 camera.lookAt(target);
 if(ui.panel()==='garage'){const a=now*.00022,d=portrait?1.7:1.05;camera.position.set(r.x+Math.sin(a)*d,r.y+(portrait?.75:.48),r.z+Math.cos(a)*d);camera.fov=48;if(portrait)camera.clearViewOffset();else camera.setViewOffset(innerWidth,innerHeight,(innerWidth>900?330:315)/2,0,innerWidth,innerHeight);camera.updateProjectionMatrix();camera.lookAt(r.x,r.y+(portrait?portraitAim:.08),r.z);}else if(camera.view?.enabled)camera.clearViewOffset();
 gates.forEach((g,i)=>{const next=i===(s.gate===cps.length-1?0:s.gate);g.userData.arch.material=next?archLit:archMat;g.userData.label.visible=false;g.userData.label.quaternion.copy(camera.quaternion);});aliens.forEach((a,i)=>{a.position.y=.4+Math.sin(now*.0015+i)*.07;});
 $('speed').textContent=Math.round(r.speed*3.6);{const f=adventure?.fighter?.();const hud=$('item');if(robot&&f&&adventure.inside(robot.pos)){hud.hidden=false;hud.textContent='🔋'.repeat(Math.max(0,f.batteries))+'▫️'.repeat(Math.max(0,f.max-f.batteries))+(adventure.state.keys?`  🗝️×${adventure.state.keys}`:'')+(adventure.state.bigKey?'  🔑':'');}}$('clock').hidden=race.roam&&!race.furball;$('clock').textContent=format(race.furball?race.furball.left:s.time);drawLives(now,dt);drawPickups(now);drawFlightHud();drawLine(now);drawRoam(now);drawCoins(now);$('gate').textContent=race.furball?`FURBALL · 🎈${race.furball.out.has(s.car)?0:race.furball.lives.get(s.car)} · ${race.rivals.filter(r=>!race.furball.out.has(r.session.car)).length} bandits`:race.roam?(openWorld?nearestLocation(s.car.pos).short:'FREE DRIVE'):`${race.rivals.length?`P${place()}/${race.rivals.length+1} · `:''}${s.laps>1?`LAP ${s.lap}/${s.laps}`:`${Math.min(s.gate+1,cps.length)}/${cps.length}`}`;if(!$('banner').dataset.callout)$('banner').hidden=!retreatActive(race);$('secret').hidden=!course.secrets.length;$('secret').textContent=openWorld?`◇ ${openWorld.progress.specimens.length}/${SPECIMENS.length} badges${expedition(openWorld.progress).complete?' ★':''}`:`◇ ${s.found}/${course.secrets.length}`;drawMap();(prof.renderStart=performance.now(),renderer.info.reset(),polish?polish.render():renderer.render(scene,camera),prof.calls+=renderer.info.render.calls,prof.tris+=renderer.info.render.triangles,prof.add(performance.now()-prof.renderStart,prof.renderStart-(prof.simStart??prof.renderStart)));
 if(skate)skateHud.update(skate,now);
 if(s.finished&&!reported){reported=true;openWorld?.finish(s.time,s.lapTimes);telemetry.raceFinish({place:place(),time:s.time,gap:null,recoveries:s.recoveries,altTaken:null,turbos:s.assist.turbos??0});if(!best||s.time<best){best=s.time;try{localStorage.setItem(bestKey,best);}catch{}}const result=$('result');result.hidden=false;const at=place(),ranked=race.rivals.length;result.innerHTML=resultPanel({badge:ranked?`${at}<sup>${ordinal(at).slice(String(at).length)}</sup>`:null,title:openWorld?.selected.location==='lab'&&expedition(openWorld.progress).complete?'DREAMLAND CLEARED':ranked?placeTitle(at):'Lap complete!',order:ranked?finishOrder():[],you:at,stats:[['Time',format(s.time)],['Best',format(best)],['Badges',`${openWorld?openWorld.progress.specimens.length:s.found}/${course.secrets.length}`],...(course.coins?.length?[['Coins',`${banked.size}/${course.coins.length}`]]:[])],again:'🏁 Again'});bindResultPanel(result);pause(true);$("again").onclick=()=>{telemetry.choice('again');s=(race=createRace(course,{mode,opponents:rivalCount,features:trackFeatures})).player;reported=false;Object.assign(sfx,{gate:0,coins:0,held:false,air:0,retreat:false,finished:false});startCountdown();result.hidden=true;pause(false);};$('explore').onclick=()=>{telemetry.choice('drive');result.hidden=true;goRoam();pause(false);};$('to-menu').onclick=toMenu;if(cup){const order=[s,...race.rivals.map(r=>r.session)].sort((a,b)=>placeOf(race,a)-placeOf(race,b)).map(x=>x===s?'YOU':race.rivals.find(r=>r.session===x).callsign);recordCupRace(cup,openWorld.selected.id,order);saveCup(cup,cupStorage);const scores=document.createElement('p');scores.textContent=cupStandings(cup).map(r=>`${r.rank}. ${r.id} ${r.points}`).join(' · ');scores.className='result-cup';result.querySelector('.result-actions').before(scores);const next=nextCupEvent(cup);if(next){const button=document.createElement('button');button.textContent='Next race';button.className='primary';button.onclick=()=>location.href=cupURL(next,cup.id);$('again').classList.remove('primary');result.querySelector('.result-actions').prepend(button);}else{result.querySelector('h1').textContent=CUP_COURSES[Number(cup.id)].cup+' Cup · '+cupStandings(cup).find(r=>r.id==='YOU').rank;}}}
 if(now-lastTelemetrySample>=1000){lastTelemetrySample=now;sampleTelemetry(now);}stuckHint();if(now-lastTelemetryFlush>=15_000){lastTelemetryFlush=now;telemetry.flush();}
 requestAnimationFrame(frame);}
// Read-only diagnostics for QA. Simulation tests use the same public step function.
window.__gunsOnlyRC={form:()=>form,mine:()=>adventure&&{keys:adventure.state.keys,bigKey:adventure.state.bigKey,open:[...adventure.state.open],opened:[...adventure.state.opened]},robot:()=>robot&&{pos:robot.pos.map(v=>+v.toFixed(3)),yaw:+robot.yaw.toFixed(3),grounded:robot.grounded,crouched:robot.crouched,climbing:!!robot.climb},transform:()=>transform(),camera:()=>{const d=camera.getWorldDirection(new T.Vector3());return {pos:camera.position.toArray(),yaw:Math.atan2(d.x,-d.z),pitch:Math.asin(d.y),fov:camera.fov};},scene:()=>scene,collision:()=>course.world,carObject:()=>car,pumpkins:()=>pumpkinsSmashed,playmate:(force=false)=>{if(force&&!playmates.active)playmates.next=0;const a=playmates.active;return a&&{dest:a.dest.id,rival:a.rival.session.car.pos.map(v=>+v.toFixed(1)),i:a.rival.follow?.i,n:a.rival.follow?.path?.length};},navigate:id=>{openWorld?.navigate(id,s.car.pos);return openWorld?.route().slice(0,40)??[];},flying:()=>({mode:s.flight.mode,speed:s.flight.speed,burning,roam:race.roam,target:document.activeElement?.id}),flyover:before=>openWorld?.qaFlyover(before),place:(pos,yaw=0)=>{placeCar(s.car,pos,yaw);s.car.vel=[0,0,0];s.car.ang=[0,0,0];},skate:(left)=>{if(skate&&left!=null)skate.left=left;return skate&&{score:skate.score,left:skate.left,letters:[...skate.letters],goals:[...skate.goals],combo:skate.combo?.tricks.length??0};},give:(item,n)=>{race.pickups.held.set(s.car,item);if(n>1)race.pickups.ammo.set(s.car,n);else race.pickups.ammo.delete(s.car);},profile:()=>prof.read(),frames:()=>{const a=[...frameMs].sort((x,y)=>x-y);return {p50:a[a.length>>1],p95:a[Math.floor(a.length*.95)],max:a.at(-1),ratio:adaptive.ratio};},audio:()=>Object.keys(audio.samples||{}),line:()=>race.line.map(p=>[p[0],p[1]]),snapshot:()=>({...readout(s),rivals:race.rivals.map(rv=>({name:rv.callsign,x:rv.session.car.pos[0],z:rv.session.car.pos[2],finished:rv.session.finished})),drifting:!!s.assist.drift?.active,time:s.time,lap:s.lap,laps:s.laps,lapTimes:[...s.lapTimes],gate:s.gate,running:s.running,finished:s.finished,hits:s.hits,found:s.found,seen:[...s.seen],travel:s.travel,recoveries:s.recoveries,mode,paused,guide:drivingLine.mesh.visible?'course':activeDistrictGuide,assets:assetState,item:race.pickups.held.get(s.car)??null,place:place(),track,world:openWorld?{...openWorld.stream.stats(),ready:openWorld.stream.ready(s.car.pos),discovered:[...openWorld.progress.discovered],event:openWorld.selected.id,locked:openWorld.locked,golf:openWorld.activity(),golfBest:openWorld.progress.golfBest,bowlingBest:openWorld.progress.bowlingBest,specimens:[...openWorld.progress.specimens],expedition:expedition(openWorld.progress)}:null,vehicle:{topSpeed:s.car.params.topSpeed,wheelRadius:s.car.params.wheelRadius,mass:s.car.params.mass},body:ui.progress.body,shell:ui.progress.shell,paint:ui.progress.paint,audioSilent:audio.silent}),renderer:()=>renderer.info.render,nearDetail:()=>nearDetail?.stats()??null,checkpoints:()=>cps.map(c=>[c[0],c[1]])};requestAnimationFrame(frame);
