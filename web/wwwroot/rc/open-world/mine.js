import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {MINE,ROOMS,OPENINGS,CHESTS,PLATES,CELLS,SPIRIT_MARK,DOORS,buildMine,mineWorld} from './mine.mjs';

// The Old Silver Mine, drawn: red-brown rock with timber frames, cart rails across the hub, oil
// lanterns, toy treasure chests, rusty gates with padlocks, a pressure plate, and a rocky hill with
// a timbered adit mouth outside. Static parts merge into one vertex-coloured mesh; doors, chests
// and the plate are separate so they can open. Visual only: collision lives in the stream.
const COL={rock:'#7b4a33',dirt:'#5e4636',wood:'#8d6038',metal:'#5b6366',beam:'#6d4a2b',rail:'#9aa0a3',lamp:'#ffcf6a'};
export function createMine(scene){
 const root=new T.Group();root.name='OldSilverMine';const parts=[],keep=[],W=p=>mineWorld(p);
 const coloured=(g,c)=>{const col=new T.Color(c),n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++)a.set([col.r,col.g,col.b],i*3);g.setAttribute('color',new T.BufferAttribute(a,3));return g;};
 const place=(g,x,y,z,yaw=0)=>{g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...W([x,y,z])),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw+MINE.yaw),new T.Vector3(1,1,1)));return g;};
 const box=(w,h,d,x,y,z,c,yaw=0)=>{let g=new T.BoxGeometry(w,h,d).toNonIndexed();g.deleteAttribute('uv');parts.push(coloured(place(g,x,y,z,yaw),c));};
 // Shell: the same triangles the physics uses, coloured by surface with a little per-vertex grit.
 {const tris=buildMine(),pos=[],col=[],c=new T.Color();for(const t of tris){for(const p of [t.a,t.b,t.c]){const w=W(p);pos.push(...w);c.set(COL[t.surface]??COL.rock);const n=.85+.3*Math.abs(Math.sin(w[0]*3.1+w[2]*2.3+w[1]*5));col.push(c.r*n,c.g*n,c.b*n);}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.computeVertexNormals();parts.push(g);}
 // Timber frames every 2 m along each room's long walls, and cross-beams under the ceiling.
 for(const r of ROOMS){const [x0,x1]=r.x,[z0,z1]=r.z,H=MINE.ceiling;for(let z=z0+1;z<z1-.5;z+=2){for(const x of [x0+.1,x1-.1])box(.08,H,.08,x,H/2,z,COL.beam);box(x1-x0,.08,.08,(x0+x1)/2,H-.06,z,COL.beam);}}
 // Cart rails across the hub, out through the adit; an overturned cart.
 for(const x of [-.25,.25])box(.03,.03,13,x,.015,-1.5,COL.rail);for(let z=-7.5;z<5.5;z+=.5)box(.7,.025,.08,0,.0125,z,COL.beam);
 box(.6,.35,.9,2.6,.2,-6.5,COL.metal,.4);
 // Oil lanterns on the frames (emissive, so the mine reads at night and in shadow).
 const lampMat=new T.MeshStandardMaterial({color:COL.lamp,emissive:'#ffb347',emissiveIntensity:2.2});
 for(const [x,z] of [[-1.3,4],[-3.8,-2],[3.8,-6],[-1.8,-10],[1.8,-13],[-2.8,-18],[2.8,-18],[8.7,-3],[-8.7,-3]]){const l=new T.Mesh(new T.SphereGeometry(.06,10,8),lampMat);l.position.set(...W([x,1.1,z]));root.add(l);}
 // Outside: a rocky hill over the whole footprint and a timbered mouth with a sign.
 {const [cx,cz]=[0,-9.5],g=new T.SphereGeometry(1,28,14,0,Math.PI*2,0,Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=1+.12*Math.sin(x*7)*Math.cos(z*5);p.setXYZ(i,x*12.5*k,y*5*k+.2,z*18*k);}g.computeVertexNormals();
  let hg=g.toNonIndexed();hg.deleteAttribute('uv');parts.push(coloured(place(hg,cx,-.15,cz),'#9a6748'));}
 box(.18,1.9,.18,-1.65,.95,6,COL.wood);box(.18,1.9,.18,1.65,.95,6,COL.wood);box(3.6,.2,.22,0,1.85,6,COL.wood);
 {const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');x.fillStyle='#3a2414';x.fillRect(0,0,512,128);x.font='bold 64px Georgia,serif';x.fillStyle='#f2d38c';x.textAlign='center';x.textBaseline='middle';x.fillText('OLD SILVER MINE',256,68);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const sign=new T.Mesh(new T.PlaneGeometry(2.6,.62),new T.MeshBasicMaterial({map:tex}));sign.position.set(...W([0,2.25,6.08]));sign.rotation.y=MINE.yaw;root.add(sign);keep.push(tex,sign.geometry,sign.material);}
 const merged=mergeGeometries(parts.map(g=>{if(!g.attributes.normal)g.computeVertexNormals();return g;}),false);parts.forEach(g=>g.dispose());merged.computeBoundingSphere();
 const shellMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.92,side:T.DoubleSide});const shell=new T.Mesh(merged,shellMat);shell.castShadow=shell.receiveShadow=true;root.add(shell);
 // Dynamic: doors (rusty gates with a padlock), chests, the plate.
 const gateMat=new T.MeshStandardMaterial({color:'#7d5a43',roughness:.6,metalness:.5}),lockMat=new T.MeshStandardMaterial({color:'#d8b04a',roughness:.3,metalness:.8}),bigLockMat=new T.MeshStandardMaterial({color:'#c23b3b',roughness:.35,metalness:.6});
 const doors={};const crackMat=new T.MeshStandardMaterial({color:'#8a5a40',roughness:.95}),seamMat=new T.MeshStandardMaterial({color:'#1c120c',roughness:1});
 for(const o of OPENINGS)if(o.door&&DOORS[o.door].kind==='dig'){// cracked rock: a lumpy slab with dark seams, crumbles when dug
  const g=new T.Group(),[s0,s1]=o.span,len=s1-s0,mid=(s0+s1)/2,H=MINE.ceiling;g.add(Object.assign(new T.Mesh(new T.BoxGeometry(len,H,.16),crackMat),{castShadow:true}));g.children[0].position.y=H/2;
  for(const [x,y,a,l] of [[-.2,.5,.7,.6],[.15,.9,-.5,.7],[0,1.25,.3,.5],[.3,.35,1.1,.4]]){const seam=new T.Mesh(new T.BoxGeometry(l,.025,.18),seamMat);seam.position.set(x,y,0);seam.rotation.z=a;g.add(seam);}
  const at=o.wall==='x'?[o.at,0,mid]:[mid,0,o.at];g.position.set(...W(at));g.rotation.y=MINE.yaw+(o.wall==='x'?Math.PI/2:0);g.userData.dig=true;root.add(g);doors[o.door]=g;}
 for(const o of OPENINGS)if(o.door&&DOORS[o.door].kind!=='dig'){const g=new T.Group(),[s0,s1]=o.span,len=s1-s0,mid=(s0+s1)/2;for(let i=0;i<=len/.18;i++){const bar=new T.Mesh(new T.CylinderGeometry(.015,.015,MINE.ceiling,6),gateMat);bar.position.set(-len/2+i*.18,MINE.ceiling/2,0);g.add(bar);}
  for(const y of [.25,MINE.ceiling-.2]){const rail=new T.Mesh(new T.BoxGeometry(len,.05,.04),gateMat);rail.position.y=y;g.add(rail);}
  if(o.door==='A'||o.door==='B'){const lock=new T.Mesh(new T.BoxGeometry(.14,.16,.06),o.door==='B'?bigLockMat:lockMat);lock.position.y=.55;g.add(lock);}
  const at=o.wall==='x'?[o.at,0,mid]:[mid,0,o.at];g.position.set(...W(at));g.rotation.y=MINE.yaw+(o.wall==='x'?Math.PI/2:0);root.add(g);doors[o.door]=g;}
 const chestMat=new T.MeshStandardMaterial({color:'#b5532d',roughness:.5}),trimMat=new T.MeshStandardMaterial({color:'#e3b341',roughness:.3,metalness:.7});
 const chests={};for(const [id,c] of Object.entries(CHESTS)){const g=new T.Group(),big=c.holds==='big',s=big?1.4:1;const body=new T.Mesh(new T.BoxGeometry(.22*s,.13*s,.15*s),chestMat);body.position.y=.065*s;g.add(body);const lid=new T.Group();lid.position.set(0,.13*s,.075*s);const top=new T.Mesh(new T.BoxGeometry(.22*s,.05*s,.15*s),chestMat);top.position.set(0,.025*s,-.075*s);lid.add(top);const band=new T.Mesh(new T.BoxGeometry(.04*s,.06*s,.155*s),trimMat);band.position.set(0,.02*s,-.075*s);lid.add(band);g.add(lid);
  g.position.set(...W(c.at));g.rotation.y=MINE.yaw;root.add(g);chests[id]={g,lid};}
 const plates={};for(const [id,p] of Object.entries(PLATES)){const m=new T.Mesh(new T.CylinderGeometry(.22,.24,.03,20),new T.MeshStandardMaterial({color:'#4fb3c9',emissive:'#1f8fb0',emissiveIntensity:.4}));m.position.set(...W([p.at[0],.015,p.at[2]]));root.add(m);plates[id]=m;}
 // The spirit mark: a glowing spiral-mountain painted on the chamber wall, and a battery cell.
 {const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.strokeStyle='#7ff5e4';x.lineWidth=10;x.lineCap='round';x.shadowColor='#3fe0d0';x.shadowBlur=18;
  x.beginPath();x.moveTo(30,200);x.lineTo(128,50);x.lineTo(226,200);x.stroke();x.beginPath();for(let t=0;t<14;t+=.1){const r=4+t*4;x.lineTo(128+Math.cos(t)*r,150+Math.sin(t)*r*.8);}x.stroke();
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(.9,.9),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));m.position.set(...W(SPIRIT_MARK.at));m.rotation.y=MINE.yaw+Math.PI/2;root.add(m);keep.push(tex,m.geometry,m.material);
  const glow=new T.PointLight('#5ff0dc',1.2,3,1.5);glow.position.set(...W([SPIRIT_MARK.at[0]+.4,SPIRIT_MARK.at[1],SPIRIT_MARK.at[2]]));root.add(glow);}
 const cellMat=new T.MeshStandardMaterial({color:'#7dff6a',emissive:'#3ad13a',emissiveIntensity:1.2,roughness:.3}),capMat=new T.MeshStandardMaterial({color:'#d9d9d9',metalness:.9,roughness:.25});
 const cells={};for(const [id,c] of Object.entries(CELLS)){const g=new T.Group();const body=new T.Mesh(new T.CylinderGeometry(.035,.035,.1,14),cellMat);g.add(body);const cap=new T.Mesh(new T.CylinderGeometry(.015,.015,.02,10),capMat);cap.position.y=.06;g.add(cap);g.position.set(...W(c.at));root.add(g);cells[id]=g;}
 scene.add(root);
 return {root,
  takeCell(id){const g=cells[id];if(g)g.visible=false;},
  openDoor(id){const g=doors[id];if(!g)return;if(g.userData.dig){g.visible=false;return;}g.userData.opening=0;},
  openChest(id){const c=chests[id];if(c)c.lid.userData.opening=0;},
  pressPlate(id){const m=plates[id];if(m){m.position.y-=.02;m.material.emissiveIntensity=1.6;}},
  update(dt){for(const g of Object.values(cells))if(g.visible){g.rotation.y+=dt*2;}for(const g of Object.values(doors))if(g.userData.opening!==undefined&&g.userData.opening<1){g.userData.opening=Math.min(1,g.userData.opening+dt*.8);g.position.y=mineWorld([0,0,0])[1]+MINE.ceiling*.95*g.userData.opening;}
   for(const c of Object.values(chests))if(c.lid.userData.opening!==undefined&&c.lid.userData.opening<1){c.lid.userData.opening=Math.min(1,c.lid.userData.opening+dt*2.5);c.lid.rotation.x=-1.9*c.lid.userData.opening;}},
  dispose(){root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();});[shellMat,lampMat,crackMat,seamMat,cellMat,capMat,gateMat,lockMat,bigLockMat,chestMat,trimMat,...keep].forEach(x=>x.dispose?.());}};
}
