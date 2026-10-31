import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {SEWER,ROOMS,CHANNELS,OPENINGS,CHESTS,CELLS,SEWER_PARK,LADDERS,MANHOLE,RAT_KING,SHRINE,PIPE_Y,BOWL,bowlFloor,buildSewer,sewerWorld} from './sewer.mjs';

// The Sewers under the base, drawn: old red brick with a soot band, concrete walkways, green
// slime in the channels, rusty pipes that are the grind rails, caged work lamps, a gated door, the
// trick-shrine door with its combo count, toy chests, and the Rat King asleep in the drained bowl
// (a painted pool with tiles at the lip and steel coping). In the street above: an iron manhole cover. Visual only; collision is in the stream.
const COL={brick:'#8a4a36',concrete:'#8d887c',sewage:'#24311a',wood:'#8d6038',metal:'#5b6366',pipe:'#a0663f',lamp:'#ffd27a',soot:'#3b2a22'};
export function createSewer(scene){
 const root=new T.Group();root.name='Sewers';
 // The manhole cover lives in the street; everything else is only drawn while you're down there
 // (it sat under the skatepark costing ~100 draw calls nobody could see).
 const street=new T.Group();street.name='SewerManhole';scene.add(street);root.visible=false;const parts=[],keep=[],W=sewerWorld;
 const coloured=(g,c)=>{const col=new T.Color(c),n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++)a.set([col.r,col.g,col.b],i*3);g.setAttribute('color',new T.BufferAttribute(a,3));return g;};
 const place=(g,x,y,z,rx=0,ry=0,rz=0)=>{g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...W([x,y,z])),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),new T.Vector3(1,1,1)));return g;};
 const box=(w,h,d,x,y,z,c)=>{const g=new T.BoxGeometry(w,h,d).toNonIndexed();g.deleteAttribute('uv');parts.push(coloured(place(g,x,y,z),c));};
 const cyl=(r,len,x,y,z,c,rx=0,rz=0)=>{const g=new T.CylinderGeometry(r,r,len,12).toNonIndexed();g.deleteAttribute('uv');parts.push(coloured(place(g,x,y,z,rx,0,rz),c));};
 // Shell: the physics triangles, coloured by surface. Brick gets courses (darker every 7.5 cm) and
 // a soot band at the waterline; everything gets a little per-vertex grit.
 {const pos=[],col=[],c=new T.Color(),soot=new T.Color(COL.soot);for(const t of buildSewer()){for(const p of [t.a,t.b,t.c]){const w=W(p);pos.push(...w);c.set(COL[t.surface]??COL.concrete);
   if(t.surface==='brick'){const course=Math.floor((p[1]+1)/.075)%2?0.9:1.04;c.multiplyScalar(course);if(p[1]<.12)c.lerp(soot,.6);}
   else if(p[1]<-.005&&p[0]>BOWL.box[0]-.01&&p[0]<BOWL.box[1]+.01&&p[2]>BOWL.box[2]-.01&&p[2]<BOWL.box[3]+.01){c.set(p[1]>-.14?'#d9d3bf':'#6f9fae');if(p[1]<-.6)c.lerp(soot,.35);}
   const n=.85+.3*Math.abs(Math.sin(w[0]*2.7+w[2]*3.3+w[1]*6));col.push(c.r*n,c.g*n,c.b*n);}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.computeVertexNormals();parts.push(g);}
 // Brick arches every 3 m and a pipe run along the north wall of each room.
 for(const r of ROOMS){const [x0,x1]=r.x,[z0,z1]=r.z,H=r.ceiling??SEWER.ceiling;for(let x=x0+1.5;x<x1-.5;x+=3){box(.18,.16,z1-z0,x,H-.08,(z0+z1)/2,'#6e3a2a');for(const z of [z0+.08,z1-.08])box(.18,H,.16,x,H/2,z,'#6e3a2a');}
  cyl(.05,x1-x0,(x0+x1)/2,H-.35,z0+.14,'#6f7a7d',0,Math.PI/2);}
 // The grind pipes: rusty, with flanges every 2 m, and brackets down into the slime.
 for(const r of SEWER_PARK.rails.filter(r=>r.kind==='rail')){const [a,b]=[r.pts[0],r.pts.at(-1)],len=b[0]-a[0],cx=(a[0]+b[0])/2,y=PIPE_Y-.09;cyl(.09,len,cx,y,a[1],COL.pipe,0,Math.PI/2);
  for(let x=a[0]+1;x<b[0];x+=2){cyl(.11,.06,x,y,a[1],'#7a4a2e',0,Math.PI/2);box(.05,y-SEWER.pit,.05,x,(y+SEWER.pit)/2,a[1],'#4a4f52');}}
 // Sewage: a slightly glossy green plane in each channel, scrolled in update().
 const slimeTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.fillStyle='#4d6b22';x.fillRect(0,0,128,128);for(let i=0;i<70;i++){x.fillStyle=`rgba(${150+Math.random()*60|0},${170+Math.random()*60|0},60,${.15+Math.random()*.25})`;x.beginPath();x.ellipse(Math.random()*128,Math.random()*128,2+Math.random()*7,1+Math.random()*3,0,0,7);x.fill();}const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;return t;})();keep.push(slimeTex);
 const slimeMat=new T.MeshStandardMaterial({map:slimeTex,color:'#b9e06a',emissive:'#1f3a08',emissiveIntensity:.6,roughness:.25,metalness:.1});
 for(const ch of CHANNELS){const [x0,x1,z0,z1]=ch.box,m=new T.Mesh(new T.PlaneGeometry(x1-x0,z1-z0),slimeMat);m.rotation.x=-Math.PI/2;m.position.set(...W([(x0+x1)/2,SEWER.sewage,(z0+z1)/2]));slimeTex.repeat.set(4,1);root.add(m);keep.push(m.geometry);}
 // Coping: a steel pipe round the bowl's lip, and the painted depth marks on the deck.
 {const [x0,x1,z0,z1]=BOWL.box,y=BOWL.coping-.03;cyl(.035,x1-x0,(x0+x1)/2,y,z0,'#b8bec2',0,Math.PI/2);cyl(.035,x1-x0,(x0+x1)/2,y,z1,'#b8bec2',0,Math.PI/2);cyl(.035,z1-z0,x0,y,(z0+z1)/2,'#b8bec2',Math.PI/2);cyl(.035,z1-z0,x1,y,(z0+z1)/2,'#b8bec2',Math.PI/2);}
 // The flood: sewage that rises in the bowl with each hit on the Rat King.
 const floodMat=new T.MeshStandardMaterial({map:slimeTex,color:'#b9e06a',emissive:'#1f3a08',emissiveIntensity:.6,roughness:.2,metalness:.1});keep.push(floodMat);
 const flood=new T.Mesh(new T.PlaneGeometry(BOWL.box[1]-BOWL.box[0],BOWL.box[3]-BOWL.box[2]),floodMat);flood.rotation.x=-Math.PI/2;flood.position.set(...W([(BOWL.box[0]+BOWL.box[1])/2,-1.2,(BOWL.box[2]+BOWL.box[3])/2]));flood.visible=false;root.add(flood);keep.push(flood.geometry);
 // Ladders: in (up the shaft to the manhole) and out of the bowl.
 for(const [x,,z] of [LADDERS.in,LADDERS.out]){const H=3;for(const dz of [-.18,.18])box(.04,H,.04,x,H/2,z+dz,'#8a8f93');for(let y=.2;y<H;y+=.25)box(.04,.03,.36,x,y,z,'#a5aaad');}
 // Work lamps in cages along the walls (emissive) and a few real lights so the tunnels read.
 const lampMat=new T.MeshStandardMaterial({color:COL.lamp,emissive:'#ffb347',emissiveIntensity:2.4});keep.push(lampMat);
 const lamps=[[0,-2.9],[7,-2.9],[13,2.9],[18,-2.9],[24,-5.9],[30,.9],[34,-5.9],[41,-5.9],[44,.9],[50,-7.9],[56,2.9]];
 for(const [x,z] of lamps){const l=new T.Mesh(new T.SphereGeometry(.05,10,8),lampMat);l.position.set(...W([x,1.35,z+(z<0?.1:-.1)]));root.add(l);keep.push(l.geometry);}
 for(const [x,z,i] of [[6,0,1.4],[28,-2.5,1.8],[42,-2.5,1.4],[53,-2,1.6]]){const p=new T.PointLight('#ffd9a0',i,14,1.6);p.position.set(...W([x,1.5,z]));root.add(p);}
 // The manhole in the street above: iron cover with a ring and cast lettering.
 {const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#2f3336';x.beginPath();x.arc(128,128,126,0,7);x.fill();x.strokeStyle='#4a5054';x.lineWidth=10;for(const r of [118,90]){x.beginPath();x.arc(128,128,r,0,7);x.stroke();}
  for(let i=-3;i<=3;i++){x.fillStyle='#454b4f';x.fillRect(40,124+i*14,176,5);}x.fillStyle='#8a9296';x.font='bold 34px system-ui';x.textAlign='center';x.fillText('SEWER',128,60);x.fillText('↓',128,220);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.CircleGeometry(.36,28),new T.MeshStandardMaterial({map:tex,roughness:.5,metalness:.6,polygonOffset:true,polygonOffsetFactor:-2}));
  m.rotation.x=-Math.PI/2;m.position.set(MANHOLE.at[0],MANHOLE.at[1]+.012,MANHOLE.at[2]);street.add(m);keep.push(tex,m.geometry,m.material);}
 const merged=mergeGeometries(parts.map(g=>{if(!g.attributes.normal)g.computeVertexNormals();return g;}),false);parts.forEach(g=>g.dispose());parts.length=0;merged.computeBoundingSphere();
 const shellMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.9,side:T.DoubleSide});const shell=new T.Mesh(merged,shellMat);shell.castShadow=shell.receiveShadow=true;root.add(shell);keep.push(shellMat);
 // Doors. A: a rusty gate with a padlock. C: the trick shrine, a round grate with its combo count.
 const gateMat=new T.MeshStandardMaterial({color:'#7d5a43',roughness:.6,metalness:.5}),lockMat=new T.MeshStandardMaterial({color:'#d8b04a',roughness:.3,metalness:.8});keep.push(gateMat,lockMat);
 const doors={};let shrineSign=null;
 for(const o of OPENINGS)if(o.door){const g=new T.Group(),[s0,s1]=o.span,len=s1-s0,mid=(s0+s1)/2,H=SEWER.ceiling;
  for(let i=0;i<=len/.16;i++){const bar=new T.Mesh(new T.CylinderGeometry(.016,.016,H,6),gateMat);bar.position.set(-len/2+i*.16,H/2,0);g.add(bar);}
  for(const y of [.25,H-.2,H/2]){const rail=new T.Mesh(new T.BoxGeometry(len,.05,.04),gateMat);rail.position.y=y;g.add(rail);}
  if(o.door==='A'){const lock=new T.Mesh(new T.BoxGeometry(.14,.16,.06),lockMat);lock.position.y=.55;g.add(lock);}
  if(o.door==='C'){const c=document.createElement('canvas');c.width=512;c.height=256;const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const sign=new T.Mesh(new T.PlaneGeometry(1.2,.6),new T.MeshBasicMaterial({map:tex,transparent:true}));sign.position.set(0,1.05,-.08);sign.rotation.y=Math.PI;g.add(sign);keep.push(tex,sign.geometry,sign.material);shrineSign={c,tex};}
  g.position.set(...W([o.at,0,mid]));g.rotation.y=Math.PI/2;root.add(g);doors[o.door]=g;}
 const drawShrine=(need,best)=>{if(!shrineSign)return;const x=shrineSign.c.getContext('2d');x.clearRect(0,0,512,256);x.fillStyle='rgba(20,30,34,.86)';x.fillRect(0,0,512,256);x.strokeStyle='#ffc23a';x.lineWidth=8;x.strokeRect(6,6,500,244);
  x.fillStyle='#ffc23a';x.font='italic 900 52px system-ui';x.textAlign='center';x.fillText(`${need}-TRICK COMBO`,256,92);x.font='bold 38px system-ui';x.fillStyle='#f3efdc';x.fillText('opens the way',256,148);
  x.font='900 60px system-ui';x.fillStyle=best>=need?'#7dff6a':'#ffffff';x.fillText(`${Math.min(best,need)} / ${need}`,256,222);shrineSign.tex.needsUpdate=true;};
 // Chests (a gold one for the board) and the battery cell.
 const chestMat=new T.MeshStandardMaterial({color:'#b5532d',roughness:.5}),goldMat=new T.MeshStandardMaterial({color:'#e3b341',roughness:.3,metalness:.7});keep.push(chestMat,goldMat);
 const chests={};for(const [id,c] of Object.entries(CHESTS)){const g=new T.Group(),big=c.holds!=='small',s=big?1.5:1,mat=big?goldMat:chestMat;
  const body=new T.Mesh(new T.BoxGeometry(.22*s,.13*s,.15*s),mat);body.position.y=.065*s;g.add(body);const lid=new T.Group();lid.position.set(0,.13*s,.075*s);
  const top=new T.Mesh(new T.BoxGeometry(.22*s,.05*s,.15*s),mat);top.position.set(0,.025*s,-.075*s);lid.add(top);const band=new T.Mesh(new T.BoxGeometry(.04*s,.06*s,.155*s),big?chestMat:goldMat);band.position.set(0,.02*s,-.075*s);lid.add(band);g.add(lid);
  g.position.set(...W(c.at));g.rotation.y=-Math.PI/2;root.add(g);chests[id]={g,lid};}
 const cellMat=new T.MeshStandardMaterial({color:'#7dff6a',emissive:'#3ad13a',emissiveIntensity:1.2,roughness:.3}),capMat=new T.MeshStandardMaterial({color:'#d9d9d9',metalness:.9,roughness:.25});keep.push(cellMat,capMat);
 const cells={};for(const [id,c] of Object.entries(CELLS)){const g=new T.Group();g.add(new T.Mesh(new T.CylinderGeometry(.035,.035,.1,14),cellMat));const cap=new T.Mesh(new T.CylinderGeometry(.015,.015,.02,10),capMat);cap.position.y=.06;g.add(cap);g.position.set(...W(c.at));root.add(g);cells[id]=g;}
 // The Rat King, asleep in the bowl: a fat grey-brown rat with a tin crown and a long tail.
 const rat=new T.Group(),ratBody=new T.Group();rat.add(ratBody);let fur,crownMesh;{fur=new T.MeshStandardMaterial({color:'#6b5a4c',roughness:.95});const pink=new T.MeshStandardMaterial({color:'#e8a0a8',roughness:.7}),crown=new T.MeshStandardMaterial({color:'#e3b341',metalness:.8,roughness:.3});keep.push(fur,pink,crown);
  const body=new T.Mesh(new T.SphereGeometry(.7,20,14),fur);body.scale.set(1.3,.75,.9);body.position.y=.5;ratBody.add(body);
  const head=new T.Mesh(new T.SphereGeometry(.38,16,12),fur);head.scale.set(1.3,.85,.9);head.position.set(-1,.42,0);ratBody.add(head);
  const nose=new T.Mesh(new T.SphereGeometry(.07,10,8),pink);nose.position.set(-1.48,.4,0);ratBody.add(nose);
  for(const z of [-.22,.22]){const ear=new T.Mesh(new T.CircleGeometry(.17,16),pink);ear.position.set(-.95,.78,z);ear.rotation.y=Math.PI/2;ratBody.add(ear);}
  const c=new T.Mesh(new T.CylinderGeometry(.2,.24,.18,8,1,true),crown);c.position.set(-.95,.92,0);ratBody.add(c);crownMesh=c;
  const tail=new T.Mesh(new T.TorusGeometry(.7,.04,6,24,Math.PI*1.4),pink);tail.position.set(.85,.12,.1);tail.rotation.x=Math.PI/2;ratBody.add(tail);
  ratBody.scale.setScalar(.7);rat.position.set(...W(RAT_KING.at));rat.rotation.y=.4;root.add(rat);
}
 // The battery cell's cage on the deck: it lifts away when the Rat King is freed.
 const cage=new T.Group();{const [x0,x1,z0,z1]=RAT_KING.cage,h=.36,bars=[];for(let x=x0;x<=x1+1e-6;x+=.1)for(const z of [z0,z1])bars.push([x,z]);for(let z=z0+.1;z<z1-1e-6;z+=.1)for(const x of [x0,x1])bars.push([x,z]);
  for(const [x,z] of bars){const b=new T.Mesh(new T.CylinderGeometry(.008,.008,h,6),gateMat);b.position.set(x-(x0+x1)/2,h/2,z-(z0+z1)/2);cage.add(b);keep.push(b.geometry);}
  const lid=new T.Mesh(new T.BoxGeometry(x1-x0+.02,.02,z1-z0+.02),gateMat);lid.position.y=h;cage.add(lid);keep.push(lid.geometry);cage.position.set(...W([(x0+x1)/2,0,(z0+z1)/2]));root.add(cage);}
 const fallenCrown=crownMesh.clone();fallenCrown.scale.setScalar(.7);fallenCrown.visible=false;root.add(fallenCrown);
 if(parts.length){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());const m=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:.6,metalness:.5}));root.add(m);keep.push(g,m.material);}
 let time=0;drawShrine(SHRINE.kid,0);
 scene.add(root);
 return {root,
  setShrine:drawShrine,
  takeCell(id){const g=cells[id];if(g)g.visible=false;},
  openDoor(id){const g=doors[id];if(g)g.userData.opening=0;},
  openChest(id){const c=chests[id];if(c)c.lid.userData.opening=0;},
  freeRat(){crownMesh.visible=false;fallenCrown.visible=true;fallenCrown.userData.t=0;cage.userData.opening=0;},
  /** Draw the tunnels only while the player is in them. */
  show(on){root.visible=on;},
  update(dt,k){time+=dt;slimeTex.offset.x=(time*.05)%1;
   if(k){const y=bowlFloor(k.at[0],k.at[1]),moving=k.state==='roam'||k.state==='charge'||k.state==='back';rat.position.set(...W([k.at[0],y,k.at[1]]));
    if(k.state==='stunned')rat.rotation.y+=dt*7;else{let d=k.heading+Math.PI/2-rat.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d));rat.rotation.y+=d*Math.min(1,dt*8);}
    const rear=k.state==='rear'?Math.min(1,k.t*3):0;ratBody.rotation.z=-.55*rear;ratBody.position.y=moving?Math.abs(Math.sin(time*(k.state==='charge'?26:16)))*.04:k.state==='stunned'?.05+Math.sin(time*9)*.03:0;
    ratBody.children[0].scale.y=.75+Math.sin(time*(k.state==='sleep'||k.state==='freed'?1.6:5))*.03;fur.emissive.set(k.flash>0?'#ff3a2a':'#000000');fur.emissiveIntensity=k.flash>0?k.flash*2:0;
    flood.visible=k.level>-1.1;flood.position.y=W([0,k.level,0])[1];
    if(fallenCrown.visible&&fallenCrown.userData.t<1){const t=fallenCrown.userData.t=Math.min(1,fallenCrown.userData.t+dt*1.2);fallenCrown.position.set(...W([k.at[0]+.6*t,y+.65+Math.sin(t*Math.PI)*.6-(.65-.07)*t,k.at[1]]));fallenCrown.rotation.z=t*2.4;}}
   if(cage.userData.opening!==undefined&&cage.userData.opening<1){cage.userData.opening=Math.min(1,cage.userData.opening+dt*.7);cage.position.y=W([0,0,0])[1]+.5*cage.userData.opening;cage.visible=cage.userData.opening<1;}
   for(const g of Object.values(cells))if(g.visible)g.rotation.y+=dt*2;
   for(const g of Object.values(doors))if(g.userData.opening!==undefined&&g.userData.opening<1){g.userData.opening=Math.min(1,g.userData.opening+dt*.8);g.position.y=W([0,0,0])[1]+SEWER.ceiling*.95*g.userData.opening;}
   for(const c of Object.values(chests))if(c.lid.userData.opening!==undefined&&c.lid.userData.opening<1){c.lid.userData.opening=Math.min(1,c.lid.userData.opening+dt*2.5);c.lid.rotation.x=-1.9*c.lid.userData.opening;}},
  dispose(){street.removeFromParent();street.traverse(o=>o.geometry?.dispose());root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();});[...keep].forEach(x=>x.dispose?.());}};
}
