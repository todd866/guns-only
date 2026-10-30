import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {PUMPKIN,SCARECROW,HAY,INFLATABLES,BANNER,spawnPoint,spawnYaw,pumpkinField,createPumpkins,stepPumpkins} from './halloween.mjs';

// Halloween art: instanced pumpkins (body, stem, glowing face) that hide when smashed, a burst of
// pumpkin chunks per splat, and a merged vertex-coloured set of patch props. Purely visual: the car
// drives through all of it; the splat is the only interaction.
const ORANGE='#e8741c',STEM='#5b6b2a',GLOW='#ffbf3c';
const ribbed=()=>{const g=new T.SphereGeometry(1,16,10),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(z,x),k=1-.07*Math.abs(Math.sin(a*4));p.setXYZ(i,x*k,y*.74*(1-.12*Math.max(0,y)),z*k);}g.computeVertexNormals();return g;};
// Two triangle eyes, a triangle nose and a zig-zag grin, lifted just proud of the pumpkin's front.
function faceGeometry(){const v=[],tri=(a,b,c)=>v.push(a[0],a[1],1.002,b[0],b[1],1.002,c[0],c[1],1.002);
 for(const s of [-1,1])tri([s*.42,.12],[s*.16,.12],[s*.29,.38]);tri([-.08,-.02],[.08,-.02],[0,.12]);
 const m=[[-.55,-.18],[-.4,-.3],[-.25,-.2],[-.1,-.32],[.1,-.32],[.25,-.2],[.4,-.3],[.55,-.18]];for(let i=0;i<m.length-1;i++){const [a,b]=[m[i],m[i+1]];tri([a[0],a[1]],[b[0],b[1]-.12],[b[0],b[1]]);tri([a[0],a[1]],[a[0],a[1]-.12],[b[0],b[1]-.12]);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));
 // Curve the flat face onto the front of the squashed sphere.
 const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i)/.74;p.setZ(i,Math.sqrt(Math.max(.02,1-x*x-y*y))*.93+.075);}g.computeVertexNormals();return g;}
