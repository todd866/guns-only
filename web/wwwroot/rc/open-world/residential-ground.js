import * as T from '../../vendor/three.module.js';

// Original irrigated turf, tiled over two physical metres. Tiny blade groups
// remain legible from the RC chase camera and blend into colour at a distance.
export function residentialGrass() {
 const size=256,pixels=new Uint8Array(size*size*4),height=new Uint8Array(pixels.length);
 const random=(x,y)=>{let n=Math.imul((x+size)%size+11,374761393)^Math.imul((y+size)%size+23,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,grain=random(x,y),blade=random(Math.floor(x/2)*2,Math.floor(y/5)*5);
  const value=(grain-.5)*12+(blade-.5)*25;
  pixels.set([78+value,108+value,39+value*.6,255],i);
  const h=115+blade*36+grain*12;height.set([h,h,h,255],i);
 }
 const texture=(data,srgb)=>{const t=new T.DataTexture(data,size,size,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;if(srgb)t.colorSpace=T.SRGBColorSpace;t.needsUpdate=true;return t;};
 return {map:texture(pixels,true),bumpMap:texture(height,false)};
}
