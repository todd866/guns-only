import {VISUAL_SCALE} from './physics/car.mjs';

// Fixed authoring dimensions of buggy.glb, including tread, not live BUGGY tuning.
export const MODEL_WHEEL_RADIUS=.1560344845, MODEL_WHEEL_WIDTH=.135, MODEL_HUB_WIDTH=.184;
export function poseCar(group,wheelSet,c){
 // A scaled car (the Legend's bigger tiers, params.scale) is the same model drawn bigger.
 const k=c.params.scale??1,S=VISUAL_SCALE*k;
 group.position.set(...c.pos);group.quaternion.set(...c.q);group.scale.setScalar(S);
 const body=group.getObjectByName('Body');if(body)body.scale.set(c.params.size[0]/(.24*k),.8,1);
 const shell=group.getObjectByName('VehicleBody');if(shell)shell.scale.x=c.params.size[0]/(.24*k);
 // Solid kits cover the open buggy's shock towers; they must not poke through the hood.
 for(const name of ['Mesh_Body_alloy','Mesh_Body_copper']){const o=body?.getObjectByName(name);if(o)o.visible=!shell;}
 wheelSet.forEach((w,i)=>{
  const ws=c.wheels[i],at=c.params.wheels[i].at;
  w.pivot.position.set(at[0]/S,(at[1]-c.params.restLength+ws.compression)/S,at[2]/S);
  w.pivot.rotation.y=w.front?-c.steer:0;w.wheel.rotation.x=ws.spin;
  w.wheel.scale.set(c.params.wheelWidth/((w.wheel.userData.modelWidth??MODEL_WHEEL_WIDTH)*S),c.params.wheelRadius/((w.wheel.userData.modelRadius??MODEL_WHEEL_RADIUS)*S),c.params.wheelRadius/((w.wheel.userData.modelRadius??MODEL_WHEEL_RADIUS)*S));
 });
}