function labelTexture(text){const c=document.createElement('canvas');c.width=1024;c.height=160;const x=c.getContext('2d');x.fillStyle='#2a1838';x.fillRect(0,0,1024,160);x.strokeStyle='#ff8a1f';x.lineWidth=10;x.strokeRect(8,8,1008,144);x.font='bold 96px "Trebuchet MS",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillStyle='#ff9a2a';x.fillText(text,512,86);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;}

export function createHalloween(scene,world,{porches=[],heightAt=()=>0}={}){
 const ground=(x,z,fallback=heightAt(x,z))=>{const hit=world?.raycast?.([x,fallback+4,z],[0,-1,0],8);return hit?hit.point[1]:fallback;};
 const field=pumpkinField({porches,heightAt:(x,z)=>ground(x,z)}),state=createPumpkins(field),n=field.length;
 const root=new T.Group();root.name='Halloween';scene.add(root);const disposables=[];const keep=o=>(disposables.push(o),o);
 const bodyGeo=keep(ribbed()),stemGeo=keep(new T.CylinderGeometry(.08,.12,.32,6)),faceGeo=keep(faceGeometry());
 const bodyMat=keep(new T.MeshStandardMaterial({color:ORANGE,roughness:.62})),stemMat=keep(new T.MeshStandardMaterial({color:STEM,roughness:.9})),faceMat=keep(new T.MeshBasicMaterial({color:GLOW}));
 const lit=field.map((p,i)=>p.lit?i:-1).filter(i=>i>=0);
 const body=new T.InstancedMesh(bodyGeo,bodyMat,n),stem=new T.InstancedMesh(stemGeo,stemMat,n),face=new T.InstancedMesh(faceGeo,faceMat,lit.length);body.castShadow=true;
 const m=new T.Matrix4(),q=new T.Quaternion(),up=new T.Vector3(0,1,0),zero=new T.Matrix4().makeScale(0,0,0);
 const place=i=>{const p=field[i],s=PUMPKIN.radius*p.scale,gone=state.pumpkins[i].smashedAt!==null;q.setFromAxisAngle(up,p.yaw);
  body.setMatrixAt(i,gone?zero:m.compose(new T.Vector3(p.x,p.y+s*.72,p.z),q,new T.Vector3(s,s,s)));
  stem.setMatrixAt(i,gone?zero:m.compose(new T.Vector3(p.x,p.y+s*1.4+.04,p.z),q,new T.Vector3(s*2.6,s*2.6,s*2.6)));};
 const placeFace=(slot,i)=>{const p=field[i],s=PUMPKIN.radius*p.scale;q.setFromAxisAngle(up,p.yaw);face.setMatrixAt(slot,state.pumpkins[i].smashedAt!==null?zero:m.compose(new T.Vector3(p.x,p.y+s*.72,p.z),q,new T.Vector3(s,s,s)));};
 const refresh=()=>{for(let i=0;i<n;i++)place(i);lit.forEach(placeFace);body.instanceMatrix.needsUpdate=stem.instanceMatrix.needsUpdate=face.instanceMatrix.needsUpdate=true;};
 refresh();for(const mesh of [body,stem,face]){mesh.computeBoundingSphere();root.add(mesh);}

 // Splat chunks: a small pool reused round-robin.
 const CHUNKS=72,chunkGeo=keep(new T.DodecahedronGeometry(1,0)),chunkMat=keep(new T.MeshStandardMaterial({color:'#f08a2c',roughness:.7})),chunks=new T.InstancedMesh(chunkGeo,chunkMat,CHUNKS);chunks.frustumCulled=false;root.add(chunks);
 const bits=Array.from({length:CHUNKS},()=>({life:0,p:[0,0,0],v:[0,0,0],s:0,spin:0}));let nextBit=0;
 for(let i=0;i<CHUNKS;i++)chunks.setMatrixAt(i,zero);
 const splat=hit=>{const p=hit.pumpkin,s=PUMPKIN.radius*p.scale;for(let k=0;k<12;k++){const b=bits[nextBit=(nextBit+1)%CHUNKS],a=Math.random()*Math.PI*2,out=1+Math.random()*2.2,push=hit.speed*.45;b.life=1.1+Math.random()*.5;b.p=[p.x,p.y+s*.7,p.z];b.v=[Math.cos(a)*out+hit.dir[0]*push,2.2+Math.random()*2.6,Math.sin(a)*out+hit.dir[1]*push];b.s=s*(.18+Math.random()*.22);b.spin=Math.random()*6;}};

 // Patch props, merged into one vertex-coloured mesh.
 const parts=[],add=(geo,color,pos,{yaw=0,scale=[1,1,1],rot=null}={})=>{const g=geo.index?geo.toNonIndexed():geo.clone();if(geo.index)geo.dispose();const mm=new T.Matrix4().compose(new T.Vector3(...pos),rot??new T.Quaternion().setFromAxisAngle(up,yaw),new T.Vector3(...scale));g.applyMatrix4(mm);const c=new T.Color(color),cols=[];for(let i=0;i<g.attributes.position.count;i++)cols.push(c.r,c.g,c.b);g.setAttribute('color',new T.Float32BufferAttribute(cols,3));g.deleteAttribute('uv');parts.push(g);};
 const at=(a,r,lift=0)=>{const [x,z]=spawnPoint(a,r);return [x,ground(x,z)+lift,z];};
 const faceYaw=-spawnYaw;
 // Hay bales and a scarecrow on a post.
 for(const [a,r] of HAY){const p=at(a,r,.28);add(new T.BoxGeometry(1.1,.56,.7),'#d8b55a',p,{yaw:faceYaw+(a%2)*.3});add(new T.BoxGeometry(1.12,.06,.72),'#b38f3c',[p[0],p[1]+.12,p[2]],{yaw:faceYaw+(a%2)*.3});}
 {const [a,r]=SCARECROW,b=at(a,r);add(new T.CylinderGeometry(.05,.06,2.2,6),'#7a5634',[b[0],b[1]+1.1,b[2]]);add(new T.BoxGeometry(1.5,.07,.07),'#7a5634',[b[0],b[1]+1.55,b[2]],{yaw:faceYaw});
  add(new T.BoxGeometry(.55,.7,.3),'#4f6fa8',[b[0],b[1]+1.35,b[2]],{yaw:faceYaw});add(new T.BoxGeometry(1.3,.2,.22),'#c0463a',[b[0],b[1]+1.55,b[2]],{yaw:faceYaw});
  add(new T.SphereGeometry(.24,10,8),'#e3c98a',[b[0],b[1]+1.95,b[2]]);add(new T.CylinderGeometry(.42,.42,.04,14),'#a37b3a',[b[0],b[1]+2.13,b[2]]);add(new T.ConeGeometry(.2,.32,10),'#a37b3a',[b[0],b[1]+2.3,b[2]]);
  for(const s of [-1,1])add(new T.ConeGeometry(.06,.3,5),'#e0c060',[b[0],b[1]+1.08,b[2]],{rot:new T.Quaternion().setFromEuler(new T.Euler(Math.PI,faceYaw,s*.3))});}
 // Giant inflatable pumpkin and ghost, held down by guy ropes.
 {const [a,r]=INFLATABLES.pumpkin,p=at(a,r),s=2.1;const g=ribbed();add(g,'#f07d1e',[p[0],p[1]+s*.7,p[2]],{scale:[s,s,s]});add(new T.CylinderGeometry(.15,.22,.6,8),STEM,[p[0],p[1]+s*1.55,p[2]]);
  const f=faceGeometry();add(f,'#2b1a10',[p[0],p[1]+s*.7,p[2]],{yaw:faceYaw,scale:[s,s,s]});}
 {const [a,r]=INFLATABLES.ghost,p=at(a,r);add(new T.CylinderGeometry(1,1.35,2.6,18,1,true),'#f4f4f0',[p[0],p[1]+1.3,p[2]]);add(new T.SphereGeometry(1,18,10,0,Math.PI*2,0,Math.PI/2),'#f4f4f0',[p[0],p[1]+2.6,p[2]]);
  for(const s of [-1,1]){add(new T.CylinderGeometry(.28,.36,1.2,10),'#f4f4f0',[p[0]+Math.cos(-faceYaw)*s*1.2,p[1]+2.1,p[2]+Math.sin(-faceYaw)*s*1.2],{rot:new T.Quaternion().setFromEuler(new T.Euler(0,faceYaw,s*-.9))});}
  const fy=faceYaw,fx=Math.sin(fy),fz=Math.cos(fy),rx=Math.cos(fy),rz=-Math.sin(fy);for(const s of [-1,1])add(new T.SphereGeometry(.17,10,8),'#1c1c22',[p[0]+fx*.96+rx*s*.36,p[1]+2.75,p[2]+fz*.96+rz*s*.36],{scale:[1,1.5,.5]});add(new T.SphereGeometry(.22,10,8),'#1c1c22',[p[0]+fx*1.02,p[1]+2.25,p[2]+fz*1.02],{scale:[1,1.3,.4]});}
 // Banner posts across the park mouth; the sign itself is a textured plane.
 const [ba,br]=BANNER.at,bw=BANNER.width;for(const s of [-1,1]){const p=at(ba,br+s*bw/2);add(new T.CylinderGeometry(.07,.07,3.2,8),'#3a2a48',[p[0],p[1]+1.6,p[2]]);add(new T.SphereGeometry(.16,10,8),'#ff8a1f',[p[0],p[1]+3.25,p[2]]);}
 // Tombstones on the lawn of every third dressed yard.
 porches.forEach((p,i)=>{if(i%3)return;const l=p.lawn,yaw=p.yaw;add(new T.BoxGeometry(.5,.62,.12),'#8d9196',[l.x,l.y+.31,l.z],{yaw:yaw+(i%2?.12:-.1)});add(new T.CylinderGeometry(.25,.25,.12,12,1,false,0,Math.PI),'#8d9196',[l.x,l.y+.62,l.z],{rot:new T.Quaternion().setFromEuler(new T.Euler(Math.PI/2,0,0)).premultiply(new T.Quaternion().setFromAxisAngle(up,yaw+(i%2?.12:-.1)))});add(new T.BoxGeometry(.3,.04,.02),'#4d5156',[l.x+Math.sin(yaw)*.07,l.y+.5,l.z+Math.cos(yaw)*.07],{yaw});});
 const props=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());props.computeBoundingSphere();const propsMat=keep(new T.MeshStandardMaterial({vertexColors:true,roughness:.8}));const propsMesh=new T.Mesh(keep(props),propsMat);propsMesh.castShadow=true;root.add(propsMesh);
 {const tex=keep(labelTexture('HAPPY HALLOWEEN')),mid=at(ba,br,2.6),sign=new T.Mesh(keep(new T.PlaneGeometry(bw-.3,bw/6.4)),keep(new T.MeshBasicMaterial({map:tex})));sign.position.set(...mid);sign.rotation.y=faceYaw;root.add(sign);
  // The back reads the right way round too (a double-sided plane shows it mirrored).
  const back=sign.clone();back.rotation.y=faceYaw+Math.PI;back.position.set(mid[0]-Math.sin(faceYaw)*.01,mid[1],mid[2]-Math.cos(faceYaw)*.01);root.add(back);}

 // Floating ghosts and circling bats over the patch.
 const ghostGeo=keep(mergeGeometries([new T.SphereGeometry(.42,14,10,0,Math.PI*2,0,Math.PI/2).translate(0,.3,0),new T.CylinderGeometry(.42,.56,.6,14,1,true)].map(g=>g.toNonIndexed()))),ghostMat=keep(new T.MeshStandardMaterial({color:'#f6f6f2',roughness:.5,transparent:true,opacity:.88,emissive:'#b8c6ff',emissiveIntensity:.25}));
 const eyeGeo=keep(new T.SphereGeometry(.07,8,6)),eyeMat=keep(new T.MeshBasicMaterial({color:'#18181e'}));
 const ghosts=[[12,4],[16,-3],[8,6.5]].map(([a,r],i)=>{const g=new T.Group(),b=new T.Mesh(ghostGeo,ghostMat);g.add(b);for(const s of [-1,1]){const e=new T.Mesh(eyeGeo,eyeMat);e.position.set(s*.15,.42,.38);e.scale.set(1,1.5,.6);g.add(e);}const p=at(a,r,1.6);g.position.set(...p);g.userData={base:p,phase:i*2.1};root.add(g);return g;});
 const batGeo=keep((()=>{const v=[0,0,0,.42,.08,-.1,.18,0,.2, 0,0,0,-.18,0,.2,-.42,.08,-.1];const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.computeVertexNormals();return g;})()),batMat=keep(new T.MeshBasicMaterial({color:'#1b1424',side:T.DoubleSide}));
 const centre=at(12,0,0),bats=Array.from({length:9},(_,i)=>{const b=new T.Mesh(batGeo,batMat);b.userData={r:6+(i%3)*3,h:5+(i%4)*1.3,w:.5+(i%5)*.12,phase:i*.7};root.add(b);return b;});

 let last=0;
 return {
  count:n,state,
  step(pos,vel,time){const hits=stepPumpkins(state,pos,vel,time);for(const h of hits)splat(h);if(state.changed)refresh();return hits;},
  update(time){const dt=Math.min(.05,Math.max(0,time-last));last=time;
   for(let i=0;i<CHUNKS;i++){const b=bits[i];if(b.life<=0)continue;b.life-=dt;b.v[1]-=9.8*dt;for(let k=0;k<3;k++)b.p[k]+=b.v[k]*dt;const floor=heightAt(b.p[0],b.p[2])+b.s*.5;if(b.p[1]<floor){b.p[1]=floor;b.v=[b.v[0]*.4,Math.abs(b.v[1])*.2,b.v[2]*.4];}q.setFromEuler(new T.Euler(b.spin*time,b.spin*.7*time,0));const s=b.life>0?b.s*Math.min(1,b.life*2):0;chunks.setMatrixAt(i,s>0?m.compose(new T.Vector3(...b.p),q,new T.Vector3(s,s*.6,s)):zero);}
   chunks.instanceMatrix.needsUpdate=true;
   for(const g of ghosts){const {base,phase}=g.userData;g.position.set(base[0]+Math.sin(time*.4+phase)*1.2,base[1]+Math.sin(time*1.3+phase)*.35,base[2]+Math.cos(time*.33+phase)*1.2);g.rotation.y=time*.5+phase;}
   for(const b of bats){const {r,h,w,phase}=b.userData,a=time*w+phase;b.position.set(centre[0]+Math.cos(a)*r,centre[1]+h+Math.sin(time*2+phase)*.4,centre[2]+Math.sin(a)*r);b.rotation.set(0,-a,0);b.scale.set(1,1+Math.sin(time*14+phase)*.9,1);}
   faceMat.color.setRGB(1,.68+Math.sin(time*9)*.04+Math.sin(time*23)*.03,.2);},
  dispose(){root.removeFromParent();for(const o of disposables)o.dispose();body.dispose();stem.dispose();face.dispose();chunks.dispose();},
 };
}
