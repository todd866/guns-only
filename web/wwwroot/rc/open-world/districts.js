import {finishSkateparkSurface} from './skatepark-materials.js';
import {RESIDENTIAL_PARK} from './residential-frame.mjs';
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {courseFromGlb} from '../physics/district.mjs';
import {createWorld} from '../physics/world.mjs';
import {placeDistrictCourse} from './district-placement.mjs';
import {clipDistrictTriangle} from './district-entrances.mjs';
import {DISTRICT_ZONES,districtOffset} from './district-zones.mjs';
import {districtApron} from './district-aprons.mjs';
import {fetchAssetBuffer} from '../asset-buffer.mjs';
import {introBermOverlays,clipIntroTurf} from './intro-berm-overlay.mjs';
import {perimeterSkirts} from './park-skirt.mjs';

// Districts listed in `eager` (all of them by default) are prepared before driving. The runtime
// passes only the starting ones in the browser: the others are 1-2 km away, so they download after attach and join
// the world as they arrive; `loadRest()` settles once every district is in. Standalone GLBs remain untouched.
export async function prepareDistricts(world,{eager=[...Object.keys(DISTRICT_ZONES),'skatepark']}={}){
 let paintTexture=null,scene=null,disposed=false;
 const ids=[...Object.keys(DISTRICT_ZONES),'skatepark'],entries=[],courses=new Map();
 const load=id=>fetchAssetBuffer(`./assets/districts/${id}.glb`).then(buffer=>({id,buffer,native:courseFromGlb(buffer)}));
 // Collision insertion stays deterministic within each batch: results are consumed in catalog order.
 const insert=({id,buffer,native})=>{
  const zone=id==='skatepark'?null:id,clip=vertices=>zone?clipDistrictTriangle(zone,vertices):[vertices],placement=zone?{anchor:districtOffset(zone)}:RESIDENTIAL_PARK;
  const cut=createWorld();
  for(const t of native.world.tris)for(const [a,b,c]of clip([t.a,t.b,t.c]))cut.addTri(a,b,c,t.surface);
  const course=placeDistrictCourse({...native,world:cut},placement);
  for(const t of course.world.tris)world.addTri(t.a,t.b,t.c,t.surface);
  if(id!=='skatepark'){const apron=districtApron(id);world.addQuad(...apron.vertices,apron.surface);}
  else for(const q of perimeterSkirts(course.world))world.addQuad(...q,'concrete');   // never under the slab (park-skirt.mjs)
  course.world=world;const entry={id,zone,clip,placement,buffer,course};entries.push(entry);courses.set(id,course);return entry;
 };
 for(const d of await Promise.all(ids.filter(id=>eager.includes(id)).map(load)))insert(d);
 const rest=ids.filter(id=>!eager.includes(id));let ready=null;
 // Idempotent: the game calls this once the player is driving, a jump calls it before arriving.
 const loadRest=()=>ready??=Promise.all(rest.map(load)).then(async decoded=>{for(const d of decoded){if(disposed)return;const entry=insert(d);if(scene)await attachEntry(entry);}});
 const roots=[];
 async function attachEntry({id,clip,placement,buffer}){if(disposed)return;const gltf=await new GLTFLoader().parseAsync(buffer,'./assets/districts/'),root=new T.Group();root.name=`District_${id}`;root.position.set(...placement.anchor);root.rotation.y=placement.yaw??0;gltf.scene.updateMatrixWorld(true);
   const introPathOverlays=[];let introPathMesh=null,introPathAttributes=null,introPathData=null;
   gltf.scene.traverse(o=>{if(!o.isMesh||!o.name.startsWith('VIS_'))return;const source=o.geometry.clone().applyMatrix4(o.matrixWorld),g=source.index?source.toNonIndexed():source,attributes=['position','normal','uv','color'].filter(name=>g.attributes[name]).map(name=>[name,g.attributes[name]]),data=Object.fromEntries(attributes.map(([name])=>[name,[]]));
    for(let i=0;i<g.attributes.position.count;i+=3){const vertices=[0,1,2].map(k=>attributes.flatMap(([,a])=>Array.from({length:a.itemSize},(_,j)=>a[['getX','getY','getZ','getW'][j]](i+k))));if(id==='skatepark'&&o.material?.name==='turf')introPathOverlays.push(...introBermOverlays(vertices));for(const tri of id==='skatepark'&&o.material?.name==='turf'?clipIntroTurf(vertices):clip(vertices))for(const v of tri){let at=0;for(const [name,a]of attributes){data[name].push(...v.slice(at,at+a.itemSize));at+=a.itemSize;}}}
    if(data.position.length){const geometry=new T.BufferGeometry();for(const [name,a]of attributes)geometry.setAttribute(name,new T.Float32BufferAttribute(data[name],a.itemSize));geometry.computeBoundingSphere();if(id==='skatepark'&&o.material?.name!=='path')finishSkateparkSurface(geometry,o.material,paintTexture);const mesh=new T.Mesh(geometry,o.material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);if(id==='skatepark'&&o.material?.name==='path'){introPathMesh=mesh;introPathAttributes=attributes;introPathData=data;}}if(g!==source)g.dispose();source.dispose();
   });
   if(introPathMesh&&introPathData)for(const tri of introPathOverlays){const ab=tri[1].map((v,i)=>v-tri[0][i]),ac=tri[2].map((v,i)=>v-tri[0][i]),n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],l=Math.hypot(...n)||1;for(const v of tri)for(const [name,a]of introPathAttributes){const values=name==='position'?v:name==='normal'?n.map(x=>x/l):name==='uv'?[v[0]/3,v[2]/3]:name==='color'?Array(a.itemSize).fill(1):Array(a.itemSize).fill(0);introPathData[name].push(...values.slice(0,a.itemSize));}}
   if(introPathMesh&&introPathData){const old=introPathMesh.geometry,geometry=new T.BufferGeometry();for(const [name,a]of introPathAttributes)geometry.setAttribute(name,new T.Float32BufferAttribute(introPathData[name],a.itemSize));geometry.computeBoundingSphere();finishSkateparkSurface(geometry,introPathMesh.material,paintTexture);introPathMesh.geometry=geometry;old.dispose();}
   // Materials belong to the attached mesh set; source geometry is no longer used.
   gltf.scene.traverse(o=>o.geometry?.dispose());scene.add(root);roots.push(root);
   if(id==='skatepark')return;
   const apron=districtApron(id),[a,b,c,d]=apron.vertices,geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));geometry.computeVertexNormals();
   const threshold=new T.Mesh(geometry,new T.MeshStandardMaterial({color:apron.color,roughness:.9}));threshold.name=`Threshold_${id}`;threshold.receiveShadow=true;scene.add(threshold);roots.push(threshold);
 }
 return {courses,loadRest,async attach(target){
  scene=target;
  paintTexture=await new T.TextureLoader().loadAsync(new URL('../assets/materials/park-paint-atlas.webp',import.meta.url).href);
  paintTexture.colorSpace=T.SRGBColorSpace;paintTexture.flipY=false;paintTexture.wrapS=T.RepeatWrapping;paintTexture.anisotropy=8;
  for(const entry of [...entries])await attachEntry(entry);
 },dispose(){disposed=true;const materials=new Set(),textures=new Set();for(const root of roots){root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});}for(const m of materials)m.dispose();for(const t of textures)t.dispose();roots.length=0;}};
}
