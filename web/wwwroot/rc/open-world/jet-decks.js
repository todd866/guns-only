import * as T from '../../vendor/three.module.js';
import {createAircraft} from './aircraft-catalog.js';
import {DECK,JET_DECKS,deckTris,rampQuad} from './jet-decks.mjs';

// Jets you can drive on, drawn and made solid (data in jet-decks.mjs).
const wood=()=>{const c=document.createElement('canvas');c.width=64;c.height=256;const x=c.getContext('2d');x.fillStyle='#c79a5e';x.fillRect(0,0,64,256);for(let i=0;i<256;i+=16){x.fillStyle=i%32?'#b78a50':'#d2a868';x.fillRect(0,i,64,14);}x.fillStyle='#f2c230';for(let i=0;i<256;i+=64)x.fillRect(0,i,64,6);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;};

/** Every upward-facing face of `meshes` (above DECK.minY) becomes solid ground in `world`. */
export function addDeck(world,meshes){let n=0;const v=new T.Vector3(),tris=[];
 for(const m of meshes){m.updateMatrixWorld(true);const g=m.geometry,p=g.attributes.position,count=g.index?g.index.count:p.count,at=i=>g.index?g.index.getX(i):i;
  for(let i=0;i<count;i+=3){const tri=[0,1,2].map(k=>v.fromBufferAttribute(p,at(i+k)).applyMatrix4(m.matrixWorld).toArray());tris.push(tri);}}
 for(const [a,b,c] of deckTris(tris)){world.addTri(a,b,c,DECK.surface);n++;}return n;}

/** Marches along the ramp's line for the first point over the deck. Returns { edge: [x, z], top } or null. */
export function findEdge(world,ramp,[s0,s1]){const step=.1*Math.sign(s1-s0);
 for(let s=s0;(s1-s)*step>0;s+=step){const x=ramp.along==='x'?s:ramp.line,z=ramp.along==='x'?ramp.line:s,hit=world.raycast([x,30,z],[0,-1,0],40);
  if(hit&&hit.point[1]>DECK.minY&&hit.surface===DECK.surface){
   // Settle on the deck a little way in, where the skin is past its rounded edge.
   const s2=s+step*DECK.lip*10,x2=ramp.along==='x'?s2:ramp.line,z2=ramp.along==='x'?ramp.line:s2,in2=world.raycast([x2,30,z2],[0,-1,0],40);
   return {edge:[x,z],top:Math.max(hit.point[1],in2?.point[1]??0)};}}
 return null;}

/** A wooden ramp with yellow-striped planks and side skirts, solid on top. */
export function addRamp(parent,world,ramp,edge,top,keep){const {quad}=rampQuad(ramp,edge,top+.02);world.addQuad(...quad,'wood');
 const [a,b,c,d]=quad,g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,8,0,0,1,8,0,8],2));g.computeVertexNormals();
 const tex=wood();tex.wrapS=tex.wrapT=T.RepeatWrapping;const m=new T.MeshStandardMaterial({map:tex,roughness:.85});const top_=new T.Mesh(g,m);top_.castShadow=top_.receiveShadow=true;parent.add(top_);
 // Skirts under both long edges, so it reads as a built ramp, not a floating plank.
 const skirt=new T.MeshStandardMaterial({color:'#8a6238',roughness:.9,side:T.DoubleSide}),sv=[];for(const [p,q] of [[a,d],[b,c]].map(([p,q])=>p[1]<q[1]?[p,q]:[q,p]))sv.push(...p,...q,...[q[0],0,q[2]],...p,...[q[0],0,q[2]],...[p[0],0,p[2]]);
 const sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(sv,3));sg.computeVertexNormals();parent.add(new T.Mesh(sg,skirt));keep.push(g,m,tex,skirt,sg);}

/** The Ramp Rat B-52 and its wing ramp (the petting zoo adds its own in petting-zoo.js). */
export function createJetDecks(scene,world){const root=new T.Group();root.name='JetDecks';const keep=[],decks=[];
 for(const d of JET_DECKS){const g=createAircraft(d.type);g.rotation.y=d.yaw;g.position.set(d.at[0],0,d.at[1]);g.updateMatrixWorld(true);g.position.y=-new T.Box3().setFromObject(g).min.y+.02;root.add(g);g.updateMatrixWorld(true);
  const meshes=[];g.traverse(o=>{if(o.isMesh)meshes.push(o);});const n=addDeck(world,meshes);
  const ramps=d.ramps.map(r=>{const e=findEdge(world,r,r.search);if(e)addRamp(root,world,r,e.edge,e.top,keep);return e&&{...e,line:r.line};});
  const bb=new T.Box3().setFromObject(g);decks.push({id:d.id,tris:n,ramps,box:[bb.min.toArray().map(v=>+v.toFixed(1)),bb.max.toArray().map(v=>+v.toFixed(1))]});}
 scene.add(root);
 return {root,decks,dispose(){root.removeFromParent();root.traverse(o=>o.geometry?.dispose());keep.forEach(x=>x.dispose?.());}};}
