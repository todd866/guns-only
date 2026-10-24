import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Anonymous, metre-scale architecture. The caller retains the mapped footprint,
// courtyard and collision shell at 3.4m; these overlays supply the upper wings
// and the distinctive human-scale entrance details. No remote assets are used.
export const isResidentialSchool = b => b?.kind === 'school' && b.holes?.length === 1;
export function buildResidentialSchool(scene, data = {}, options = {}) {
  const building = data.buildings?.find(isResidentialSchool);
  const root = new T.Group(); root.name = 'ResidentialSchoolDetails';
  if (!building) { scene.add(root); return {root, dispose(){root.removeFromParent();}}; }
  const heightAt = options.terrain?.heightAt ?? (() => 0);
  const buildingCentre = building.points.reduce((s,p)=>[s[0]+p[0]/building.points.length,s[1]+p[1]/building.points.length],[0,0]);
  root.position.y = heightAt(buildingCentre[0], buildingCentre[1]);
  const buckets = new Map(), materials = new Map();
  const clean = ring => ring.length>3&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?ring.slice(0,-1):ring;
  const ring = clean(building.points);
  const minX=Math.min(...ring.map(p=>p[0])),minZ=Math.min(...ring.map(p=>p[1]));
  // The map may translate, but this school keeps its measured local axes.
  const dx=minX+3314.049,dz=minZ+800.568;
  const at=(x,z)=>[x+dx,z+dz];
  const colour={brick:'#b5a083',roof:'#737779',stone:'#c7bdac',glass:'#36505d',frame:'#3b4448',blue:'#355ba0',concrete:'#bfbcb0'};
  function mat(key){
    if(!materials.has(key)){
      const m=new T.MeshStandardMaterial({color:colour[key],roughness:key==='glass'?.29:.88,metalness:key==='frame'?.35:0,side:T.DoubleSide});
      if(key==='brick'){
        const size=128,pixels=new Uint8Array(size*size*4);
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          const row=Math.floor(y/16),mortar=y%16<1||(x+(row%2)*16)%32<1;
          const noise=((x*37+y*71)%23)/23-.5,i=(y*size+x)*4;
          const shade=mortar?.72:.94+noise*.10;pixels[i]=255*shade;pixels[i+1]=250*shade;pixels[i+2]=241*shade;pixels[i+3]=255;
        }
        const texture=new T.DataTexture(pixels,size,size,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.anisotropy=4;texture.needsUpdate=true;m.map=texture;
      }
      materials.set(key,m);
    }return materials.get(key);
  }
  function add(key,g){if(g.index){const source=g;g=g.toNonIndexed();source.dispose();}if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(g);}
  function quad(key,a,b,c,d){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));
    const len=Math.hypot(b[0]-a[0],b[2]-a[2]),h=c[1]-b[1];
    g.setAttribute('uv',new T.Float32BufferAttribute([0,0,len/.92,0,len/.92,h/.4,0,0,len/.92,h/.4,0,h/.4],2));g.computeVertexNormals();add(key,g);
  }
  function box(key,x,y,z,w,h,d,yaw=0){const g=new T.BoxGeometry(w,h,d);g.rotateY(yaw);g.translate(x,y,z);add(key,g);}
  function clip(poly,axis,limit,greater){
    const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=greater?a[axis]>=limit:a[axis]<=limit,ib=greater?b[axis]>=limit:b[axis]<=limit;if(ia)out.push(a);if(ia!==ib){const t=(limit-a[axis])/(b[axis]-a[axis]);out.push(a.map((v,k)=>v+(b[k]-v)*t));}}return out;
  }
  const zone=(bounds)=>{let p=ring;for(const [axis,v,greater]of[[0,bounds[0]+dx,true],[0,bounds[2]+dx,false],[1,bounds[1]+dz,true],[1,bounds[3]+dz,false]])p=clip(p,axis,v,greater);return p;};
  function walls(poly,lo,hi,offset=.025){
    const area=poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p[0]*q[1]-q[0]*p[1]},0),sign=Math.sign(area)||1;
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.04)continue;
      const nx=sign*(b[1]-a[1])/len,nz=-sign*(b[0]-a[0])/len;
      quad('brick',[a[0]+nx*offset,lo,a[1]+nz*offset],[b[0]+nx*offset,lo,b[1]+nz*offset],[b[0]+nx*offset,hi,b[1]+nz*offset],[a[0]+nx*offset,hi,a[1]+nz*offset]);
      const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2,covered=(mz>-696+dz&&mx<-3197+dx)||(mx>-3240+dx&&mz<-754+dz);
      const yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]);if(hi>3.5||!covered)box('frame',(a[0]+b[0])/2,hi+.035,(a[1]+b[1])/2,len+.04,.10,.16,yaw);
    }
  }
  function upper(poly,height){
    if(poly.length<3)return;walls(poly,3.4,height);
    const triangles=T.ShapeUtils.triangulateShape(poly.map(p=>new T.Vector2(...p)),[]),pos=[];
    for(const f of triangles)for(const i of f)pos.push(poly[i][0],height,poly[i][1]);
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(pos.flatMap((_,i)=>i%3===0?[pos[i]*.2,pos[i+2]*.2]:[]),2));g.computeVertexNormals();add('roof',g);
  }
  walls(ring,.04,3.4);
  for(const hole of building.holes||[])walls(clean(hole),.04,3.4,-.025);
  upper(zone([-3240,-805,-3145,-754]),6.7);
  upper(zone([-3320,-696,-3197,-663]),8.6);

  // Vertical classroom/stair bays have metal spandrels between floors; the
  // western service walls remain mostly solid instead of repeating house windows.
  const area=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1]},0),sign=Math.sign(area)||1;
  function facade(a,b){
    const vx=b[0]-a[0],vz=b[1]-a[1],len=Math.hypot(vx,vz),nx=sign*vz/len,nz=-sign*vx/len;
    return {len,nx,nz,p:(u,y,out=.08)=>[a[0]+vx*u+nx*out,y,a[1]+vz*u+nz*out],plane(key,u,w,y,h,out=.08){const l=u-w/len/2,r=u+w/len/2;quad(key,this.p(l,y,out),this.p(r,y,out),this.p(r,y+h,out),this.p(l,y+h,out));}};
  }
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const tall=mid[1]>-696+dz&&mid[0]<-3197+dx?8.6:mid[0]>-3240+dx&&mid[1]<-754+dz?6.7:3.4;
    const f=facade(a,b);if(f.len<7)continue;
    if(tall>6){
      const count=Math.max(1,Math.floor(f.len/6.4));
      for(let j=0;j<count;j++){
        const u=(j+.5)/count,w=1.18;f.plane('frame',u,w+.17,.55,tall-.95,.055);
        for(let y=.7;y<tall-1;y+=2.55){f.plane('glass',u,w,y,1.68,.085);f.plane('stone',u,w,y+1.68,.64,.09);}
        f.plane('frame',u,.04,.6,tall-1,.11);
      }
    }else if(i<10||mid[0]>-3205+dx){
      const count=Math.floor(f.len/6);for(let j=0;j<count;j++){const u=(j+.5)/count;f.plane('frame',u,2.6,.6,2.25);f.plane('glass',u,2.4,.72,1.97,.11);f.plane('frame',u,.06,.7,2.05,.14);}
    }
  }
  // Recessed blue paired doors at the small eastern entrance jog. The dark
  // surround and projecting asymmetric fascia reproduce the low entry silhouette.
  const entry=facade(at(-3174.717,-757.505),at(-3173.273,-754.929));
  entry.plane('frame',.5,2.75,.02,2.7,.075);
  for(const u of [.27,.73]){
    entry.plane('blue',u,1.20,.06,2.38,.10);
    entry.plane('glass',u,.76,1.04,.92,.13);
    entry.plane('glass',u,.76,.28,.47,.13);
    entry.plane('stone',u+.11,.035,.85,.52,.15);
  }
  const centre=entry.p(.5,3.05,.80),yaw=-Math.atan2(2.576,1.444);
  box('stone',centre[0],3.05,centre[2],7.4,.62,2.0,yaw);
  box('frame',centre[0],3.39,centre[2],7.55,.10,2.12,yaw);
  const wing=entry.p(-.65,1.5,.12);box('brick',wing[0],1.5,wing[2],.46,3.0,.55,yaw);
  // Flush final approach joins the mapped pedestrian path to the paired doors.
  const door=entry.p(.5,.026,.2),walk=at(-3161.329,-763.912),vx=walk[0]-door[0],vz=walk[1]-door[2],vl=Math.hypot(vx,vz),nx=-vz/vl*1.25,nz=vx/vl*1.25;
  quad('concrete',[door[0]+nx,.026,door[2]+nz],[walk[0]+nx,.026,walk[1]+nz],[walk[0]-nx,.026,walk[1]-nz],[door[0]-nx,.026,door[2]-nz]);
  // Slender service chimney and cap, inset within the service wing footprint.
  const chimney=at(-3278.1,-740.0);
  box('brick',chimney[0],8.2,chimney[1],1.65,9.6,1.95);
  box('stone',chimney[0],13.05,chimney[1],1.78,.18,2.08);
  box('frame',chimney[0],13.15,chimney[1],1.2,.08,1.4);
  // Modest rooftop services establish scale without turning the roof into clutter.
  for(const [x,z,w,d]of[[-3220,-780,3.4,2.1],[-3254,-681,4.4,2.1],[-3280,-683,2.8,2.0]]){
    const p=at(x,z),h=z<-754?6.7:8.6;box('frame',p[0],h+.5,p[1],w,.9,d);box('stone',p[0],h+.98,p[1],w+.12,.08,d+.12);
  }
  for(const [key,parts]of buckets){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());const mesh=new T.Mesh(g,mat(key));mesh.name=`School_${key}`;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
  scene.add(root);return {root,dispose(){root.removeFromParent();root.traverse(o=>o.geometry?.dispose());for(const m of materials.values()){m.map?.dispose();m.dispose();}}};
}
