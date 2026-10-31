// Fictional civic square, inspired by Philadelphia street skating. Local x,z metres, y up.
export const PLAZA = Object.freeze({ center: [-410, 0, -104], yaw: 0, half: [38, 31] });
export function plazaWorld([x, y, z]) { const c = Math.cos(PLAZA.yaw), s = Math.sin(PLAZA.yaw); return [PLAZA.center[0] + x * c - z * s, PLAZA.center[1] + y, PLAZA.center[2] + x * s + z * c]; }
export function plazaLocal([x, y, z]) { const c = Math.cos(PLAZA.yaw), s = Math.sin(PLAZA.yaw), dx = x - PLAZA.center[0], dz = z - PLAZA.center[2]; return [dx * c + dz * s, y - PLAZA.center[1], -dx * s + dz * c]; }
export const PLAZA_BOUNDS = (() => { const p = [[-38,-31],[-38,31],[38,31],[38,-31]].map(([x,z]) => plazaWorld([x,0,z])); return [Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[2])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[2]))]; })();

const rails = [], tris = [];
export const PLAZA_FEATURES = [];
const feature = (id,kind,build) => {
  const first=tris.length;build();const pts=tris.slice(first).flatMap(t=>[t.a,t.b,t.c]);
  PLAZA_FEATURES.push({id,kind,bounds:[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[2])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[2]))]});
};
const tri = (a, b, c, mat, surface = 'concrete') => tris.push({ a, b, c, mat, surface });
const quad = (a, b, c, d, mat, surface) => { tri(a,b,c,mat,surface); tri(a,c,d,mat,surface); };
const top = (a, b, c, d, mat, surface) => quad(a,d,c,b,mat,surface);
const box = (x0,x1,z0,z1,y0,y1,mat) => {
  const b = [[x0,y0,z0],[x0,y0,z1],[x1,y0,z1],[x1,y0,z0]], t = b.map(([x,,z])=>[x,y1,z]);
  quad(...t,mat); for(let i=0;i<4;i++){const j=(i+1)%4;quad(b[i],b[j],t[j],t[i],mat);}
};
const wedge = (x0,x1,z0,z1,h0,h1,mat='bank') => {
  top([x0,h0,z0],[x1,h0,z0],[x1,h1,z1],[x0,h1,z1],mat);
  top([x0,.08,z0],[x0,h0,z0],[x0,h1,z1],[x0,.08,z1],'skirt');
  top([x1,.08,z0],[x1,.08,z1],[x1,h1,z1],[x1,h0,z0],'skirt');
  if(h1>.08)top([x0,.08,z1],[x0,h1,z1],[x1,h1,z1],[x1,.08,z1],'skirt');
  if(h0>.08)top([x0,.08,z0],[x1,.08,z0],[x1,h0,z0],[x0,h0,z0],'skirt');
};
const edge = (id,kind,pts) => rails.push({id,kind,pts});
const handrail = (id,pts) => {
  edge(id,'rail',pts);
  for(let i=1;i<pts.length;i++){
    const [x,z,h]=pts[i-1],[xx,zz,hh]=pts[i],len=Math.hypot(xx-x,zz-z),nx=-(zz-z)/len*.055,nz=(xx-x)/len*.055;
    const a=[x+nx,h,z+nz],b=[xx+nx,hh,zz+nz],c=[xx-nx,hh,zz-nz],d=[x-nx,h,z-nz];
    quad(a,b,c,d,'steel','metal');
    for(const [p,q] of [[a,b],[b,c],[c,d],[d,a]])quad([p[0],p[1]-.11,p[2]],[q[0],q[1]-.11,q[2]],q,p,'steel','metal');
  }
  for(const [x,z,h] of pts)box(x-.045,x+.045,z-.045,z+.045,.08,h-.1,'steel');
};
// Tile seams are geometry colours, with no coplanar decals.
for(let x=-38;x<38;x+=2)for(let z=-31;z<31;z+=2)top([x,.08,z],[x+2,.08,z],[x+2,.08,z+2],[x,.08,z+2],Math.abs(x+1)>33||z<-27||z>27?'sidewalk':Math.abs(x+1)===23||z===-17||z===5?'paver-dark':'paver');
// Raised drained fountain: gentle banks on both sides, no scripted transition assist.
feature('fountain','fountain',()=>{
const rings = [[0,.12],[1.4,.12],[2.6,.7],[3,.7],[3.8,.08]], n=64;
for(let k=1;k<rings.length;k++)for(let i=0;i<n;i++){
  const [r0,y0]=rings[k-1],[r1,y1]=rings[k],p=(r,y,j)=>[-18+r*Math.cos(j*2*Math.PI/n),y,-7.5+r*Math.sin(j*2*Math.PI/n)];
  const mat=k===3?'rim':k<3?'basin':'granite';
  if(!r0)tri(p(0,y0,i),p(r1,y1,i+1),p(r1,y1,i),mat);
  else top(p(r0,y0,i),p(r1,y1,i),p(r1,y1,i+1),p(r0,y0,i+1),mat);
}
for(let i=-3;i<=3;i++)box(-18+i*.1-.025,-18+i*.1+.025,-7.85,-7.15,.12,.14,'steel');
for(let q=0;q<4;q++)edge(`fountain-rim-${q}`,'ledge',Array.from({length:17},(_,i)=>{const a=(q*16+i)*2*Math.PI/64;return [-18+2.8*Math.cos(a),-7.5+2.8*Math.sin(a),.7];}));
wedge(-21,-15,-14,-11,.08,1.2);
});
// An off-centre open sculpture leaves the plinth's jump line clear.
feature('sculpture','ledge',()=>{
box(-3,3,-9,-7,.08,.55,'granite');wedge(-3,3,-14,-11,.08,1.2);
box(1.8,2.4,-8.7,-7.3,.55,2.7,'sculpture');box(.3,2.4,-8.5,-7.5,2.2,2.7,'sculpture');
edge('plinth-front','ledge',[[-3,-9,.55],[3,-9,.55]]);
});
// Subway stairwell rises above the terrain, so its lower passage needs no terrain hole.
feature('subway','stairs',()=>{
wedge(15,21,-13,-10,.08,1.4);
for(let i=0;i<4;i++)box(14.4,21.6,-8+i*.7,-7.3+i*.7,.08,1.05-i*.24,'steps');
box(14,14.4,-8,-2,.08,1.25,'granite');box(21.6,22,-8,-2,.08,1.25,'granite');
edge('subway-west','ledge',[[14.2,-8,1.25],[14.2,-3.15,1.25]]);edge('subway-east','ledge',[[21.8,-8,1.25],[21.8,-3.15,1.25]]);
box(15,21,-7,-3,1.3,1.5,'awning');
for(const x of [15.2,20.8])for(const z of [-6.8,-3.2])box(x-.1,x+.1,z-.1,z+.1,.08,1.3,'steel');
wedge(13.5,22.5,-3,4,1.5,.08);
edge('awning-front','edge',[[15,-7,1.5],[21,-7,1.5]]);
});
const stairs=(id,x0,x1,h,steps)=>{
  feature(id,'stairs',()=>{
  wedge(x0,x1,8,13,.08,h);box(x0,x1,13,20,.08,h,'granite');
  for(let i=1;i<steps;i++)box(x0,x1,20+(i-1)*.75,20+i*.75,.08,h-(h-.08)*i/steps,'steps');
  for(const x of [x0+.8,x1-.8])handrail(`${id}-${x===x0+.8?'w':'e'}`,[[x,18,h+.7],[x,20,h+.7],[x,20+(steps-1)*.75,.08+.7]]);
  wedge(x0+.25,x0+1.35,14,18,h,h+.7);
  edge(`${id}-deck`,'ledge',[[x0+.15,13,h],[x0+.15,17,h]]);
  });
};
stairs('big-four',-33,-25,1.08,4);stairs('east-three',25,33,.83,3);
// Two long tiers, with a forgiving drop across the break between them.
for(const [x0,x1,h] of [[-11,-7,.83],[-7,-5,.48]]){
  feature(`tier-${x0}`,'ledge',()=>{
  wedge(x0,x1,3,7,.08,h);box(x0,x1,7,x0===-11?12:15,.08,h,'granite');box(x0,x1,17,26,.08,h-.2,'granite');
  edge(`tier-${x0===-11?'upper':'lower'}-a`,'ledge',x0===-11?[[x0+.5,7,h],[x0+.5,12,h],[x0+.5,15,1.35]]:[[x0+.5,7,h],[x0+.5,15,h]]);edge(`tier-${x0===-11?'upper':'lower'}-b`,'ledge',[[x0+.5,17,h-.2],[x0+.5,26,h-.2]]);
  if(x0===-11)wedge(-11,-7,12,15,.83,1.35);
  });
}
feature('planter-pop','planter',()=>{
wedge(4,10,10,13,.08,1.1);box(4,10,15,17,.08,.58,'granite');box(4.35,9.65,15.35,16.65,.58,.62,'soil');
for(const z of [15.15,16.85])edge(`planter-${z}`,'ledge',[[4.15,z,.58],[9.85,z,.58]]);
});
for(const [x,z] of [[-28,-3],[29,2],[20.5,18.5],[4,-24]])feature(`bench-${x}`,'bench',()=>{
  box(x-2,x+2,z-.5,z+.5,.45,.62,'bench');for(const xx of [x-1.5,x+1.5])box(xx-.12,xx+.12,z-.35,z+.35,.08,.45,'steel');
  edge(`bench-${x}`,'ledge',[[x-2,z,.62],[x+2,z,.62]]);
});
// Tall planting stays on the perimeter, away from landing zones.
for(const x of [-35,35])for(const z of [-26,1,27])feature(`planter-${x}-${z}`,'planter',()=>{box(x-1,x+1,z-1,z+1,.08,.55,'granite');box(x-.7,x+.7,z-.7,z+.7,.55,.9,'green');edge(`planter-${x}-${z}`,'ledge',[[x-1,z-.9,.55],[x+1,z-.9,.55]]);});
// Civic hall anchors the square; its closed doors leave the street lines outside.
feature('civic-hall','building',()=>{
box(-4,4,23,31,.08,5,'civic');box(-4.3,4.3,22.7,31,5,5.25,'granite');
box(-.9,.9,22.94,23,.08,2.3,'glass');
for(const x of [-2.7,2.7])box(x-.7,x+.7,22.94,23,1.2,3,'glass');
});

