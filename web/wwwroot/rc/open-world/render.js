import {createSurfaceMaps} from './materials.js';
import {groundTriangles} from './elevation.mjs';
import {DISTRICT_BOUNDS} from './district-zones.mjs';
import {subtractBox} from './district-entrances.mjs';
import * as T from '../../vendor/three.module.js';
import {buildingInfo,roadWidth} from './geometry.mjs';
import {runwayFurniture} from './runways.mjs';
import {SIZE} from './stream.mjs';
const PALETTE={sand:'#bfaa86',asphalt:'#515b61',concrete:'#aeb2aa',grass:'#8c9b65',wall:'#c8b99c',roof:'#9a8770',glass:'#4d6d78',paint:'#eee4c4',stripe:'#e5b751',trim:'#e2d3b5',light:'#e6efc2'};
// Clip each draw to its tile. Long OSM roads/aprons occur in multiple source tiles, but never
// render twice on the same pixel. Collision keeps original footprints, including at seams.
function clip(poly,b){for(const [axis,value,sign]of [[0,b[0],1],[0,b[2],-1],[1,b[1],1],[1,b[3],-1]]){const result=[];for(let i=0;i<poly.length;i++){const a=poly[i],c=poly[(i+1)%poly.length],ia=(a[axis]-value)*sign>=0,ic=(c[axis]-value)*sign>=0;if(ia)result.push(a);if(ia!==ic){const t=(value-a[axis])/(c[axis]-a[axis]);result.push([a[0]+t*(c[0]-a[0]),a[1]+t*(c[1]-a[1])]);}}poly=result;if(poly.length<3)return [];}return poly;}
export function createTileRenderer(scene,elevation=null){const maps=new Map(['sand','asphalt','concrete','stucco','roof'].map(k=>[k,createSurfaceMaps(k)])),mats=new Map(),groups=new Map();for(const [k,c]of Object.entries(PALETTE)){const textures=maps.get(k==='wall'?'stucco':k);mats.set(k,new T.MeshStandardMaterial({color:textures?'#ffffff':c,emissive:k==='light'?'#e6efc2':'#000000',emissiveIntensity:k==='light'?1:0,roughness:textures?1:k==='glass'?.25:.92,metalness:k==='glass'?.3:0,vertexColors:true,...(textures?{map:textures.map,roughnessMap:textures.roughnessMap,normalMap:textures.normalMap,normalScale:new T.Vector2(k==='asphalt'?.035:.18,k==='asphalt'?.035:.18)}:{})}));}
 function load(key,tile){const b=[tile.tile[0]*SIZE,tile.tile[1]*SIZE,(tile.tile[0]+1)*SIZE,(tile.tile[1]+1)*SIZE],buckets=new Map(),root=new T.Group();root.name=`WorldTile_${key}`;
  const bucket=k=>{if(!buckets.has(k))buckets.set(k,{v:[],c:[],uv:[]});return buckets.get(k);};
 function tri(k,a,b,c,shade=1){let triangles=[[a,b,c]];for(const d of DISTRICT_BOUNDS){if(Math.min(a[0],b[0],c[0])>d[2]||Math.max(a[0],b[0],c[0])<d[0]||Math.min(a[2],b[2],c[2])>d[3]||Math.max(a[2],b[2],c[2])<d[1])continue;triangles=triangles.flatMap(v=>subtractBox(v,[d[0],-100,d[1],d[2],1000,d[3]]));}const t=bucket(k);for(const triangle of triangles){t.v.push(...triangle.flat());
    // Horizontal surfaces use X/Z; vertical facades use their dominant wall axis/Y.
    // The old mixed X/Y and Z/Y projection skewed window bands diagonally on walls.
    const dx=Math.abs(triangle[1][0]-triangle[0][0])+Math.abs(triangle[2][0]-triangle[0][0]);
    const dz=Math.abs(triangle[1][2]-triangle[0][2])+Math.abs(triangle[2][2]-triangle[0][2]);
    const vertical=Math.abs(triangle[1][1]-triangle[0][1])+Math.abs(triangle[2][1]-triangle[0][1])>.1;
    const scale=k==='asphalt'?1.2:.16;for(const p of triangle){t.c.push(shade,shade,shade);t.uv.push(vertical?(dx>=dz?p[0]:p[2])*.24:p[0]*scale,(vertical?p[1]:p[2])*scale);}
  }}
  function quad(k,a,b,c,d,shade=1){tri(k,a,b,c,shade);tri(k,a,c,d,shade);}
  function poly(k,ring,y,shade=1){const pts=clip(ring,b);if(pts.length<3)return;const v=pts.map(p=>new T.Vector2(...p)),faces=T.ShapeUtils.triangulateShape(v,[]);for(const [a,c,d]of faces){const p=[pts[a],pts[c],pts[d]],cross=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);if(cross>0)p.reverse();tri(k,...p.map(q=>[q[0],y,q[1]]),shade);}}
  function ribbon(k,a,c,w,y){const len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<.01)return;const x=-(c[1]-a[1])/len*w/2,z=(c[0]-a[0])/len*w/2;poly(k,[[a[0]+x,a[1]+z],[c[0]+x,c[1]+z],[c[0]-x,c[1]-z],[a[0]-x,a[1]-z]],y);}
  if(elevation){for(const points of groundTriangles(elevation,b))tri('sand',...points.map(p=>[p[0],p[1]-.025,p[2]]));}else poly('sand',[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]],-.025);
  for(const f of tile.features){const p=f.properties,g=f.geometry;
   if(p.building&&g.type==='Polygon'){const info=buildingInfo(f);if(!info)continue;const {ring,h,area}=info,shade=.88+(Number(f.id.replace(/\D/g,''))%11)*.014;poly('roof',ring,h,shade);
    for(let i=1;i<ring.length;i++){const a=ring[i-1],c=ring[i],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(!len)continue;
     // Subdivision makes clipping facades independent of polygon orientation.
     const n=Math.max(1,Math.ceil(len/3));for(let j=0;j<n;j++){const a0=[a[0]+(c[0]-a[0])*j/n,a[1]+(c[1]-a[1])*j/n],a1=[a[0]+(c[0]-a[0])*(j+1)/n,a[1]+(c[1]-a[1])*(j+1)/n],mid=[(a0[0]+a1[0])/2,(a0[1]+a1[1])/2];if(mid[0]<b[0]||mid[0]>=b[2]||mid[1]<b[1]||mid[1]>=b[3])continue;
      const P=(t,y,off=0)=>[a0[0]+(a1[0]-a0[0])*t+(c[1]-a[1])/len*off,y,a0[1]+(a1[1]-a0[1])*t-(c[0]-a[0])/len*off];
      quad('wall',P(0,0),P(1,0),P(1,h),P(0,h),shade);quad('wall',P(0,h),P(1,h),P(1,0),P(0,0),shade);
      // A low raised plinth gives the base buildings the chunky toy-model silhouette
      // visible in the Nellis standards photos without changing the collision footprint.
      quad('trim',P(0,0,.045),P(1,0,.045),P(1,.2,.045),P(0,.2,.045),shade+.04);
      quad('trim',P(0,.2,.045),P(1,.2,.045),P(1,.2,.025),P(0,.2,.025),shade+.04);
      quad('trim',P(0,h-.2,.025),P(1,h-.2,.025),P(1,h,.025),P(0,h,.025));
      if(p.building!=='roof')for(let y=1.1;y<h-1;y+=3){quad('glass',P(.2,y,.04),P(.8,y,.04),P(.8,y+1.25,.04),P(.2,y+1.25,.04));quad('glass',P(.2,y+1.25,-.04),P(.8,y+1.25,-.04),P(.8,y,-.04),P(.2,y,-.04));}
     }
    }continue;
   }
   if(g.type==='Polygon'){if(p.aeroway==='apron')poly('concrete',g.coordinates[0],.004);else if(p.leisure&&p.leisure!=='swimming_pool'||p.landuse==='grass')poly('grass',g.coordinates[0],.002);else if(p.amenity==='parking')poly('asphalt',g.coordinates[0],.008);continue;}
   if(g.type==='LineString'&&(p.highway||p.aeroway==='runway'||p.aeroway==='taxiway')){const w=roadWidth(p),kind=p.aeroway?'concrete':p.highway==='track'||p.highway==='path'?'sand':'asphalt',y=p.aeroway?.012:.02;for(let i=1;i<g.coordinates.length;i++){const a=g.coordinates[i-1],c=g.coordinates[i];ribbon(kind,a,c,w,y);
     if(p.aeroway==='runway'){const len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len)for(const side of [-1,1]){const off=(w/2-1)*side,dx=(c[1]-a[1])/len*off,dz=-(c[0]-a[0])/len*off;ribbon('paint',[a[0]+dx,a[1]+dz],[c[0]+dx,c[1]+dz],.3,y+.008);}}
     if(p.aeroway==='taxiway')ribbon('stripe',a,c,.18,y+.006);
     if(p.aeroway==='runway'||w>=9){const len=Math.hypot(c[0]-a[0],c[1]-a[1]),step=p.aeroway?25:7;for(let d=0;d<len;d+=step){const t=d/len,u=Math.min((d+step*.42)/len,1);ribbon('paint',[a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t],[a[0]+(c[0]-a[0])*u,a[1]+(c[1]-a[1])*u],p.aeroway?.8:.1,y+.008);}}
    }if(p.aeroway==='runway'){const details=runwayFurniture(f,w);for(const shape of details.paint)poly('paint',shape,y+.012);for(const [x,z]of details.lights)poly('light',[[x-.18,z-.18],[x+.18,z-.18],[x+.18,z+.18],[x-.18,z+.18]],.12);}}
  }
  for(const [k,v]of buckets){if(!v.v.length)continue;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v.v,3));g.setAttribute('color',new T.Float32BufferAttribute(v.c,3));g.setAttribute('uv',new T.Float32BufferAttribute(v.uv,2));g.computeVertexNormals();g.computeBoundingSphere();const m=new T.Mesh(g,mats.get(k));m.castShadow=['wall','roof'].includes(k);m.receiveShadow=true;root.add(m);}groups.set(key,root);scene.add(root);
 }
 function drop(key){const root=groups.get(key);if(!root)return;root.removeFromParent();root.traverse(o=>o.geometry?.dispose());groups.delete(key);}
 return {load,drop,dispose(){for(const k of groups.keys())drop(k);for(const m of mats.values())m.dispose();for(const m of maps.values())m.dispose();}};
}
