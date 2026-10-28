// Original beach park: local geometry [x,y,z], skate data [x,z,h]. The raised
// promenade contains the pit above the existing terrain, without a hidden floor.
export const BOARDWALK = Object.freeze({ center: [-668, 0, 3421], length: 64, width: 42, deck: 1.64 });
export const BOARDWALK_BOUNDS = [-700, 3400, -636, 3452];
export const BOARDWALK_SHORE = Object.freeze([[-32,20.5],[-24,21.4],[-16,21],[-8,22],[0,21.5],[8,22],[16,21],[24,21.4],[32,20.5]]);
export const BOARDWALK_FAR_SHORE=Object.freeze([20.5,27.4,29,30,30.4,30,29,27.4,20.5]);
export const boardwalkWorld = ([x,y,z]) => [BOARDWALK.center[0]+x,y,BOARDWALK.center[2]+z];
export const boardwalkLocal = ([x,y,z]) => [x-BOARDWALK.center[0],y,z-BOARDWALK.center[2]];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const arc = t => 1-Math.sqrt(Math.max(0,1-t*t));
const snakeZ = x => -11.5+1.2*Math.sin((x+14)*Math.PI/10);
const centerline = Array.from({length:39},(_,i)=>{const x=-23.5+i*.5;return [x,snakeZ(x)];});
function snakeDistance(x,z) {
  let best=Infinity;
  for(let i=1;i<centerline.length;i++){
    const a=centerline[i-1],b=centerline[i],dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
    best=Math.min(best,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  }
  return best;
}
export function boardwalkHeight(x,z) {
  const d=snakeDistance(x,z),t=clamp((d-1.8)/1.6,0,1);
  let h=.04+1.6*arc(t);
  if(x>-17&&x<-11&&d<1.7)h=Math.max(h,.04+.9*(1-Math.abs(x+14)/3)*clamp((1.7-d)/.4,0,1));
  return h;
}
export function boardwalkRampHeight(x,z) {
  return 1.64+2.4*arc(clamp(x<21?(18.6-x)/2.4:(x-23.4)/2.4,0,1));
}

const benches=[-24,-18,-12,0,6].map(x=>({x,z:3}));
const planters=[[-30,-19,.84],[2,-19,1.64],[30,-19,.84],[29,18,.04]];
const walls=[[-28,-16],[-10,0],[4,12],[16,27]];
const rails=[];
const rail=(id,kind,pts)=>rails.push({id,kind,pts});
const rectangleRails=(id,kind,x0,x1,z0,z1,h)=>{
  const p=[[x0,z0,h],[x1,z0,h],[x1,z1,h],[x0,z1,h]];
  for(let i=0;i<4;i++)rail(`${id}-${i}`,kind,[p[i],p[(i+1)%4]]);
};
for(const [i,{x,z}] of benches.entries())for(const side of [-1,1])rail(`bench-${i}-${side}`,'ledge',[[x-1.5,z+side*.38,2.09],[x+1.5,z+side*.38,2.09]]);
for(const [i,[x,z,y]] of planters.entries())rectangleRails(`planter-${i}`,'ledge',x-.85,x+.85,z-.85,z+.85,y+.5);
for(const [i,[x0,x1]] of walls.entries())for(const z of [-20.7,-20.3])rail(`sea-wall-${i}-${z}`,'ledge',[[x0,z,2.19],[x1,z,2.19]]);
// Parallel offsets and rounded ends follow the actual channel rim.

for(const side of [-1,1]){
  const pts=centerline.map(([x,z])=>{const dz=1.2*Math.PI/10*Math.cos((x+14)*Math.PI/10),n=Math.hypot(1,dz);return [x-side*dz/n*3.62,z+side/n*3.62,1.645];});
  for(let i=0;i<4;i++)rail(`snake-${side}-${i}`,'coping',pts.slice(Math.floor(i*38/4),Math.floor((i+1)*38/4)+1));
}
for(const [j,[x,z]] of [centerline[0],centerline.at(-1)].entries()){
  const tangent=Math.atan2(1.2*Math.PI/10*Math.cos((x+14)*Math.PI/10),1),start=tangent+(j? -Math.PI/2:Math.PI/2);
  for(let k=0;k<2;k++)rail(`snake-end-${j}-${k}`,'coping',Array.from({length:13},(_,i)=>{const a=start+(k+i/12)*Math.PI/2;return [x+3.62*Math.cos(a),z+3.62*Math.sin(a),1.645];}));
}
for(const x of [16.2,25.8])rail(`vert-${x}`,'coping',[[x,-18,4.08],[x,-7,4.08]]);
rectangleRails('hut-roof','edge',4.08,11.92,-17.92,-11.08,3.24);
for(const x of [-7.7,-2.3])rail(`beach-stair-${x}`,'rail',[[x,4.6,2.14],[x,9.2,.49]]);
for(let i=0;i<4;i++)rail(`step-${i}`,'edge',[[-7.5,5+(i+1)*.8-.06,1.64-(i+1)*.32],[-2.5,5+(i+1)*.8-.06,1.64-(i+1)*.32]]);
for(const x of [18.08,23.92])rail(`launch-${x}`,'edge',[[x,.1,1.662],[x,4.9,2.718]]);

export function buildBoardwalk() {
  const tris=[],tri=(a,b,c,surface,mat)=>tris.push({a,b,c,surface,mat});
  const quad=(a,b,c,d,surface='concrete',mat='deck')=>{tri(a,b,c,surface,mat);tri(a,c,d,surface,mat);};
  const flat=(x0,x1,z0,z1,h,mat='deck',surface='concrete')=>quad([x0,h,z0],[x0,h,z1],[x1,h,z1],[x1,h,z0],surface,mat);
  const box=(x0,x1,z0,z1,y0,y1,mat,surface='concrete',open='')=>{
    if(!open.includes('t'))flat(x0,x1,z0,z1,y1,mat,surface);
    if(!open.includes('n'))quad([x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],surface,mat);
    if(!open.includes('s'))quad([x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[x0,y0,z1],surface,mat);
    if(!open.includes('w'))quad([x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0],surface,mat);
    if(!open.includes('e'))quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],surface,mat);
  };
  const bankZ=(x0,x1,z0,z1,y0,y1,mat='bank')=>{
    quad([x0,y0,z0],[x0,y1,z1],[x1,y1,z1],[x1,y0,z0],'concrete',mat);
    quad([x0,.04,z1],[x0,y1,z1],[x0,y0,z0],[x0,.04,z0],'concrete','skirt');
    quad([x1,.04,z0],[x1,y0,z0],[x1,y1,z1],[x1,.04,z1],'concrete','skirt');
  };
  const bankX=(x0,x1,z0,z1,y0,y1)=>quad([x0,y0,z0],[x0,y0,z1],[x1,y1,z1],[x1,y1,z0],'concrete','bank');
  // The lagoon stays shallow and drivable, including its rounded outer shore.
  flat(-32,32,5,18,.04,'sand','dirt');
  for(let i=1;i<BOARDWALK_SHORE.length;i++){
    const [x0,z0]=BOARDWALK_SHORE[i-1],[x1,z1]=BOARDWALK_SHORE[i];
    quad([x0,.045,18],[x0,.045,z0],[x1,.045,z1],[x1,.045,18],'dirt','wet-sand');
    const f0=BOARDWALK_FAR_SHORE[i-1],f1=BOARDWALK_FAR_SHORE[i];
    quad([x0,.055,z0],[x0,.055,f0],[x1,.055,f1],[x1,.055,z1],'dirt','water');
    quad([x0,.04,f0],[x0,.025,f0+.5],[x1,.025,f1+.5],[x1,.04,f1],'dirt','wet-sand');
  }
  // The four-metre side banks make every entrance flush with the surrounding ground.
  for(const r of [[-28,1,-21,-18],[-28,1,-5,5],[1,28,-21,5]])flat(...r,1.64);
  bankX(-32,-28,-21,5,.04,1.64);bankX(28,32,-21,5,1.64,.04);
  quad([-32,.04,-21],[-28,1.64,-21],[28,1.64,-21],[32,.04,-21],'concrete','skirt');
  for(const [a,b] of [[-28,-8],[-2,18],[24,28]])quad([b,.04,5],[b,1.64,5],[a,1.64,5],[a,.04,5],'concrete','skirt');
  const nx=116,nz=52;
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
    const p=[[i,j],[i,j+1],[i+1,j+1],[i+1,j]].map(([a,b])=>{const x=-28+a/4,z=-18+b/4;return [x,boardwalkHeight(x,z),z];});
    const x=-28+(i+.5)/4,z=-18+(j+.5)/4,cut=p.some(v=>v[1]<1.63),hip=x>-17&&x<-11&&snakeDistance(x,z)<1.7;
    quad(...p,hip?'hip':cut?'bowl':'concrete',hip?'bank':cut?(p.every(v=>v[1]<.05)?'pit-floor':'pit-wall'):'deck');
  }
  // A bank launches over seven metres of sand to a broad, forgiving beach landing.
  bankZ(18,24,0,5,1.64,2.74);
  quad([24,.04,5],[24,2.74,5],[18,2.74,5],[18,.04,5],'concrete','skirt');
  bankZ(17,25,12,20,.74,.04);flat(17,25,11,12,.74,'deck');
  quad([17,.04,11],[17,.74,11],[25,.74,11],[25,.04,11],'concrete','skirt');
  // Beach stairs and a separate broad roll-down give the promenade an easy return.
  for(let i=0;i<5;i++)box(-8,-2,5+i*.8,5+(i+1)*.8,.04,1.64-(i+1)*.32,'steps');
  bankZ(-1,7,5,13,1.64,.04);
  // The hut roof is reached by its rear bank; no hidden internal wall under the crest.
  box(4,12,-18,-11,1.64,3.24,'hut','wood','st');flat(4,12,-18,-11,3.24,'roof','wood');
  bankZ(4,12,-11,-3,3.24,1.64);
  for(const [toe,dir] of [[18.6,-1],[23.4,1]])for(let i=0;i<32;i++){
    const xa=toe+dir*2.4*i/32,xb=toe+dir*2.4*(i+1)/32,ya=1.64+2.4*arc(i/32),yb=1.64+2.4*arc((i+1)/32);
    const a=[xa,ya,-18],b=[xa,ya,-7],c=[xb,yb,-7],d=[xb,yb,-18];
    dir>0?quad(a,b,c,d,'vert','vert'):quad(a,d,c,b,'vert','vert');
    for(const z of [-18,-7]){
      const p=[[xa,1.64,z],[xb,1.64,z],[xb,yb,z],[xa,ya,z]];
      (z===-18)===(dir>0)?quad(...p,'concrete','skirt'):quad(p[0],p[3],p[2],p[1],'concrete','skirt');
    }
  }
  box(14,16.2,-18,-7,1.64,4.04,'deck','concrete','e');box(25.8,28,-18,-7,1.64,4.04,'deck','concrete','w');
  bankZ(25.8,28,-7,0,4.04,1.64);
  for(const [x0,x1] of walls)box(x0,x1,-20.7,-20.3,1.64,2.19,'ledge');
  bankX(-22,-19.5,2.6,3.4,1.64,2.09);
  for(const {x,z} of benches){box(x-1.5,x+1.5,z-.4,z+.4,2,2.09,'bench','wood');for(const dx of [-1.1,1.1])box(x+dx-.08,x+dx+.08,z-.3,z+.3,1.64,2,'steel','metal');}
  for(const [x,z,y] of planters){
    for(const r of [[x-.95,x+.95,z-.95,z-.65],[x-.95,x+.95,z+.65,z+.95],[x-.95,x-.65,z-.65,z+.65],[x+.65,x+.95,z-.65,z+.65]])box(...r,Math.abs(x)>28?.04:y,y+.5,'planter');
    flat(x-.65,x+.65,z-.65,z+.65,y+.38,'soil','dirt');
  }
  // Rail tops share collision with the visible coping and handrails. Ledge/edge rails
  // describe the furniture itself; they need no invisible strip above its surface.
  for(const r of rails.filter(r=>r.kind==='coping'||r.kind==='rail'))for(let i=1;i<r.pts.length;i++){
    const [x,z,h]=r.pts[i-1],[u,v,k]=r.pts[i],dx=u-x,dz=v-z,n=Math.hypot(dx,dz),w=r.id.startsWith('snake')?.18:.045,ox=-dz/n*w,oz=dx/n*w,surface=r.kind==='coping'?(r.id.startsWith('vert')?'vert':'bowl'):'metal';
    if(r.id.startsWith('snake')){
      quad([x+ox,h,z+oz],[u+ox,k,v+oz],[u-ox,k,v-oz],[x-ox,h,z-oz],surface,'coping');
    }else if(r.kind==='coping'){
      // A rounded cap must not introduce a vertical collision edge over a bowl lip.
      quad([x+ox,h-.06,z+oz],[u+ox,k-.06,v+oz],[u,k,v],[x,h,z],surface,'coping');
      quad([x,h,z],[u,k,v],[u-ox,k-.06,v-oz],[x-ox,h-.06,z-oz],surface,'coping');
    }else{
      quad([x+ox,h,z+oz],[u+ox,k,v+oz],[u-ox,k,v-oz],[x-ox,h,z-oz],surface,'coping');
      quad([x-ox,h-.07,z-oz],[x-ox,h,z-oz],[u-ox,k,v-oz],[u-ox,k-.07,v-oz],surface,'steel');
      quad([u+ox,k-.07,v+oz],[u+ox,k,v+oz],[x+ox,h,z+oz],[x+ox,h-.07,z+oz],surface,'steel');
    }
    if(r.kind==='rail')for(const t of [0,.5,1]){const px=x+dx*t,pz=z+dz*t,ph=h+(k-h)*t,base=pz<5?1.64:pz>=9?.04:1.64-Math.ceil((pz-5)/.8)*.32;box(px-.035,px+.035,pz-.035,pz+.035,base,ph-.07,'steel','metal');}
  }
  return tris;
}

