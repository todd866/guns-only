import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {createAircraft} from './aircraft-catalog.js';
import {addBox} from '../physics/world.mjs';

// Authored cartoon approximations and fictional dimensions for base-life dressing.
export function buildBaseLife(scene,world){
 const root=new T.Group(),mats=new Map();const mat=c=>{if(!mats.has(c))mats.set(c,new T.MeshStandardMaterial({color:c,roughness:.75}));return mats.get(c);};
 const box=(x,y,z,w,h,d,c,solid=false)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);root.add(m);if(solid)addBox(world,x,z,w,d,y-h/2,y+h/2,'concrete');return m;};
 const cyl=(x,y,z,r,h,c)=>{const m=new T.Mesh(new T.CylinderGeometry(r,r,h,10),mat(c));m.position.set(x,y,z);m.rotation.z=Math.PI/2;root.add(m);return m;};
 const vehicle=(x,z,c,kind)=>{box(x,.6,z,4.2,1.2,6,c,true);for(const dx of [-1.7,1.7])for(const dz of [-1.8,1.8])cyl(x+dx,.28,z+dz,.42,.35,'#20292d');if(kind==='loader'){box(x,.95,z-1.7,3.4,1.1,1.5,'#e0b542');box(x,2,z-1.8,.3,2.2,3.2,'#9b7834');box(x,3.1,z-3.3,.3,.2,3,'#d4b54f');}if(kind==='pickup'){box(x,.95,z-1.4,3.7,1.2,2.2,'#4f777a');box(x,1.5,z+1.1,3.5,1.4,1.8,'#6f9392');box(x,1.55,z+.15,3,.9,.08,'#25454d');}if(kind==='bus'){box(x,1.45,z,3.7,2.7,8,'#d6a94e');for(const side of [-1,1])for(const dz of [-2.8,-1.4,0,1.4,2.8])box(x+side*1.86,1.9,z+dz,.06,.65,1,'#395e66');}if(kind==='sedan'){box(x,1,z,3.6,1.5,6,'#8b9b9b');box(x,1.9,z-.4,3,1.1,2.6,'#3e626b');}if(kind==='shuttle'){box(x,1.2,z,3.8,2.1,7,'#d8d9ce');box(x,1.8,z,3.6,.7,6.2,'#b7c9c0');}return kind;};
 vehicle(760,-220,'#d2a537','loader');vehicle(780,-220,'#5d8185','pickup');box(780,2.3,-219,2,.18,.4,'#698dd0');vehicle(800,-220,'#d4aa4b','bus');vehicle(820,-220,'#d7d9d1','shuttle');vehicle(840,-220,'#7b8e90','sedan');vehicle(860,-220,'#8a9a9a','pickup');
 // Parked white Janet-style 737 silhouette, with swept wings and twin nacelles.
 const airliner=createAircraft('KC-135');airliner.scale.setScalar(.65);airliner.position.set(2700,2,-1100);airliner.name='Janet-style 737';const engines=airliner.children.filter(o=>o.name==='nacelle');for(const e of engines.slice(2)){e.geometry.dispose();airliner.remove(e);}airliner.traverse(o=>{if(o.isMesh)o.material=mat(o.name==='nacelle'?'#87999e':'#ece9dc');});root.add(airliner);for(const m of airliner.userData.materials)m.dispose();box(2700,2.3,-1100,2,.12,24,'#a8554b');addBox(world,2700,-1100,2.5,25,1.2,3.8,'metal');

 // Gym and hospital follow documented public anchors; chapel placement is authored fiction.
 box(-1201,3,1224,24,6,18,'#bca88c',true);box(-1201,6.2,1224,26,.4,20,'#738387');box(-1201,3,1214,10,4,.1,'#355b62');
 box(-412,4,-507,30,8,22,'#d1b896',true);box(-412,8.2,-507,32,.4,24,'#8c9a93');box(-412,4,-495,12,5,.1,'#446c73');box(-412,6,-495.8,.7,2.5,.12,'#a9514d');box(-412,6,-495.9,2.5,.7,.12,'#a9514d');
 box(-350,3,-600,18,6,14,'#d2c3aa',true);const roof=new T.ConeGeometry(13,3,4);const r=new T.Mesh(roof,mat('#9b6653'));r.position.set(-350,7,-600);r.rotation.y=Math.PI/4;root.add(r);box(-350,3,-592,6,4,.1,'#4b7074');box(-350,9.3,-600,.35,3,.35,'#e4d7bb');box(-350,9.8,-600,2,.3,.35,'#e4d7bb');
 root.updateMatrixWorld(true);const gs=[];root.traverse(o=>{if(o.isMesh){let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat;}const col=[];for(let i=0;i<g.attributes.position.count;i++)col.push(o.material.color.r,o.material.color.g,o.material.color.b);g.setAttribute('color',new T.Float32BufferAttribute(col,3));gs.push(g);}});const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.75}),mesh=new T.Mesh(mergeGeometries(gs,false),material);gs.forEach(g=>g.dispose());root.traverse(o=>o.geometry?.dispose());for(const m of mats.values())m.dispose();mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);return {dispose(){mesh.removeFromParent();mesh.geometry.dispose();material.dispose();}};
}
