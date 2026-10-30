import {SCENERY_BOUNDS as DISTRICT_BOUNDS} from './district-zones.mjs';
import {WATER_BODIES,basinTriangles} from '../physics/water.mjs';
import {MINE_BOUNDS,mineWorldTris} from './mine.mjs';
import {subtractBox} from './district-entrances.mjs';
import {groundTriangles} from './elevation.mjs';
import {createWorld} from '../physics/world.mjs';
import {BOUNDS,eventSurface} from './catalog.mjs';
import {buildingInfo,addBuildingCollision,surfaceAt} from './geometry.mjs';
export const SIZE=256;
export const tileKey=(x,z)=>`${Math.floor(x/SIZE)},${Math.floor(z/SIZE)}`;
export function desiredTiles(pos,radius=2){const tx=Math.floor(pos[0]/SIZE),tz=Math.floor(pos[2]/SIZE),out=[];for(let x=tx-radius;x<=tx+radius;x++)for(let z=tz-radius;z<=tz+radius;z++)if((x+1)*SIZE>=BOUNDS[0]&&x*SIZE<=BOUNDS[2]&&(z+1)*SIZE>=BOUNDS[1]&&z*SIZE<=BOUNDS[3])out.push([x,z]);return out.sort((a,b)=>Math.hypot(a[0]-tx,a[1]-tz)-Math.hypot(b[0]-tx,b[1]-tz));}
export function createStream({manifest,fetchTile,onLoad=()=>{},onDrop=()=>{},cacheLimit=64,elevation=null,residentialTerrain=null,terrainSite=null}){
 const available=new Set(manifest.tiles.map(t=>t.join(','))),loaded=new Map(),pending=new Map(),errors=new Map(),authored=createWorld(16);const cache=new Map();let wanted=new Set(),disposed=false;
 cacheLimit=Math.max(25,Math.floor(cacheLimit)||64);
 const ground=(x,z)=>eventSurface(x,z)??(inResidentialTerrain(x,z)?'grass':surfaceAt(x,z,loaded.get(tileKey(x,z))?.features??[]));
 const inResidentialTerrain=(x,z)=>!!residentialTerrain&&x>=residentialTerrain.bounds[0]&&x<=residentialTerrain.bounds[2]&&z>=residentialTerrain.bounds[1]&&z<=residentialTerrain.bounds[3];
 const terrainClipBounds=[...DISTRICT_BOUNDS,...(residentialTerrain?.bounds?[residentialTerrain.bounds]:[]),...(terrainSite?.hole?[terrainSite.hole]:[]),...WATER_BODIES.map(b=>b.rect),MINE_BOUNDS];   // water basins replace the ground
 const inTerrainHole=(x,z)=>!!terrainSite?.hole&&x>=terrainSite.hole[0]&&x<=terrainSite.hole[2]&&z>=terrainSite.hole[1]&&z<=terrainSite.hole[3];
 function candidates(a,b){const out=[];for(let x=Math.floor(Math.min(a[0],b[0])/SIZE);x<=Math.floor(Math.max(a[0],b[0])/SIZE);x++)for(let z=Math.floor(Math.min(a[2],b[2])/SIZE);z<=Math.floor(Math.max(a[2],b[2])/SIZE);z++){const tile=loaded.get(`${x},${z}`);if(tile)out.push(tile);}return out;}
 if(residentialTerrain?.triangles)for(const [a,b,c] of residentialTerrain.triangles())authored.addTri(a,b,c,'grass');
 // Water basins replace the ground they cut out (see terrainClipBounds), so collision is never missing.
 for(const b of WATER_BODIES)for(const [p,q,r] of basinTriangles(b))authored.addTri(p,q,r,'water');
 // The Old Silver Mine (docs/design/adventure): its own floor, walls and gated doors.
 for(const t of mineWorldTris())authored.addTri(t.a,t.b,t.c,t.surface,t.gate);
 const world={addTri:authored.addTri,addQuad:authored.addQuad,
  // Every collision triangle currently loaded, '__terrain' resolved to its surface (native export).
  triangles(){const out=[...authored.tris];for(const t of loaded.values())for(const tri of t.collision?.tris??[])out.push(tri.surface==='__terrain'?{...tri,surface:ground((tri.a[0]+tri.b[0]+tri.c[0])/3,(tri.a[2]+tri.b[2]+tri.c[2])/3)}:tri);return out;},
  flatGround:!elevation,
  openGate:id=>authored.openGate(id),
  raycast(origin,dir,maxDist){let best=authored.raycast(origin,dir,maxDist);const end=origin.map((v,i)=>v+dir[i]*maxDist);for(const t of candidates(origin,end)){const hit=t.collision.raycast(origin,dir,maxDist);if(hit&&(!best||hit.dist<best.dist)){if(hit.surface==='__terrain')hit.surface=ground(hit.point[0],hit.point[2]);best=hit;}}
    if(!elevation&&dir[1]<-1e-10){const dist=-origin[1]/dir[1];if(dist>=0&&dist<=maxDist){const p=origin.map((v,i)=>v+dir[i]*dist);if(!inResidentialTerrain(p[0],p[2])&&!inTerrainHole(p[0],p[2])&&(!best||dist<best.dist))best={point:p,normal:[0,1,0],dist,surface:ground(p[0],p[2])};}}return best;},
  sphereContacts(c,r,out=[]){authored.sphereContacts(c,r,out);const seen=new Set();for(const t of candidates([c[0]-r,c[1],c[2]-r],[c[0]+r,c[1],c[2]+r]))for(const p of t.collision.sphereContacts(c,r)){if(p.surface==='__terrain')p.surface=ground(p.point[0],p.point[2]);const key=[...p.point,...p.normal].map(v=>v.toFixed(5)).join(',');if(!seen.has(key)){out.push(p);seen.add(key);}}
    if(!elevation&&!inResidentialTerrain(c[0],c[2])&&!inTerrainHole(c[0],c[2])&&c[1]<r&&c[1]>-2)out.push({point:[c[0],0,c[2]],normal:[0,1,0],depth:r-c[1],surface:ground(c[0],c[2])});return out;},
 };
 // Keep CPU tile data bounded independently of the 25 rendered/collidable tiles.
 // Preparing a destination never drops the current scene; a failed trip stays driveable.
 function remember(key,tile){cache.delete(key);cache.set(key,tile);while(cache.size>cacheLimit)cache.delete(cache.keys().next().value);return tile;}
 async function fetchReady(key){
  if(disposed)return null;
  if(loaded.has(key))return remember(key,loaded.get(key));
  if(cache.has(key))return remember(key,cache.get(key));
  if(pending.has(key))return pending.get(key);
  if(errors.has(key)&&Date.now()-errors.get(key)<3000)return null;
  const job=(async()=>{try{
   const tile=available.has(key)?await fetchTile(key):{tile:key.split(',').map(Number),features:[]};
   if(disposed)return null;
   tile.collision=createWorld(16);if(elevation){const [x,z]=tile.tile;for(const tri of groundTriangles(elevation,[x*SIZE,z*SIZE,(x+1)*SIZE,(z+1)*SIZE],16,terrainSite)){let parts=[tri];for(const d of terrainClipBounds){if(Math.min(...tri.map(p=>p[0]))>d[2]||Math.max(...tri.map(p=>p[0]))<d[0]||Math.min(...tri.map(p=>p[2]))>d[3]||Math.max(...tri.map(p=>p[2]))<d[1])continue;parts=parts.flatMap(t=>subtractBox(t,[d[0],-100,d[1],d[2],1000,d[3]]));}for(const part of parts)tile.collision.addTri(...part,'__terrain');}}for(const f of tile.features)if(f.properties.building&&f.geometry.type==='Polygon'){const info=buildingInfo(f);if(info)addBuildingCollision(tile.collision,info,f.properties.building==='roof');}
   errors.delete(key);return remember(key,tile);
  }catch(e){if(!disposed)errors.set(key,Date.now());return null;}})();
  pending.set(key,job);
  try{return await job;}finally{if(pending.get(key)===job)pending.delete(key);}
 }
 async function prepare(pos){if(disposed)return false;const tiles=await Promise.all(desiredTiles(pos).map(t=>fetchReady(t.join(','))));return !disposed&&tiles.every(Boolean);}
 async function update(pos){if(disposed)return;wanted=new Set(desiredTiles(pos).map(t=>t.join(',')));for(const [key,tile] of loaded)if(!wanted.has(key)){onDrop(key,tile);loaded.delete(key);}
  // Only failures the car still needs keep the per-frame retry alive.
  for(const key of errors.keys())if(!wanted.has(key))errors.delete(key);
  await Promise.all([...wanted].map(async key=>{if(loaded.has(key))return;const tile=await fetchReady(key);if(disposed||!tile||!wanted.has(key)||loaded.has(key))return;onLoad(key,tile);loaded.set(key,tile);}));
 }
 // Streaming must be ready before a car can enter a neighbouring cell; no ghost buildings.
 const ready=pos=>desiredTiles(pos,1).every(t=>loaded.has(t.join(',')));
 return {world,update,prepare,ready,loaded,errors,stats:()=>({tiles:loaded.size,cached:cache.size,pending:pending.size,failed:errors.size,features:[...loaded.values()].reduce((n,t)=>n+t.features.length,0)}),dispose(){disposed=true;for(const [key,tile]of loaded)onDrop(key,tile);loaded.clear();cache.clear();errors.clear();}};
}
