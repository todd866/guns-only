// Original authored toy-scale art. Repeated architectural parts are instanced.
import * as T from '../vendor/three.module.js';
const materials=new Map();
function mat(color,metal=0,emissive=false){const key=color+metal+emissive;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,metalness:metal,roughness:metal?.38:.72,...(emissive?{emissive:color,emissiveIntensity:1.6}:{})}));return materials.get(key);}
function mesh(g,m,parent,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function box(parent,x,y,z,w,h,d,color,metal=0){return mesh(new T.BoxGeometry(w,h,d),mat(color,metal),parent,x,y,z);}
function rod(parent,a,b,r,color){const v=new T.Vector3(...b).sub(new T.Vector3(...a));const o=mesh(new T.CylinderGeometry(r,r,v.length(),8),mat(color,.4),parent);o.position.copy(new T.Vector3(...a).add(new T.Vector3(...b)).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return o;}
function path(parent,points,r,color){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return mesh(new T.TubeGeometry(curve,Math.max(12,points.length*3),r,5,false),mat(color),parent);}
function hull(parent,sections,color){const v=[],idx=[];for(const [z,width,bottom,top] of sections)v.push(-width,bottom,z,width,bottom,z,width,top,z,-width,top,z);for(let j=0;j<sections.length-1;j++)for(let i=0;i<4;i++){const a=j*4+i,b=j*4+(i+1)%4,c=b+4,d=a+4;idx.push(a,b,c,a,c,d);}idx.push(0,2,1,0,3,2);const k=(sections.length-1)*4;idx.push(k,k+1,k+2,k,k+2,k+3);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();return mesh(g,mat(color,.3),parent);}
function decal(parent,text,x,y,z,w,h,rotation=[0,0,0],background='#233637',ink='#f6dca1'){
 const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,512,128);ctx.fillStyle=ink;ctx.font='bold 68px monospace';ctx.textAlign='center';ctx.fillText(text,256,89);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const o=mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}),parent,x,y,z);o.rotation.set(...rotation);o.castShadow=false;return o;
}
export function buildBuggy(scene){
 const car=new T.Group();scene.add(car);
 hull(car,[[-.43,.12,.025,.10],[-.30,.21,.025,.16],[.12,.22,.03,.17],[.36,.16,.035,.12]],'#dfa63f');
 hull(car,[[-.22,.13,.14,.155],[-.05,.135,.15,.30],[.16,.12,.15,.285],[.23,.11,.13,.15]],'#203c45');
 // Roll cage and roof spine follow the raked canopy, not a rectangular cab.
 for(const x of [-.14,.14])path(car,[[x,.13,-.24],[x,.30,-.04],[x,.285,.16],[x,.12,.27]],.012,'#e2b95f');
 rod(car,[-.14,.302,-.04],[.14,.302,-.04],.012,'#e2b95f');
 box(car,0,.305,.035,.045,.016,.16,'#f2e6c6');
 box(car,0,.016,0,.30,.035,.62,'#263234',.5);
 for(const side of [-1,1]){
  path(car,[[side*.18,.02,-.3],[side*.24,.03,-.17],[side*.24,.03,.23]],.015,'#2b373b');
  box(car,side*.19,.175,.09,.07,.014,.26,'#f1d077');
  box(car,side*.155,.10,-.365,.06,.035,.025,'#e9f6e3');
  box(car,side*.16,.12,.345,.06,.025,.018,'#b94735');
 }
 // Rear wing, supports, body clips and flexible receiver whip.
 box(car,0,.23,.37,.51,.025,.12,'#243438');for(const x of [-.15,.15]){box(car,x,.17,.35,.018,.11,.018,'#6e7774',.8);box(car,x,.16,-.25,.035,.007,.014,'#ddd7bd',.8);}
 for(const x of [-.245,.245])box(car,x,.25,.37,.018,.065,.15,'#e9bd58');
 path(car,[[.1,.18,.19],[.1,.39,.20],[.105,.59,.24]],.004,'#242e2e');
 path(car,[[-.21,.02,-.43],[0,.01,-.47],[.21,.02,-.43]],.018,'#3b4648');
 decal(car,'07',0,.166,-.26,.16,.11,[-Math.PI/2,0,0],'#eee1bc','#22373a');
 decal(car,'SCOUT',0,.247,.375,.31,.07,[-Math.PI/2,0,0],'#243438','#e7b954');
 const wheels=[];
 for(const x of [-.29,.29])for(const z of [-.25,.25]){
  const pivot=new T.Group();pivot.position.set(x,-.08,z);car.add(pivot);const wheel=new T.Group();pivot.add(wheel);
  const tire=mesh(new T.CylinderGeometry(.147,.147,.135,20),mat('#182127'),wheel);tire.rotation.z=Math.PI/2;
  for(const side of [-1,1]){
   const rim=mesh(new T.CylinderGeometry(.086,.086,.012,12),mat('#b3b9ac',.75),wheel,side*.071,0,0);rim.rotation.z=Math.PI/2;
   const hub=mesh(new T.CylinderGeometry(.032,.032,.019,12),mat('#d8ad51',.65),wheel,side*.081,0,0);hub.rotation.z=Math.PI/2;
   for(let j=0;j<6;j++){const a=j*Math.PI/3;const spoke=box(wheel,side*.08,Math.sin(a)*.055,Math.cos(a)*.055,.013,.018,.055,'#35454a',.65);spoke.rotation.x=-a;}
  }
  const tread=new T.InstancedMesh(new T.BoxGeometry(.14,.022,.035),mat('#303b3b'),20);const dummy=new T.Object3D();
  for(let i=0;i<20;i++){const a=i*Math.PI/10;dummy.position.set(0,Math.cos(a)*.145,Math.sin(a)*.145);dummy.rotation.set(a,0,(i%2?.12:-.12));dummy.updateMatrix();tread.setMatrixAt(i,dummy.matrix);}tread.castShadow=true;wheel.add(tread);
  const sign=Math.sign(x);for(const dz of [-.065,.065])rod(car,[sign*.08,.015,z+dz],[x,-.07,z],.009,'#72817e');
  rod(car,[sign*.17,.14,z],[x,-.03,z],.014,'#d0d3c0');
  const spring=[];for(let i=0;i<=36;i++){const t=i/36;spring.push([sign*(.17+.12*t)+Math.cos(t*Math.PI*12)*.018,.14-.17*t,z+Math.sin(t*Math.PI*12)*.018]);}path(car,spring,.005,'#dc6140');
  wheels.push({pivot,wheel,front:z<0});
 }
 return {car,wheels};
}
export function buildAircraft(scene,{x,z},index){
 const g=new T.Group();g.position.set(x,1.2,z);scene.add(g);
 const profile=[[-4.7,.02],[-4.1,.28],[-3,.57],[-1.3,.85],[.4,.95],[2,.68],[3.5,.4],[4.5,.28]].map(([a,r])=>new T.Vector2(r,a));
 const body=mesh(new T.LatheGeometry(profile,20),mat('#a6b3ad',.4),g);body.rotation.x=Math.PI/2;body.scale.z=.73;
 // Swept, tapered planform, within the same ten-metre collision envelope.
 for(const side of [-1,1]){
  const shape=new T.Shape();shape.moveTo(side*.65,-.4);shape.lineTo(side*5,.8);shape.lineTo(side*5,1.5);shape.lineTo(side*.65,1.6);shape.closePath();
  const wing=mesh(new T.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:false}),mat('#8faaa5',.5),g,0,.06,0);wing.rotation.x=Math.PI/2;
  box(g,side*4.65,.077,1.13,.65,.035,.65,'#d8b25b');
  rod(g,[side*.9,.081,.2],[side*4.8,.081,1.14],.018,'#4f6868');
  rod(g,[side*.95,-.45,1],[side*1,-.92,1],.065,'#d3d7ca');
  const tire=mesh(new T.CylinderGeometry(.23,.23,.17,16),mat('#223032'),g,side*1,-.96,1);tire.rotation.z=Math.PI/2;
  const rim=mesh(new T.CylinderGeometry(.10,.10,.18,12),mat('#a2aaa0',.7),g,side*1,-.96,1);rim.rotation.z=Math.PI/2;
 }
 const canopy=mesh(new T.SphereGeometry(1,16,10),mat('#254c60',.65),g,0,.56,-1.45);canopy.scale.set(.58,.48,1.35);
 for(const zc of [-2.15,-.8])rod(g,[-.45,.7,zc],[.45,.7,zc],.025,'#bcc6b8');
 hull(g,[[2.9,.08,.2,.2],[3.9,.08,.2,2],[4.5,.08,.1,1.8]],'#64827e');
 hull(g,[[3.05,.5,.08,.16],[3.6,2,.08,.16],[4.05,1.8,.08,.16]],'#839d96');
 const nozzle=mesh(new T.CylinderGeometry(.27,.33,.28,16,1,true),mat('#34474b',.8),g,0,0,4.52);nozzle.rotation.x=Math.PI/2;
 decal(g,`AF ${21+index}`,0,1.25,4.04,.7,.22,[0,Math.PI/2,0],'#64827e','#eddfb8');
 return g;
}

