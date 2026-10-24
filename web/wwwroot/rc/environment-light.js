import * as T from '../vendor/three.module.js';

// r160 has no Scene.environmentIntensity. Keep the visible sky untouched and
// scale a separate floating-point radiance source before PMREM convolution.
export function environmentRadiance(source, intensity) {
  if (!(source.image.data instanceof Float32Array)) throw new TypeError('Expected floating-point HDR radiance');
  const texture=source.clone(),data=source.image.data.slice();
  for(let i=0;i<data.length;i+=4)for(let channel=0;channel<3;channel++)data[i+channel]*=intensity;
  texture.source=new T.Source({...source.image,data});texture.needsUpdate=true;
  return texture;
}
