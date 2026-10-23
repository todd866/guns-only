import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addBox} from '../physics/world.mjs';

// Original low-poly flight-line props. Dimensions and placement are authored fiction for
// the RC play space, not surveyed public-source representations.
export function buildSupport(scene,world){
  const root=new T.Group(),mats=new Map();
  const mat=(c,m=0)=>{const k=c+m;if(!mats.has(k))mats.set(k,new T.MeshStandardMaterial({color:c,roughness:.72,metalness:m}));return mats.get(k);};
  const box=(x,y,z,w,h,d,c,solid=false)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);root.add(m);if(solid)addBox(world,x,z,w,d,y-h/2,y+h/2,'metal');return m;};
  const cyl=(x,y,z,r,h,c,rot=false)=>{const m=new T.Mesh(new T.CylinderGeometry(r,r,h,10),mat(c,.15));m.position.set(x,y,z);if(rot)m.rotation.z=Math.PI/2;root.add(m);return m;};
  // Set aside on the far apron beyond the event courses (all active course bounds are elsewhere).
  const x=1040,z=-320;
  // Tow tug: squat cab, nose and two visible axle wheels.
  box(x,.65,z,4.2,1.3,5.2,'#d7a641',true);box(x,.1,z+1.1,3.2,.35,1.2,'#273136');box(x,.95,z-1.2,3.2,1.7,2.1,'#e5bd5a');for(const dx of [-1.7,1.7])for(const dz of [-1.1,1.1])cyl(x+dx,.35,z+dz,.45,.35,'#252b2c',true);
  // Fuel tanker: cab plus rounded silver tank and rear wheels.
  box(x+13,.65,z,3.5,1.3,4.3,'#587c86',true);box(x+13,1.35,z-1.4,3.1,1.5,1.3,'#72949b');const tank=cyl(x+13,1.25,z+1.1,1.35,3.8,'#c1c7bf');tank.rotation.x=Math.PI/2;for(const dx of [x+11.7,x+14.3])for(const dz of [-1.1,1.1])cyl(dx,.3,z+dz,.43,.35,'#252b2c',true);
  // Fire truck: red body, raised cab and simple ladder plank.
  box(x+26,.7,z,4.5,1.4,5.5,'#bd4d42',true);box(x+26,1.45,z-1.35,4.1,1.4,2.2,'#d85b48');box(x+26,2.35,z+1.0,3.5,.9,2.0,'#d8d1b0');box(x+26,1.7,z-2.46,2.5,.7,.08,'#4d777e');for(const dx of [x+24.3,x+27.7])for(const dz of [-1.15,1.15])cyl(dx,.3,z+dz,.45,.35,'#252b2c',true);for(const dx of [-.55,.55])box(x+26+dx,3.0,z+1.25,.16,.16,4.6,'#e1b85e');for(let dz=-.7;dz<3.5;dz+=.6)box(x+26,3.0,z+dz,1.2,.12,.12,'#e1b85e');
  // Golf cart: open canopy and two seats, kept well clear of racing lines.
  box(x+40,.55,z,2.8,1.1,3.8,'#86a875',true);for(const dx of [x+39,x+41])for(const dz of [-1.1,1.1])cyl(dx,.2,z+dz,.35,.3,'#252b2c',true);box(x+40,1.25,z-.55,2.2,.35,.8,'#d8c98d');box(x+40,1.25,z+.55,2.2,.35,.8,'#d8c98d');for(const dx of [x+39,x+41])box(dx,2.1,z,.16,2.8,.16,'#d8c98d');box(x+40,3.5,z,3.2,.18,3.8,'#d8c98d');
  // Small control tower: shaft, glass cabin and antenna, on the same remote apron.
  const tx=x+58,tz=z+4;box(tx,3,tz,7,6,7,'#879b9b',true);box(tx,6.4,tz,9,1.3,9,'#b8c8bd',true);box(tx,7.2,tz,7.6,.55,7.6,'#4b737a');cyl(tx,10,tz,.12,5,'#d8c98d');
  root.updateMatrixWorld(true);const geometries=[];
  root.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld),colors=[];for(let i=0;i<g.attributes.position.count;i++)colors.push(o.material.color.r,o.material.color.g,o.material.color.b);g.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometries.push(g);});
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.72,metalness:.1}),mesh=new T.Mesh(mergeGeometries(geometries,false),material);mesh.castShadow=true;mesh.receiveShadow=true;
  geometries.forEach(g=>g.dispose());root.traverse(o=>o.geometry?.dispose());for(const m of mats.values())m.dispose();scene.add(mesh);
  return {dispose(){mesh.removeFromParent();mesh.geometry.dispose();material.dispose();}};
}
