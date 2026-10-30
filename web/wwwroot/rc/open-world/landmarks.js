import {buildWorldSurfaces} from './world-surfaces.js';
import {buildArrivalRoad} from './arrival-road.js';
import {buildArrivalArt} from './arrival-art.js';
import {buildDressing} from './base-dressing.js';
import {buildFences} from './fences.js';
import {WORLD_LINKS} from './navigation.mjs';
import {buildBaseLife} from './base-life.js';
import {buildBoundaryView} from './boundary-view.js';
import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {createAircraft,AIRCRAFT_TYPES} from './aircraft-catalog.js';
import {addBox} from '../physics/world.mjs';
import {buildSupport} from './support.js';
import {buildMuseum} from './museum.js';
import {createSpecimens} from './specimens.js';
import {OLD_DISPLAY_CUT} from './petting-zoo.mjs';
import {LOCATIONS,EVENTS,SPECIMENS,SPLASH_ZONES,SAND_ZONES,BOUNDS,loadProgress,canEnter} from './catalog.mjs';
// The bake predates the petting-zoo module: drop its old jets (triangles inside the display box,
// above the ground) so the new ones don't stand inside them.
function cutOldDisplay(mesh){const [x0,z0,x1,z1,y0]=OLD_DISPLAY_CUT,g=mesh.geometry,pos=g.attributes.position,v=new T.Vector3(),c=new T.Vector3(),keep=[];const n=g.index?g.index.count:pos.count,at=i=>g.index?g.index.getX(i):i;let cut=0;
 for(let t=0;t<n;t+=3){c.set(0,0,0);for(let k=0;k<3;k++)c.add(v.fromBufferAttribute(pos,at(t+k)).applyMatrix4(mesh.matrixWorld));c.multiplyScalar(1/3);if(c.x>x0&&c.x<x1&&c.z>z0&&c.z<z1&&c.y>y0){cut++;continue;}keep.push(at(t),at(t+1),at(t+2));}
 if(cut)g.setIndex(keep);}
