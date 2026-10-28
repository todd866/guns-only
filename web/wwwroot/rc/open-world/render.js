import {roofProfile,roadLamps,litWindow} from './world-finish.mjs';
import {buildingFrontage,exteriorRing,frontageWindowMask} from './building-frontages.mjs';
import {roadVerges} from './road-verges.mjs';
import {roadsideDetail,desertScatter} from './roadside-detail.mjs';
import {createSurfaceMaps} from './materials.js';
import {groundTriangles,elevationAt} from './elevation.mjs';
import {SCENERY_BOUNDS as DISTRICT_BOUNDS} from './district-zones.mjs';
import {subtractBox} from './district-entrances.mjs';
import * as T from '../../vendor/three.module.js';
import {buildingInfo,roadWidth} from './geometry.mjs';
import {runwayFurniture} from './runways.mjs';
import {SIZE} from './stream.mjs';
const PALETTE={sand:'#bfaa86',asphalt:'#515b61',concrete:'#aeb2aa',grass:'#8c9b65',wall:'#c8b99c',roof:'#9a8770',glass:'#4d6d78',paint:'#eee4c4',stripe:'#e5b751',trim:'#e2d3b5',light:'#e6efc2',scrub:'#7e8561',gravel:'#a58e70',reflector:'#e3c48a',windowLight:'#4d6d78'};
// Clip each draw to its tile. Long OSM roads/aprons occur in multiple source tiles, but never
// render twice on the same pixel. Collision keeps original footprints, including at seams.
function clip(poly,b){for(const [axis,value,sign]of [[0,b[0],1],[0,b[2],-1],[1,b[1],1],[1,b[3],-1]]){const result=[];for(let i=0;i<poly.length;i++){const a=poly[i],c=poly[(i+1)%poly.length],ia=(a[axis]-value)*sign>=0,ic=(c[axis]-value)*sign>=0;if(ia)result.push(a);if(ia!==ic){const t=(value-a[axis])/(c[axis]-a[axis]);result.push([a[0]+t*(c[0]-a[0]),a[1]+t*(c[1]-a[1])]);}}poly=result;if(poly.length<3)return [];}return poly;}
// Large-scale desert variation so the 6 m sand detail never reads as a checkerboard: pale
// desert pavement, warmer drifts and darker gravel washes on 20-90 m patches, per vertex.
const noiseHash=(x,z)=>{let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
const valueNoise=(x,z)=>{const i=Math.floor(x),j=Math.floor(z),u=x-i,v=z-j,a=noiseHash(i,j),b=noiseHash(i+1,j),c=noiseHash(i,j+1),d=noiseHash(i+1,j+1),su=u*u*(3-2*u),sv=v*v*(3-2*v);return a+(b-a)*su+(c-a)*sv+(a-b-c+d)*su*sv;};
export function sandTone(x,z){const broad=valueNoise(x/90,z/90),fine=valueNoise(x/23+40,z/23-17),wash=Math.max(0,valueNoise(x/140-9,z/60+5)-.6)*2.5,n=broad*.6+fine*.4;
 const pale=Math.max(0,.55-n)*2,warm=Math.max(0,n-.5)*2,dark=Math.min(.32,wash*.7);
 // pale = grey desert pavement, warm = drifted sand, dark = gravel wash
 return [(1-.16*pale+.05*warm)*(1-dark),(1-.12*pale+.01*warm)*(1-dark*.96),(1-.02*pale-.07*warm)*(1-dark*.9)];}
export function createTileRenderer(scene,elevation=null,residentialTerrain=null){const maps=new Map(['gravel','sand','asphalt','concrete','stucco','roof'].map(k=>[k,createSurfaceMaps(k)])),mats=new Map(),groups=new Map(),tileLights=new Map();const residentialBounds=residentialTerrain?.bounds??null;for(const [k,c]of Object.entries(PALETTE)){const textures=maps.get(k==='wall'?'stucco':k);mats.set(k,new T.MeshStandardMaterial({color:textures?'#ffffff':c,emissive:k==='windowLight'?'#edc792':k==='light'?'#e6efc2':k==='reflector'?'#e3ba70':'#000000',emissiveIntensity:k==='light'?1:k==='reflector'?.4:0,roughness:textures?1:['glass','windowLight'].includes(k)?.25:.92,metalness:['glass','windowLight'].includes(k)?.3:0,vertexColors:true,...(textures?{map:textures.map,roughnessMap:textures.roughnessMap,normalMap:textures.normalMap,normalScale:new T.Vector2(k==='asphalt'?.035:.18,k==='asphalt'?.035:.18)}:{})}));}
 const poolMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{night:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float night;void main(){float r=length((vUv-.5)*2.);float a=pow(max(0.,1.-r),2.)*.55*night;gl_FragColor=vec4(1.,.77,.43,a);}'});
 const inResidential=(x,z)=>!!residentialBounds&&x>=residentialBounds[0]&&x<=residentialBounds[2]&&z>=residentialBounds[1]&&z<=residentialBounds[3];
 function load(key,tile){const b=[tile.tile[0]*SIZE,tile.tile[1]*SIZE,(tile.tile[0]+1)*SIZE,(tile.tile[1]+1)*SIZE],buckets=new Map(),root=new T.Group();root.name=`WorldTile_${key}`;
  const bucket=k=>{if(!buckets.has(k))buckets.set(k,{v:[],c:[],uv:[]});return buckets.get(k);};
 function tri(k,a,b,c,shade=1,clipResidential=false){let triangles=[[a,b,c]];const clipBounds=clipResidential&&residentialBounds?[...DISTRICT_BOUNDS,residentialBounds]:DISTRICT_BOUNDS;for(const d of clipBounds){if(Math.min(a[0],b[0],c[0])>d[2]||Math.max(a[0],b[0],c[0])<d[0]||Math.min(a[2],b[2],c[2])>d[3]||Math.max(a[2],b[2],c[2])<d[1])continue;triangles=triangles.flatMap(v=>subtractBox(v,[d[0],-100,d[1],d[2],1000,d[3]]));}const t=bucket(k);for(const triangle of triangles){t.v.push(...triangle.flat());
    // Horizontal surfaces use X/Z; vertical facades use their dominant wall axis/Y.
    // The old mixed X/Y and Z/Y projection skewed window bands diagonally on walls.
    const dx=Math.abs(triangle[1][0]-triangle[0][0])+Math.abs(triangle[2][0]-triangle[0][0]);
    const dz=Math.abs(triangle[1][2]-triangle[0][2])+Math.abs(triangle[2][2]-triangle[0][2]);
    const vertical=Math.abs(triangle[1][1]-triangle[0][1])+Math.abs(triangle[2][1]-triangle[0][1])>.1;
    const scale=k==='asphalt'?1.2:.16;for(const p of triangle){if(k==='sand'&&!vertical){const [r,g,bl]=sandTone(p[0],p[2]);t.c.push(shade*r,shade*g,shade*bl);}else t.c.push(shade,shade,shade);t.uv.push(vertical?(dx>=dz?p[0]:p[2])*.24:p[0]*scale,(vertical?p[1]:p[2])*scale);}
  }}
  function quad(k,a,b,c,d,shade=1){tri(k,a,b,c,shade);tri(k,a,c,d,shade);}
  function poly(k,ring,y,shade=1,clipResidential=false){const pts=clip(ring,b);if(pts.length<3)return;const v=pts.map(p=>new T.Vector2(...p)),faces=T.ShapeUtils.triangulateShape(v,[]);for(const [a,c,d]of faces){const p=[pts[a],pts[c],pts[d]],cross=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);if(cross>0)p.reverse();tri(k,...p.map(q=>[q[0],y,q[1]]),shade,clipResidential);}}
  function ribbon(k,a,c,w,y){const len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<.01)return;const x=-(c[1]-a[1])/len*w/2,z=(c[0]-a[0])/len*w/2;poly(k,[[a[0]+x,a[1]+z],[c[0]+x,c[1]+z],[c[0]-x,c[1]-z],[a[0]-x,a[1]-z]],y,1,true);}
  if(elevation){for(const points of groundTriangles(elevation,b))tri('sand',...points.map(p=>[p[0],p[1]-.025,p[2]]),1,true);}else poly('sand',[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]],-.025,1,true);
  for(const f of tile.features){const p=f.properties,g=f.geometry;
   if(p.building&&g.type==='Polygon'){const info=buildingInfo(f);if(!info)continue;const {h,area}=info,ring=exteriorRing(info.ring),shade=.88+(Number(f.id.replace(/\D/g,''))%11)*.014;poly('roof',ring,h,shade);const maskWindow=frontageWindowMask(f,tile.features);
    for(let i=1;i<ring.length;i++){const a=ring[i-1],c=ring[i],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(!len)continue;
     // Subdivision makes clipping facades independent of polygon orientation.
     const n=Math.max(1,Math.ceil(len/3));for(let j=0;j<n;j++){const a0=[a[0]+(c[0]-a[0])*j/n,a[1]+(c[1]-a[1])*j/n],a1=[a[0]+(c[0]-a[0])*(j+1)/n,a[1]+(c[1]-a[1])*(j+1)/n],mid=[(a0[0]+a1[0])/2,(a0[1]+a1[1])/2];if(mid[0]<b[0]||mid[0]>=b[2]||mid[1]<b[1]||mid[1]>=b[3])continue;
      const outside=(k,a,b,c,d,shade=1)=>quad(k,d,c,b,a,shade);
      const P=(t,y,off=0)=>[a0[0]+(a1[0]-a0[0])*t+(c[1]-a[1])/len*off,y,a0[1]+(a1[1]-a0[1])*t-(c[0]-a[0])/len*off];
      quad('wall',P(0,0),P(1,0),P(1,h),P(0,h),shade);quad('wall',P(0,h),P(1,h),P(1,0),P(0,0),shade);
      // A low raised plinth gives the base buildings the chunky toy-model silhouette
      // visible in the Nellis standards photos without changing the collision footprint.
      outside('trim',P(0,0,.045),P(1,0,.045),P(1,.2,.045),P(0,.2,.045),shade+.04);
      outside('trim',P(0,.2,.045),P(1,.2,.045),P(1,.2,.025),P(0,.2,.025),shade+.04);
      outside('trim',P(0,h-.2,.025),P(1,h-.2,.025),P(1,h,.025),P(0,h,.025));
      // Nellis facility references: recessed blue glazing, pale projecting frames,
      // deep lintels and roof coping. Keep every detail inside the existing facade
      // envelope apart from a shallow sill, with no props in the driving corridor.
      outside('trim',P(0,h,.12),P(1,h,.12),P(1,h,-.12),P(0,h,-.12));
      if(p.building!=='roof')for(let y=1.1;y<h-1;y+=3){
       if(maskWindow(mid[0],mid[1],y))continue;
       // Ring orientation is normalized above: positive offset is outdoors.
       // Front faces must point toward that offset, not back into the wall.
       const face=(kind,t0,t1,y0,y1,off)=>outside(kind,P(t0,y0,off),P(t1,y0,off),P(t1,y1,off),P(t0,y1,off));
       face(litWindow(f.id,j,Math.round((y-1.1)/3))?'windowLight':'glass',.2,.8,y,y+1.25,.045);
       for(const [t0,t1,y0,y1]of [[.17,.2,y-.08,y+1.33],[.8,.83,y-.08,y+1.33],[.2,.8,y-.08,y],[.2,.8,y+1.25,y+1.33],[.49,.51,y,y+1.25]])face('trim',t0,t1,y0,y1,.085);
       outside('trim',P(.16,y-.08,.18),P(.84,y-.08,.18),P(.84,y-.08,0),P(.16,y-.08,0));
       face('trim',.16,.84,y+1.33,y+1.43,.18);
      }
     }
    }
    for(const face of roofProfile(f,b))tri(face.kind,...face.points,face.shade);
    for(const part of buildingFrontage(f,tile.features,b))for(const face of part.faces)quad(part.kind,...face,part.shade);
    continue;
   }
   if(g.type==='Polygon'){if(p.aeroway==='apron')poly('concrete',g.coordinates[0],.004,1,true);else if(p.leisure&&p.leisure!=='swimming_pool'||p.landuse==='grass')poly('grass',g.coordinates[0],.002,1,true);else if(p.amenity==='parking')poly('asphalt',g.coordinates[0],.008,1,true);continue;}
   if(g.type==='LineString'&&(p.highway||p.aeroway==='runway'||p.aeroway==='taxiway')){const w=roadWidth(p),kind=p.aeroway?'concrete':p.highway==='track'||p.highway==='path'?'sand':'asphalt',y=p.aeroway?.012:.02;for(let i=1;i<g.coordinates.length;i++){const a=g.coordinates[i-1],c=g.coordinates[i];if(inResidential(a[0],a[1])&&inResidential(c[0],c[1]))continue;
     // A graded shoulder joins paved roads to desert without narrowing the route.
     // Draw in the existing sand bucket, clipped exactly like the roadway.
     if(kind==='asphalt')ribbon('sand',a,c,w+1.4,y-.006);
     ribbon(kind,a,c,w,y);
     if(p.aeroway==='runway'){const len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len)for(const side of [-1,1]){const off=(w/2-1)*side,dx=(c[1]-a[1])/len*off,dz=-(c[0]-a[0])/len*off;ribbon('paint',[a[0]+dx,a[1]+dz],[c[0]+dx,c[1]+dz],.3,y+.008);}}
     if(p.aeroway==='taxiway')ribbon('stripe',a,c,.18,y+.006);
     if(p.aeroway==='runway'||w>=9){const len=Math.hypot(c[0]-a[0],c[1]-a[1]),step=p.aeroway?25:7;for(let d=0;d<len;d+=step){const t=d/len,u=Math.min((d+step*.42)/len,1);ribbon('paint',[a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t],[a[0]+(c[0]-a[0])*u,a[1]+(c[1]-a[1])*u],p.aeroway?.8:.1,y+.008);}}
    }if(p.aeroway==='runway'){const details=runwayFurniture(f,w);for(const shape of details.paint)poly('paint',shape,y+.012);for(const [x,z]of details.lights)poly('light',[[x-.18,z-.18],[x+.18,z-.18],[x+.18,z+.18],[x-.18,z+.18]],.12);}}
  }
  // Batched road grading and sparse furniture. All standing details are beyond
  // the drivable shoulder; no collision or racing-line geometry is changed.
  const verges=roadVerges(tile,b,residentialBounds);
  for(const strip of verges.strips){poly('gravel',strip.ring,.014,.98,true);if(strip.major)ribbon('paint',strip.edge[0],strip.edge[1],.12,.031);}
  const box=(kind,x,y,z,w,h,d,shade=1)=>{
   const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y0=y,y1=y+h;
   quad(kind,[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],shade);quad(kind,[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[x0,y0,z1],shade);
   quad(kind,[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0],shade);quad(kind,[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],shade);
   quad(kind,[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],shade);
  };
  const lamps=roadLamps(tile,b,residentialBounds);tileLights.set(key,lamps.map(({x,z})=>({pos:new T.Vector3(x,elevationAt(elevation,x,z)+4.25,z)})));
  const poolVertices=[],poolUvs=[];
  for(const {x,z} of lamps){const y=elevationAt(elevation,x,z);box('glass',x,y,z,.10,4.2,.10,.7);box('trim',x,y+4.18,z,.72,.12,.38,.85);box('light',x,y+4.16,z,.60,.035,.29);
   const r=19;for(const [u,v] of [[0,0],[0,1],[1,1],[0,0],[1,1],[1,0]]){const px=x+(u-.5)*r*2,pz=z+(v-.5)*r*2;poolVertices.push(px,elevationAt(elevation,px,pz)+.055,pz);poolUvs.push(u,v);}
  }
  if(poolVertices.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(poolVertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(poolUvs,2));const mesh=new T.Mesh(g,poolMaterial);mesh.name='RoadLightPools';root.add(mesh);}
  for(const {x,z} of verges.markers){const y=elevationAt(elevation,x,z);box('trim',x,y,z,.12,.72,.12,.75);box('reflector',x,y+.52,z,.145,.14,.145);}
  for(const {x,z} of verges.services){const y=elevationAt(elevation,x,z);poly('concrete',[[x-1.4,z-1],[x+1.4,z-1],[x+1.4,z+1],[x-1.4,z+1]],y+.025,.82,true);box('glass',x,y+.03,z,1.15,1.35,.65,.8);box('trim',x,y+1.38,z,1.25,.08,.75,.75);for(let h=.35;h<1.2;h+=.15)box('trim',x,y+h,z+.34,.8,.025,.025,.6);box('reflector',x-.4,y+1.12,z+.345,.1,.1,.03);}
  // Low, non-colliding scrub and stones sit beyond the drivable shoulder.
  // At most 48 clusters per streamed tile; two shared batches, no per-prop objects.
  for(const {x,z,size:s} of roadsideDetail(tile,b,residentialBounds)){
   const y=elevationAt(elevation,x,z)-.025;
   for(let j=0;j<3;j++){const angle=j*2.094,dx=Math.cos(angle)*s,dz=Math.sin(angle)*s;
    quad('scrub',[x-dx,y+.015,z-dz],[x+dx,y+.015,z+dz],[x+dx*.3,y+s*.8,z+dz*.3],[x-dx*.3,y+s*.8,z-dz*.3],.85+j*.08);
    quad('scrub',[x-dx*.3,y+s*.8,z-dz*.3],[x+dx*.3,y+s*.8,z+dz*.3],[x+dx,y+.015,z+dz],[x-dx,y+.015,z-dz],.85+j*.08);
   }
   const cx=x+.8,cz=z+.3,r=s*.45,top=[cx,y+.12,cz];
   for(let j=0;j<5;j++){const a=j*Math.PI*2/5,c=(j+1)*Math.PI*2/5;tri('gravel',top,[cx+Math.cos(c)*r,y+.005,cz+Math.sin(c)*r],[cx+Math.cos(a)*r,y+.005,cz+Math.sin(a)*r],.85+j*.035);}
  }
  // Open desert: creosote-like clumps (three crossed cards, slightly varied height and tone)
  // or a low stone, on bare sand only. Same two batches as the verge planting.
  if(elevation)for(const {x,z,size:s,stone} of desertScatter(tile,b,residentialBounds)){
   const y=elevationAt(elevation,x,z)-.025,turn=(x*.37+z*.11)%Math.PI;
   if(stone){const r=s*.55,top=[x,y+r*.45,z];for(let j=0;j<5;j++){const a=turn+j*Math.PI*2/5,c=turn+(j+1)*Math.PI*2/5;tri('gravel',top,[x+Math.cos(c)*r,y+.005,z+Math.sin(c)*r*.8],[x+Math.cos(a)*r,y+.005,z+Math.sin(a)*r*.8],.72+j*.05);}continue;}
   for(let j=0;j<3;j++){const angle=turn+j*2.094,dx=Math.cos(angle)*s,dz=Math.sin(angle)*s,h=s*(.7+j*.12),tone=.68+j*.09;
    quad('scrub',[x-dx,y+.015,z-dz],[x+dx,y+.015,z+dz],[x+dx*.35,y+h,z+dz*.35],[x-dx*.35,y+h,z-dz*.35],tone);
    quad('scrub',[x-dx*.35,y+h,z-dz*.35],[x+dx*.35,y+h,z+dz*.35],[x+dx,y+.015,z+dz],[x-dx,y+.015,z-dz],tone);}
  }
  for(const [k,v]of buckets){if(!v.v.length)continue;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v.v,3));g.setAttribute('color',new T.Float32BufferAttribute(v.c,3));g.setAttribute('uv',new T.Float32BufferAttribute(v.uv,2));g.computeVertexNormals();g.computeBoundingSphere();const m=new T.Mesh(g,mats.get(k));m.castShadow=['wall','roof'].includes(k);m.receiveShadow=true;root.add(m);}groups.set(key,root);scene.add(root);
 }
 function drop(key){const root=groups.get(key);if(!root)return;root.removeFromParent();root.traverse(o=>o.geometry?.dispose());groups.delete(key);tileLights.delete(key);}
 return {load,drop,fixtures:()=>[...tileLights.values()].flat(),update(day){mats.get('windowLight').emissiveIntensity=(1-day)*.65;poolMaterial.uniforms.night.value=1-day;},dispose(){for(const k of groups.keys())drop(k);for(const m of mats.values())m.dispose();for(const m of maps.values())m.dispose();poolMaterial.dispose();}};
}
