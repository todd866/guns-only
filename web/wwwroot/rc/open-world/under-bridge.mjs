// Fictional brick banks and a disused elevated road: New York street-skating homage.
// Geometry is local [x,y,z]; skate data is [x,z,h], in real metres for the 1:10 car.
export const NY = Object.freeze({center:[452,0,1152],length:64,width:44});
export const NY_BOUNDS = [420,1130,484,1174];
export const bridgeWorld = ([x,y,z]) => [NY.center[0]+x,y,NY.center[2]+z];
export const bridgeLocal = ([x,y,z]) => [x-NY.center[0],y,z-NY.center[2]];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const arc=t=>1-Math.sqrt(Math.max(0,1-t*t));
export const brickHeight=(x,z)=>.04+(2.4+.35*Math.cos(x*Math.PI/12))*arc(clamp((-z-9)/5,0,1));
const rails=[];
const rail=(id,kind,pts)=>rails.push({id,kind,pts});
const rect=(id,kind,x0,x1,z0,z1,h)=>{const p=[[x0,z0,h],[x1,z0,h],[x1,z1,h],[x0,z1,h]];for(let i=0;i<4;i++)rail(`${id}-${i}`,kind,[p[i],p[(i+1)%4]]);};
for(let i=0;i<8;i++)rail(`brick-coping-${i}`,'coping',Array.from({length:29},(_,j)=>{const x=-28+i*7+j/4;return [x,-14,brickHeight(x,-14)+.015];}));
rect('back-wall','ledge',-28,28,-21.4,-21,3.24);
rect('abutment','ledge',20.05,27.95,-19.95,-15.05,3.24);
rect('bank-ledge','ledge',-27.9,-20.1,5.1,8.9,.64);
for(const x of [1.3,6.7])rail(`subway-rail-${x}`,'rail',[[x,-2,1.74],[x,1.8,1.74],[x,5.5,.54]]);
for(let i=0;i<5;i++)rail(`subway-step-${i}`,'edge',[[1.6,2+(i+1)*.7-.06,1.24-(i+1)*.24],[6.4,2+(i+1)*.7-.06,1.24-(i+1)*.24]]);
for(const x of [1.1,6.9])rail(`subway-platform-${x}`,'edge',[[x,-2,1.24],[x,2,1.24]]);
for(let i=0;i<8;i++)rail(`fountain-rim-${i}`,'ledge',Array.from({length:9},(_,j)=>{const a=(i*8+j)*Math.PI/32;return [-11+3.1*Math.cos(a),15+3.1*Math.sin(a),.74];}));
const benches=[[-29,12],[-4,12],[9,20],[25,20]];
for(const [i,[x,z]] of benches.entries())for(const side of [-1,1])rail(`bench-${i}-${side}`,'ledge',[[x-1.5,z+side*.33,.54],[x+1.5,z+side*.33,.54]]);
const planters=[[-30,-5],[30,-5],[-30,20]];
for(const [i,[x,z]] of planters.entries())rect(`planter-${i}`,'ledge',x-.8,x+.8,z-.8,z+.8,.64);
for(const [i,[x,z]] of [[-2,19],[12,2]].entries())rect(`manual-${i}`,'edge',x-2.9,x+2.9,z-.9,z+.9,.64);
for(const x of [19.1,24.9])rail(`cab-launch-${x}`,'edge',[[x,-1.8,.128],[x,2.9,2.196]]);

