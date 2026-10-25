// Optional lines in the plaza's local metre frame. A line supplies an approach
// and a clear runout; it never steers, launches, or teleports the player's car.
const c=Math.cos(.274),s=Math.sin(.274);
export const bankPoint=(x,y)=>[-3.691+x*c-y*s,.14,-(.983+x*s+y*c)];
export const bankLocal=p=>{const x=p[0]+3.691,y=-p[2]-.983;return [x*c+y*s,-x*s+y*c];};
const heading=(a,b)=>Math.atan2(b[0]-a[0],-(b[2]-a[2]));
const ridge=[-3.05,1.5],direction=[-Math.cos(1),-Math.sin(1)];
const entry=bankPoint(ridge[0]-direction[0]*3,ridge[1]-direction[1]*3);
const exit=bankPoint(ridge[0]+direction[0]*6,ridge[1]+direction[1]*6);
export const PARK_HIP_LINE=Object.freeze({entry,exit,yaw:heading(entry,exit)});
