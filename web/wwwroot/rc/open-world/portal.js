import * as T from '../../vendor/three.module.js';
import {PORTAL_POINTS,portalSections,portalHeight} from './portal-course.mjs';
export function createPortal(scene,world,alienUnlocked=()=>true){
 const root=new T.Group();root.name='NightWavePortal';root.visible=false;scene.add(root);const resources=new Set(),materials=new Set();
 const mat=(color,glow=0)=>{const m=new T.MeshStandardMaterial({color,metalness:.35,roughness:.36,emissive:color,emissiveIntensity:glow});materials.add(m);return m;};
 const add=(g,m,x=0,y=0,z=0)=>{resources.add(g);const o=new T.Mesh(g,m);o.position.set(x,y,z);o.receiveShadow=true;root.add(o);return o;};
 const colors=['#f56b9f','#ed8959','#e7cf58','#69d9a1','#55cadf','#7987ee','#b17cde'].map(c=>mat(c,.48)),rail=mat('#cdefff',1.8),metal=mat('#587985'),lights=[];
 const verts=colors.map(()=>[]),railVerts=[];
 function quad(v,a,b,c,d,surface){v.push(...a,...b,...c,...a,...c,...d);if(surface)world.addQuad(a,b,c,d,surface);}
 for(const {a,b,na,nb} of portalSections()){
  const P=(p,n,w,h=0)=>[p[0]+n[0]*w,p[1]+h+.035,p[2]+n[1]*w];
  for(let lane=0;lane<7;lane++){const l=-4+lane*8/7,r=l+8/7;quad(verts[lane],P(a,na,l),P(a,na,r),P(b,nb,r),P(b,nb,l),'asphalt');}
  for(const side of [-1,1]){
   // Low continuous luminous guardrails prevent an accidental fall without hiding the road.
   const A=P(a,na,side*4),B=P(b,nb,side*4),C=P(b,nb,side*4,.45),D=P(a,na,side*4,.45);
   quad(railVerts,A,B,C,D,'wall');quad(railVerts,D,C,B,A,'wall');
  }
 }
 for(const [i,v]of [...verts,railVerts].entries()){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.computeVertexNormals();add(g,i===7?rail:colors[i]);}
 // Two visible mouths: the original Dreamland ring and the alien-world return ring.
 for(const [x,z,heading]of [[2530,-1200,Math.PI/2],[10000,200,0]]){
  const ring=add(new T.TorusGeometry(5.4,.44,12,64),metal,x,4.8,z);ring.rotation.y=heading;
  const inner=add(new T.TorusGeometry(4.95,.13,8,64),rail,x,4.8,z);inner.rotation.y=heading;
  for(let i=0;i<12;i++){const a=i*Math.PI/6,m=add(new T.SphereGeometry(.19,8,6),colors[i%7],x+Math.cos(a)*5.4*Math.cos(heading),4.8+Math.sin(a)*5.4,z-Math.cos(a)*5.4*Math.sin(heading));lights.push(m);}
 }
 // Floating asteroid fragments frame both the original apron and the alien road.
 const rock=mat('#444269');for(const [cx,cz] of [[2510,-1310],[10000,100]])for(let i=0;i<35;i++){const a=i*2.39996,r=105+(i%5)*8;const m=add(new T.IcosahedronGeometry(1.5+i%4,1),rock,cx+Math.cos(a)*r,20+i%9*2,cz+Math.sin(a)*r);m.rotation.set(i,i*.7,i*.2);}
 const cosmosMaterial=new T.MeshBasicMaterial({color:'#080e2a',side:T.BackSide,fog:false,depthWrite:false});materials.add(cosmosMaterial);const cosmos=add(new T.SphereGeometry(1800,32,16),cosmosMaterial,10000,0,100);cosmos.renderOrder=-10;cosmos.visible=false;
 const starsG=new T.BufferGeometry(),starPos=[];for(const [cx,cz] of [[2510,-1320],[10000,100]])for(let i=0;i<225;i++){const a=i*2.39996,r=80+(i*37%250);starPos.push(cx+Math.cos(a)*r,45+(i*73%180),cz+Math.sin(a)*r);}starsG.setAttribute('position',new T.Float32BufferAttribute(starPos,3));resources.add(starsG);const starMat=new T.PointsMaterial({color:'#d8efff',size:.55,fog:false});materials.add(starMat);const stars=new T.Points(starsG,starMat);root.add(stars);
 // Alien-world owns the hub road through x=10740; add only its final approach.
 if(world?.addQuad){const a=[10740,0,200],b=[11200,0,200],w=5,A=[a[0],a[1]+.035,a[2]-w],B=[a[0],a[1]+.035,a[2]+w],C=[b[0],b[1]+.035,b[2]+w],D=[b[0],b[1]+.035,b[2]-w];world.addQuad(A,B,C,D,'asphalt');const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([...A,...B,...C,...A,...C,...D],3));g.computeVertexNormals();add(g,colors[4]);}
 return {root,update(t,pos){const nearBase=Math.hypot(pos[0]-2530,pos[2]+1200)<750,unlocked=typeof alienUnlocked==='function'?Boolean(alienUnlocked()):Boolean(alienUnlocked),nearAlien=unlocked&&pos[0]>9000;cosmos.visible=nearAlien;root.visible=unlocked&&(nearBase||nearAlien);lights.forEach((l,i)=>l.scale.setScalar(.8+.2*Math.sin(t*2+i)));},dispose(){root.removeFromParent();resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
