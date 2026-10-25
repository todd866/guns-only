import * as T from '../../vendor/three.module.js';

// Original, metre-scaled cast concrete. The glTF has baked occlusion but no UVs;
// project each triangle onto its dominant plane rather than stretching a tile
// across the entire park. A tile spans 3 m, so aggregate stays RC-sized.
export function finishSkateparkSurface(geometry, material, paintTexture = null) {
  if(material.name==='paint'){
    if(!paintTexture)throw new Error('Skatepark paint texture was not prepared');
    const p=geometry.attributes.position,uv=[],c=Math.cos(.274),s=Math.sin(.274);
    for(let i=0;i<p.count;i+=3){
      const x=p.getX(i),z=p.getZ(i),strip=z<-6?0:x<-10?1:z>5?2:3;
      const local=[];
      for(let j=i;j<i+3;j++){
        const X=p.getX(j),Y=-p.getZ(j);
        const origin=strip===0?[8.555,12.953]:strip===1?[-15.522,-3.638]:strip===2?[-.364,-8.537]:[-3.691,.983];
        const a=(X-origin[0])*c+(Y-origin[1])*s,b=-(X-origin[0])*s+(Y-origin[1])*c;
        local.push([a,b,p.getY(j)]);
      }
      const span=k=>Math.max(...local.map(v=>v[k]))-Math.min(...local.map(v=>v[k]));
      const top=span(2)<1e-5,along=span(0)>span(1)?0:1;
      for(const [a,b,y] of local){
        const u=strip===0?Math.atan2(b,a)*.7:top?a/4+.5:([a,b][along])/(strip===2?8.5:strip===1?10.7:6)+.5;
        const height=[1.12,.85,.36,.98][strip],depth=strip===3?5.9:strip===2?1.25:10.7;
        const v=Math.min(1,Math.max(0,top?b/depth+.5:(y-.14)/height));
        uv.push(u,(strip+.035+v*.93)/4);
      }
    }
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    material.map=paintTexture;material.color.set('#ffffff');material.roughness=.88;material.needsUpdate=true;return;
  }
  if (!['floor','concrete','edge','path'].includes(material.name)) return;
  const position=geometry.attributes.position, normal=geometry.attributes.normal, uv=[];
  for(let i=0;i<position.count;i+=3){
    const nx=Math.abs(normal.getX(i)),ny=Math.abs(normal.getY(i)),nz=Math.abs(normal.getZ(i));
    for(let j=i;j<i+3;j++)uv.push((ny>=nx&&ny>=nz?position.getX(j):nx>nz?position.getZ(j):position.getX(j))/3,(ny>=nx&&ny>=nz?position.getZ(j):position.getY(j))/3);
  }
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  if(material.map)return;
  const size=512, pixels=new Uint8Array(size*size*4), relief=new Uint8Array(pixels.length);
  const noise=(x,y)=>{let n=Math.imul(x+17,374761393)^Math.imul(y+91,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
  const joint=material.name==='floor'||material.name==='path';
  const base={floor:[173,170,163],concrete:[151,157,159],edge:[190,182,165],path:[142,149,145]}[material.name];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,n=noise(x,y),grain=(n-.5)*14;
    const edge=Math.min(x,y,size-1-x,size-1-y),seam=joint&&edge<1?22:joint&&edge<3?6:0;
    const mottling=3*Math.sin(x*.028)*Math.sin(y*.033)+2*Math.sin((x+y)*.071);
    // Sparse dark pinholes and subtle aggregate, rather than high-contrast gravel.
    const pore=n<.025?12:0,v=grain+mottling-seam-pore;
    pixels.set([...base.map(c=>c+v),255],i);const bump=128+(n-.5)*38-seam*2;relief.set([bump,bump,bump,255],i);
  }
  const texture=(data,srgb=false)=>{const t=new T.DataTexture(data,size,size,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;t.anisotropy=8;if(srgb)t.colorSpace=T.SRGBColorSpace;t.needsUpdate=true;return t;};
  material.map=texture(pixels,true);material.bumpMap=texture(relief);material.bumpScale=.007;material.color.set('#ffffff');material.roughness=.82;material.needsUpdate=true;
}