export function buildUnderBridge(){
  const tris=[],tri=(a,b,c,surface,mat)=>tris.push({a,b,c,surface,mat});
  const quad=(a,b,c,d,mat='paver',surface='concrete')=>{tri(a,b,c,surface,mat);tri(a,c,d,surface,mat);};
  const flat=(x0,x1,z0,z1,h,mat='paver',surface='concrete')=>quad([x0,h,z0],[x0,h,z1],[x1,h,z1],[x1,h,z0],mat,surface);
  const box=(x0,x1,z0,z1,y0,y1,mat,surface='concrete',open='')=>{
    if(!open.includes('t'))flat(x0,x1,z0,z1,y1,mat,surface);
    if(!open.includes('n'))quad([x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],mat,surface);
    if(!open.includes('s'))quad([x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[x0,y0,z1],mat,surface);
    if(!open.includes('w'))quad([x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0],mat,surface);
    if(!open.includes('e'))quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],mat,surface);
  };
  const bank=(x0,x1,z0,z1,y0,y1,mat='bank')=>{
    quad([x0,y0,z0],[x0,y1,z1],[x1,y1,z1],[x1,y0,z0],mat);
    quad([x0,.04,z1],[x0,y1,z1],[x0,y0,z0],[x0,.04,z0],'skirt');
    quad([x1,.04,z0],[x1,y0,z0],[x1,y1,z1],[x1,.04,z1],'skirt');
  };
  for(let x=-32;x<32;x+=2)for(let z=-22;z<22;z+=2)flat(x,x+2,z,z+2,.04,Math.abs(x)>29||Math.abs(z)>19?'border':(x/2+z/2)%3===0?'paver-dark':'paver');
  for(let x=-28;x<28;x+=1)for(let z=-18;z<-9;z+=.25){
    const p=[[x,z],[x,z+.25],[x+1,z+.25],[x+1,z]].map(([u,v])=>[u,brickHeight(u,v),v]);
    quad(...p,z<-14?'brick-deck':'brick','bowl');
  }
  for(const x of [-28,28])for(let z=-18;z<-9;z+=.125){const p=[[x,.04,z],[x,brickHeight(x,z),z],[x,brickHeight(x,z+.125),z+.125],[x,.04,z+.125]];x<0?quad(...p,'skirt'):quad(p[3],p[2],p[1],p[0],'skirt');}
  box(-28,28,-21.4,-21,.04,3.24,'wall');
  // The deck is a closed retired span, independent of the live road network.
  box(-31,31,-21,-11,7.7,8.2,'road','asphalt');
  quad([-31,7.7,-11],[-31,7.7,-21],[31,7.7,-21],[31,7.7,-11],'soffit','metal');
  for(const z of [-20.8,-11.2])box(-31,31,z-.12,z+.12,8.2,8.85,'granite');
  for(const z of [-20,-12])box(-31,31,z-.16,z+.16,7.2,7.7,'steel','metal');
  for(const x of [-29,-6,6,29])for(const z of [-19.5,-11.5]){
    const base=Math.abs(x)<28?brickHeight(x,z):.04;
    box(x-.42,x+.42,z-.42,z+.42,base,7.7,'pillar');
    box(x-.7,x+.7,z-.65,z+.65,base,base+.25,'granite');
  }
  for(let x=-29;x<30;x+=6)flat(x,x+3,-16.07,-15.93,8.22,'stripe');
  for(const x of [-30,30])box(x-.2,x+.2,-20.8,-11.2,8.2,9,'barrier');
  // Accessible abutment with a broad landing on the brick bank below.
  box(20,28,-20,-15,.04,3.24,'abutment','concrete','w');
  quad([8,.04,-20],[8,.04,-18.5],[20,3.24,-18.5],[20,3.24,-20],'access');
  // Three separate straight lines: bank to granite, subway steps, and the cab.
  bank(-28,-20,-3,2,.04,1.24);box(-28,-20,5,9,.04,.64,'granite');bank(-28,-20,9,13,.64,.04,'ledge-return');
  bank(1,7,-8,-2,.04,1.24,'subway-bank');flat(1,7,-2,2,1.24,'steps');
  for(let i=0;i<5;i++)box(1,7,2+i*.7,2+(i+1)*.7,.04,1.24-(i+1)*.24,'steps');
  bank(19,25,-2,3,.04,2.24,'cab-bank');
  box(19.7,24.3,5.1,7.5,.3,1.2,'cab');box(20.6,23.5,5.3,7.3,1.2,1.65,'glass');
  flat(20.6,23.5,5.3,7.3,1.655,'cab');box(21.6,22.4,6,6.6,1.655,1.8,'taxi');
  for(const x of [20.5,23.5])for(const z of [5.05,7.55])box(x-.32,x+.32,z-.14,z+.14,.04,.64,'tyre','rubber');
  for(const z of [5.08,7.52])box(19.8,24.2,z-.04,z+.04,.55,.7,'steel','metal');
  bank(8,14,8,12,.04,1.24,'hydrant-bank');
  box(10.8,11.2,14.8,15.2,.04,.64,'hydrant','metal');box(10.65,11.35,14.9,15.1,.35,.48,'hydrant','metal');
  box(27.3,27.9,14.7,15.3,.04,.95,'news','metal');flat(27.35,27.85,14.75,15.25,.955,'paper');
  // The fountain is drained: its inner bank is rideable, with a broad granite rim.
  const rings=[[0,.08],[2,.08],[2.8,.74],[3.4,.74],[4.2,.04]];
  for(let k=1;k<rings.length;k++)for(let i=0;i<64;i++){
    const [r0,h0]=rings[k-1],[r1,h1]=rings[k],p=(r,h,j)=>[-11+r*Math.cos(j*Math.PI/32),h,15+r*Math.sin(j*Math.PI/32)];
    if(!r0)tri(p(0,h0,i),p(r1,h1,i+1),p(r1,h1,i),'concrete','basin');
    else quad(p(r0,h0,i),p(r0,h0,i+1),p(r1,h1,i+1),p(r1,h1,i),k===3?'rim':k===2?'basin-bank':'fountain-bank');
  }
  bank(-14,-8,4,8,.04,1.09,'fountain-launch');
  for(const [x,z] of benches){box(x-1.5,x+1.5,z-.35,z+.35,.44,.54,'bench');for(const dx of [-1.1,1.1])box(x+dx-.06,x+dx+.06,z-.25,z+.25,.04,.44,'steel','metal');}
  for(const [x,z] of planters){for(const r of [[x-.9,x+.9,z-.9,z-.6],[x-.9,x+.9,z+.6,z+.9],[x-.9,x-.6,z-.6,z+.6],[x+.6,x+.9,z-.6,z+.6]])box(...r,.04,.64,'granite');flat(x-.6,x+.6,z-.6,z+.6,.5,'soil','dirt');}
  for(const [x,z] of [[-2,19],[12,2]]){box(x-3,x+3,z-1,z+1,.04,.64,'granite','concrete','w');quad([x-5,.04,z-1],[x-5,.04,z+1],[x-3,.64,z+1],[x-3,.64,z-1],'manual-bank');}
  for(const r of rails.filter(r=>r.kind==='coping'||r.kind==='rail'))for(let i=1;i<r.pts.length;i++){
    const [x,z,h]=r.pts[i-1],[u,v,k]=r.pts[i],n=Math.hypot(u-x,v-z),ox=-(v-z)/n*.045,oz=(u-x)/n*.045;
    quad([x+ox,h,z+oz],[u+ox,k,v+oz],[u-ox,k,v-oz],[x-ox,h,z-oz],'steel',r.kind==='coping'?'bowl':'metal');
    if(r.kind==='rail'){
      quad([x-ox,h-.07,z-oz],[x-ox,h,z-oz],[u-ox,k,v-oz],[u-ox,k-.07,v-oz],'steel','metal');
      quad([u+ox,k-.07,v+oz],[u+ox,k,v+oz],[x+ox,h,z+oz],[x+ox,h-.07,z+oz],'steel','metal');
      for(const t of [0,.5,1]){const px=x+(u-x)*t,pz=z+(v-z)*t,ph=h+(k-h)*t,base=pz<2?1.24:Math.max(.04,1.24-Math.ceil((pz-2)/.7)*.24);box(px-.035,px+.035,pz-.035,pz+.035,base,ph-.07,'steel','metal');}
    }
  }
  return tris;
}

