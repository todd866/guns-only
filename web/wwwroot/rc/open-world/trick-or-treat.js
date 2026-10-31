import * as T from '../../vendor/three.module.js';
import {createTrickOrTreat,stepTrickOrTreat,treatHouses} from './trick-or-treat.mjs';

// Trick-or-treat, drawn (rules in trick-or-treat.mjs): a glowing porch light by each lit door and
// a candy bowl on the step; a house that has given goes dark. A friendly sheet ghost pops up for
// the BOO houses. Instanced: one draw per kind for every house on the base.
export function createTrickOrTreatVisual(scene,porches){
 const houses=treatHouses(porches),state=createTrickOrTreat(houses),root=new T.Group();root.name='TrickOrTreat';
 const lampMat=new T.MeshStandardMaterial({color:'#fff3c4',emissive:'#ffc04a',emissiveIntensity:1.8}),bowlMat=new T.MeshStandardMaterial({color:'#f28a1a',roughness:.5}),candyMat=new T.MeshStandardMaterial({color:'#ffffff',roughness:.4});
 const postMat=new T.MeshStandardMaterial({color:'#2b2b30',roughness:.6}),posts=new T.InstancedMesh(new T.CylinderGeometry(.03,.04,.95,8),postMat,houses.length),lamps=new T.InstancedMesh(new T.SphereGeometry(.12,12,8),lampMat,houses.length),bowls=new T.InstancedMesh(new T.CylinderGeometry(.2,.13,.14,16),bowlMat,houses.length),candy=new T.InstancedMesh(new T.SphereGeometry(.05,8,6),candyMat,houses.length*5);
 const candyAt=[],m=new T.Matrix4(),q=new T.Quaternion(),one=new T.Vector3(1,1,1),c=new T.Color(),colors=['#e8323c','#ffd23a','#7dd13b','#3a8ff0','#f05ab4'];
 houses.forEach((h,i)=>{const f=[Math.sin(h.yaw),Math.cos(h.yaw)],t=[f[1],-f[0]];
  // A lantern on a post on one side of the step, the bowl on the other (the porch pumpkin sits on the step).
  posts.setMatrixAt(i,m.compose(new T.Vector3(h.x-t[0]*.7,h.y+.47,h.z-t[1]*.7),q,one));
  lamps.setMatrixAt(i,m.compose(new T.Vector3(h.x-t[0]*.7,h.y+1.0,h.z-t[1]*.7),q,one));lamps.setColorAt(i,c.set('#ffffff'));
  const bx=h.x+t[0]*.7+f[0]*.2,bz=h.z+t[1]*.7+f[1]*.2;bowls.setMatrixAt(i,m.compose(new T.Vector3(bx,h.y+.07,bz),q,one));
  for(let k=0;k<5;k++){const a=k/5*Math.PI*2+i;candyAt[i*5+k]=new T.Matrix4().compose(new T.Vector3(bx+Math.cos(a)*.09,h.y+.15,bz+Math.sin(a)*.09),q,one);candy.setMatrixAt(i*5+k,candyAt[i*5+k]);candy.setColorAt(i*5+k,c.set(colors[k]));}});
 for(const o of [posts,lamps,bowls,candy]){o.instanceMatrix.needsUpdate=true;if(o.instanceColor)o.instanceColor.needsUpdate=true;o.castShadow=false;root.add(o);}
 // The ghost: a sheet with two eyes, risen from a BOO porch and gone again.
 const ghost=new T.Group(),sheet=new T.Mesh(new T.CapsuleGeometry(.35,.5,6,14),new T.MeshStandardMaterial({color:'#f6f6f2',emissive:'#dfe6ff',emissiveIntensity:.35,transparent:true,opacity:.92}));sheet.position.y=.6;ghost.add(sheet);
 for(const x of [-.12,.12]){const e=new T.Mesh(new T.SphereGeometry(.055,10,8),new T.MeshBasicMaterial({color:'#15151a'}));e.position.set(x,.25,-.33);sheet.add(e);}
 ghost.visible=false;root.add(ghost);let booT=0;
 scene.add(root);
 const dim=i=>{lamps.setColorAt(i,c.set('#2a2a2a'));lamps.instanceColor.needsUpdate=true;for(let k=0;k<5;k++)candy.setMatrixAt(i*5+k,m.makeScale(0,0,0));candy.instanceMatrix.needsUpdate=true;};
 const relight=()=>{houses.forEach((h,i)=>lamps.setColorAt(i,c.set('#ffffff')));lamps.instanceColor.needsUpdate=true;candyAt.forEach((x,j)=>candy.setMatrixAt(j,x));candy.instanceMatrix.needsUpdate=true;};
 return {state,houses,
  /** One frame: rules plus the porch lights and the ghost. Returns the rule events. */
  step(pos,trick,time,dt){const before=state.given.size,ev=stepTrickOrTreat(state,pos,trick,time);
   if(state.given.size<before)relight();
   for(const e of ev){if(e.treat)dim(houses.indexOf(e.house));if(e.boo){const h=e.house;ghost.position.set(h.x,h.y,h.z);ghost.rotation.y=h.yaw+Math.PI;ghost.visible=true;booT=0;}}
   if(ghost.visible){booT+=dt;const k=Math.min(1,booT*3);ghost.children[0].position.y=.6+k*1.4+Math.sin(booT*6)*.08;ghost.scale.setScalar(.4+.6*k);if(booT>2.2)ghost.visible=false;}
   return ev;},
  dispose(){root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});}};
}
