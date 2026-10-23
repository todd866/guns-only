// Original toy aliens. Instancing keeps the collection loop to three draw calls, base-wide.
import * as T from '../../vendor/three.module.js';
import {SPECIMENS} from './catalog.mjs';
export function createSpecimens(scene,progress){
 const sphere=new T.SphereGeometry(1,12,8),bodyMat=new T.MeshStandardMaterial({color:'#a6dec0',emissive:'#28705b',emissiveIntensity:.45,roughness:.55}),eyeMat=new T.MeshStandardMaterial({color:'#193a40',roughness:.25}),baseMat=new T.MeshStandardMaterial({color:'#568e85',emissive:'#48c5ad',emissiveIntensity:.5});
 const bodies=new T.InstancedMesh(sphere,bodyMat,SPECIMENS.length*2),eyes=new T.InstancedMesh(sphere,eyeMat,SPECIMENS.length*2),bases=new T.InstancedMesh(new T.CylinderGeometry(.5,.58,.08,16),baseMat,SPECIMENS.length);
 const m=new T.Object3D(),colour=new T.Color();for(const mesh of [bodies,eyes,bases]){mesh.frustumCulled=false;scene.add(mesh);}
 const place=(mesh,i,x,y,z,sx,sy,sz)=>{m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.updateMatrix();mesh.setMatrixAt(i,m.matrix);};
 function update(t){SPECIMENS.forEach((p,i)=>{const collected=progress.specimens.includes(p.id),scale=collected?0:1,bob=Math.sin(t*2+i)*.06;place(bases,i,p.x,.04,p.z,1,1,1);bases.setColorAt(i,colour.set(collected?'#727c7c':'#a8ffce'));place(bodies,i*2,p.x,.48+bob,p.z,.19*scale,.3*scale,.16*scale);place(bodies,i*2+1,p.x,.84+bob,p.z,.3*scale,.28*scale,.23*scale);for(const [j,side]of [-1,1].entries())place(eyes,i*2+j,p.x+side*.12,.87+bob,p.z+.2,.08*scale,.12*scale,.04*scale);});for(const mesh of [bodies,eyes,bases])mesh.instanceMatrix.needsUpdate=true;bases.instanceColor.needsUpdate=true;}
 update(0);return {update,dispose(){for(const mesh of [bodies,eyes,bases])mesh.removeFromParent();sphere.dispose();bases.geometry.dispose();bodyMat.dispose();eyeMat.dispose();baseMat.dispose();}};
}
