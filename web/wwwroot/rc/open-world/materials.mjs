export const MATERIAL_SIZE = 128;
export const SURFACE_NAMES = Object.freeze(['sand','asphalt','concrete','stucco','roof']);
const TAU=Math.PI*2, clamp=x=>Math.max(0,Math.min(1,x));
const periodic=n=>n%(MATERIAL_SIZE-1);
// Wrapped integer grain avoids the diagonal sine-wave bands that looked like painted roads.
const noise=(x,y,s=0)=>{let n=Math.imul(periodic(x)+1,374761393)^Math.imul(periodic(y)+1,668265263)^Math.imul(s+1,1274126177);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
const detail=(x,y,s=0)=>noise(x,y,s+31);
function heightAt(kind,x,y){const u=periodic(x)/(MATERIAL_SIZE-1),v=periodic(y)/(MATERIAL_SIZE-1);switch(kind){case'sand':return .5+.18*Math.sin(TAU*(v*7+Math.sin(TAU*u*4)*.12))+.025*noise(x,y);case'asphalt':return .5+.06*noise(x,y)+.025*Math.sin(TAU*u*31)*Math.sin(TAU*v*29);case'concrete':return .5+.025*noise(x,y)+.018*(Math.abs(Math.sin(TAU*u*4))>.96||Math.abs(Math.sin(TAU*v*4))>.96?-.7:0);case'stucco':return .5+.07*noise(x,y)+.018*Math.sin(TAU*u*47)*Math.sin(TAU*v*43);case'roof':return .5+.13*Math.sin(TAU*u*8)+.02*noise(x,y);default:throw new RangeError(`unknown surface: ${kind}`);}}
function base(kind,x,y){
 const h=heightAt(kind,x,y),n=noise(x,y,9),d=detail(x,y,kind.length),u=periodic(x)/127,v=periodic(y)/127;
 // Deliberately saturated, toy-scale colours: each base material must remain legible
 // at a distance, while the small variation keeps large tiles from reading as flat fills.
 const palette={sand:[.64,.49,.31],asphalt:[.16,.18,.19],concrete:[.56,.58,.56],stucco:[.72,.63,.49],roof:[.37,.22,.16]}[kind];
 let variation=(n-.5)*.10+(d-.5)*.055+(h-.5)*.05;
 if(kind==='asphalt'){
   variation=(n-.5)*.018+(d-.5)*.012;
   const aggregate=d>.91?.09:0;
   variation+=(aggregate);
   // Sparse hairline seams are darker than the road; keep them distinct from paint.
   if(Math.abs(Math.sin(TAU*(u+.025*Math.sin(TAU*v*3))))<.018)return [.11,.12,.13];
 }
 if(kind==='concrete'&&(Math.abs(Math.sin(TAU*u*4))>.96||Math.abs(Math.sin(TAU*v*4))>.96))variation-=.08;
 if(kind==='roof')variation+=(Math.sin(TAU*u*8)>.25?.035:-.035);
 return palette.map(channel=>clamp(channel+variation));
}
export function generateSurface(kind,size=MATERIAL_SIZE){if(size!==128)throw new RangeError('procedural surfaces require 128x128');const albedo=new Uint8Array(size*size*4),roughness=new Uint8Array(albedo.length),normal=new Uint8Array(albedo.length);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,cx=x===size-1?0:x,cy=y===size-1?0:y,h=heightAt(kind,cx,cy),left=heightAt(kind,(cx-1+size-1)%(size-1),cy),right=heightAt(kind,(cx+1)%(size-1),cy),up=heightAt(kind,cx,(cy-1+size-1)%(size-1)),down=heightAt(kind,cx,(cy+1)%(size-1)),tx=(right-left)*1.8,ty=(down-up)*1.8,l=Math.hypot(tx,ty,1),nx=-tx/l,ny=-ty/l,nz=1/l;const [r,g,b]=base(kind,cx,cy);albedo[i]=r*255;albedo[i+1]=g*255;albedo[i+2]=b*255;albedo[i+3]=255;const rough=clamp((kind==='asphalt'?.82:kind==='roof'?.58:kind==='sand'?.9:kind==='stucco'?.76:.72)+.12*noise(cx,cy,4));roughness[i]=rough*255;roughness[i+1]=rough*255;roughness[i+2]=rough*255;roughness[i+3]=255;normal[i]=(nx*.5+.5)*255;normal[i+1]=(ny*.5+.5)*255;normal[i+2]=(nz*.5+.5)*255;normal[i+3]=255;}return {kind,size,albedo,roughness,normal};}
export const surfacePattern=generateSurface;
