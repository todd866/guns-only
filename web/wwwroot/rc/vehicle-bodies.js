import * as T from '../vendor/three.module.js';
export const VEHICLE_NAMES=Object.freeze({buggy:'Buggy',monster:'Monster',rally:'Rally',pickup:'Pickup',golf:'Golf cart'});
// Original toy shells around the shared wheel pivots; dimensions and styling are fiction.
export function makeVehicleBody(kind='buggy',color='#db6d2f'){
 if(!VEHICLE_NAMES[kind])throw new RangeError(`unknown vehicle body: ${kind}`);
 const g=new T.Group();g.name='VehicleBody';g.userData.kind=kind;
 const paint=new T.MeshStandardMaterial({color,roughness:.32,metalness:.12}),glass=new T.MeshStandardMaterial({color:'#233b4a',roughness:.18,metalness:.25}),rubber=new T.MeshStandardMaterial({color:'#253038',roughness:.8}),chrome=new T.MeshStandardMaterial({color:'#c0c8c8',roughness:.25,metalness:.6}),lamp=new T.MeshStandardMaterial({color:'#fff4c5',emissive:'#fff0a8',emissiveIntensity:.4});
 const add=(geo,m,x=0,y=0,z=0,name='')=>{const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.name=name;o.castShadow=o.receiveShadow=true;g.add(o);return o;};
 const box=(w,h,d,x,y,z,m=paint,name='')=>add(new T.BoxGeometry(w,h,d),m,x,y,z,name);
 const profile=(points,width,m,name)=>{const s=new T.Shape();points.forEach(([z,y],i)=>i?s.lineTo(-z,y):s.moveTo(-z,y));s.closePath();const geo=new T.ExtrudeGeometry(s,{depth:width-.02,steps:1,bevelEnabled:true,bevelSegments:2,bevelSize:.01,bevelThickness:.01});geo.rotateY(Math.PI/2);geo.translate(-width/2+.01,0,0);return add(geo,m,0,0,0,name);};
 const raised=kind==='monster'?.025:0,w=kind==='monster'?.49:.43;
 profile([[-.34,.11+raised],[-.31,.2+raised],[-.12,.23+raised],[.3,.2+raised],[.34,.11+raised]],w,paint,'sculpted-shell');
 if(kind==='golf'){
  box(.34,.045,.42,0,.2,.02,rubber,'floor');for(const x of [-.16,.16])for(const z of [-.16,.16])box(.018,.3,.018,x,.36,z,chrome,'roof-post');
  profile([[-.24,.5],[0,.53],[.24,.5],[.24,.48],[-.24,.48]],.48,paint,'canopy');
  for(const x of [-.085,.085]){box(.14,.055,.13,x,.27,.04,rubber,'seat');box(.14,.13,.035,x,.33,.11,rubber,'seat-back');}
 }else{
  const truck=kind==='monster'||kind==='pickup',back=truck?.06:kind==='rally'?.23:.12,top=kind==='buggy'?.32:.37+raised;
  profile([[-.22,.22+raised],[-.11,top],[back-.05,top],[back,.22+raised]],w*.82,glass,'windows');
  profile([[-.12,top-.005],[-.1,top+.02],[back-.04,top+.02],[back-.025,top-.005]],w*.86,paint,'roof');
  for(const x of [-w*.425,w*.425])box(.018,top-.22-raised,.025,x,(top+.22+raised)/2,back-.05,paint,'rear-pillar');
  if(truck){box(w*.8,.03,.22,0,.21+raised,.21,rubber,'bed');for(const x of [-w*.43,w*.43])box(.045,.09,.24,x,.25+raised,.21,paint,'bed-rail');box(w,.09,.035,0,.25+raised,.33,paint,'tailgate');}
  else{box(w+.08,.025,.085,0,.31,.3,rubber,'spoiler');for(const x of [-.14,.14])box(.02,.1,.02,x,.26,.3,chrome,'spoiler-post');}
 }
 for(const side of [-1,1]){box(.065,.045,.025,side*w*.32,.17+raised,-.333,lamp,'headlight');box(.05,.025,.025,side*w*.32,.17+raised,.335,rubber,'tail-light');}
 box(w*.45,.045,.025,0,.13+raised,-.34,rubber,'grille');
 if(kind==='monster')for(const x of [-.275,.275])for(const z of [-.25,.25]){const a=add(new T.TorusGeometry(.125,.015,6,18,Math.PI),paint,x,-.025,z,'wheel-arch');a.rotation.y=Math.PI/2;}
 return g;
}
