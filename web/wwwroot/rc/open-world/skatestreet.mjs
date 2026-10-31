// Raised bowls keep the flight-line terrain intact. Local [x,y,z], park data [x,z,h].
export const SKATESTREET = Object.freeze({ center: [560, 0, 1000], length: 84, width: 64, roof: 16, deck: 3.24 });
export const SKATESTREET_BOUNDS = [515, 965, 605, 1035];
export const skatestreetWorld = ([x, y, z]) => [x + SKATESTREET.center[0], y + SKATESTREET.center[1], z + SKATESTREET.center[2]];
export const skatestreetLocal = ([x, y, z]) => [x - SKATESTREET.center[0], y - SKATESTREET.center[1], z - SKATESTREET.center[2]];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const arc = t => 1 - Math.sqrt(Math.max(0, 1 - t * t));
const rounded = (x, z, cx, cz, hx, hz, r) => {
  const a = Math.abs(x - cx) - hx + r, b = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0) - r;
};
export function streetBowlHeight(x, z) {
  const notch = z < -10.5 ? 2.3 * Math.exp(-(((x + 23) / 4.5) ** 2)) : 0;
  const deep = rounded(x, z - notch, -22.5, -10.5, 12.5, 12.5, 6);
  const shallow = rounded(x, z, 0, -10.5, 10, 10.5, 5);
  let y = Math.min(.04 + 3.2 * arc(clamp(1 + deep / 3.2, 0, 1)), 1.04 + 2.2 * arc(clamp(1 + shallow / 2.2, 0, 1)));
  // Lower the shared saddle, leaving the rest of both rims full height.
  const side = x < -10, r = side ? 3.2 : 2.2, base = side ? .04 : 1.04;
  const hip = base + (1.5 - base) * arc(clamp(1 - Math.abs(x + 10) / r, 0, 1));
  const w = clamp((4.5 - Math.abs(z + 10.5)) / 1.5, 0, 1);
  if (x > -13.2 && x < -7.8) y += (Math.min(y, hip) - y) * w;
  return y;
}

const RAILS = [
  { id: 'super-coping-s', kind: 'coping', pts: [[-28, 2, 3.28], [-16, 2, 3.28]] },
  { id: 'super-coping-w', kind: 'coping', pts: [[-35, -15, 3.28], [-35, -6, 3.28]] },
  { id: 'shallow-coping-e', kind: 'coping', pts: [[10, -15, 3.28], [10, -6, 3.28]] },
  { id: 'vert-coping', kind: 'coping', pts: [[34, -21, 4.04], [34, -5, 4.04]] },
  { id: 'mini-coping-w', kind: 'coping', pts: [[13.92, 1, 1.64], [13.92, 9, 1.64]] },
  { id: 'mini-coping-e', kind: 'coping', pts: [[24.08, 1, 1.64], [24.08, 9, 1.64]] },
  { id: 'stairs-w', kind: 'rail', pts: [[8.5, 17, 1.7], [8.5, 23, .45]] },
  { id: 'stairs-e', kind: 'rail', pts: [[16.5, 17, 1.7], [16.5, 23, .45]] },
  { id: 'long-ledge', kind: 'ledge', pts: [[21, 21.1, .68], [34, 21.1, .68]] },
  { id: 'kicker-ledge', kind: 'ledge', pts: [[-4, 20.1, .78], [2, 20.1, .78]] },
  { id: 'mezzanine-edge', kind: 'edge', pts: [[-24, -25, 3.28], [-13, -25, 3.28]] },
];

