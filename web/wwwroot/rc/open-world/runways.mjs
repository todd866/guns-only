// OSM supplies runway axes/ref. Paint dimensions and light spacing are authored visual cues,
// not a surveyed aerodrome-lighting plan or operational navigation data.
const FONT={'0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['111','001','111','100','111'],'3':['111','001','111','001','111'],L:['100','100','100','100','111'],R:['110','101','110','101','101']};
export function runwayFurniture(feature,width){
 const points=feature.geometry.coordinates,paint=[],lights=[];
 for(const [end,index]of [[0,0],[points.length-1,1]]){const p=points[end],q=points[end===0?1:end-1],length=Math.hypot(q[0]-p[0],q[1]-p[1]);if(!length)continue;const f=[(q[0]-p[0])/length,(q[1]-p[1])/length],r=[f[1],-f[0]],P=(x,z)=>[p[0]+r[0]*x+f[0]*z,p[1]+r[1]*x+f[1]*z],rect=(x,z,w,h)=>paint.push([P(x-w/2,z-h/2),P(x+w/2,z-h/2),P(x+w/2,z+h/2),P(x-w/2,z+h/2)]);
  for(const side of [-1,1])for(let x=3;x<width/2-3;x+=3.6)rect(side*x,18,1.8,24);
  const text=String(feature.properties.ref??'').split('/')[index]??'';
  for(let ch=0;ch<text.length;ch++)for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(FONT[text[ch]]?.[row][col]==='1')rect((ch*4+col-(text.length*4-2)/2)*1.1,62+(4-row)*2,1.1,2);
 }
 // Sample continuously along the whole polyline so spacing never restarts at OSM vertices.
 let travelled=0,next=0;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(!len)continue;
  while(next<=travelled+len){const t=(next-travelled)/len;for(const side of [-1,1])lights.push([a[0]+dx*t+dz/len*(width/2+1)*side,a[1]+dz*t-dx/len*(width/2+1)*side]);next+=60;}travelled+=len;
 }
 return {paint,lights};
}
