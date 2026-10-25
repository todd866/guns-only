import * as T from '../../vendor/three.module.js';
import {residentialGrass} from './residential-ground.js';
import {createSurfaceMaps} from './materials.js';
import {buildResidentialStreetSurfaces} from './residential-streets.mjs';
import {roofProfile,splitRoofTriangle} from './residential-roofs.mjs';

// Authored residential dressing. The data contract is intentionally local and
// anonymous: roads/areas are fictional IDs with x/z metres only. This module
// owns visual batching and the matching simple collision surfaces.
export function buildResidentialArt(scene, world, data = {}, options = {}) {
  if (!scene?.add) throw new TypeError('buildResidentialArt requires a scene');
  const root = new T.Group(); root.name = 'ResidentialArt';
  const buckets = new Map();
  const materials = new Map();
  const terrain = options.terrain;
  const heightAt = terrain?.heightAt ?? (() => 0);
  let currentBaseY = null;
  const project = p => [p[0], p[1] + (currentBaseY == null ? heightAt(p[0], p[2]) : currentBaseY), p[2]];
  const colours = {
    asphalt: '#59636a', sidewalk: '#b6b5a8', grass: '#668847', sand: '#baa783',
    concrete: '#b8b5a8', stucco: '#d1b08b', brick: '#a56c59',
    roof: '#795c54', trim: '#ead4a6', glass: '#3d6870',
    stucco1: '#d8c9ac', stucco2: '#c7b795', brick1: '#b97b66', brick2: '#b39879',
    roof1: '#64716e', roof2: '#937965', roof3: '#565f68', door1: '#50736c', door2: '#a05b45',
    schoolDoor: '#365a9a', skate: '#a9aaa3', rail: '#c8c2ad', court: '#d7965f', tree: '#5f874f',
  };
  const brickMaps=()=>{
    const size=128,pixels=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const row=Math.floor(y/16),mortar=y%16<1||(x+(row%2)*8)%16<1,noise=((x*73+y*131)%29)/29-.5;
      const colour=mortar?[.49,.45,.36]:[.48+noise*.06,.34+noise*.05,.24+noise*.04],i=(y*size+x)*4;
      colour.forEach((v,k)=>pixels[i+k]=v*255);pixels[i+3]=255;
    }
    const map=new T.DataTexture(pixels,size,size,T.RGBAFormat);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.minFilter=T.LinearMipmapLinearFilter;map.generateMipmaps=true;map.anisotropy=4;map.needsUpdate=true;return {map};
  };
  const mat = (key) => {
    if (!materials.has(key)) {
      const family=key.replace(/\d+$/,'');
      const texture = ['asphalt','concrete','stucco','roof'].includes(family) ? createSurfaceMaps(family) : family==='brick'?brickMaps():key==='grass'?residentialGrass():null;
      // A neutral material tile carries grain; the house palette carries paint.
      // Multiplying a warm coloured tile by another colour made every house brown.
      if (/\d$/.test(key) && texture?.map?.image?.data) {
        const pixels=texture.map.image.data, base={stucco:.72,brick:.48,roof:.37}[family];
        for(let i=0;i<pixels.length;i+=4){const grey=Math.max(0,Math.min(255,230+(pixels[i]-base*255)));pixels[i]=pixels[i+1]=pixels[i+2]=grey;}
        texture.map.needsUpdate=true;
      }
      materials.set(key, new T.MeshStandardMaterial({
        color: /\d$/.test(key) ? colours[key] : texture ? '#ffffff' : colours[key] || key,
        roughness: key === 'glass' ? .3 : .88,
        // Ground layers are centimetres apart across a kilometre-scale view.
        // Bias paved overlays in depth, without lifting their wheel surfaces.
        polygonOffset: ['asphalt','sidewalk','concrete'].includes(key), polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        metalness: key === 'rail' ? .55 : 0,
        ...(texture ? { map: texture.map, ...(texture.bumpMap?{bumpMap:texture.bumpMap,bumpScale:.008}:{}), ...(texture.roughnessMap?{roughnessMap:texture.roughnessMap}:{}), ...(texture.normalMap?{normalMap:texture.normalMap}:{}), normalScale: new T.Vector2(.035, .035) } : {}),
      }));
    }
    return materials.get(key);
  };
  const push = (key, a, b, c, conform = true) => {
    if (!a || !b || !c) return;
    const chunked = /^(stucco|brick|roof|glass|trim|schoolDoor|door)[0-9]*$/.test(key);
    const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const bucketKey = chunked ? `${key}:${Math.floor(cx / 128)}:${Math.floor(cz / 128)}` : key;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { positions: [], uv: [] });
    const bucket = buckets.get(bucketKey);
    const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]),nx=ab[1]*ac[2]-ab[2]*ac[1],nz=ab[0]*ac[1]-ab[1]*ac[0],vertical=Math.abs(nx)+Math.abs(nz)>Math.abs(ab[2]*ac[0]-ab[0]*ac[2]);
    const triangles = conform && currentBaseY == null && terrain?.conformTriangle ? terrain.conformTriangle(a, b, c) : [[a, b, c]];
    for (const triangle of triangles) for(const p of triangle){const q=conform && currentBaseY == null && terrain?.conformTriangle ? p : project(p);bucket.positions.push(...q);if(vertical){const u=Math.abs(nx)>Math.abs(nz)?p[2]:p[0];bucket.uv.push(u/(key.startsWith('brick')?1.76:2),p[1]/(key.startsWith('brick')?.6:2));}else bucket.uv.push(p[0]*.5,p[2]*.5);}
  };
  const quad = (key, a, b, c, d) => { push(key, a, b, c); push(key, a, c, d); };
  const upTri=(key,a,b,c)=>{if((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])<0)[b,c]=[c,b];push(key,a,b,c);};
  const tessellate=(key,a,b,c,depth=0)=>{const longest=Math.max(Math.hypot(a[0]-b[0],a[2]-b[2]),Math.hypot(b[0]-c[0],b[2]-c[2]),Math.hypot(c[0]-a[0],c[2]-a[2]));if(longest<=8||depth>=6)return upTri(key,a,b,c);const ab=a.map((v,i)=>(v+b[i])*.5),bc=b.map((v,i)=>(v+c[i])*.5),ca=c.map((v,i)=>(v+a[i])*.5);tessellate(key,a,ab,ca,depth+1);tessellate(key,ab,b,bc,depth+1);tessellate(key,ca,bc,c,depth+1);tessellate(key,ab,bc,ca,depth+1);};
  const surface = (key, ring, y = .02) => {
    if (!ring || ring.length < 3) return;
    const pts=ring.length>3&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?ring.slice(0,-1):ring;
    for(const f of T.ShapeUtils.triangulateShape(pts.map(p=>new T.Vector2(...p)),[]))tessellate(key,...f.map(i=>[pts[i][0],y,pts[i][1]]));
  };
  const collideQuad = (a, b, c, d, name = 'concrete') => {
    if (currentBaseY == null && terrain?.conformTriangle && world?.addTri) {
      for (const triangle of [...terrain.conformTriangle(a, b, c), ...terrain.conformTriangle(a, c, d)]) world.addTri(...triangle, name);
    } else world?.addQuad?.(...[a,b,c,d].map(project), name);
  };
  const ribbon = (key, a, b, width, y = .025, collision = true, offset = 0) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < .05) return;
    const nx = -dz / len, nz = dx / len;
    const ox = nx * offset, oz = nz * offset;
    const A = [a[0] + ox + nx * width / 2, y, a[1] + oz + nz * width / 2], B = [a[0] + ox - nx * width / 2, y, a[1] + oz - nz * width / 2], C = [b[0] + ox - nx * width / 2, y, b[1] + oz - nz * width / 2], D = [b[0] + ox + nx * width / 2, y, b[1] + oz + nz * width / 2];
    quad(key, A, D, C, B);
    if (collision) collideQuad(A, D, C, B, key === 'asphalt' ? 'asphalt' : 'concrete');
  };
  const ribbonPath=(key,a,b,width,y,collision=true,offset=0)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4));for(let i=0;i<n;i++){const t=i/n,u=(i+1)/n;ribbon(key,[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],width,y,collision,offset);}};
  for(const surface of buildResidentialStreetSurfaces(data.roads||[]).surfaces){
    const key=surface.material==='path'?'sidewalk':surface.material;
    quad(key,...surface.quad);
    if(surface.collision)collideQuad(...surface.quad,surface.collision==='path'?'concrete':surface.collision);
  }
  if(terrain?.triangles){for(const tri of terrain.triangles())push('grass',...tri.map(p=>[p[0],0,p[2]]),false);}
  else if(data.bounds){const [a,b,c,d]=data.bounds;surface('grass',[[a,b],[c,b],[c,d],[a,d]],0);collideQuad([a,0,b],[a,0,d],[c,0,d],[c,0,b],'grass');}
  // The residential district is fully irrigated; desert terrain stays outside it.
  for (const green of data.greens || []) surface('grass', green.points, .012);

  const clean=ring=>ring.length>3&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?ring.slice(0,-1):ring;
  const roadSegments=(data.roads||[]).filter(r=>!/foot|path|walk|cycle/.test(r.kind)).flatMap(r=>r.points.slice(1).map((b,i)=>[r.points[i],b]));
  const nearestRoad=p=>{let best=null;for(const [a,b]of roadSegments){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1))),q=[a[0]+dx*t,a[1]+dz*t],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(!best||d<best.d)best={q,d};}return best;};
  for(const [index,building]of(data.buildings||[]).entries()){
    const kind=building.kind,house=kind==='house',heroSchool=kind==='school'&&building.holes?.length===1,heroCivic=kind==='civic'&&index===0,h=heroSchool?3.4:kind==='civic'&&index===0?5:building.height||(house?3.1:6.2),outer=clean(building.points),holes=(building.holes||[]).map(clean),rings=[outer,...holes],points=rings.flat(),centre=outer.reduce((s,p)=>[s[0]+p[0]/outer.length,s[1]+p[1]/outer.length],[0,0]);
    currentBaseY=heightAt(centre[0],centre[1]);
    const foundationLo=Math.min(...outer.map(p=>heightAt(p[0],p[1])));
    const faces=T.ShapeUtils.triangulateShape(outer.map(p=>new T.Vector2(...p)),holes.map(r=>r.map(p=>new T.Vector2(...p))));
    const wallKey=house?(index%3===0?'stucco'+(index%2+1):'brick'+(index%2+1)):kind==='school'?'brick':'stucco';
    const roofKey=house?'roof'+(index%3+1):'roof',profile=house?roofProfile(outer,h,index):null;
    let front=null;
    for(const [ringIndex,ring]of rings.entries()){
      const area=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0),sign=(area>0?1:-1)*(ringIndex? -1:1);
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.02)continue;
        const nx=sign*dz/len,nz=-sign*dx/len,p=(u,y,off=.04)=>[a[0]+dx*u+nx*off,y===0?foundationLo-currentBaseY:y,a[1]+dz*u+nz*off];
        const face=(key,u0,u1,y0,y1,off=.04)=>{const q=[p(u0,y0,off),p(u1,y0,off),p(u1,y1,off),p(u0,y1,off)];if(sign>0)q.reverse();quad(key,...q);};
        const q=[p(0,0,0),p(1,0,0),p(1,h,0),p(0,h,0)];if(sign>0)q.reverse();if(!heroSchool)quad(wallKey,...q);collideQuad(...q,'concrete');
        // Human-sized window bays and doors establish the small car's scale.
        const bays=(heroSchool||heroCivic)?0:Math.floor(len/(house?3.6:3)),levels=Math.max(1,Math.round(h/3.1));
        for(let floor=0;floor<levels;floor++)for(let j=0;j<bays;j++){
          const u=(j+.5)/bays,half=(house?.68:.85)/len,y=1.05+floor*3.1;
          if(y+1.25>h-.2)continue;
          face('trim',u-half-.08/len,u+half+.08/len,y-.08,y+1.28,.05);
          face('glass',u-half,u+half,y,y+1.2,.065);
          face('trim',u-.025/len,u+.025/len,y,y+1.2,.08);
        }
        if(!heroSchool)face('trim',0,1,h-.13,h+.06,.08);
        if(house){
          const cuts=[0,1],da=profile.across(a)-profile.ridge,db=profile.across(b)-profile.ridge;if(da*db<0)cuts.splice(1,0,da/(da-db));
          for(let j=1;j<cuts.length;j++){const u=cuts[j-1],v=cuts[j],A=p(u,h,.005),B=p(v,h,.005),C=p(v,profile.height([a[0]+dx*v,a[1]+dz*v]),.005),D=p(u,profile.height([a[0]+dx*u,a[1]+dz*u]),.005);quad(wallKey,...(sign>0?[D,C,B,A]:[A,B,C,D]));}
        }
        if(!ringIndex&&len>3){const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],road=nearestRoad(mid);if(road&&(!front||road.d<front.road.d))front={face,p,len,mid,road};}
      }
    }
    if(front&&!heroSchool&&!heroCivic){
      const {face,p,len,mid,road}=front,door=house?.95:2.3;
      face('trim',.5-(door+.18)/len/2,.5+(door+.18)/len/2,.015,2.28,.085);
      face(kind==='school'?'schoolDoor':house?'door'+(index%2+1):'glass',.5-door/len/2,.5+door/len/2,.025,2.18,.10);
      face('trim',.5-.025/len,.5+.025/len,.04,2.16,.12);
      if(road.d<35){const savedBase=currentBaseY;currentBaseY=null;
        // The path ends at the near street edge rather than covering the lane.
        const distance=Math.max(0,road.d-3.1),t=distance/(road.d||1),end=mid.map((v,i)=>v+(road.q[i]-v)*t);
        ribbonPath('concrete',mid,end,house?1.15:3,.038,true);currentBaseY=savedBase;}
      if(house){
        const awning=[p(.5-1.4/len,2.4,.10),p(.5+1.4/len,2.4,.10),p(.5+1.4/len,2.32,1.05),p(.5-1.4/len,2.32,1.05)];quad(roofKey,...awning);quad(roofKey,...awning.slice().reverse());
        face('trim',.5-.025/len,.5+.025/len,1.02,1.16,.15);
      }
      if(house&&len>7){const u=.18,w=2.4/len;face('trim',u-w/2,u+w/2,.025,2.1,.08);for(let j=1;j<5;j++)face('roof',u-w/2,u+w/2,j*.4,j*.4+.025,.09);}
    }
    for(const f of faces){
      const tri=f.map(i=>points[i]);
      for(const roofTri of house?splitRoofTriangle(tri,profile):[tri])upTri(roofKey,...roofTri.map(p=>[p[0],house?profile.height(p):h+.08,p[1]]));
    }
    currentBaseY=null;
  }

  // Batch every authored surface by material to keep the whole neighbourhood
  // comfortably below the open-world draw budget.
  for (const [bucketKey, values] of buckets) {
    if (!values.positions.length) continue;
    const key = bucketKey.split(':', 1)[0];
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(values.positions, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(values.uv, 2)); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, mat(key)); mesh.name = `Residential_${bucketKey}`; mesh.castShadow = /^(stucco|brick|roof)/.test(key); mesh.receiveShadow = true; root.add(mesh);
  }
  root.updateMatrixWorld(true); scene.add(root);
  return { root, dispose() { root.removeFromParent(); root.traverse((o) => o.geometry?.dispose()); for (const m of materials.values()) { m.map?.dispose(); m.bumpMap?.dispose(); m.roughnessMap?.dispose(); m.normalMap?.dispose(); m.dispose(); } } };
}

export function prepareResidential(world,data,options={}){
 const staging=new T.Group(),built=buildResidentialArt(staging,world,data,options);
 return {attach(scene){scene.add(built.root);},dispose:built.dispose};
}
