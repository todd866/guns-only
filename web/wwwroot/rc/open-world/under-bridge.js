import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {NY,buildUnderBridge,bridgeWorld,brickHeight} from './under-bridge.mjs';
import {smoothBowlNormals,refineSkateTriangles} from './skate-normals.js';

const COLOURS={paver:'#a6a7a1','paver-dark':'#999c99',border:'#c6c4b9',brick:'#b85b42','brick-deck':'#a9513c',wall:'#894731',skirt:'#895344',road:'#535959',soffit:'#5f6869',steel:'#8eaba9',pillar:'#b8b3a4',granite:'#bbbcb2',stripe:'#ddd5ac',barrier:'#a39a7b',abutment:'#a36b50',bank:'#b87258',access:'#ad795d','subway-bank':'#bcb5a6',steps:'#c6c2b7','cab-bank':'#b27259',cab:'#f5bc32',glass:'#324b53',taxi:'#f6de8c',tyre:'#303736','hydrant-bank':'#ad7358',hydrant:'#b64936',news:'#526e78',paper:'#dfd6b6',basin:'#829c98',rim:'#c8c5b5','basin-bank':'#8fa5a1','fountain-bank':'#b2b3a7','fountain-launch':'#b9765d',bench:'#bcb5a3',soil:'#705849','manual-bank':'#b7b8ad',lamp:'#ffe7b0',sign:'#ffffff'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const heights={
  brick:brickHeight,'brick-deck':brickHeight,
  bank:(x,z)=>.04+1.2*clamp((z+3)/5,0,1),
  'ledge-return':(x,z)=>.04+.6*clamp((13-z)/4,0,1),
  access:x=>.04+3.2*clamp((x-8)/12,0,1),
  'subway-bank':(x,z)=>.04+1.2*clamp((z+8)/6,0,1),
  'cab-bank':(x,z)=>.04+2.2*clamp((z+2)/5,0,1),
  'hydrant-bank':(x,z)=>.04+1.2*clamp((z-8)/4,0,1),
  'fountain-launch':(x,z)=>.04+1.05*clamp((z-4)/4,0,1),
  'fountain-bank':(x,z)=>.04+.7*clamp((4.2-Math.hypot(x+11,z-15))/.8,0,1),
  'basin-bank':(x,z)=>.08+.66*clamp((Math.hypot(x+11,z-15)-2)/.8,0,1),
  'manual-bank':x=>.04+.6*clamp((x<0?x+7:x-7)/2,0,1),
};
export function createUnderBridge(scene,world){
  const root=new T.Group();root.name='Under the Bridge';root.position.set(...NY.center);scene.add(root);
  const batches=new Map(),pieces=[],colour=new T.Color();
  for(const source of buildUnderBridge()){
    if(world?.addTri)world.addTri(bridgeWorld(source.a),bridgeWorld(source.b),bridgeWorld(source.c),source.surface);
    const mat=source.mat,fn=heights[mat],brick=mat==='brick'||mat==='brick-deck';
    if(!batches.has(mat))batches.set(mat,{positions:[],uv:[]});const batch=batches.get(mat);
    const minx=Math.min(source.a[0],source.b[0],source.c[0]),minz=Math.min(source.a[2],source.b[2],source.c[2]);
    for(const t of fn?refineSkateTriangles([source],fn):[source])for(const p of [t.a,t.b,t.c]){batch.positions.push(...p);batch.uv.push(...(brick?[(p[0]-minx),.2+(p[2]-minz)*3.2]:[.75,.1]));}
  }
  const piece=(g,mat)=>{
    colour.set(COLOURS[mat]);const n=g.attributes.position.count;
    g.setAttribute('color',new T.Float32BufferAttribute(Array.from({length:n*3},(_,i)=>[colour.r,colour.g,colour.b][i%3]),3));
    if(!g.attributes.uv)g.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:n*2},(_,i)=>[.75,mat==='lamp'?.02:.1][i%2]),2));
    if(heights[mat])smoothBowlNormals(g,Infinity,heights[mat]);else g.computeVertexNormals();pieces.push(g);
  };
  for(const [mat,b] of batches){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));piece(g,mat);}
  // Warm fixtures are atlas emissive texels, so the entire park remains one draw mesh.
  for(const x of [-23,0,23]){const g=new T.BoxGeometry(1.3,.1,.5).toNonIndexed();g.translate(x,7.12,-12);piece(g,'lamp');}
  for(const x of [-3.2,3.2]){const g=new T.BoxGeometry(.06,.7,.06).toNonIndexed();g.translate(x,7,-20);piece(g,'steel');}
  const sign=new T.PlaneGeometry(8,.7).toNonIndexed();sign.translate(0,6.5,-19.98);
  const uv=sign.attributes.uv;for(let i=0;i<uv.count;i++){uv.setX(i,uv.getX(i));uv.setY(i,.12+uv.getY(i)*.07);}piece(sign,'sign');
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const glow=document.createElement('canvas');glow.width=1024;glow.height=512;
  for(const [c,emissive] of [[canvas,false],[glow,true]]){
    const g=c.getContext('2d');g.fillStyle=emissive?'#000':'#fff';g.fillRect(0,0,1024,512);
    if(!emissive){g.fillStyle='#bfb7a4';g.fillRect(0,0,1024,410);g.fillStyle='#fff';for(let row=0;row<2;row++)for(let x=-128*(row%2);x<1024;x+=256)g.fillRect(x+4,row*205+4,248,197);}
    g.fillStyle=emissive?'#1e170d':'#293e42';g.fillRect(0,415,1024,36);
    g.fillStyle=emissive?'#6d542a':'#f5ddb2';g.font='900 34px system-ui';g.textAlign='center';g.textBaseline='middle';g.save();g.scale(2.2,1);g.fillText('UNDER THE BRIDGE',512/2.2,434);g.restore();
    g.fillStyle=emissive?'#fff':'#fff';g.fillRect(0,492,1024,20);
  }
  const texture=new T.CanvasTexture(canvas),emissiveMap=new T.CanvasTexture(glow);texture.colorSpace=emissiveMap.colorSpace=T.SRGBColorSpace;
  const material=new T.MeshStandardMaterial({vertexColors:true,map:texture,emissive:'#ffffff',emissiveMap,emissiveIntensity:1.1,roughness:.87,side:T.DoubleSide,shadowSide:T.BackSide});
  const mesh=new T.Mesh(mergeGeometries(pieces),material);mesh.name='Under the Bridge';mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
  for(const g of pieces)g.dispose();
  return {root,dispose(){root.removeFromParent();mesh.geometry.dispose();material.dispose();texture.dispose();emissiveMap.dispose();}};
}
