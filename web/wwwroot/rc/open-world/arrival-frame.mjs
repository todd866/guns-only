// Main entrance follows the source road between the gate and the service junction.
export const ARRIVAL_ORIGIN=[-607,-28.7];
export const ARRIVAL_YAW=Math.atan2(34.1,24.8);
export const ARRIVAL_START={pos:[ARRIVAL_ORIGIN[0]-Math.sin(ARRIVAL_YAW)*6,0,ARRIVAL_ORIGIN[1]+Math.cos(ARRIVAL_YAW)*6],yaw:ARRIVAL_YAW};
export function orientArrival(root){
 // Authored arrival assets use the original north-facing gate frame.
 const c=Math.cos(ARRIVAL_YAW),s=Math.sin(ARRIVAL_YAW),x=-607,z=-29;
 root.rotation.y=-ARRIVAL_YAW;
 root.position.set(ARRIVAL_ORIGIN[0]-(x*c-z*s),0,ARRIVAL_ORIGIN[1]-(x*s+z*c));
 return root;
}
