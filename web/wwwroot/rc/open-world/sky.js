import {createNightEnvironment} from './night-environment.js';
import * as T from '../../vendor/three.module.js';
import {daylight} from './daylight.mjs';
export function createWorldSky({scene,sun,hemi,contactSun,renderer}){
 const background=new T.Color(),nightEnvironment=renderer?createNightEnvironment(renderer):null;let dayEnvironment=scene.environment;
 const starsGeometry=new T.BufferGeometry(),starsPositions=[];for(let i=0;i<500;i++){const a=i*2.399963,z=.1+.9*((i*73%499)/499),r=Math.sqrt(1-z*z);starsPositions.push(Math.cos(a)*r*12000,z*12000,Math.sin(a)*r*12000);}starsGeometry.setAttribute('position',new T.Float32BufferAttribute(starsPositions,3));const starsMaterial=new T.PointsMaterial({color:'#dce8ff',size:13,sizeAttenuation:true,fog:false,transparent:true,depthWrite:false}),stars=new T.Points(starsGeometry,starsMaterial);stars.frustumCulled=false;scene.add(stars);
 const day=new T.Color('#83b9df'),night=new T.Color('#182a48'),fogDay=new T.Color('#b9c9cf'),fogNight=new T.Color('#283a51');
 const skyMaterial=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,uniforms:{daylight:{value:1},zenith:{value:new T.Color('#0869c6')},horizon:{value:new T.Color('#c8dce3')},dark:{value:new T.Color('#071528')}},vertexShader:`varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
 varying vec3 direction;uniform float daylight;uniform vec3 zenith,horizon,dark;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){vec3 d=normalize(direction);float h=max(d.y,0.);vec3 col=mix(horizon,zenith,pow(h,.2));
 vec2 p=d.xz/max(.12,d.y)*2.8;float n=noise(p)*.7+noise(p*2.1)*.3;
 float clouds=smoothstep(.64,.8,n)*smoothstep(.06,.23,h)*(1.-smoothstep(.72,.95,h));
 col=mix(col,vec3(.95,.96,.91),clouds*.9);col=mix(dark,col,daylight);
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const skyGeometry=new T.SphereGeometry(18000,24,12),sky=new T.Mesh(skyGeometry,skyMaterial);sky.frustumCulled=false;sky.renderOrder=-10;scene.add(sky);
 const geo=new T.SphereGeometry(.6,8,6),mat=new T.MeshBasicMaterial({color:'#ffffff'}),lights=new T.InstancedMesh(geo,mat,18),o=new T.Object3D(),c=new T.Color();lights.frustumCulled=false;scene.add(lights);
 for(let i=0;i<18;i++)lights.setColorAt(i,c.set(i%3===0?'#f87070':i%3===1?'#91ffb9':'#f5f3bd'));
 return {update(seconds,pos,forceNight){const v=daylight(seconds,forceNight);if(nightEnvironment){if(scene.environment!==nightEnvironment.texture)dayEnvironment=scene.environment;scene.environment=v.night>.7?nightEnvironment.texture:dayEnvironment;scene.environmentIntensity=.12+.22*v.day;}sky.position.set(...pos);skyMaterial.uniforms.daylight.value=v.day;stars.position.set(...pos);stars.visible=v.night>.05;starsMaterial.opacity=v.night*.8;background.copy(night).lerp(day,v.day);scene.background=background;scene.fog.color.copy(fogNight).lerp(fogDay,v.day);sun.intensity=v.sun*.72;hemi.intensity=Math.max(.38,v.ambient*.42);contactSun.intensity=.3;if(renderer)renderer.toneMappingExposure=1.0;lights.visible=v.night>.1;
  // Five conventional night-wave flights and one friendly alien, parallel to the runways.
  for(let i=0;i<6;i++){const along=((seconds*(i===5?23:34)+i*110)%900)-450;for(let j=0;j<3;j++){o.position.set(pos[0]+along*.656+(j-1)*3,pos[1]+85+i*12+(i===5?Math.sin(seconds)*4:0),pos[2]-along*.755+i*20);o.updateMatrix();lights.setMatrixAt(i*3+j,o.matrix);}}lights.instanceMatrix.needsUpdate=true;return v;},dispose(){sky.removeFromParent();skyGeometry.dispose();skyMaterial.dispose();lights.removeFromParent();geo.dispose();mat.dispose();stars.removeFromParent();starsGeometry.dispose();starsMaterial.dispose();nightEnvironment?.dispose();}};
}
