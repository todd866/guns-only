import * as T from '../../vendor/three.module.js';
import {LZ,BOOSTER,boosterAt,createBoosterClock,stepBooster} from './booster.mjs';

// The landing booster, drawn (timing in booster.mjs): a white 41 m stage with a black interstage,
// four grid fins and four legs that swing out near the ground, a landing flame, a steam cloud on
// touchdown, and the LZ-1 pad (a concrete circle with a yellow ring and an X). Unfogged, so it reads
// from across the base. heightAt(x, z) is the ground there.
export function createBooster(scene,heightAt=()=>0){
 const root=new T.Group();root.name='Booster';const keep=[],K=x=>(keep.push(x),x);
 const M=(c,o={})=>K(new T.MeshStandardMaterial({color:c,roughness:.5,fog:false,...o}));
 const [px,pz]=LZ.at,py=heightAt(px,pz);
 // The pad.
 const pad=new T.Mesh(K(new T.CylinderGeometry(LZ.radius,LZ.radius,.3,48)),M('#b9b6ad',{roughness:.95}));pad.position.set(px,py+.15,pz);pad.receiveShadow=true;root.add(pad);
 const ring=new T.Mesh(K(new T.RingGeometry(LZ.radius*.62,LZ.radius*.7,48)),M('#f2c230'));ring.rotation.x=-Math.PI/2;ring.position.set(px,py+.31,pz);root.add(ring);
 for(const a of [Math.PI/4,-Math.PI/4]){const bar=new T.Mesh(K(new T.PlaneGeometry(LZ.radius*1.1,3.2)),M('#f2c230'));bar.rotation.set(-Math.PI/2,0,a);bar.position.set(px,py+.32,pz);root.add(bar);}
 // The stage, origin at the engine end.
 const stage=new T.Group();stage.position.set(px,py,pz);root.add(stage);
 const white=M('#f4f4f2'),black=M('#1c1d20'),soot=M('#5a5650',{roughness:.8});
 const tube=(r,h,y,m)=>{const o=new T.Mesh(K(new T.CylinderGeometry(r,r,h,32)),m);o.position.y=y;o.castShadow=true;stage.add(o);return o;};
 tube(1.85,33,2.5+16.5,white);tube(1.85,5,2.5+33+2.5,black);tube(1.85,2.5,1.25,soot);
 const bell=new T.Mesh(K(new T.CylinderGeometry(.55,1.4,1.4,20,1,true)),M('#3a3530',{metalness:.6,side:T.DoubleSide}));bell.position.y=-.5;stage.add(bell);
 for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,fin=new T.Mesh(K(new T.BoxGeometry(1.6,1.6,.15)),M('#6d6f72',{metalness:.5}));fin.position.set(Math.sin(a)*2.4,38,Math.cos(a)*2.4);fin.rotation.y=a;stage.add(fin);}
 const legs=[];for(let i=0;i<4;i++){const a=i*Math.PI/2,pivot=new T.Group();pivot.position.set(Math.sin(a)*1.85,6.5,Math.cos(a)*1.85);pivot.rotation.y=a;stage.add(pivot);
  const leg=new T.Mesh(K(new T.BoxGeometry(.5,9,.35)),black);leg.position.y=4.5;pivot.add(leg);legs.push(pivot);}
 // The landing flame: a long orange plume with a hot blue-white core, additive so it glows.
 const flame=new T.Group();const plume=new T.Mesh(K(new T.ConeGeometry(2.2,26,20,1,true)),K(new T.MeshBasicMaterial({color:'#ffb347',transparent:true,opacity:.75,blending:T.AdditiveBlending,depthWrite:false,fog:false})));plume.rotation.x=Math.PI;plume.position.y=-13;flame.add(plume);
 const core=new T.Mesh(K(new T.ConeGeometry(.8,12,16,1,true)),K(new T.MeshBasicMaterial({color:'#dfefff',transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false,fog:false})));core.rotation.x=Math.PI;core.position.y=-6;flame.add(core);stage.add(flame);
 // Steam and dust on touchdown.
 const steamMat=K(new T.MeshStandardMaterial({color:'#f0efe9',transparent:true,opacity:.5,depthWrite:false,fog:false})),puffs=[];
 for(let i=0;i<10;i++){const p=new T.Mesh(K(new T.SphereGeometry(4,12,8)),steamMat);const a=i/10*Math.PI*2;p.userData={a,r:4+Math.random()*4};p.visible=false;root.add(p);puffs.push(p);}
 scene.add(root);
 const clock=createBoosterClock();let steamT=-1;
 return {clock,
  /** One frame. Returns booster events (boom, burn, landed) with the distance to the pad. */
  step(dt,pos){const ev=stepBooster(clock,dt),s=boosterAt(clock.t);
   stage.visible=s.phase!=='away';stage.position.y=py+s.y;
   flame.visible=s.phase==='burn';if(flame.visible){const k=.85+.25*Math.sin(clock.t*40);flame.scale.set(1,k*Math.min(1,s.v/40+.35),1);}
   const out=s.phase==='landed'?1:s.phase==='burn'?Math.max(0,Math.min(1,(BOOSTER.legsAt-s.y)/30)):0;for(const l of legs)l.rotation.x=2.4*out;   // hinged at the top of the engine bay, folded up; out = down and outward to the pad
   if(ev.some(e=>e.landed))steamT=0;
   if(steamT>=0){steamT+=dt;const k=Math.min(1,steamT/4);for(const p of puffs){p.visible=steamT<9;p.position.set(px+Math.sin(p.userData.a)*(p.userData.r+k*18),py+2+k*5,pz+Math.cos(p.userData.a)*(p.userData.r+k*18));p.scale.setScalar(.6+k*1.6);}steamMat.opacity=.5*(1-Math.max(0,steamT-4)/5);if(steamT>9)steamT=-1;}
   const d=Math.hypot(pos[0]-px,pos[2]-pz);return ev.map(e=>({...e,distance:d}));},
  dispose(){root.removeFromParent();keep.forEach(x=>x.dispose?.());}};
}