export function buildLandmarks(scene,world,progress=loadProgress(),roads=[],baked=null){
 const existing=new Set(scene.children);
 const surfaces=buildWorldSurfaces(scene),approach=buildArrivalRoad(scene),arrival=buildArrivalArt(scene),specimens=createSpecimens(scene,progress),museum=buildMuseum(scene,world),support=buildSupport(scene,world),boundary=buildBoundaryView(scene,BOUNDS),baseLife=buildBaseLife(scene,world),dressing=buildDressing(scene,world),fences=buildFences(scene,world,roads,{eventSegments:[...EVENTS.flatMap(e=>e.points.slice(1).map((b,i)=>[e.points[i],b])),...SPECIMENS.map(p=>[[p.x,p.z],[p.x,p.z+10]])]});
 let racing=false;const root=new T.Group(),mats=new Map(),dynamic=[],rings=new Map();
 const mat=(c,rough=.7)=>{const k=c+rough;if(!mats.has(k))mats.set(k,new T.MeshStandardMaterial({color:c,roughness:rough,metalness:rough<.4?.2:0}));return mats.get(k);};
 function box(x,y,z,w,h,d,c,solid=false){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);root.add(m);if(solid)addBox(world,x,z,w,d,y-h/2,y+h/2);return m;}
 function cylinder(x,y,z,r,h,c,rs=10){const m=new T.Mesh(new T.CylinderGeometry(r,r,h,rs),mat(c));m.position.set(x,y,z);root.add(m);return m;}
 function label(text,x,y,z,w=8,color='#f6d58c'){const c=document.createElement('canvas');c.width=1024;c.height=192;const g=c.getContext('2d');g.fillStyle='#1b3339';g.fillRect(0,0,1024,192);g.fillStyle=color;g.fillRect(0,0,1024,10);g.font='700 60px system-ui';g.textAlign='center';g.fillText(text,512,117,970);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(w,w*192/1024),new T.MeshBasicMaterial({map:t,side:T.DoubleSide}));m.position.set(x,y,z);scene.add(m);return m;}
 function jet(x,z,kind,paint,yaw=0,scale=13){const type=({viper:'F-16',eagle:'F-15C',hog:'A-10',raptor:'F-22',flanker:'Su-27'})[kind]??kind,g=createAircraft(type),d=g.userData.dimensions,lift=Math.max(d.height*.18+.8,-new T.Box3().setFromObject(g).min.y+.12);g.rotation.y=yaw;g.position.set(x,lift,z);root.add(g);for(const [dx,dz]of (['B-52','C-17','A-10'].includes(type)?[]:[[-.9,1.6],[.9,1.6],[0,-3.6]])){const px=x+dx*Math.cos(yaw)+dz*Math.sin(yaw),pz=z-dx*Math.sin(yaw)+dz*Math.cos(yaw);cylinder(px,.55,pz,.16,1.1,'#c3c7c8');const w=new T.Mesh(new T.CylinderGeometry(.37,.37,.26,12),mat('#2c3438'));w.rotation.z=Math.PI/2;w.position.set(px,.37,pz);root.add(w);addBox(world,px,pz,.5,.6,0,1.2);}const oriented={addQuad:(a,b,c,d,surface)=>world.addQuad(...[a,b,c,d].map(p=>[x+p[0]*Math.cos(yaw)+p[2]*Math.sin(yaw),p[1],z-p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw)]),surface)};addBox(oriented,0,0,1.3,7,2,3.5);addBox(oriented,0,0,9,1.2,2.1,2.35);}
 function ramp(x,z,width=3,length=8,height=1.1,heading=0){const f=[Math.sin(heading),Math.cos(heading)],r=[f[1],-f[0]],P=(a,c,y)=>[x+f[0]*a+r[0]*c,y,z+f[1]*a+r[1]*c],verts=[];const quad=(a,b,c,d)=>{const cross=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);if(cross<0)[b,d]=[d,b];world.addQuad(a,b,c,d,'wood');verts.push(...a,...b,...c,...a,...c,...d);};quad(P(-length/2,-width/2,0),P(-length/2,width/2,0),P(0,width/2,height),P(0,-width/2,height));quad(P(0,-width/2,height),P(0,width/2,height),P(length/2,width/2,0),P(length/2,-width/2,0));const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.computeVertexNormals();root.add(new T.Mesh(g,mat('#d5ac72')));}
 // The authored circuits replace small play spaces within the source footprints. Broad apron
 // edges and optional ramps never form a wall that could trap an exploring car.
 for(const e of EVENTS){if(e.road||e.alien||e.authored||e.battle||(e.kind==='sprint'&&!e.clearing))continue;const xs=e.points.map(p=>p[0]),zs=e.points.map(p=>p[1]),minX=Math.min(...xs)-10,maxX=Math.max(...xs)+10,minZ=Math.min(...zs)-10,maxZ=Math.max(...zs)+10;if(e.id!=='gate-guard')box((minX+maxX)/2,-.006,(minZ+maxZ)/2,maxX-minX,.02,maxZ-minZ,e.surface==='grass'?'#87ac73':e.surface==='dirt'?'#b59a70':e.surface==='gymfloor'?'#cba778':'#70787a');
  for(let i=0;i<e.points.length-1;i++){const a=e.points[i],b=e.points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),n=Math.ceil(len/8);for(let j=0;j<n;j++){const t=j/n;for(const side of [-1,1]){const x=a[0]+dx*t+dz/len*e.half*side,z=a[1]+dz*t-dx/len*e.half*side;const m=box(x,.035,z,.13,.025,2.5,j%2?'#eee2be':'#f2b755');m.rotation.y=Math.atan2(dx,dz);}}}
 }
 // Short authored forecourt connection between otherwise disconnected OSM road components.
 for(const {points:[a,b]}of WORLD_LINKS){const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),road=box((a[0]+b[0])/2,.018,(a[1]+b[1])/2,6,.012,length,'#687574');road.rotation.y=Math.atan2(dx,dz);const nx=-dz/length*3,nz=dx/length*3;world.addQuad([a[0]-nx,0,a[1]-nz],[a[0]+nx,0,a[1]+nz],[b[0]+nx,0,b[1]+nz],[b[0]-nx,0,b[1]-nz],'asphalt');}
 // Main-gate welcome, gate guard and small service booth: human-scale cues at toy-eye level.
 label('SAUCER SPRINGS AFB',-635.5,.85,-28.02,4.5);
 box(-582,1.7,-69,5,3.4,4,'#c5b9a1',true);box(-582,3.5,-69,5.8,.25,4.8,'#526f76');box(-582,2,-66.96,3,1.3,.05,'#446776');
 for(const [i,type]of ['F-105','F-4','F-100','F-111','F-117'].entries()){jet(-670+i*32,-140,type,'#c4d0d5',0);label(type,-670+i*32,1.8,-125,5);}
 // Ramp Rat: aircraft line the inside of a broad slalom loop, leaving its roadway clear.
 for(const [i,type]of AIRCRAFT_TYPES.slice(0,17).entries()){const x=540+i%5*60,z=-70-Math.floor(i/5)*85;jet(x,z,type,'#b8cbd5',Math.PI/2);label(type,x,2,z+24,7);}
 // Two open maintenance bays, with ribbed barrel roofs and safe drive-through lanes.
 for(const x of [353,407]){const z=356;for(const side of [-1,1])box(x+side*12,4,z,.7,8,28,'#929e9e',true);
  const roof=new T.Mesh(new T.CylinderGeometry(12.3,12.3,28,32,1,true,Math.PI/2,Math.PI),new T.MeshStandardMaterial({color:'#b4bcbc',roughness:.65,side:T.DoubleSide}));roof.rotation.x=Math.PI/2;roof.position.set(x,8,z);root.add(roof);
  for(let zz=z-14;zz<=z+14;zz+=7){const rib=new T.Mesh(new T.TorusGeometry(12.35,.12,6,28,Math.PI),mat('#647c82'));rib.position.set(x,8,zz);root.add(rib);}
  label(x===353?'FLIGHT TEST 01':'MAINTENANCE 02',x,6.5,z+14.1,13,x===353?'#9bd7df':'#f6d58c');for(const side of [-1,1])box(x+side*9,.65,z+8,2,1.3,3,'#dcad5d',true);
 }
 // WIC PlayPlace: optional tabletop ramps and a broad, rideable curved quarterpipe.
 for(const [x,z,h]of [[-1145,1205,1],[-1115,1190,1.4],[-1130,1180,.7]])ramp(x,z,4,10,h,Math.PI/2);
 {const x=-1130,z=1195,v=[];for(let i=0;i<20;i++){const a=i/20*Math.PI/2,b=(i+1)/20*Math.PI/2,P=(t,dx)=>[x+dx,2*(1-Math.cos(t)),z-2*Math.sin(t)];const aa=P(a,-5),bb=P(a,5),cc=P(b,5),dd=P(b,-5);world.addQuad(aa,bb,cc,dd,'wood');v.push(...aa,...bb,...cc,...aa,...cc,...dd);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.computeVertexNormals();root.add(new T.Mesh(g,mat('#cdae7f')));}
 for(let i=0;i<7;i++)ramp(1750+i*16,1400,5,12,.2+(i%3)*.06,Math.PI/2);
 // Original recreation pavilion: open front, wood lane and safe run-out behind the pins.
 box(-1020,.015,1245,10,.025,34,'#c9a46f');for(const side of [-1,1])box(-1020+side*6,3,1244,.4,6,40,'#bda48c',true);box(-1020,3,1224,12,6,.4,'#bda48c',true);label('STRIKE',-1020,4.5,1264,9);
 for(const x of [-1021.5,-1018.5])box(x,.035,1245,.15,.04,32,'#805e48');
 // Authored rink beside recreation: open entry, polished lane, rental booth and mirror ball.
 for(const x of [-967,-913])box(x,.6,1245,.2,1.2,36,'#8b739e',true);
 box(-940,.6,1227,54,1.2,.2,'#8b739e',true);label('RINK DRIFT',-940,4,1266,15,'#dfb9f1');
 box(-975,1,1260,6,2,3,'#9877a5',true);label('SKATE RENTAL',-975,2.5,1261.6,6);
 const mirror=new T.Mesh(new T.IcosahedronGeometry(1.2,1),mat('#d8e2e8',.1));mirror.position.set(-940,7,1245);scene.add(mirror);dynamic.push(t=>{mirror.rotation.y=t*.6;});
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2,m=new T.Mesh(new T.CircleGeometry(1.5,12),new T.MeshBasicMaterial({color:['#f5a4ce','#8acde0','#dfc481'][i%3],transparent:true,opacity:.45,depthWrite:false}));m.rotation.x=-Math.PI/2;scene.add(m);dynamic.push(t=>{m.position.set(-940+Math.cos(a+t*.15)*17,.045,1245+Math.sin(a+t*.15)*10);});}
 // The source pitch (way/704934740) anchors a fictional baseball layout and safe side bleachers.
 for(const [x,z]of [[-1327,1490],[-1307,1470],[-1327,1450],[-1347,1470]]){const b=box(x,.035,z,1,.04,1,'#f4e9cf');b.rotation.y=Math.PI/4;}
 for(const side of [-1,1]){box(-1327+side*31,1,1470,4,2,16,'#647f83',true);for(let row=0;row<3;row++)box(-1327+side*(30+row),.4+row*.4,1470,.8,.25,16,'#c7beb0');}
 label('ROUND THE BASES',-1327,4,1497,14);
 // Boneyard wing deck is an optional skill line; falling lands on the open desert floor.
 for(const x of [2383,2400])jet(x,1596,'eagle','#b9b4a3',Math.PI/2,13);
 function slope(x0,x1,y0,y1,z,width,color){const a=[x0,y0,z-width/2],b=[x0,y0,z+width/2],c=[x1,y1,z+width/2],d=[x1,y1,z-width/2];world.addQuad(a,b,c,d,'wood');const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));g.computeVertexNormals();root.add(new T.Mesh(g,mat(color)));}
 slope(2370,2380,0,2.5,1592,5,'#cba771');slope(2380,2410,2.5,2.5,1592,5,'#b2b5ab');slope(2410,2426,2.5,0,1592,5,'#cba771');label('WING HOP ↗',2364,3.5,1590,7);
 for(let i=0;i<4;i++)jet(2300+i*28,1530,'hog','#a7aba3',0,14);label('BONEYARD',2350,4,1607,16);
 // Public pool location anchors an authored toy waterpark. Shallow zones stay at ground level.
 for(const [x0,z0,x1,z1]of SPLASH_ZONES){box((x0+x1)/2,.04,(z0+z1)/2,x1-x0,.025,z1-z0,'#6dc5d5');for(let z=z0+2;z<z1;z+=4)box((x0+x1)/2,.057,z,x1-x0-1,.01,.1,'#b4e6df');}
 const spray=new T.InstancedMesh(new T.SphereGeometry(.045,6,4),new T.MeshBasicMaterial({color:'#c6f5f1'}),20),drop=new T.Object3D();spray.frustumCulled=false;scene.add(spray);dynamic.push((t,car)=>{spray.visible=SPLASH_ZONES.some(b=>car[0]>=b[0]&&car[0]<=b[2]&&car[2]>=b[1]&&car[2]<=b[3]);if(!spray.visible)return;for(let i=0;i<20;i++){const phase=(t*2+i/20)%1,a=i*2.4;drop.position.set(car[0]+Math.cos(a)*phase*.8,.1+Math.sin(phase*Math.PI)*.55,car[2]+Math.sin(a)*phase*.8);drop.updateMatrix();spray.setMatrixAt(i,drop.matrix);}spray.instanceMatrix.needsUpdate=true;});
 ramp(-510,3340,6,28,2,Math.PI/2);ramp(-580,3310,6,24,1.5,0);label('SUNRISE SPLASH',-545,4,3395,18,'#a0e7ed');
 for(const x of [-570,-540,-510]){cylinder(x,2,3350,.12,4,'#e9c27d');const shade=new T.Mesh(new T.ConeGeometry(4,1,12),mat('#e18d89'));shade.position.set(x,4.4,3350);root.add(shade);}
 for(const [x0,z0,x1,z1]of SAND_ZONES)box((x0+x1)/2,.04,(z0+z1)/2,x1-x0,.025,z1-z0,'#d7bd8c');
 // Golf and collection landmarks with friendly science-fiction rewards.
 const golf=LOCATIONS.find(p=>p.id==='golf');for(let i=0;i<3;i++){const x=golf.pos[0]+i*15-15,z=golf.pos[2]-12;const green=new T.Mesh(new T.CircleGeometry(10,28),mat('#87ac73'));green.rotation.x=-Math.PI/2;green.position.set(x,.03,z);root.add(green);cylinder(x,1.5,z,.035,3,'#e9d6a6');box(x+.6,2.6,z,1.2,.7,.03,'#ecb45d');}
 // The petting zoo's jets are their own module now (petting-zoo.js).
 const lab=LOCATIONS.find(p=>p.id==='lab'),labUnlocked=canEnter(progress,lab);box(2500,4,-1225,32,8,20,'#768886',true);box(2500,3,-1214.9,8,6,.1,'#244d50');if(labUnlocked){
 const saucer=new T.Group();saucer.position.set(2500,9,-1210);const disc=new T.Mesh(new T.SphereGeometry(1,32,12),mat('#b9d5c9',.25));disc.scale.set(7,.8,7);saucer.add(disc);const dome=new T.Mesh(new T.SphereGeometry(1,20,12),mat('#74baa6',.25));dome.position.y=.7;dome.scale.set(2.7,1.4,2.7);saucer.add(dome);scene.add(saucer);dynamic.push(t=>{saucer.rotation.y=t*.15;saucer.position.y=9+Math.sin(t*.7)*.5;});}
 // Perimeter of the authored playable window is visible and collidable. Source roads continue
 // beyond it; this bounded game perimeter is not represented as the real Nellis fence.
 const [x0,z0,x1,z1]=BOUNDS;for(const [x,z,w,d]of [[(x0+x1)/2,z0,x1-x0,.18],[(x0+x1)/2,z1,x1-x0,.18],[x0,(z0+z1)/2,.18,z1-z0],[x1,(z0+z1)/2,.18,z1-z0]]){box(x,.65,z,w,1.3,d,'#87968e',true);}
 // Event rings have separate pulse materials. Labels stay in world space; proximity UI has
 // the unambiguous action and keyboard shortcut.
 for(const p of LOCATIONS){const allowed=canEnter(progress,p),g=new T.Group();g.position.set(...p.pos);const m=new T.Mesh(new T.TorusGeometry(1.1,.035,8,40),new T.MeshStandardMaterial({color:p.color,emissive:p.color,emissiveIntensity:.8,roughness:.4,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.y=.055;g.add(m);const beacon=new T.Mesh(new T.CylinderGeometry(.06,.15,8,8),new T.MeshBasicMaterial({color:p.color,transparent:true,opacity:.12,depthWrite:false}));beacon.position.y=4;beacon.visible=false;g.add(beacon);scene.add(g);g.visible=allowed;rings.set(p.id,g);if(!allowed)continue;const name=label(p.short.toUpperCase(),p.pos[0],2.5,p.pos[2],4,p.color);if(p.id==='gate')name.position.set(p.pos[0]+5,1.5,p.pos[2]);dynamic.push((t,car,camera)=>{name.quaternion.copy(camera.quaternion);const d=Math.hypot(car[0]-p.pos[0],car[2]-p.pos[2]);name.visible=p.id!=='gate'&&p.id!=='skatepark'&&!racing&&d<35;g.visible=!racing&&d<650;g.children[0].material.emissiveIntensity=.35;g.children[0].material.opacity=Math.min(1,Math.max(0,(d-1.5)/2));});}
 // Batch static art by material and 256 m tile. Frustum culling and shadow work stay local.
 root.updateMatrixWorld(true);const batches=new Map();root.traverse(o=>{if(!o.isMesh||Array.isArray(o.material))return;const at=new T.Vector3().setFromMatrixPosition(o.matrixWorld),key=Math.floor(at.x/256)+','+Math.floor(at.z/256)+':'+[o.material.roughness,o.material.metalness,o.material.side].join(':');let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat;}const colors=[];for(let i=0;i<g.attributes.position.count;i++)colors.push(o.material.color.r*(g.attributes.color?.getX(i)??1),o.material.color.g*(g.attributes.color?.getY(i)??1),o.material.color.b*(g.attributes.color?.getZ(i)??1));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));for(const key of Object.keys(g.attributes))if(!['position','normal','color'].includes(key))g.deleteAttribute(key);if(!batches.has(key)){const m=o.material.clone();m.color.set('#ffffff');m.vertexColors=true;batches.set(key,{m,g:[]});}batches.get(key).g.push(g);});
 const staticRoot=new T.Group();staticRoot.name='WorldLandmarksStatic';for(const {m,g}of batches.values()){const mesh=new T.Mesh(mergeGeometries(g,false),m);mesh.castShadow=true;mesh.receiveShadow=true;staticRoot.add(mesh);g.forEach(a=>a.dispose());}const oldMaterials=new Set();root.traverse(o=>{o.geometry?.dispose();if(o.material)oldMaterials.add(o.material);});for(const m of oldMaterials)m.dispose();if(baked){staticRoot.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});baked.name='WorldLandmarksBaked';baked.updateMatrixWorld(true);baked.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;cutOldDisplay(o);}});scene.add(baked);}else scene.add(staticRoot);
 const owned=scene.children.filter(o=>!existing.has(o));
 return {rings,setRacing(value){racing=value;},update(t,car,camera){specimens.update(t);museum.update(t,car);for(const f of dynamic)f(t,car,camera);},dispose(){surfaces.dispose();approach.dispose();arrival.dispose();specimens.dispose();museum.dispose();support.dispose();boundary.dispose();baseLife.dispose();dressing.dispose();fences.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();for(const object of owned){if(object.parent!==scene)continue;object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);if(m.map)textures.add(m.map);}});object.removeFromParent();}for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