export function buildSkatestreet() {
  const tris = [], tri = (a, b, c, surface, mat) => tris.push({ a, b, c, surface, mat });
  const quad = (a, b, c, d, surface = 'concrete', mat = 'deck') => { tri(a, b, c, surface, mat); tri(a, c, d, surface, mat); };
  const box = (x0, x1, z0, z1, y0, y1, mat, surface = 'concrete', openX = 0) => {
    quad([x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],surface,mat);
    quad([x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],surface,mat);
    quad([x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[x0,y0,z1],surface,mat);
    if(openX!==-1)quad([x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0],surface,mat);
    if(openX!==1)quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],surface,mat);
  };
  const bankX = (x0, x1, z0, z1, y0, y1, mat = 'bank', surface = 'concrete') => {
    quad([x0,y0,z0],[x0,y0,z1],[x1,y1,z1],[x1,y1,z0],surface,mat);
    tri([x0,.04,z0],[x0,y0,z0],[x1,y1,z0],'concrete','skirt'); tri([x0,.04,z0],[x1,y1,z0],[x1,.04,z0],'concrete','skirt');
    tri([x0,.04,z1],[x1,y1,z1],[x0,y0,z1],'concrete','skirt'); tri([x0,.04,z1],[x1,.04,z1],[x1,y1,z1],'concrete','skirt');
  };
  const bankZ = (x0, x1, z0, z1, y0, y1, mat = 'bank') => {
    quad([x0,y0,z0],[x0,y1,z1],[x1,y1,z1],[x1,y0,z0],'concrete',mat);
    quad([x0,.04,z0],[x0,.04,z1],[x0,y1,z1],[x0,y0,z0],'concrete','skirt');
    quad([x1,.04,z1],[x1,.04,z0],[x1,y0,z0],[x1,y1,z1],'concrete','skirt');
  };
  const transition = (toe, dir, r, z0, z1, surface) => {
    for (let i = 0; i < 24; i++) {
      const xa = toe + dir * r * i / 24, xb = toe + dir * r * (i + 1) / 24;
      const ya = .04 + r * arc(i / 24), yb = .04 + r * arc((i + 1) / 24);
      bankX(Math.min(xa,xb),Math.max(xa,xb),z0,z1,dir>0?ya:yb,dir>0?yb:ya,'ramp',surface);
    }
  };
  box(-42,42,-32,32,0,.01,'floor');
  // Bowl platform, with a notched northern wall giving the deep bowl its kidney outline.
  const x0=-35,x1=10,z0=-24,z1=4,nx=150,nz=94;
  const xs=[...Array.from({length:nx+1},(_,i)=>x0+(x1-x0)*i/nx),-10].sort((a,b)=>a-b);
  for(let j=0;j<nz;j++)for(let i=0;i<xs.length-1;i++){
    const points=[[i,j],[i,j+1],[i+1,j+1],[i+1,j]].map(([a,b])=>{const x=xs[a],z=z0+(z1-z0)*b/nz;return [x,streetBowlHeight(x,z),z];});
    const x=(points[0][0]+points[2][0])/2,z=(points[0][2]+points[2][2])/2,hip=x>-13.3&&x<-7.7&&Math.abs(z+10.5)<4.5;
    const flat=points.every(p=>Math.abs(p[1]-points[0][1])<.001),deck=points.every(p=>p[1]>3.23);
    quad(...points,deck?'concrete':hip?'hip':'bowl',deck?'deck':hip?'hip':flat?'bowl-floor':'bowl-wall');
  }
  quad([-35,.04,4],[10,.04,4],[10,3.24,4],[-35,3.24,4],'concrete','skirt');
  quad([10,.04,-24],[-35,.04,-24],[-35,3.24,-24],[10,3.24,-24],'concrete','skirt');
  quad([10,.04,4],[10,.04,-24],[10,3.24,-24],[10,3.24,4],'concrete','skirt');
  box(-36,-35,-24,4,.04,3.24,'deck','concrete',1);
  bankX(-42,-40,-17,-4,.04,3.24); box(-40,-36,-17,-4,.04,3.24,'deck','concrete',1);
  bankZ(-32,6,4,11,3.24,.04);
  // Omit the deck's internal face against each transition: a hull must not hit a wall under the lip.
  transition(30,1,4,-21,-5,'vert'); box(34,40,-21,-5,.04,4.03,'deck','concrete',-1);
  bankZ(35,40,-5,5,4.04,.04);
  transition(15.6,-1,1.6,1,9,'bowl'); transition(22.4,1,1.6,1,9,'bowl');
  box(12.5,14,1,9,.04,1.63,'deck','concrete',1); box(24,25.5,1,9,.04,1.63,'deck','concrete',-1);
  bankX(25.5,30,1,9,1.64,.04);
  // Four-sided funbox and a separate kicker-to-ledge line.
  const lo=[[-25,.04,14],[-17,.04,14],[-17,.04,24],[-25,.04,24]],hi=[[-22,1.24,17],[-20,1.24,17],[-20,1.24,21],[-22,1.24,21]];
  quad(hi[0],hi[3],hi[2],hi[1],'wood','funbox');
  for(let i=0;i<4;i++){const j=(i+1)%4;quad(lo[i],hi[i],hi[j],lo[j],'wood','funbox');}
  bankZ(-4,2,14,18,.04,1.04,'ramp'); box(-4,2,20,22,.04,.74,'ledge');
  // Bank to the stair platform, wide enough to keep both handrails out of the driving line.
  box(8,17,13,18,.04,1.24,'deck'); bankZ(8,17,7,13,.04,1.24);
  for(let i=0;i<4;i++)box(8,17,18+i*.8,18+(i+1)*.8,.04,1.24-(i+1)*.24,'steps');
  box(21,34,21,23,.04,.64,'ledge'); bankX(17,21,21,23,.04,.64);
  // Mezzanine, broad bank and hidden tape room behind an already-open wall break.
  box(-35,22,-32,-25,.04,3.24,'deck'); bankZ(12,20,-25,-15,3.24,.04);
  box(-35,10,-25,-24,.04,3.24,'deck');
  box(-35,-30,-27,-26,3.24,5.5,'wall'); box(-27,-25,-27,-26,3.24,5.5,'wall');
  box(-25.2,-25,-32,-26,3.24,5.5,'wall');
  // Rail tops are solid geometry shared with the render; h describes the grindable top.
  for(const rail of RAILS){
    const surface=rail.kind==='coping'?(rail.id.startsWith('vert')?'vert':'bowl'):'metal';
    const [[x,z,h],[u,v,k]]=rail.pts,w=.055,dx=u-x,dz=v-z,n=Math.hypot(dx,dz),ox=-dz/n*w,oz=dx/n*w;
    quad([x+ox,h,z+oz],[u+ox,k,v+oz],[u-ox,k,v-oz],[x-ox,h,z-oz],surface,'steel');
    quad([x-ox,h-.09,z-oz],[x-ox,h,z-oz],[u-ox,k,v-oz],[u-ox,k-.09,v-oz],surface,'steel');
    quad([u+ox,k-.09,v+oz],[u+ox,k,v+oz],[x+ox,h,z+oz],[x+ox,h-.09,z+oz],surface,'steel');
    if(rail.kind==='rail')for(const t of [0,.5,1]){const px=x+dx*t,pz=z+dz*t,ph=h+(k-h)*t;box(px-.035,px+.035,pz-.035,pz+.035,.04,ph,'steel','metal');}
  }
  box(-42.3,-42,-32,32,.04,1,'wall'); box(42,42.3,-32,32,.04,1,'wall'); box(-42,42,-32.3,-32,.04,8,'wall');
  return tris;
}

