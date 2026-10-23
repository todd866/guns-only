import * as T from '../../vendor/three.module.js';
import {createSurfaceMaps} from './materials.js';
import {createRolledKerb} from './residential-kerbs.mjs';

// Authored residential dressing. The data contract is intentionally local and
// anonymous: roads/areas are fictional IDs with x/z metres only. This module
// owns visual batching and the matching simple collision surfaces.
export function buildResidentialArt(scene, world, data = {}) {
  if (!scene?.add) throw new TypeError('buildResidentialArt requires a scene');
  const root = new T.Group(); root.name = 'ResidentialArt';
  const buckets = new Map();
  const materials = new Map();
  const colours = {
    asphalt: '#59636a', sidewalk: '#b6b5a8', grass: '#668847', sand: '#baa783',
    concrete: '#b8b5a8', stucco: '#d1b08b', brick: '#a56c59',
    roof: '#795c54', trim: '#ead4a6', glass: '#3d6870',
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
      const texture = ['asphalt','concrete','stucco','roof'].includes(key) ? createSurfaceMaps(key) : key==='brick'?brickMaps():null;
      materials.set(key, new T.MeshStandardMaterial({
        color: texture ? '#ffffff' : colours[key] || key,
        roughness: key === 'glass' ? .3 : .88,
        metalness: key === 'rail' ? .55 : 0,
        ...(texture ? { map: texture.map, ...(texture.roughnessMap?{roughnessMap:texture.roughnessMap}:{}), ...(texture.normalMap?{normalMap:texture.normalMap}:{}), normalScale: new T.Vector2(.035, .035) } : {}),
      }));
    }
    return materials.get(key);
  };
  const push = (key, a, b, c) => {
    if (!a || !b || !c) return;
    const chunked = /^(stucco|brick|roof|glass|trim|schoolDoor)$/.test(key);
    const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const bucketKey = chunked ? `${key}:${Math.floor(cx / 128)}:${Math.floor(cz / 128)}` : key;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { positions: [], uv: [] });
    const bucket = buckets.get(bucketKey);
    const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]),nx=ab[1]*ac[2]-ab[2]*ac[1],nz=ab[0]*ac[1]-ab[1]*ac[0],vertical=Math.abs(nx)+Math.abs(nz)>Math.abs(ab[2]*ac[0]-ab[0]*ac[2]);
    for(const p of [a,b,c]){bucket.positions.push(...p);if(vertical){const u=Math.abs(nx)>Math.abs(nz)?p[2]:p[0];bucket.uv.push(u/(key==='brick'?1.76:2),p[1]/(key==='brick'?.6:2));}else bucket.uv.push(p[0]*.5,p[2]*.5);}
  };
  const quad = (key, a, b, c, d) => { push(key, a, b, c); push(key, a, c, d); };
  const upTri=(key,a,b,c)=>{if((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])<0)[b,c]=[c,b];push(key,a,b,c);};
  const surface = (key, ring, y = .02) => {
    if (!ring || ring.length < 3) return;
    const pts=ring.length>3&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?ring.slice(0,-1):ring;
    for(const f of T.ShapeUtils.triangulateShape(pts.map(p=>new T.Vector2(...p)),[]))upTri(key,...f.map(i=>[pts[i][0],y,pts[i][1]]));
  };
  const collideQuad = (a, b, c, d, name = 'concrete') => world?.addQuad?.(a, b, c, d, name);
  const ribbon = (key, a, b, width, y = .025, collision = true, offset = 0) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < .05) return;
    const nx = -dz / len, nz = dx / len;
    const ox = nx * offset, oz = nz * offset;
    const A = [a[0] + ox + nx * width / 2, y, a[1] + oz + nz * width / 2], B = [a[0] + ox - nx * width / 2, y, a[1] + oz - nz * width / 2], C = [b[0] + ox - nx * width / 2, y, b[1] + oz - nz * width / 2], D = [b[0] + ox + nx * width / 2, y, b[1] + oz + nz * width / 2];
    quad(key, A, D, C, B);
    if (collision) collideQuad(A, D, C, B, key === 'asphalt' ? 'asphalt' : 'concrete');
  };
  const widthFor = (kind) => /foot|path|walk|cycle/i.test(kind || '') ? 2.2 : /primary|secondary|tertiary/i.test(kind || '') ? 8 : /service/i.test(kind || '') ? 5 : 5.8;

  // Preserve every mapped road segment and give each a narrow sidewalk ribbon.
  for (const road of data.roads || []) {
    const pts = road.points || [];
    for (let i = 1; i < pts.length; i++) {
      const path = /foot|path|walk|cycle/i.test(road.kind);
      ribbon(path ? 'sidewalk' : 'asphalt', pts[i - 1], pts[i], widthFor(road.kind), path ? .018 : .025);
      if (!path && Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1])>.05) {
        const kerb=createRolledKerb(pts[i-1],pts[i],{roadWidth:widthFor(road.kind)});
        for(const q of kerb.quads)quad('sidewalk',...q);
        kerb.addCollision(world);
      }
    }
  }
  if(data.bounds){const [a,b,c,d]=data.bounds;surface('grass',[[a,b],[c,b],[c,d],[a,d]],0);collideQuad([a,0,b],[a,0,d],[c,0,d],[c,0,b],'grass');}
  // The residential district is fully irrigated; desert terrain stays outside it.
  for (const green of data.greens || []) surface('grass', green.points, .012);

  const clean=ring=>ring.length>3&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?ring.slice(0,-1):ring;
  const roadSegments=(data.roads||[]).filter(r=>!/foot|path|walk|cycle/.test(r.kind)).flatMap(r=>r.points.slice(1).map((b,i)=>[r.points[i],b]));
  const nearestRoad=p=>{let best=null;for(const [a,b]of roadSegments){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1))),q=[a[0]+dx*t,a[1]+dz*t],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(!best||d<best.d)best={q,d};}return best;};
  for(const [index,building]of(data.buildings||[]).entries()){
    const kind=building.kind,house=kind==='house',heroSchool=kind==='school'&&building.holes?.length===1,heroCivic=kind==='civic'&&index===0,h=heroSchool?3.4:kind==='civic'&&index===0?5:building.height||(house?3.1:6.2),outer=clean(building.points),holes=(building.holes||[]).map(clean),rings=[outer,...holes],points=rings.flat();
    const faces=T.ShapeUtils.triangulateShape(outer.map(p=>new T.Vector2(...p)),holes.map(r=>r.map(p=>new T.Vector2(...p))));
    const wallKey=house?(index%3===0?'stucco':'brick'):kind==='school'?'brick':'stucco';
    let front=null;
    for(const [ringIndex,ring]of rings.entries()){
      const area=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0),sign=(area>0?1:-1)*(ringIndex? -1:1);
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.02)continue;
        const nx=sign*dz/len,nz=-sign*dx/len,p=(u,y,off=.04)=>[a[0]+dx*u+nx*off,y,a[1]+dz*u+nz*off];
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
        if(!ringIndex&&len>3){const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],road=nearestRoad(mid);if(road&&(!front||road.d<front.road.d))front={face,p,len,mid,road};}
      }
    }
    if(front&&!heroSchool&&!heroCivic){
      const {face,p,len,mid,road}=front,door=house?.95:2.3;
      face('trim',.5-(door+.18)/len/2,.5+(door+.18)/len/2,.015,2.28,.085);
      face(kind==='school'?'schoolDoor':'glass',.5-door/len/2,.5+door/len/2,.025,2.18,.10);
      face('trim',.5-.025/len,.5+.025/len,.04,2.16,.12);
      if(road.d<35)ribbon('concrete',mid,road.q,house?1.1:3,.025,true);
      if(house&&len>7){const u=.18,w=2.4/len;face('trim',u-w/2,u+w/2,.025,2.1,.08);for(let j=1;j<5;j++)face('roof',u-w/2,u+w/2,j*.4,j*.4+.025,.09);}
    }
    const edgeDistance=p=>Math.min(...rings.flatMap(r=>r.map((a,i)=>{const b=r[(i+1)%r.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);})));
    const roofPoint=p=>[p[0],h+(house?Math.min(1.5,edgeDistance(p)*.65):.08),p[1]];
    const roofTri=(a,b,c,n)=>{if(!n){upTri('roof',roofPoint(a),roofPoint(b),roofPoint(c));return;}const mid=(p,q)=>p.map((v,i)=>(v+q[i])/2),ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);roofTri(a,ab,ca,n-1);roofTri(ab,b,bc,n-1);roofTri(ca,bc,c,n-1);roofTri(ab,bc,ca,n-1);};
    for(const f of faces)roofTri(...f.map(i=>points[i]),house?2:0);
  }

  // Batch every authored surface by material to keep the whole neighbourhood
  // comfortably below the open-world draw budget.
  for (const [bucketKey, values] of buckets) {
    if (!values.positions.length) continue;
    const key = bucketKey.split(':', 1)[0];
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(values.positions, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(values.uv, 2)); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, mat(key)); mesh.name = `Residential_${bucketKey}`; mesh.castShadow = key === 'stucco' || key === 'brick' || key === 'roof'; mesh.receiveShadow = true; root.add(mesh);
  }
  root.updateMatrixWorld(true); scene.add(root);
  return { root, dispose() { root.removeFromParent(); root.traverse((o) => o.geometry?.dispose()); for (const m of materials.values()) { m.map?.dispose(); m.roughnessMap?.dispose(); m.normalMap?.dispose(); m.dispose(); } } };
}

export function prepareResidential(world,data){
 const staging=new T.Group(),built=buildResidentialArt(staging,world,data);
 return {attach(scene){scene.add(built.root);},dispose:built.dispose};
}
