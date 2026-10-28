import {RESIDENTIAL_START} from './residential-frame.mjs';
import {ALIEN_EVENTS,ALIEN_LOCATIONS} from './alien-world.mjs';
import {BATTLE_EVENTS} from './battle-arenas.mjs';
import {CLASSIC_LOCATIONS,CLASSIC_EVENTS} from './classic-courses.mjs';
import {VENUE_LOCATIONS,VENUE_EVENTS} from './expansion-venues.mjs';
import {PORTAL_EVENT,portalHeight} from './portal-course.mjs';
import {ROAD_EVENTS} from './road-events.mjs';
// Authored activities in the real Nellis local metre frame. +x east, +z south.
// Gameplay courses and landmark art are fiction; OSM supplies roads and footprints.
export const BOUNDS = [-3800, -2300, 3250, 4050];
export const LOCATIONS = [
  {id:'gate',name:'Main Gate',short:'Main Gate',pos:[-607,0,-29],color:'#f8c35d',icon:'⌂',kind:'race',event:'gate-guard'},
  {id:'skatepark',name:'Neighbourhood Skatepark',short:'Skatepark',pos:RESIDENTIAL_START.pos,color:'#59cec4',icon:'↗',kind:'interior',track:'skatepark'},
  {id:'housing',name:'Base Housing',short:'Housing',pos:[-1285,0,-1132],color:'#75cc9e',icon:'🏁',kind:'interior',track:'housing'},
  {id:'bx',name:'The BX',short:'BX',pos:[-546,0,791],color:'#f899bc',icon:'🏁',kind:'interior',track:'bx'},
  {id:'school',name:'Saucer Springs Elementary',short:'School',pos:[-1228,0,718],color:'#f7cb67',icon:'🏁',kind:'interior',track:'school'},
  {id:'ramp',name:'Red Flag Ramp',short:'Red Flag',pos:[618,0,71],color:'#fb8e56',icon:'🏁',kind:'race',event:'ramp-rat'},
  {id:'hangars',name:'Hangar Row',short:'Hangars',pos:[380,0,400],color:'#7ed7de',icon:'🏁',kind:'race',event:'hangar-hop'},
  {id:'runway',name:'Runway 03',short:'Runway',pos:[24,0,1842],color:'#c5d7ee',icon:'🏁',kind:'race',event:'runway-drag'},
  {id:'wic',name:'WIC PlayPlace',short:'Big Skatepark',pos:[-1130,0,1230],color:'#b6a0f9',icon:'↗',kind:'race',event:'playplace'},
  {id:'dirt',name:'Desert Whoops',short:'Whoops',pos:[1800,0,1450],color:'#e2a16d',icon:'🏁',kind:'race',event:'whoops'},
  {id:'golf',name:'Sunrise Vista',short:'Golf',pos:[-330,0,2776],color:'#a8d485',icon:'◇',kind:'activity',game:'golf',event:'fairway-rally'},
  {id:'zoo',name:'Petting Zoo',short:'Petting Zoo',pos:[-1361,0,2074],color:'#78d2d0',icon:'◇',kind:'discovery'},
  {id:'rec',name:'Strike Recreation',short:'Bowling',pos:[-1020,0,1260],color:'#e4ad89',icon:'◇',kind:'activity',game:'bowling',event:'rink-drift'},
  {id:'diamond',name:'Baseball Diamond',short:'Baseball',pos:[-1327,0,1490],color:'#e5c68d',icon:'🏁',kind:'race',event:'round-bases'},
  {id:'boneyard',name:'Desert Boneyard',short:'Boneyard',pos:[2350,0,1600],color:'#c6b99c',icon:'🏁',kind:'race',event:'wing-walker'},
  {id:'waterpark',name:'Sunrise Splash',short:'Waterpark',pos:[-545,0,3388],color:'#79d9e2',icon:'🏁',kind:'race',event:'splash-down'},
  {id:'lab',name:'Dreamland',short:'Dreamland',pos:[2500,0,-1200],color:'#9fe2a8',icon:'◇',kind:'race',event:'dreamland'},
  // THPS2-style skate park on the flight line: E inside opens the skate goal card.
  {id:'schoolyard',name:'Schoolyard',short:'Schoolyard',pos:[-3373,0,-778],color:'#f2b705',icon:'🛹',kind:'activity',skate:'school'},
  {id:'skatestreet',name:'Skatestreet',short:'Skatestreet',pos:[560,0,1030],color:'#59cec4',icon:'🛹',kind:'activity',skate:'skatestreet'},
  {id:'skate-hangar',name:'Skate Hangar',short:'Skate Hangar',pos:[581.9,0,877.7],color:'#edbd6a',icon:'🛹',kind:'activity',skate:'hangar'},
];
LOCATIONS.push(...VENUE_LOCATIONS,...CLASSIC_LOCATIONS,...ALIEN_LOCATIONS,{id:'night-wave',name:'Night Wave',short:'Night Wave',pos:[11200,0,200],color:'#a99cf2',icon:'◇',kind:'race',event:'night-wave',alien:true});
const loop = (cx,cz,w,d) => [[cx,cz],[cx+w*.4,cz],[cx+w*.5,cz-d*.18],[cx+w*.5,cz-d*.82],[cx+w*.35,cz-d],[cx-w*.35,cz-d],[cx-w*.5,cz-d*.82],[cx-w*.5,cz-d*.18],[cx-w*.4,cz],[cx,cz]];
export const EVENTS = [
  {id:'gate-guard',name:'Gate Guard',location:'gate',kind:'circuit',points:loop(-607,-29,100,70),half:4,medals:[30,42,60]},
  {id:'ramp-rat',name:'Ramp Rat',location:'ramp',kind:'circuit',points:[[618,71],[700,71],[700,15],[650,15],[600,15],[540,15],[540,-19],[590,-19],[640,-19],[700,-19],[710,40],[618,71]],half:5,medals:[60,80,110]},
  {id:'hangar-hop',name:'Hangar Hop',location:'hangars',kind:'sprint',clearing:true,points:[[380,400],[353,380],[353,350],[353,330],[380,315],[407,330],[407,350],[407,380],[430,420],[500,460],[600,500]],half:4,medals:[50,68,95]},
  {id:'runway-drag',name:'Runway Drag',location:'runway',kind:'sprint',points:Array.from({length:9},(_,i)=>[24+i*50*.656,1842-i*50*.755]),half:12,medals:[33,40,50]},
  {id:'playplace',name:'PlayPlace',location:'wic',kind:'circuit',points:loop(-1130,1230,85,60),half:4,medals:[27,38,55]},
  {id:'fairway-rally',name:'Fairway Rally',location:'golf',kind:'circuit',surface:'grass',points:loop(-330,2776,220,150),half:6,medals:[70,95,130]},
  {id:'rink-drift',name:'Rink Drift',location:'rec',kind:'circuit',night:true,surface:'gymfloor',points:loop(-940,1260,45,30),half:4,medals:[20,28,40]},
  {id:'round-bases',name:'Round the Bases',location:'diamond',kind:'sprint',surface:'dirt',clearing:true,points:[[-1327,1490],[-1307,1470],[-1327,1450],[-1347,1470],[-1327,1490]],half:4,medals:[17,24,35]},
  {id:'wing-walker',gateWidths:[5,12],name:'Wing Walker',location:'boneyard',kind:'circuit',points:loop(2350,1600,190,130),half:5,medals:[52,72,100],alts:[{name:'Wing hop',nodes:[[2354,1600,1],[2356,1592,1],[2364,1592,1],[2370,1592,1],[2380,1592,2],[2400,1592,2],[2410,1592,2],[2426,1592,2],[2426,1600,2]]}]},
  {id:'splash-down',name:'Wavepool Beach',location:'waterpark',kind:'circuit',points:[[-545,3388],[-481,3388],[-465,3370],[-465,3340],[-490,3340],[-530,3340],[-545,3310],[-590,3310],[-625,3340],[-625,3370],[-609,3388],[-545,3388]],half:5,medals:[48,65,90]},
  {id:'dreamland',name:'Containment Circuit',location:'lab',kind:'circuit',night:true,points:[[2330,-1200],[2380,-1200],[2380,-1240],[2350,-1240],[2350,-1280],[2290,-1280],[2290,-1240],[2320,-1240],[2320,-1220],[2280,-1220],[2280,-1200],[2330,-1200]],half:5,medals:[44,60,85]},
  {id:'whoops',name:'Whoops',location:'dirt',kind:'circuit',surface:'dirt',points:[[1800,1450],[1880,1450],[1880,1400],[1740,1400],[1740,1450],[1800,1450]],half:5,medals:[42,57,80]},
];
EVENTS.push(...ROAD_EVENTS,...VENUE_EVENTS,...CLASSIC_EVENTS,...BATTLE_EVENTS,...ALIEN_EVENTS,PORTAL_EVENT);
export const DISTRICT_EVENTS=['skatepark','housing','bx','school'].map(id=>({id:'district-'+id,name:id==='skatepark'?'Neighbourhood Run':LOCATIONS.find(p=>p.id===id).name,location:id,district:id,kind:'circuit',medals:[100,150,210]}));
export const RACE_EVENTS=[...EVENTS,...DISTRICT_EVENTS];
export const PAINTS=[{name:'Viper Punks',color:'#ed9145'},{name:'Arctic',color:'#d7e5e8'},{name:'Aggressor',color:'#6a9dbf'},{name:'Mudhen Mafia',color:'#b5a17b'},{name:'Night Wave',color:'#74728d'}];
export const locationById=id=>LOCATIONS.find(p=>p.id===id);
export const eventById=id=>RACE_EVENTS.find(p=>p.id===id);
export function eventCourse(event,world){
  const points=event.points,first=points[0],next=points[1],yaw=Math.atan2(next[0]-first[0],-(next[1]-first[1]));
  const ai=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4);for(let j=0;j<n;j++)ai.push({pos:[a[0]+(b[0]-a[0])*j/n,(a[2]??0)+((b[2]??0)-(a[2]??0))*j/n,a[1]+(b[1]-a[1])*j/n],halfWidth:event.half});}
  if(event.kind==='sprint')ai.push({pos:[points.at(-1)[0],0,points.at(-1)[1]],halfWidth:event.half});
  return {world,event,outOfBounds:event.alien&&event.id!=='night-wave'?pos=>pos[1]<-3:event.id==='night-wave'?pos=>{const h=portalHeight(pos[0],pos[2]);return h.height>3&&pos[1]<h.height-2;}:null,pickupItems:event.id==='runway-drag'?['zoom']:undefined,checkpoints:points.map(([x,z],i)=>{const a=points[Math.max(0,i-1)],b=i?points[i]:points[1],d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [x,z,i===points.length-1?'Finish':`Gate ${i+1}`,event.gateWidths?.[i]??event.half,[(b[0]-a[0])/d,(b[1]-a[1])/d]];}),ai,start:{pos:[first[0],first[2]??0,first[1]],yaw},secrets:[],coins:[],pickups:ai.filter((_,i)=>i%12===6).map(a=>({pos:[a.pos[0],a.pos[1]+.16,a.pos[2]]})),alts:event.alts??[]};
}
const eventAreas=EVENTS.filter(e=>!e.road&&(e.kind!=='sprint'||e.clearing)).map(e=>({event:e,bounds:e.clearingBounds??[Math.min(...e.points.map(p=>p[0])),Math.min(...e.points.map(p=>p[1])),Math.max(...e.points.map(p=>p[0])),Math.max(...e.points.map(p=>p[1]))]}));
function eventAt(x,z,padding){return eventAreas.find(({bounds:b})=>x>=b[0]-padding&&x<=b[2]+padding&&z>=b[1]-padding&&z<=b[3]+padding)?.event;}
export function inEventArea(x,z,padding=12){return !!eventAt(x,z,padding);}
// Shallow splash-pad drag is authored toy handling, not a hydrodynamic model.
export const SAND_ZONES=[[-447,2700,-430,2730]];
export const SPLASH_ZONES=[[-565,3380,-545,3396],[-632,3310,-617,3340],[-310,2670,-280,2690]];
export function eventSurface(x,z){if(SPLASH_ZONES.some(b=>x>=b[0]&&x<=b[2]&&z>=b[1]&&z<=b[3]))return 'water';if(SAND_ZONES.some(b=>x>=b[0]&&x<=b[2]&&z>=b[1]&&z<=b[3]))return 'gravel';const e=eventAt(x,z,6);return e?(e.surface??'asphalt'):null;}
export function nearestLocation(pos){return LOCATIONS.reduce((a,b)=>distance(pos,a.pos)<distance(pos,b.pos)?a:b);}
export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
// Original, friendly specimens stand beside each public event ring; Dreamland is the reward.
export const SPECIMENS=LOCATIONS.filter(p=>['gate','housing','bx','school','ramp','hangars','runway','wic','dirt','golf','zoo','rec','diamond','boneyard','waterpark'].includes(p.id)).map(p=>({id:p.id,name:p.short,x:p.pos[0]+4,z:p.pos[2]+2}));
export const specimensComplete=state=>SPECIMENS.every(p=>state.specimens.includes(p.id));
const EARLY_CUP_EVENTS=['district-housing','district-bx','district-school','splash-down','demo-team-circuit','supply-line','ramp-rat','wing-walker'];
export const earlyCupsComplete=state=>EARLY_CUP_EVENTS.every(id=>[state?.raceWins?.[id],state?.wins?.[id]].some(t=>Number.isFinite(t)&&t>0));
// The lab follows the ordinary base cups and specimen hunt; the portal follows its finale.
export const dreamlandUnlocked=state=>specimensComplete(state)&&earlyCupsComplete(state);
export const secretLabUnlocked=dreamlandUnlocked;
export const alienWorldUnlocked=state=>secretLabUnlocked(state)&&['dreamland'].some(id=>[state?.raceWins?.[id],state?.wins?.[id]].some(t=>Number.isFinite(t)&&t>0));
export const canEnter=(state,p)=>p?.alien?alienWorldUnlocked(state):p?.id==='lab'?secretLabUnlocked(state):true;
// Ordinary base geography is visitable even when its challenge is locked.
export const canVisit=(state,p)=>!!p&&(!p.alien||alienWorldUnlocked(state));
export const canEnterEvent=(state,event)=>event?.alien?alienWorldUnlocked(state):canEnter(state,locationById(event?.location));
export function collectSpecimens(state,seen){const found=[];for(const i of seen){const p=SPECIMENS[i];if(p&&!state.specimens.includes(p.id)){state.specimens.push(p.id);found.push(p);}}return found;}
export function expedition(state){return {found:state.specimens.length,total:SPECIMENS.length,unlocked:dreamlandUnlocked(state),complete:dreamlandUnlocked(state)&&(['dreamland','night-wave'].some(id=>[state.raceWins?.[id],state.wins?.[id]].some(t=>Number.isFinite(t)&&t>0)))};}
export function loadProgress(storage){let v;try{v=JSON.parse(storage?.getItem('guns-only.rc.world.v1'));}catch{}
 const ids=(value,valid)=>[...new Set(Array.isArray(value)?value.filter(id=>valid.some(p=>p.id===id)):[])];
 const raceWins={};for(const e of RACE_EVENTS){const t=v?.raceWins?.[e.id];if(typeof t==='number'&&Number.isFinite(t)&&t>0)raceWins[e.id]=t;}
 const wins={};for(const e of RACE_EVENTS){const t=v?.wins?.[e.id];if(typeof t==='number'&&Number.isFinite(t)&&t>0)wins[e.id]=t;}
 return {discovered:['gate',...ids(v?.discovered,LOCATIONS).filter(id=>id!=='gate')],specimens:ids(v?.specimens,SPECIMENS),bowlingBest:Number.isInteger(v?.bowlingBest)&&v.bowlingBest>=0&&v.bowlingBest<=10?v.bowlingBest:0,golfBest:Number.isInteger(v?.golfBest)&&v.golfBest>0?v.golfBest:null,wins,raceWins,body:['buggy','monster','rally','pickup','golf'].includes(v?.body)&&(v.body!=='golf'||v?.discovered?.includes('golf'))?v.body:'jet',shell:['viper','eagle','hog','raptor','flanker'].includes(v?.shell)?v.shell:'viper',paint:PAINTS.some(p=>p.color===v?.paint)?v.paint:PAINTS[0].color};}
export function saveProgress(storage,state){try{storage?.setItem('guns-only.rc.world.v1',JSON.stringify(state));}catch{}}
export function discover(state,pos){const found=[];for(const p of LOCATIONS)if(canEnter(state,p)&&distance(pos,p.pos)<45&&!state.discovered.includes(p.id)){state.discovered.push(p.id);found.push(p);}return found;}
export function recordFinish(state,id,time){const event=eventById(id);if(!event||!Number.isFinite(time)||time<=0||!canEnterEvent(state,event))return;state.raceWins??={};state.raceWins[id]=Math.min(Number(state.raceWins[id])||Infinity,time);state.wins[id]=Math.min(Number(state.wins[id])||Infinity,time);}
export function medal(event,time){const factor=event.kind==='sprint'?1:3;return time<=event.medals[0]*factor?'Gold':time<=event.medals[1]*factor?'Silver':time<=event.medals[2]*factor?'Bronze':'Finished';}
export function rcLink(params,search=''){const p=new URLSearchParams(search);for(const k of ['track','from','event','mode','at'])p.delete(k);for(const [k,v]of Object.entries(params))if(v!=null)p.set(k,v);return `?${p}`;}
