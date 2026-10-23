import {RESIDENTIAL_PARK} from './residential-frame.mjs';
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {courseFromGlb} from '../physics/district.mjs';
import {createWorld} from '../physics/world.mjs';
import {placeDistrictCourse} from './district-placement.mjs';
import {clipDistrictTriangle} from './district-entrances.mjs';
import {DISTRICT_ZONES,districtOffset} from './district-zones.mjs';
import {districtApron} from './district-aprons.mjs';

// Districts and the residential skatepark are prepared before driving. Standalone GLBs remain untouched.
export async function prepareDistricts(world){
 const entries=[];
 for(const id of [...Object.keys(DISTRICT_ZONES),'skatepark']){
  const zone=id==='skatepark'?null:id,clip=vertices=>zone?clipDistrictTriangle(zone,vertices):[vertices],placement=zone?{anchor:districtOffset(zone)}:RESIDENTIAL_PARK;
  const response=await fetch(`./assets/districts/${id}.glb`);if(!response.ok)throw Error(`District ${id} unavailable (${response.status})`);
  const buffer=await response.arrayBuffer(),native=courseFromGlb(buffer),cut=createWorld();
  for(const t of native.world.tris)for(const [a,b,c]of clip([t.a,t.b,t.c]))cut.addTri(a,b,c,t.surface);
  const course=placeDistrictCourse({...native,world:cut},placement);
  for(const t of course.world.tris)world.addTri(t.a,t.b,t.c,t.surface);
  if(id!=='skatepark'){const apron=districtApron(id);world.addQuad(...apron.vertices,apron.surface);}
  course.world=world;entries.push({id,zone,clip,placement,buffer,course});
 }
 const roots=[];
 return {courses:new Map(entries.map(e=>[e.id,e.course])),async attach(scene){
  for(const {id,zone,clip,placement,buffer}of entries){const gltf=await new GLTFLoader().parseAsync(buffer,'./assets/districts/'),root=new T.Group();root.name=`District_${id}`;root.position.set(...placement.anchor);root.rotation.y=placement.yaw??0;gltf.scene.updateMatrixWorld(true);
   gltf.scene.traverse(o=>{if(!o.isMesh||!o.name.startsWith('VIS_'))return;const source=o.geometry.clone().applyMatrix4(o.matrixWorld),g=source.index?source.toNonIndexed():source,attributes=['position','normal','uv','color'].filter(name=>g.attributes[name]).map(name=>[name,g.attributes[name]]),data=Object.fromEntries(attributes.map(([name])=>[name,[]]));
    for(let i=0;i<g.attributes.position.count;i+=3){const vertices=[0,1,2].map(k=>attributes.flatMap(([,a])=>Array.from({length:a.itemSize},(_,j)=>a[['getX','getY','getZ','getW'][j]](i+k))));for(const tri of clip(vertices))for(const v of tri){let at=0;for(const [name,a]of attributes){data[name].push(...v.slice(at,at+a.itemSize));at+=a.itemSize;}}}
    if(data.position.length){const geometry=new T.BufferGeometry();for(const [name,a]of attributes)geometry.setAttribute(name,new T.Float32BufferAttribute(data[name],a.itemSize));geometry.computeBoundingSphere();const mesh=new T.Mesh(geometry,o.material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}if(g!==source)g.dispose();source.dispose();
   });
   // Materials belong to the attached mesh set; source geometry is no longer used.
   gltf.scene.traverse(o=>o.geometry?.dispose());scene.add(root);roots.push(root);
   if(id==='skatepark')continue;
   const apron=districtApron(id),[a,b,c,d]=apron.vertices,geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));geometry.computeVertexNormals();
   const threshold=new T.Mesh(geometry,new T.MeshStandardMaterial({color:apron.color,roughness:.9}));threshold.name=`Threshold_${id}`;threshold.receiveShadow=true;scene.add(threshold);roots.push(threshold);
  }
 },dispose(){const materials=new Set(),textures=new Set();for(const root of roots){root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});}for(const m of materials)m.dispose();for(const t of textures)t.dispose();roots.length=0;}};
}
