import * as THREE from "../../vendor/three.module.js";
import { createPeachlandExclusion } from "./peachland.js";

// Summer cover: maintained runs still carry grass. These are not snowfields or bare firebreaks.
export function createResortScenery(resort, toWorld, sampleHeight, quality = "desktop") {
  const group = new THREE.Group();
  group.name = `${resort.name} runs and lifts`;
  const ground = [], steel = [], cables = [];
  const tri = (out, a, b, c) => out.push(...a, ...b, ...c);
  const at = (p, lift = 0.5) => [p.x, sampleHeight(p.x, p.z) + lift, p.z];
  for (const run of resort.runs) {
    const points = run.points.map(([lon, lat]) => toWorld(lat, lon));
    if (run.area) {
      const contour = points.slice(0, -1).map(p => new THREE.Vector2(p.x, p.z));
      // Large area polygons would bridge relief. The mapped edges and centreline runs supply
      // terrain-draped clearings; area-only features are covered with short triangle subdivisions.
      const subdivide = (a, b, c, depth = 0) => {
        if (depth < 7 && Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) > 55) {
          const ab=a.clone().lerp(b,.5), bc=b.clone().lerp(c,.5), ca=c.clone().lerp(a,.5);
          subdivide(a,ab,ca,depth+1);subdivide(ab,b,bc,depth+1);subdivide(ca,bc,c,depth+1);subdivide(ab,bc,ca,depth+1);
        } else tri(ground,at(c),at(b),at(a));
      };
      for (const [a,b,c] of THREE.ShapeUtils.triangulateShape(contour, [])) subdivide(points[a],points[b],points[c]);
      continue;
    }
    for (let i=1;i<points.length;i++) {
      const a=points[i-1], b=points[i], length=a.distanceTo(b);
      const side=new THREE.Vector3(b.z-a.z,0,a.x-b.x).normalize().multiplyScalar(run.widthM/2);
      const steps=Math.max(1,Math.ceil(length/24));
      for(let j=0;j<steps;j++) {
        const p=a.clone().lerp(b,j/steps), q=a.clone().lerp(b,(j+1)/steps);
        const l0=at(p.clone().add(side)),r0=at(p.clone().sub(side)),l1=at(q.clone().add(side)),r1=at(q.clone().sub(side));
        tri(ground,l0,l1,r0);tri(ground,r0,l1,r1);
      }
    }
  }
  const box = (p,w,h,d) => {
    const part=new THREE.BoxGeometry(w,h,d).translate(p.x,p.y+h/2,p.z).toNonIndexed();
    steel.push(...part.attributes.position.array);part.dispose();
  };
  for(const lift of resort.lifts) {
    const points=lift.points.map(([lon,lat])=>toWorld(lat,lon));
    if(points.length<2)continue;
    const terminals=[points[0],points.at(-1)];
    for(const p of terminals) box(new THREE.Vector3(...at(p,0)),12,7,18);
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(a.distanceTo(b)/95));
      let previous;
      for(let j=0;j<=steps;j++) {
        const p=a.clone().lerp(b,j/steps);p.y=sampleHeight(p.x,p.z);
        const height=lift.kind==='magic_carpet'?1:13;
        if(j>0 && j<steps && height>1){box(p,1.3,height,1.3);box(p.clone().add(new THREE.Vector3(0,height,0)),7,1,1);}
        const top=p.clone().add(new THREE.Vector3(0,height,0));
        if(previous)for(const offset of [-2.3,2.3]) cables.push(previous.x+offset,previous.y,previous.z,top.x+offset,top.y,top.z);
        previous=top;
      }
    }
  }
  const mesh=(positions,material,name)=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const result=new THREE.Mesh(geometry,material);result.name=name;result.receiveShadow=true;group.add(result);
  };
  mesh(ground,new THREE.MeshStandardMaterial({color:0x4e5731,roughness:1,side:THREE.DoubleSide}),`${resort.name} summer ski runs`);
  mesh(steel,new THREE.MeshStandardMaterial({color:0x636562,roughness:.75}),`${resort.name} lift terminals and surrogate towers`);
  const cableGeometry=new THREE.BufferGeometry();cableGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cables,3));
  group.add(new THREE.LineSegments(cableGeometry,new THREE.LineBasicMaterial({color:0x373b37})));
  group.add(createSubalpineForest(resort,toWorld,sampleHeight,quality));
  return group;
}

function createSubalpineForest(resort,toWorld,sampleHeight,quality) {
  const count=quality==='mobile'?6_000:quality==='balanced'?18_000:55_000;
  const geometry=new THREE.ConeGeometry(7,23,5,1).translate(0,11.5,0);
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});
  const forest=new THREE.InstancedMesh(geometry,material,count);forest.name=`${resort.name} subalpine forest`;
  const dummy=new THREE.Object3D(),color=new THREE.Color(), b=resort.bounds,exclude=createResortExclusion(resort,toWorld);
  const hash=n=>{const v=Math.sin(n*12.9898)*43758.5453;return v-Math.floor(v);};
  const sw=toWorld(b.south,b.west),ne=toWorld(b.north,b.east);
  let placed=0;
  for(let i=0;i<count*4&&placed<count;i++) {
    const p=toWorld(b.south+(b.north-b.south)*hash(i*17+31),b.west+(b.east-b.west)*hash(i*29+47));
    const edge=Math.min(p.x-sw.x,ne.x-p.x,p.z-sw.z,ne.z-p.z);
    if(hash(i*97)>THREE.MathUtils.smoothstep(edge,0,900))continue;
    const y=sampleHeight(p.x,p.z);
    if(exclude(p.x,p.z)||y>2180||hash(i*83)<THREE.MathUtils.smoothstep(y,2010,2180))continue;
    const slope=Math.hypot(sampleHeight(p.x+20,p.z)-sampleHeight(p.x-20,p.z),sampleHeight(p.x,p.z+20)-sampleHeight(p.x,p.z-20))/40;
    if(slope>.95)continue;
    const scale=(.7+hash(i*53)*.65)*(1-THREE.MathUtils.smoothstep(y,1900,2200)*.5);
    dummy.position.set(p.x,y,p.z);dummy.scale.setScalar(scale);dummy.rotation.y=hash(i*67)*Math.PI*2;dummy.updateMatrix();forest.setMatrixAt(placed,dummy.matrix);
    color.setHex(hash(i*71)>.5?0x253b2b:0x324735);forest.setColorAt(placed++,color);
  }
  forest.count=placed;forest.computeBoundingSphere();forest.receiveShadow=true;
  return forest;
}

export function createResortExclusion(resort, toWorld) {
  const features={buildings:resort.buildings, roads:[...resort.roads,
    ...resort.runs.filter(r=>!r.area).map(r=>({paths:[r.points],widthM:r.widthM})),
    ...resort.lifts.map(l=>({paths:[l.points],widthM:12}))]};
  const exclude=createPeachlandExclusion(features,toWorld);
  const areas=resort.runs.filter(r=>r.area).map(r=>r.points.map(([lon,lat])=>toWorld(lat,lon)));
  return (x,z)=>exclude(x,z)||areas.some(points=>{
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const a=points[i],b=points[j];
      if((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
    }
    return inside;
  });
}
