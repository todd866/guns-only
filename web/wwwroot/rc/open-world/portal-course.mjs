// Night Wave lives in the alien frame. Heights are shared by rendering, collision,
// recovery and the race line. The base mouth remains at Dreamland's original apron.
const ALIEN_OFFSET = [8700, 1400];
const BASE_PORTAL_POINTS = [
 [2500,-1200,0],[2530,-1200,0],[2570,-1220,4],[2605,-1260,10],
 [2620,-1320,14],[2600,-1380,17],[2550,-1410,18],[2490,-1415,15],
 [2435,-1390,12],[2405,-1340,14],[2415,-1290,12],[2445,-1250,6],
 [2470,-1220,0],[2470,-1200,0],[2500,-1200,0]
];
export const PORTAL_POINTS = BASE_PORTAL_POINTS.map(([x,z,y]) => [x + ALIEN_OFFSET[0], z + ALIEN_OFFSET[1], y]);
export const PORTAL_EVENT={id:'night-wave',name:'Night Wave Portal',location:'lab',kind:'circuit',night:true,alien:true,authored:true,points:PORTAL_POINTS,half:8,medals:[70,90,120]};
export function portalHeight(x,z){let best=Infinity,height=0;for(let i=1;i<PORTAL_POINTS.length;i++){const a=PORTAL_POINTS[i-1],b=PORTAL_POINTS[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);if(d<best){best=d;height=a[2]+(b[2]-a[2])*t;}}return {height,distance:best};}
export function portalSections(){const points=PORTAL_POINTS.map(([x,z,y])=>[x,y,z]);return points.slice(0,-1).map((a,i)=>{const b=points[i+1],prev=points[(i+points.length-2)%(points.length-1)],next=points[(i+2)%(points.length-1)];const normal=(p,q)=>{const d=Math.hypot(q[0]-p[0],q[2]-p[2]);return [-(q[2]-p[2])/d,(q[0]-p[0])/d];};return {a,b,na:normal(prev,b),nb:normal(a,next)};});}