export const NY_PARK=Object.freeze({
  id:'ny',name:'UNDER THE BRIDGE',start:{at:[-24,-7],toward:[0,1],height:.04},rails,
  gaps:[
    {name:'BANK TO LEDGE',points:500,from:[-28,-20,1,3],fromAbove:1,to:[-29,-19,5,10],toAbove:.5},
    {name:'BRICK AIR',points:400,from:[-28,28,-15,-9],to:[-28,28,-15,-9],minAir:1.1},
    {name:'ABUTMENT DROP',points:500,from:[20,28,-20,-14.5],fromAbove:3,to:[18,30,-14,-6],toBelow:2.7},
    {name:'BETWEEN THE PILLARS',points:300,from:[-5,5,-15,-9],to:[-5,5,-15,-9],minAir:.8},
    {name:'SUBWAY SET',points:350,from:[1,7,1,3],fromAbove:1,to:[0,8,5.5,15],toBelow:.6},
    {name:'CAB CLEARANCE',points:500,from:[19,25,2,4],to:[18,26,8,18]},
    {name:'FOUNTAIN HOP',points:350,from:[-14,-8,7,9],to:[-16,-6,12,20]},
    {name:'HYDRANT HOP',points:250,from:[8,14,11,13],to:[7,15,16,22]},
    {name:'GRANITE DROP',points:200,from:[-28.5,-20,5,9],fromAbove:.5,to:[-36,-28,4,10],toBelow:.4},
    {name:'MANUAL PAD',points:150,from:[-5,1.5,18,20],fromAbove:.2,to:[1,8,17,21]},
  ],
  letters:[{letter:'S',at:[-24,4,1.8]},{letter:'K',at:[0,-13.5,3.6]},{letter:'A',at:[4,4,1.5]},{letter:'T',at:[22,6,2.5]},{letter:'E',at:[-11,11,1.6]}],
  tape:[24,-19.2,3.9],
  goals:[{id:'high',label:'High Score',score:3000},{id:'pro',label:'Pro Score',score:12000},{id:'sick',label:'Sick Score',score:35000},{id:'skate',label:'Collect S-K-A-T-E'},{id:'ledge',label:'Bank to Ledge',gap:'BANK TO LEDGE'},{id:'cab',label:'Cab Clearance',gap:'CAB CLEARANCE'},{id:'combo',label:'4-trick combo',combo:4},{id:'tape',label:'Secret Tape'}],
});
