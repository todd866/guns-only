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
