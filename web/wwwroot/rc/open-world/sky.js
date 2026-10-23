import {createNightEnvironment} from './night-environment.js';
import * as T from '../../vendor/three.module.js';
import {daylight} from './daylight.mjs';
export function createWorldSky({scene,sun,hemi,contactSun,renderer}){
 const background=new T.Color(),nightEnvironment=renderer?createNightEnvironment(renderer):null;let dayEnvironment=scene.environment;
 const starsGeometry=new T.BufferGeometry(),starsPositions=[];for(let i=0;i<500;i++){const a=i*2.399963,z=.1+.9*((i*73%499)/499),r=Math.sqrt(1-z*z);starsPositions.push(Math.cos(a)*r*12000,z*12000,Math.sin(a)*r*12000);}starsGeometry.setAttribute('position',new T.Float32BufferAttribute(starsPositions,3));const starsMaterial=new T.PointsMaterial({color:'#dce8ff',size:13,sizeAttenuation:true,fog:false,transparent:true,depthWrite:false}),stars=new T.Points(starsGeometry,starsMaterial);stars.frustumCulled=false;scene.add(stars);
 const day=new T.Color('#a9d4ee'),night=new T.Color('#182a48'),fogDay=new T.Color('#c9dde6'),fogNight=new T.Color('#283a51');
 const geo=new T.SphereGeometry(.6,8,6),mat=new T.MeshBasicMaterial({color:'#ffffff'}),lights=new T.InstancedMesh(geo,mat,18),o=new T.Object3D(),c=new T.Color();lights.frustumCulled=false;scene.add(lights);
 for(let i=0;i<18;i++)lights.setColorAt(i,c.set(i%3===0?'#f87070':i%3===1?'#91ffb9':'#f5f3bd'));
 return {update(seconds,pos,forceNight){const v=daylight(seconds,forceNight);if(nightEnvironment){if(scene.environment!==nightEnvironment.texture)dayEnvironment=scene.environment;scene.environment=v.night>.7?nightEnvironment.texture:dayEnvironment;scene.environmentIntensity=.18+.42*v.day;}stars.position.set(...pos);stars.visible=v.night>.05;starsMaterial.opacity=v.night*.8;background.copy(night).lerp(day,v.day);scene.background=background;scene.fog.color.copy(fogNight).lerp(fogDay,v.day);sun.intensity=v.sun;hemi.intensity=v.ambient;contactSun.intensity=.5;lights.visible=v.night>.1;
  // Five conventional night-wave flights and one friendly alien, parallel to the runways.
  for(let i=0;i<6;i++){const along=((seconds*(i===5?23:34)+i*110)%900)-450;for(let j=0;j<3;j++){o.position.set(pos[0]+along*.656+(j-1)*3,pos[1]+85+i*12+(i===5?Math.sin(seconds)*4:0),pos[2]-along*.755+i*20);o.updateMatrix();lights.setMatrixAt(i*3+j,o.matrix);}}lights.instanceMatrix.needsUpdate=true;},dispose(){lights.removeFromParent();geo.dispose();mat.dispose();stars.removeFromParent();starsGeometry.dispose();starsMaterial.dispose();nightEnvironment?.dispose();}};
}
