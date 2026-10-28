import {VISUAL_SCALE} from './physics/car.mjs';

// Fixed authoring dimensions of buggy.glb, including tread, not live BUGGY tuning.
export const MODEL_WHEEL_RADIUS=.1560344845, MODEL_WHEEL_WIDTH=.135, MODEL_HUB_WIDTH=.184;
export function poseCar(group,wheelSet,c){
 group.position.set(...c.pos);group.quaternion.set(...c.q);group.scale.setScalar(VISUAL_SCALE);
 const body=group.getObjectByName('Body');if(body)body.scale.set(c.params.size[0]/.24,.8,1);
 const shell=group.getObjectByName('VehicleBody');if(shell)shell.scale.x=c.params.size[0]/.24;
 wheelSet.forEach((w,i)=>{
  const ws=c.wheels[i],at=c.params.wheels[i].at;
  w.pivot.position.set(at[0]/VISUAL_SCALE,(at[1]-c.params.restLength+ws.compression)/VISUAL_SCALE,at[2]/VISUAL_SCALE);
  w.pivot.rotation.y=w.front?-c.steer:0;w.wheel.rotation.x=ws.spin;
  w.wheel.scale.set(c.params.wheelWidth/((w.wheel.userData.modelWidth??MODEL_WHEEL_WIDTH)*VISUAL_SCALE),c.params.wheelRadius/((w.wheel.userData.modelRadius??MODEL_WHEEL_RADIUS)*VISUAL_SCALE),c.params.wheelRadius/((w.wheel.userData.modelRadius??MODEL_WHEEL_RADIUS)*VISUAL_SCALE));
 });
}
