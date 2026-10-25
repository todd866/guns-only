// Optional lines in the plaza's local metre frame. A line supplies an approach
// and a clear runout; it never steers, launches, or teleports the player's car.
// The frame is the image-traced park alignment used by the Blender exporter:
// glTF x=u*cos(a)-v*sin(a), z=-(u*sin(a)+v*cos(a)).
const c=Math.cos(.274),s=Math.sin(.274);
export const bankPoint=(u,v)=>[u*c-v*s,.14,-(u*s+v*c)];
export const bankLocal=p=>[p[0]*c-p[2]*s,-p[0]*s-p[2]*c];
const heading=(a,b)=>Math.atan2(b[0]-a[0],-(b[2]-a[2]));
const entry=bankPoint(3.9,4.0);
const ridge=bankPoint(7.2,7.3);
const exit=bankPoint(10.2,10.3);
export const PARK_HIP_LINE=Object.freeze({entry,exit,ridge,yaw:heading(entry,exit),module:'east-bowl-quarter-hip'});
