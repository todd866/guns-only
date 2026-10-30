// Export the RC world the browser draws for the native Metal build.
// Usage: node tools/rc/native/export-world.cjs <out.rcworld> [radius=450] [query=track=hub]
// Writes <out>.rcworld (RCW2) and <out>.tex/NNN.png (every texture, resized to 1024², sRGB RGBA).
// RCW2 (little-endian): 'RCW2', u32 headerBytes, header JSON {vertices, indices, spawn, yaw, materials,
// textures}, padded to 4; then f32 xyz positions, f32 xyz normals, u8 rgba colours (linear vertex
// colour × material tint), f32 uv (texture transform baked in), u16 material per vertex (padded to
// 4), u32 indices. A material is {tex: layer|-1, alpha: alpha-tested?}. World space throughout;
// instanced meshes expanded. Custom shader materials (sky, racing lines) are skipped.
const {chromium}=require('../../../web/smoke/node_modules/playwright');const path=require('node:path'),fs=require('node:fs');
(async()=>{const out=process.argv[2],radius=Number(process.argv[3]||450),query=process.argv[4]||'track=hub';
 const srv=await require('../serve-static.cjs')(path.resolve(__dirname,'../../../web/wwwroot'),8886);let b;
 try{b=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});const p=await b.newPage({viewport:{width:800,height:600}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(`http://127.0.0.1:8886/rc/?${query}&audioQa=silent&telemetry=off`);
  await p.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:180000});
  if(await p.locator('#start').isVisible())await p.locator('#start').click();await p.waitForTimeout(4000);
  const info=await p.evaluate(async radius=>{
   const scene=window.__gunsOnlyRC.scene(),snap=window.__gunsOnlyRC.snapshot(),cx=snap.x,cz=snap.z;scene.updateMatrixWorld(true);
   const TEX=1024,textures=[],texIndex=new Map(),materials=[],matIndex=new Map();
   // One 1024² sRGB canvas per distinct image; DataTextures are drawn through ImageData.
   const layerFor=tex=>{const img=tex?.image;if(!img)return -1;if(texIndex.has(img))return texIndex.get(img);let src=img;
    if(img.data&&img.width){const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const d=new Uint8ClampedArray(img.width*img.height*4),s=img.data,ch=s.length/(img.width*img.height),f=s instanceof Uint8Array||s instanceof Uint8ClampedArray?1:255;
     for(let i=0;i<img.width*img.height;i++){for(let k=0;k<3;k++)d[i*4+k]=s[i*ch+Math.min(k,ch-1)]*f;d[i*4+3]=ch>3?s[i*ch+3]*f:255;}c.getContext('2d').putImageData(new ImageData(d,img.width,img.height),0,0);src=c;}
    const c=document.createElement('canvas');c.width=c.height=TEX;const x=c.getContext('2d');try{x.drawImage(src,0,0,TEX,TEX);}catch{return -1;}
    texIndex.set(img,textures.length);textures.push(c.toDataURL('image/png'));return textures.length-1;};
   const materialFor=mat=>{if(matIndex.has(mat))return matIndex.get(mat);const layer=layerFor(mat.map);const m={tex:layer,alpha:!!(mat.alphaTest>0||(mat.transparent&&mat.map&&layer>=0))};matIndex.set(mat,materials.length);materials.push(m);return materials.length-1;};
   const P=[],N=[],C=[],U=[],M=[],I=[];let skipped=0;
   const Mx=new (scene.matrixWorld.constructor)(),NM=new (scene.matrixWorld.constructor)();
   const add=(geo,mat,world)=>{const pos=geo.attributes.position;if(!pos)return;
    if(!geo.boundingSphere)geo.computeBoundingSphere();const bs=geo.boundingSphere.center.clone().applyMatrix4(world);if(Math.hypot(bs.x-cx,bs.z-cz)>radius+geo.boundingSphere.radius)return;
    const nor=geo.attributes.normal,col=geo.attributes.color,uv=geo.attributes.uv,idx=geo.index,mi=materialFor(mat);
    const tint=mat.color?[mat.color.r,mat.color.g,mat.color.b]:[1,1,1];if(mat.map){mat.map.updateMatrix();}const tm=mat.map?.matrix.elements;
    NM.copy(world).invert().transpose();const v0=P.length/3,e=world.elements,ne=NM.elements;
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);P.push(e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],e[2]*x+e[6]*y+e[10]*z+e[14]);
     if(nor){const a=nor.getX(i),bq=nor.getY(i),c=nor.getZ(i);let nx=ne[0]*a+ne[4]*bq+ne[8]*c,ny=ne[1]*a+ne[5]*bq+ne[9]*c,nz=ne[2]*a+ne[6]*bq+ne[10]*c;const l=Math.hypot(nx,ny,nz)||1;N.push(nx/l,ny/l,nz/l);}else N.push(0,1,0);
     const vc=col?[col.getX(i),col.getY(i),col.getZ(i)]:[1,1,1];C.push(...[0,1,2].map(k=>Math.min(255,Math.round(tint[k]*vc[k]*255))),255);
     let u=uv?uv.getX(i):0,v=uv?uv.getY(i):0;if(tm){const uu=tm[0]*u+tm[3]*v+tm[6],vv=tm[1]*u+tm[4]*v+tm[7];u=uu;v=vv;}
     // three.js samples with flipY (v up); the PNG rows run top-down.
     U.push(u,mat.map?.flipY===false?v:1-v);M.push(mi);}
    if(idx)for(let i=0;i<idx.count;i++)I.push(v0+idx.getX(i));else for(let i=0;i<pos.count;i++)I.push(v0+i);};
   scene.traverseVisible(o=>{if(!o.isMesh||o.isSkinnedMesh)return;const mat=Array.isArray(o.material)?o.material[0]:o.material;
    if(!mat||mat.isShaderMaterial||mat.isRawShaderMaterial||(mat.transparent&&mat.opacity<.5&&!mat.map)){skipped++;return;}
    if(o.isInstancedMesh){for(let k=0;k<o.count;k++){o.getMatrixAt(k,Mx);if(Mx.elements[0]===0&&Mx.elements[5]===0)continue;add(o.geometry,mat,Mx.premultiply(o.matrixWorld).clone());}}
    else add(o.geometry,mat,o.matrixWorld);});
   const header=new TextEncoder().encode(JSON.stringify({vertices:P.length/3,indices:I.length,spawn:[cx,snap.y,cz],yaw:snap.yaw??0,materials,textures:textures.length,radius,skipped}));
   const pad=(4-(8+header.length)%4)%4,nv=P.length/3,mBytes=nv*2+((4-(nv*2)%4)%4);
   const total=8+header.length+pad+nv*12*2+nv*4+nv*8+mBytes+I.length*4,buf=new Uint8Array(total),dv=new DataView(buf.buffer);
   buf.set([82,67,87,50]);dv.setUint32(4,header.length+pad,true);buf.set(header,8);let o=8+header.length+pad;
   for(const [arr,T] of [[P,Float32Array],[N,Float32Array],[C,Uint8Array],[U,Float32Array],[M,Uint16Array]]){const bytes=new Uint8Array(new T(arr).buffer);buf.set(bytes,o);o+=T===Uint16Array?mBytes:bytes.length;}
   buf.set(new Uint8Array(new Uint32Array(I).buffer),o);
   window.__rcExport=buf;window.__rcTextures=textures;return {bytes:total,vertices:nv,indices:I.length,materials:materials.length,textures:textures.length,skipped};
  },radius);
  fs.mkdirSync(path.dirname(out),{recursive:true});const fd=fs.openSync(out,'w'),CH=24<<20;
  for(let at=0;at<info.bytes;at+=CH){const b64=await p.evaluate(([a,n])=>{const s=window.__rcExport.subarray(a,a+n);let bin='';for(let i=0;i<s.length;i+=32768)bin+=String.fromCharCode.apply(null,s.subarray(i,i+32768));return btoa(bin);},[at,CH]);fs.writeSync(fd,Buffer.from(b64,'base64'));}
  fs.closeSync(fd);
  const texDir=out.replace(/\.rcworld$/,'')+'.tex';fs.mkdirSync(texDir,{recursive:true});
  for(let i=0;i<info.textures;i++){const url=await p.evaluate(i=>window.__rcTextures[i],i);fs.writeFileSync(path.join(texDir,String(i).padStart(3,'0')+'.png'),Buffer.from(url.split(',')[1],'base64'));}
  console.log(JSON.stringify({...info,file:fs.statSync(out).size,errs}));
 }finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