export function dressBase(scene,buildings){
 const batches=new Map(),dummy=new T.Object3D();
 function add(x,y,z,w,h,d,color,rotation=0,glow=false){const key=color+glow;if(!batches.has(key))batches.set(key,{color,glow,items:[]});batches.get(key).items.push({x,y,z,w,h,d,rotation});}
 function beam(a,b,width,color){const v=new T.Vector3(...b).sub(new T.Vector3(...a));const mid=new T.Vector3(...a).add(new T.Vector3(...b)).multiplyScalar(.5);const obj=mesh(new T.BoxGeometry(width,v.length(),width),mat(color,.4),scene,...mid.toArray());obj.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());}
 // Residential: warm brick plinths, boarded walls, porches, garden fences and roadside windows.
 for(const [i,b] of buildings.filter(b=>b.kind==='house').entries()){
  const roadSide=b.x<0?1:-1,face=b.x+roadSide*4.04;
  add(b.x,.32,b.z,8.1,.64,8.1,'#8d6450');
  for(let y=.8;y<4.9;y+=.32){add(face,y,b.z,.035,.025,7.8,'#9f947b');add(b.x,y,b.z+4.04,7.9,.025,.035,'#9f947b');}
  for(const dz of [-2.2,1.5]){
   add(face+roadSide*.02,2.65,b.z+dz,.04,1.65,1.45,'#293f47');
   for(const yy of [1.8,3.5])add(face+roadSide*.06,yy,b.z+dz,.10,.10,1.65,'#e9debd');
   for(const zz of [-.8,0,.8])add(face+roadSide*.06,2.65,b.z+dz+zz,.10,1.8,.075,'#e9debd');
   add(face+roadSide*.07,2.65,b.z+dz,.11,.07,1.6,'#e9debd');
   for(const zz of [-1,1])add(face+roadSide*.04,2.65,b.z+dz+zz,.1,1.8,.27,'#5f796e');
  }
  add(b.x,5.05,b.z+4.12,8.4,.16,.18,'#e3d6b8');add(face,5.05,b.z,.18,.16,8.4,'#e3d6b8');
  for(const side of [-1,1]){add(b.x+side*1.2,1.3,b.z+5.4,.12,2.6,.12,'#e6dbbc');add(b.x+side*1.3,.22,b.z+4.85,.3,.44,2.1,'#9d9480');}
  add(b.x,2.65,b.z+4.9,3,.16,2.4,'#60746b');add(b.x,.13,b.z+5,2.8,.25,2.4,'#b0a795');
  decal(scene,`QUARTERS ${i+1}`,b.x,2.2,b.z+4.12,1.0,.22);
  for(let dz=-5;dz<=5;dz+=.45)if(Math.abs(dz-4)>1.1)add(b.x+roadSide*5.5,.54,b.z+dz,.08,1.08,.14,'#ddd2ae');
  for(const y of [.3,.8])add(b.x+roadSide*5.5,y,b.z,.07,.07,10,'#c8bea0');
  // A garden bed stays outside the RC road and checkpoint corridor.
  add(b.x+roadSide*4.8,.22,b.z-3,1,.44,2.4,'#6a7460');
  for(let j=0;j<6;j++){
   const bush=mesh(new T.IcosahedronGeometry(.43,0),mat(j%2?'#688669':'#7d915f'),scene,b.x+roadSide*4.8,.62,b.z-4+j*.4);bush.scale.y=.75;
  }
  add(b.x+roadSide*5.9,.75,b.z+4.8,.35,.3,.5,'#647b79');add(b.x+roadSide*5.9,.35,b.z+4.8,.06,.7,.06,'#a79d83');
 }
 // Hangar rib structure, trusses, corrugated panel rhythm and maintenance lanes.
 for(let z=-18;z<=2;z+=4){
  for(const x of [29.3,46.7]){add(x,3.9,z,.22,7.8,.3,'#425b5e');add(x,1,z,.35,2,.45,'#b7a575');}
  add(38,7.6,z,17.5,.2,.24,'#425b5e');
  for(let x=30;x<46;x+=2)beam([x,7.55,z],[x+1,6.9,z],.08,'#6e8580');
  for(const x of [33,43]){add(x,7.38,z,2.8,.09,.35,'#d5f2e5',0,true);add(x,7.48,z,3,.12,.5,'#536a6d');}
 }
 for(let z=-18.8;z<3;z+=.65)for(const x of [29.22,46.78])add(x,4,z,.045,7.5,.025,'#839995');
 for(let z=-19;z<3;z+=3){add(38,.071,z,17.6,.012,.018,'#7a8781');}
 for(const x of [35.5,40.5])add(x,.079,-8,.065,.015,21,'#d7bc6f');
 for(let z=-17;z<2;z+=1.3)for(const x of [30,45.8])add(x,.082,z,.8,.018,.22,'#b9a45e',-.55);
 decal(scene,'02  /  SERVICE',32.7,.087,-15.5,4.5,1.1,[-Math.PI/2,0,0],'#89958c','#d6c699');
 decal(scene,'KEEP CLEAR',38,.087,-18,3.6,.5,[-Math.PI/2,0,Math.PI],'#89958c','#e7ce7e');
 // Workbench, drawers, pegboard and small tools, safely against the west wall.
 for(const z of [-12,-4]){
  add(30.5,1.05,z,2,.14,3.2,'#c2a77b');add(30.5,.49,z,1.7,.95,3,'#425b60');
  for(let zz=z-1.1;zz<z+1.4;zz+=.5){add(31.37,.62,zz,.04,.55,.44,'#53767b');add(31.4,.76,zz,.035,.025,.25,'#c1c7b4');}
  add(29.28,2.05,z,.08,1.5,3.3,'#8e927b');
  for(let j=0;j<9;j++)add(29.35,1.7+(j%3)*.3,z-1.2+Math.floor(j/3)*.75,.05,.18,.05,'#384c50');
  add(30.4,1.2,z-.8,.42,.18,.65,'#ce6f48');add(30.2,1.3,z+.7,.4,.35,.38,'#486b69');
 }
 add(31.1,.55,-.8,1.1,1.1,.7,'#b86245');for(let y=.25;y<1;y+=.2)add(31.66,y,-.8,.025,.03,.5,'#e0c59d');
 path(scene,[[30,.12,-1],[32,.09,-2],[33,.07,-4],[32,.05,-5],[31,.08,-3]],.025,'#333f40');
 path(scene,[[45.8,.15,-14],[44.9,.08,-15],[44.5,.08,-17],[46,.08,-17.8]],.026,'#a78548');
 for(const z of [-13,-3]){const l=new T.PointLight('#ffe0ac',27,14,2);l.position.set(34,5,z);scene.add(l);}
 // Laboratory: teal tiled floor, dark service plinth, clinical wall panels and cyan edge lights.
 add(38,.073,23,17.4,.014,17.4,'#354f55');
 for(let x=30;x<=46;x+=1.5)add(x,.085,23,.018,.01,17.4,'#587477');
 for(let z=14.5;z<32;z+=1.5)add(38,.085,z,17.4,.01,.018,'#587477');
 for(const x of [29.25,46.75]){
  add(x,.6,23,.1,1.2,17.5,'#263f48');
  for(let z=15;z<32;z+=2){add(x,2.8,z,.08,2.8,1.85,'#a0bdb4');add(x,1.35,z,.12,.065,1.85,'#6ee1d0',0,true);}
  add(x,4.6,23,.18,.14,17.5,'#25424a');
 }
 for(const z of [14.25,31.75])for(const x of [33,43]){add(x,2.2,z,4.5,4.4,.1,'#4b7578');add(x,1.3,z,4.5,.10,.12,'#c3caa7');}
 for(const x of [35.5,40.5])add(x,.10,23,.06,.025,17,'#5fddc9',0,true);
 for(const x of [33,38,43]){
  for(const y of [.31,2.95]){const ring=mesh(new T.TorusGeometry(.84,.055,6,24),mat('#7ed9be',.3,true),scene,x,y,25);ring.rotation.x=Math.PI/2;}
  for(const side of [-1,1])add(x+side*.77,1.65,25,.07,2.7,.1,'#3c6a69');
  add(x,.25,25,1.9,.25,1.9,'#173941');
  path(scene,[[x,3,25],[x,3.6,25.5],[x,4.5,27]],.035,'#334c50');
 }
 for(const z of [18,29]){
  add(45.8,1.1,z,1.5,1.1,2.8,'#607f81');add(45.7,1.75,z,.12,.65,1.1,'#263d49');
  for(let j=0;j<6;j++)add(45.62,1.5+j*.075,z-.4,.025,.025,.5+(j%3)*.15,'#78ddbd',0,true);
 }
 decal(scene,'BIO / CONTAINMENT',38,3.7,31.65,4.5,.55,[0,Math.PI,0],'#28464f','#95e0c5');
 decal(scene,'AUTHORIZED PERSONNEL',38,.10,15.8,3.6,.45,[-Math.PI/2,0,Math.PI],'#354f55','#ccbf87');
 for(const z of [18,28]){add(38,4.7,z,6,.08,.5,'#9de8dd',0,true);const l=new T.PointLight('#73e5d9',22,11,2);l.position.set(38,3.8,z);scene.add(l);}
 // Long-range utility cues, still outside the drivable road edges.
 for(const z of [-30,-10,10,30]){
  rod(scene,[-6,0,z],[-6,6,z],.065,'#6d7c75');rod(scene,[-6,6,z],[-4.5,6,z],.05,'#6d7c75');add(-4.5,5.95,z,.65,.1,.3,'#d9d8b4');
 }
 for(const {color,glow,items} of batches.values()){
  const inst=new T.InstancedMesh(new T.BoxGeometry(1,1,1),mat(color,0,glow),items.length);
  for(let i=0;i<items.length;i++){const a=items[i];dummy.position.set(a.x,a.y,a.z);dummy.rotation.set(0,a.rotation,0);dummy.scale.set(a.w,a.h,a.d);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);}
  inst.castShadow=!glow;inst.receiveShadow=true;inst.computeBoundingSphere();scene.add(inst);
 }
 return {instancedParts:[...batches.values()].reduce((n,b)=>n+b.items.length,0),batches:batches.size};
}
