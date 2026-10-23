import * as T from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { addBox } from '../physics/world.mjs';
import { CLASSIC_LOCATIONS, CLASSIC_EVENTS } from './classic-courses.mjs';

export function createClassicCourses(scene, world) {
  if (!scene?.add) throw new TypeError('createClassicCourses requires a scene');
  const root = new T.Group(); root.name = 'ClassicCourses'; scene.add(root);
  const mats = new Map(), dynamic = [];
  const mat = (c, rough = .78) => { const k = c + rough; if (!mats.has(k)) mats.set(k, new T.MeshStandardMaterial({ color: c, roughness: rough })); return mats.get(k); };
  const box = (p,x,y,z,w,h,d,c,solid=false) => { const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);p.add(m);if(solid&&world?.addTri)addBox(world,x,z,w,d,y-h/2,y+h/2,'wood');return m; };
  const cyl = (p,x,y,z,r,h,c) => { const m=new T.Mesh(new T.CylinderGeometry(r,r,h,10),mat(c));m.position.set(x,y,z);p.add(m);return m; };
  const beam = (p,a,b,width,y,c) => { const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),m=box(p,(a[0]+b[0])/2,y,(a[1]+b[1])/2,width,.18,len,c);m.rotation.y=Math.atan2(dx,dz);return m; };
  const surface=(a,b,width,surfaceName)=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,rx=-dz/len*width/2,rz=dx/len*width/2;
    const A=[a[0]-rx,a[2],a[1]-rz],B=[a[0]+rx,a[2],a[1]+rz],C=[b[0]+rx,b[2],b[1]+rz],D=[b[0]-rx,b[2],b[1]-rz];
    world.addQuad(A,B,C,D,surfaceName);const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([...A,...B,...C,...A,...C,...D],3));geo.computeVertexNormals();const mesh=new T.Mesh(geo,mat(surfaceName==='wood'?'#9c704b':surfaceName==='dirt'?'#a7835e':'#535d65'));mesh.receiveShadow=true;root.add(mesh);
  };
  const dyn = name => { const g=new T.Group();g.name=name;g.userData.dynamic=true;root.add(g);dynamic.push(g);return g; };

  // Base Traffic: broad road loop with lane furniture and moving base vehicles.
  const traffic = new T.Group();traffic.name='Course_base-traffic';root.add(traffic);
  for(const [x,z] of [[-470,40],[-350,180],[-430,430],[-546,720],[-720,660],[-850,450]]){cyl(traffic,x,.18,z,.22,.36,'#d5b46a');cyl(traffic,x,.42,z,.08,.5,'#52727a');}
  for(const [x,z] of [[-390,80],[-790,520],[-650,680]]){box(traffic,x,.16,z,4,.32,1.2,'#e9e1be');box(traffic,x,.38,z,3,.14,.12,'#c7b679');}
  const vans=dyn('BaseTraffic_moving'); vans.userData.role='deterministic traffic; yields before trapping';
  const serviceVehicle=(g,color,index)=>{
    // Compact utility vans: cab, glazed windscreen, grille, bumpers and four wheels.
    box(g,0,.48,.15,2.2,.68,3.7,color); box(g,0,.92,-.48,2.0,.42,1.35,color);
    box(g,0,1.04,-1.18,1.48,.22,.05,'#273d45');
    for(const x of [-1.01,1.01]){box(g,x,1.01,-.47,.035,.25,.9,'#273d45');box(g,x,.72,-.2,.04,.04,.15,'#566469');}
    for(const x of [-.76,.76])box(g,x,.63,-1.72,.3,.16,.08,'#f2e9c5');
    box(g,0,.47,-1.74,1.55,.22,.08,'#354349');
    box(g,0,.62,1.78,1.7,.14,.12,'#354349');
    for(const x of [-.94,.94]) for(const z of [-1.25,1.25]) {
      const wheel=cyl(g,x,.25,z,.25,.2,'#263438'); wheel.rotation.z=Math.PI/2;
      cyl(g,x,.25,z,.11,.22,index===1?'#d0b77a':'#8a9aa0').rotation.z=Math.PI/2;
    }
  };
  for(let i=0;i<3;i++){const g=new T.Group();g.name=`BaseTraffic_van_${i}`;serviceVehicle(g,['#d8a64e','#7899a4','#a85e54'][i],i);g.position.set(-607+i*25,0,-29);g.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});vans.add(g);}

  // Quarry Run: terraces, ridge walls and a visible rolling foam boulder hazard.
  const quarry=new T.Group();quarry.name='Course_quarry-run';root.add(quarry);
  for(const [x,z,w,d,h] of [[1980,1370,65,8,2],[2140,1450,80,9,3],[2070,1580,70,8,2]])box(quarry,x,h/2,z,w,h,d,'#8e6c4f');
  for(const [x,z,r] of [[2010,1340,4],[2160,1480,5],[2070,1550,3]]){const b=new T.Mesh(new T.DodecahedronGeometry(r,1),mat('#a97953'));b.position.set(x,r*.6,z);quarry.add(b);}
  const rocks=dyn('Quarry_rolling-rocks');rocks.userData.role='soft foam boulder contact';for(let i=0;i<3;i++){const r=new T.Mesh(new T.DodecahedronGeometry(1.8,1),mat('#c38b61'));r.position.set(1990+i*70,1.5,1375+i*55);rocks.add(r);}

  // Demo Team Circuit: hangar-sized pipe tunnel, smooth tarmac loop, tyres on edges.
  const demo=new T.Group();demo.name='Course_demo-team-circuit';root.add(demo);
  box(demo,690,3,450,85,6,10,'#75858a',false);box(demo,645,3,425,3,6,50,'#75858a',false);box(demo,735,3,425,3,6,50,'#75858a',false);
  const pipe=new T.Mesh(new T.CylinderGeometry(4,4,14,20,1,true,0,Math.PI),mat('#b1c6c5'));pipe.rotation.z=Math.PI/2;pipe.position.set(700,4,430);demo.add(pipe);
  for(const [x,z] of [[690,330],[790,350],[640,510],[780,500]])for(const dx of [-2,2])cyl(demo,x+dx,.5,z,.38,.75,'#2c3b3f');

  // After Hours Boardwalk: raised wood deck over lagoon, ramps at both ends, rail gaps.
  const board=dyn('Course_after-hours-boardwalk');board.userData.role='raised boardwalk with shallow recovery shelves';
  const pts=CLASSIC_EVENTS.find(e=>e.id==='after-hours-boardwalk').points;
  for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];surface(a,b,7,'wood');for(const side of [-1,1]){const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len*3.2,nz=dx/len*3.2;beam(board,[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],.12,Math.max(.7,(a[2]+b[2])*.5+1),'#6d513d');}}
  for(const [x,z] of [[-530,3360],[-480,3415],[-575,3415]]){cyl(board,x,1,z,.16,2,'#7a563f');box(board,x,2,z,2.8,.12,.12,'#e0b16c');}

  for (const event of CLASSIC_EVENTS.filter(e => e.id === 'quarry-run' || e.id === 'demo-team-circuit')) for (let i = 1; i < event.points.length; i++) surface(event.points[i - 1], event.points[i], event.half * 2, event.surface);

  // Static batch by material; dynamic hazards remain independent.
  root.updateMatrixWorld(true);const groups=new Map(),staticMeshes=[];
  const hasDynamicAncestor=(object)=>{for(let p=object.parent;p;p=p.parent)if(p.userData?.dynamic)return true;return false;};
  root.traverse(o=>{if(o.isMesh&&!o.userData.dynamic&&!hasDynamicAncestor(o))staticMeshes.push(o);});
  for(const o of staticMeshes){let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index){const f=g.toNonIndexed();g.dispose();g=f;}const k=o.material.color.getHexString();if(groups.has(k))groups.get(k).push(g);else groups.set(k,[g]);o.removeFromParent();o.geometry.dispose();}
  for(const [k,gs] of groups){const g=mergeGeometries(gs,false);gs.forEach(x=>x.dispose());const m=new T.Mesh(g,mat('#'+k));m.name='ClassicStatic_'+k;m.castShadow=m.receiveShadow=true;root.add(m);}

  const update=(time=0)=>{const t=Number(time)||0;vans.position.set(0,0,0);vans.children.forEach((v,i)=>{v.position.x=-607+i*25+Math.sin(t*.08+i)*9;v.position.z=-29+Math.cos(t*.08+i)*8;v.rotation.y=Math.sin(t*.08+i)*.2;});rocks.children.forEach((r,i)=>{r.position.x=1990+i*70+Math.sin(t*.45+i)*18;r.position.z=1375+i*55+Math.cos(t*.45+i)*10;r.rotation.x=t*.7;r.rotation.z=t*.5;});};
  const stepHazards=(car,dt=1/60,time=0)=>{const pos=car?.pos||car;if(!Array.isArray(pos)||pos.length<3)return[];const t=Number(time)||0,out=[];for(const v of vans.children){const x=vans.position.x+v.position.x,z=vans.position.z+v.position.z;if(Math.hypot(pos[0]-x,pos[2]-z)<4)out.push({type:'traffic-bump',venue:'hq',speedScale:.78,push:[pos[0]-x,0,pos[2]-z],dt});}for(const r of rocks.children){const x=rocks.position.x+r.position.x,z=rocks.position.z+r.position.z;if(Math.hypot(pos[0]-x,pos[2]-z)<4)out.push({type:'rolling-rock',venue:'quarry',speedScale:.65,push:[pos[0]-x,0,pos[2]-z],dt});}return out;};
  const dispose=()=>{root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});mats.clear();};
  return {root,locations:CLASSIC_LOCATIONS,events:CLASSIC_EVENTS,update,stepHazards,dispose};
}
