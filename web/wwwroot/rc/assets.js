import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {Box3} from '../vendor/three.module.js';
// Opt-in until the exported artifacts and visual acceptance pass. No network asset service.
export async function loadBuggyAsset(url){
 const gltf=await new GLTFLoader().loadAsync(url);const car=gltf.scene;
 const wheels=['FL','FR','RL','RR'].map(name=>{
  const pivot=car.getObjectByName('Steer_'+name),wheel=car.getObjectByName('Wheel_'+name);
  if(!pivot||!wheel)throw Error(`Invalid RC asset: missing ${name} wheel pivots`);
  return {pivot,wheel,front:name.startsWith('F')};
 });
 const collision=[];car.updateMatrixWorld(true);
 car.traverse(node=>{if(node.name.startsWith('COLLISION_')||node.userData.collision_proxy){collision.push({name:node.name,bounds:new Box3().setFromObject(node)});node.visible=false;}else if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
 return {car,wheels,collision};
}

// Prepared for the reviewed hangar replacement; no scene/course mutation until callers
// have loaded the complete asset set. Proxies use the exact placement of the visuals.
export async function loadHangarAsset(url,position={x:38,y:.04,z:-8}){
 const {proxySolid}=await import('./asset-collision.mjs');
 const gltf=await new GLTFLoader().loadAsync(url),hangar=gltf.scene;
 for(const name of ['Hangar_Root','Floor','Truss_00','Workbench','Toolbox','COLLISION_workbench','COLLISION_toolbox'])
  if(!hangar.getObjectByName(name))throw Error(`Invalid hangar asset: missing ${name}`);
 hangar.position.set(position.x,position.y,position.z);hangar.updateMatrixWorld(true);
 const collision=[];
 hangar.traverse(node=>{
  if(node.name.startsWith('COLLISION_')||node.userData.collision_proxy){
   collision.push(proxySolid(node.name,new Box3().setFromObject(node)));node.visible=false;
  }else if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}
 });
 return {hangar,collision};
}