export const SKATESTREET_PARK = Object.freeze({
  id:'skatestreet',name:'SKATESTREET',start:{at:[-39.5,-10.5],toward:[1,0],height:3.24},rails:RAILS,
  gaps:[
    {name:'SUPER DROP',points:300,from:[-36,-29,-18,-4],fromAbove:2.7,to:[-33,-13,-20,0],toBelow:2.4},
    {name:'BOWL TO BOWL',points:600,from:[-15,-10,-15,-6],to:[-9.5,6,-16,-5]},
    {name:'SUPER AIR',points:400,from:[-35,-10,-24,4],to:[-35,-10,-24,4],minAir:1.2},
    {name:'VERT ALERT',points:500,from:[29,35,-21,-5],to:[28,35,-21,-5],minAir:1.7},
    {name:'FUNBOX FLIGHT',points:300,from:[-26,-20,13,25],to:[-20,-10,13,25]},
    {name:'KICKER TO LEDGE',points:350,from:[-5,3,16,19],to:[-5,3,20,28]},
    {name:'STAIR MAIL',points:300,from:[8,17,13,18.3],fromAbove:1.1,to:[7,18,21.2,30],toBelow:.5},
    {name:'MEZZANINE DROP',points:450,from:[-31,-26,-25,-21.5],fromAbove:3,to:[-33,-24,-21,-9],toBelow:2.5},
  ],
  letters:[{letter:'S',at:[-31,-10.5,2.8]},{letter:'K',at:[-9,-10.5,2]},{letter:'A',at:[33.4,-13,5.4]},{letter:'T',at:[-21,19,1.9]},{letter:'E',at:[12.5,17,1.6]}],
  tape:[-28.5,-29,3.65],
  goals:[{id:'high',label:'High Score',score:5000},{id:'pro',label:'Pro Score',score:15000},{id:'sick',label:'Sick Score',score:100000},{id:'skate',label:'Collect S-K-A-T-E'},{id:'transfer',label:'Bowl to Bowl',gap:'BOWL TO BOWL'},{id:'mezz',label:'Mezzanine Drop',gap:'MEZZANINE DROP'},{id:'combo',label:'6-trick combo',combo:6},{id:'tape',label:'Secret Tape'}],
});