const ledge = (id,x0,x1,z0,z1,h,kind='ledge') => feature(id,kind,()=>{
  box(x0,x1,z0,z1,.08,h,'granite');
  for(const [side,a,b] of [['w',[x0,z0,h],[x0,z1,h]],['e',[x1,z0,h],[x1,z1,h]],['s',[x0,z0,h],[x1,z0,h]],['n',[x0,z1,h],[x1,z1,h]]])edge(`${id}-${side}`,'ledge',[a,b]);
});
const planter = (id,x0,x1,z0,z1,h=.5) => {
  ledge(id,x0,x1,z0,z1,h,'planter');box(x0+.3,x1-.3,z0+.3,z1-.3,h,h+.06,'soil');
  box(x0+.4,x1-.4,z0+.4,z1-.4,h+.06,h+.27,'green');
};
// Broad terraces make the fountain court read as sunken; gaps leave its three jump lanes open.
for(const [id,x0,x1,z0,z1] of [['west-court',-25,-23,-13,5],['inner-court',-13,-11,-14,-3],['east-court',23,25,-13,5],['sculpture-court',4,12,-16,-14]]){
  ledge(id+'-low',x0-.45,x1+.45,z0,z1,.26);
  planter(id,x0,x1,z0+.3,z1-.3,.52);
}
// Four human-size stair sets, with banks beside the treads and handrails off the driving centre.
for(const [id,x0,x1,h] of [['arcade',-32,-25,.83],['market',25,32,.68]])feature(id,'stairs',()=>{
  wedge(x0,x1,-26,-22,.08,h);box(x0,x1,-22,-18,.08,h,'granite');
  for(let i=1;i<4;i++)box(x0,x1-1.6,-18+(i-1)*.55,-18+i*.55,.08,h-(h-.08)*i/4,'steps');
  wedge(x1-1.6,x1,-18,-14,h,.08);
  for(const x of [x0+.45,x1-2])handrail(`${id}-${x===x0+.45?'w':'e'}`,[[x,-20,h+.65],[x,-18,h+.65],[x,-16.35,.73]]);
  edge(`${id}-deck`,'ledge',[[x0,-22,h],[x0,-18,h]]);
  edge(`${id}-bank-side`,'ledge',[[x1,-22,h],[x1,-18,h]]);
  edge(`${id}-entry`,'edge',[[x0,-22,h],[x1,-22,h]]);
  edge(`${id}-drop`,'ledge',[[x0+.65,-18,h],[x1-2.2,-18,h]]);
});
// A granite path through two planted islands is wide enough for a held-throttle transfer.
feature('twin-planters','planter',()=>{
  for(const [z0,z1,h] of [[-22,-20,.6],[-17,-14.5,.4]]){
    box(-12,-7,z0,z1,.08,h,'granite');
    for(const [x0,x1] of [[-11.7,-11.1],[-7.9,-7.3]])box(x0,x1,z0+.3,z1-.3,h,h+.2,'green');
    for(const x of [-12,-7])edge(`twin-${z0}-${x}`,'ledge',[[x,z0,h],[x,z1,h]]);
    for(const z of [z0,z1])for(const [a,b] of h===.6?[[-12,-10.8],[-8.2,-7]]:[[-12,-7]])edge(`twin-end-${z}-${a}`,'ledge',[[a,z,h],[b,z,h]]);
  }
  wedge(-10.7,-8.3,-25,-20,.08,1);
  wedge(-10.7,-8.3,-14.5,-12,.4,.08);
});
feature('fountain-link','bank',()=>{
  wedge(-21,-15,6,9,.08,.78);box(-21,-15,11,12.5,.08,.4,'granite');
  for(const x of [-21,-15])edge(`court-link-${x}`,'ledge',[[x,11,.4],[x,12.5,.4]]);
  edge('court-bank-lip','edge',[[-21,9,.78],[-15,9,.78]]);
  for(const z of [11,12.5])edge(`court-link-${z}`,'ledge',[[-21,z,.4],[-15,z,.4]]);
});
feature('civic-walk','ledge',()=>{
  box(12,22,25,27,.08,.78,'granite');wedge(12,22,27,30,.78,.08);
  for(const x of [12,22])edge(`civic-walk-${x}`,'ledge',[[x,25,.78],[x,27,.78]]);
  edge('civic-walk-drop','ledge',[[12,25,.78],[22,25,.78]]);
  edge('civic-walk-entry','edge',[[12,27,.78],[22,27,.78]]);
});
// Pads, benches and planter rows chain the bigger lines at three to eight metre intervals.
for(const [id,x0,x1,z0,z1,h] of [['entry-pad',4,10,-22,-19,.23],['sculpture-pad',5,11,-9,-6,.23],['middle-pad',-3,2,7,10,.23],['west-pad',-22,-15,21,24,.26],['east-pad',12,21,12.5,15,.23]]){
  ledge(id,x0,x1,z0,z1,h,'pad');wedge(x0+.6,x1-.6,z0-1,z0,.08,h);wedge(x0+.6,x1-.6,z1,z1+1,h,.08);
}
for(const [id,x0,x1,z0,z1] of [['entry-row',-5,-3,-25,-18],['fountain-row',-22,-20,-23,-17],['subway-row',11,13,-25,-18],['court-row',11,13,0,6],['west-row',-22,-20,14,19],['hall-row',4,5.5,20,28],['east-row',22,23.5,7,12],['middle-row',-3,-1,14,19]])planter(id,x0,x1,z0,z1);
for(const [id,x,z] of [['west',-29,3],['east',29,-8],['hall',12,20],['court',-15,1],['south-west',-25.5,28],['south-east',24,28]])feature(`seat-${id}`,'bench',()=>{
  box(x-1.1,x+1.1,z-.3,z+.3,.42,.53,'bench');for(const xx of [x-.8,x+.8])box(xx-.08,xx+.08,z-.22,z+.22,.08,.42,'steel');
  edge(`seat-${id}`,'ledge',[[x-1.1,z,.53],[x+1.1,z,.53]]);
});
for(const x of [-14,14])planter(`entry-tree-${x}`,x-1,x+1,-30,-28,.55);
// Closed frontage stays inside the tested site; window bands are inset from the building corners.
for(const [id,x0,x1,z0,z1,h,mat] of [['west-shops',-38,-33,-24,-4,6.8,'brick'],['west-corner',-38,-33,3,9,8.5,'civic'],['east-shops',33,38,-24,-4,8.2,'civic'],['east-corner',33,38,3,9,6.2,'brick'],['north-shops',-12,12,-31,-28,7.5,'brick']])feature(id,'building',()=>{
  box(x0,x1,z0,z1,.08,h,mat);box(x0,x1,z0,z1,h,h+.22,'trim');
  if(id==='north-shops'){
    for(let x=x0+.7;x<x1-1;x+=3)for(const y of [1.2,4.5])quad([x,y,z1+.02],[x+2,y,z1+.02],[x+2,y+1.8,z1+.02],[x,y+1.8,z1+.02],'glass');
    box(x0,x1,z1,z1+.6,2.8,3,'awning');
  }else{
    const west=x0<0,face=west?x1:x0,sgn=west?1:-1,depth=id.endsWith('corner')?.45:1.1;
    for(let z=z0+.7;z<z1-1;z+=3)for(const y of [1.2,4.4]){
      const xx=face+sgn*.02,hi=Math.min(y+1.7,h-.4),pts=[[xx,y,z],[xx,hi,z],[xx,hi,z+2],[xx,y,z+2]];
      quad(...(west?pts:pts.reverse()),'glass');
    }
    box(Math.min(face,face+sgn*depth),Math.max(face,face+sgn*depth),z0,z1,2.9,3.12,'awning');
    for(let z=z0+.5;z<z1;z+=4)box(face+sgn*(depth-.2)-.09,face+sgn*(depth-.2)+.09,z-.09,z+.09,.08,2.9,'civic');
  }
});
for(const [x,z] of [[-35,-26],[35,-26],[-35,1],[35,1],[-35,27],[35,27],[-14,-29],[14,-29]])feature(`tree-${x}-${z}`,'tree',()=>{
  box(x-.13,x+.13,z-.13,z+.13,.08,3.2,'bark');
  const n=7,p=(r,y,i)=>[x+r*Math.cos(i*2*Math.PI/n),y,z+r*Math.sin(i*2*Math.PI/n)];
  for(let i=0;i<n;i++){tri(p(0,5.5,i),p(1.45,3.5,i+1),p(1.45,3.5,i),'leaf');tri(p(0,2.8,i),p(1.45,3.5,i),p(1.45,3.5,i+1),'green');}
});
for(const [x,z] of [[-23,-25],[23,-25],[-23,7],[23,20],[-13,28],[11,28]])feature(`lamp-${x}-${z}`,'prop',()=>{
  box(x-.07,x+.07,z-.07,z+.07,.08,3.6,'steel');box(x-.32,x+.32,z-.32,z+.32,3.6,3.78,'lamp');
  box(x+.5,x+1,z-.25,z+.25,.08,.85,'steel');box(x+.49,x+1.01,z-.26,z+.26,.85,.92,'trim');
});
export const buildPlaza = () => tris;
export const PLAZA_PARK = Object.freeze({
  id:'philly',name:'TOWN PLAZA',start:{at:[-18,-27],toward:[0,1]},rails,
  gaps:[
    {name:'FOUNTAIN GAP',points:500,from:[-22,-14,-16,-10],to:[-24,-12,-4.95,8]},
    {name:'OVER THE SUBWAY',points:500,from:[14,22,-14,-9],to:[13,23,-7,8]},
    {name:'LEDGE TO LEDGE',points:300,from:[-12,-5,12,15.5],fromAbove:.7,to:[-12,-5,17,27],toAbove:.5},
    {name:'PLINTH HOP',points:250,from:[-4,4,-15,-10],to:[-4,4,-6,6]},
    {name:'THE BIG FOUR',points:300,from:[-34,-24,16,20.5],fromAbove:1,to:[-34,-24,22.3,31],toBelow:.4},
    {name:'EAST THREE',points:200,from:[24,34,16,20.5],fromAbove:.8,to:[24,34,21.6,31],toBelow:.4},
    {name:'PLANTER POP',points:250,from:[3,11,9,13.5],to:[3,11,17.5,28]},
    {name:'ARCADE THREE',points:250,from:[-33,-24,-20,-17.5],fromAbove:.7,to:[-33,-24,-16,-8],toBelow:.4},
    {name:'MARKET STEPS',points:250,from:[24,33,-20,-17.5],fromAbove:.6,to:[24,33,-16,-8],toBelow:.4},
    {name:'PLANTER TO PLANTER',points:350,from:[-12,-7,-23,-19.5],fromAbove:.7,to:[-12,-7,-17,-12]},
    {name:'FOUNTAIN TO COURT',points:300,from:[-22,-14,6,9.5],to:[-22,-14,13,21]},
    {name:'CIVIC DROP',points:250,from:[12,22,24.5,27],fromAbove:.7,to:[12,22,17,23],toBelow:.4},
  ],
  letters:[{letter:'S',at:[-18,-7.5,1.9]},{letter:'K',at:[0,-8,1.8]},{letter:'A',at:[-9,19,1]},{letter:'T',at:[-29,21,1.1]},{letter:'E',at:[7,16,1.5]}],
  tape:[18,-5.5,2.0],
  goals:[{id:'high',label:'High Score',score:1500},{id:'pro',label:'Pro Score',score:5000},{id:'sick',label:'Sick Score',score:12000},{id:'skate',label:'Collect S-K-A-T-E'},{id:'fountain',label:'Fountain Gap',gap:'FOUNTAIN GAP'},{id:'subway',label:'Over the Subway',gap:'OVER THE SUBWAY'},{id:'combo',label:'5-trick combo',combo:5},{id:'tape',label:'Secret Tape'}],
});
