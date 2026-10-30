// Export the RC world the browser draws into a flat triangle file for the native Metal build.
// Usage: node tools/rc/native/export-world.cjs <out.rcworld> [radius=450] [query=track=hub]
// Format (little-endian): 'RCW1', u32 headerBytes, header JSON {vertices, indices, spawn, yaw, sun},
// padded to 4; then f32 xyz positions, f32 xyz normals, u8 rgba colours (linear), u32 indices.
// Everything is world-space; instanced meshes are expanded; a textured material contributes its
// texture's average colour times its tint. Custom shader materials (sky, racing lines) are skipped.
const {chromium}=require('../../../web/smoke/node_modules/playwright');const path=require('node:path'),fs=require('node:fs');
(async()=>{const out=process.argv[2],radius=Number(process.argv[3]||450),query=process.argv[4]||'track=hub';
 const srv=await require('../serve-static.cjs')(path.resolve(__dirname,'../../../web/wwwroot'),8886);let b;
 try{b=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});const p=await b.newPage({viewport:{width:800,height:600}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(`http://127.0.0.1:8886/rc/?${query}&audioQa=silent&telemetry=off`);
  await p.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:180000});
  if(await p.locator('#start').isVisible())await p.locator('#start').click();await p.waitForTimeout(4000);
  const data=await p.evaluate(async radius=>{
   const scene=window.__gunsOnlyRC.scene(),snap=window.__gunsOnlyRC.snapshot(),cx=snap.x,cz=snap.z;
   scene.updateMatrixWorld(true);
   const avg=new Map();const texColour=tex=>{const img=tex?.image;if(!img)return [1,1,1];if(avg.has(img))return avg.get(img);let c=[1,1,1];
    // DataTextures (the residential grass, asphalt and concrete) carry raw texels, not an image.
    if(img.data&&img.width){const d=img.data,step=Math.max(1,Math.floor(d.length/4/4096))*4,scale=d instanceof Uint8Array||d instanceof Uint8ClampedArray?1/255:1;let r=0,g=0,bb=0,n=0;for(let i=0;i+2<d.length;i+=step){r+=d[i]*scale;g+=d[i+1]*scale;bb+=d[i+2]*scale;n++;}const lin=v=>tex.colorSpace==='srgb'?Math.pow(v,2.2):v;c=n?[lin(r/n),lin(g/n),lin(bb/n)]:c;avg.set(img,c);return c;}
    try{const cv=document.createElement('canvas');cv.width=cv.height=16;const x=cv.getContext('2d');x.drawImage(img,0,0,16,16);const d=x.getImageData(0,0,16,16).data;let r=0,g=0,bb=0;for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];bb+=d[i+2];}const n=d.length/4,lin=v=>Math.pow(v/255/n,2.2);c=[lin(r),lin(g),lin(bb)];}catch{}avg.set(img,c);return c;};
   const P=[],N=[],C=[],I=[];let skipped=0;
   const M=new (scene.matrixWorld.constructor)(),NM=new (scene.matrixWorld.constructor)();
   const add=(mesh,geo,mat,world)=>{const pos=geo.attributes.position;if(!pos)return;const nor=geo.attributes.normal,col=geo.attributes.color,idx=geo.index;
    const base=mat.color?[mat.color.r,mat.color.g,mat.color.b]:[1,1,1],t=mat.map?texColour(mat.map):[1,1,1];
    // A cheap reject: skip geometry whose bounding sphere is outside the export radius.
    if(!geo.boundingSphere)geo.computeBoundingSphere();const bs=geo.boundingSphere.center.clone().applyMatrix4(world);if(Math.hypot(bs.x-cx,bs.z-cz)>radius+geo.boundingSphere.radius)return;
    NM.copy(world).invert().transpose();const v0=P.length/3,e=world.elements,ne=NM.elements;
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);P.push(e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],e[2]*x+e[6]*y+e[10]*z+e[14]);
     if(nor){const a=nor.getX(i),bq=nor.getY(i),c=nor.getZ(i);let nx=ne[0]*a+ne[4]*bq+ne[8]*c,ny=ne[1]*a+ne[5]*bq+ne[9]*c,nz=ne[2]*a+ne[6]*bq+ne[10]*c;const l=Math.hypot(nx,ny,nz)||1;N.push(nx/l,ny/l,nz/l);}else N.push(0,1,0);
     const vc=col?[col.getX(i),col.getY(i),col.getZ(i)]:[1,1,1];C.push(Math.min(255,Math.round(base[0]*t[0]*vc[0]*255)),Math.min(255,Math.round(base[1]*t[1]*vc[1]*255)),Math.min(255,Math.round(base[2]*t[2]*vc[2]*255)),255);}
    if(idx)for(let i=0;i<idx.count;i++)I.push(v0+idx.getX(i));else for(let i=0;i<pos.count;i++)I.push(v0+i);};
   scene.traverseVisible(o=>{if(!o.isMesh||o.isSkinnedMesh)return;const mat=Array.isArray(o.material)?o.material[0]:o.material;
    if(!mat||mat.isShaderMaterial||mat.isRawShaderMaterial||mat.transparent&&mat.opacity<.5||mat.isPointsMaterial){skipped++;return;}
    if(o.isInstancedMesh){for(let k=0;k<o.count;k++){o.getMatrixAt(k,M);if(M.elements[0]===0&&M.elements[5]===0)continue;add(o,o.geometry,mat,M.premultiply(o.matrixWorld).clone());}}
    else add(o,o.geometry,mat,o.matrixWorld);});
   const sun=window.__gunsOnlyRC.sun?.()??[.45,.8,.35];
   // Pack into one binary blob here; the page hands it back in base64 slices (a JSON array of
   // millions of numbers overflows Node's string limit).
   const header=new TextEncoder().encode(JSON.stringify({vertices:P.length/3,indices:I.length,spawn:[cx,snap.y,cz],yaw:snap.yaw??0,sun,radius,skipped})),pad=(4-(8+header.length)%4)%4;
   const total=8+header.length+pad+P.length*4+N.length*4+C.length+I.length*4,buf=new Uint8Array(total),dv=new DataView(buf.buffer);
   buf.set([82,67,87,49]);dv.setUint32(4,header.length+pad,true);buf.set(header,8);let o=8+header.length+pad;
   buf.set(new Uint8Array(new Float32Array(P).buffer),o);o+=P.length*4;buf.set(new Uint8Array(new Float32Array(N).buffer),o);o+=N.length*4;buf.set(new Uint8Array(C),o);o+=C.length;buf.set(new Uint8Array(new Uint32Array(I).buffer),o);
   window.__rcExport=buf;return {bytes:total,vertices:P.length/3,indices:I.length,skipped};
  },radius);
  fs.mkdirSync(path.dirname(out),{recursive:true});const fd=fs.openSync(out,'w'),CH=24<<20;
  for(let at=0;at<data.bytes;at+=CH){const b64=await p.evaluate(([a,n])=>{const s=window.__rcExport.subarray(a,a+n);let bin='';for(let i=0;i<s.length;i+=32768)bin+=String.fromCharCode.apply(null,s.subarray(i,i+32768));return btoa(bin);},[at,CH]);fs.writeSync(fd,Buffer.from(b64,'base64'));}
  fs.closeSync(fd);console.log(JSON.stringify({...data,file:fs.statSync(out).size,errs}));
 }finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