export const BOARDWALK_PARK = Object.freeze({
  id:'venice',name:'BOARDWALK',start:{at:[21,-4],toward:[0,1],height:1.64},rails,
  gaps:[
    {name:'OVER THE SAND',points:600,from:[18,24,3.5,5.5],fromAbove:2.4,to:[16,26,11,21]},
    {name:'BEACH VERT',points:450,from:[16,26,-18,-7],to:[16,26,-18,-7],minAir:1.4},
    {name:'PIT DROP',points:250,from:[-28,-25,-16,-7],fromAbove:1.3,to:[-26,-18,-17,-6],toBelow:1.2},
    {name:'SNAKE HOP',points:350,from:[-18,-13,-15,-8],to:[-13,-5,-15,-7]},
    {name:'PIT AIR',points:300,from:[-28,1,-18,-5],to:[-28,1,-18,-5],minAir:.9},
    {name:'BEACH STEPS',points:300,from:[-8,-2,3,5.5],fromAbove:1.4,to:[-8,-2,9,19],toBelow:.7},
    {name:'HUT ROOF',points:350,from:[4,12,-11.5,-5],to:[4,12,-18,-11],toAbove:3},
    {name:'ROOF TO WALK',points:300,from:[3.7,12,-18,-11],fromAbove:3,to:[-6,4,-19,-10],toBelow:2.2},
    {name:'BENCH HOP',points:200,from:[-19.6,-16.2,2.4,3.6],fromAbove:1.9,to:[-16.2,-13.5,2.3,3.7]},
    {name:'DECK TO BEACH',points:250,from:[-28,-10,3,5.4],fromAbove:1.4,to:[-29,-9,8,20],toBelow:.6},
  ],
  letters:[{letter:'S',at:[21,8,2.9]},{letter:'K',at:[-14,-11.5,1.5]},{letter:'A',at:[25.2,-12,5.3]},{letter:'T',at:[-5,7,1.6]},{letter:'E',at:[8,-11,3.8]}],
  tape:[8,-16,3.9],
  goals:[{id:'high',label:'High Score',score:3000},{id:'pro',label:'Pro Score',score:12000},{id:'sick',label:'Sick Score',score:75000},{id:'skate',label:'Collect S-K-A-T-E'},{id:'sand',label:'Over the Sand',gap:'OVER THE SAND'},{id:'snake',label:'Snake Hop',gap:'SNAKE HOP'},{id:'combo',label:'4-trick combo',combo:4},{id:'tape',label:'Secret Tape'}],
});
