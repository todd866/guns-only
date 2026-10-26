// Two independent racing axes: steering left, throttle/brake/reverse right.
// Both spring to neutral on release; vertical thumb drift never weakens steering.
const clamp=(v,min=-1,max=1)=>Math.min(max,Math.max(min,Number.isFinite(v)?v:0));
export function stickValue(point,bounds,deadzone=.1){
 const x=clamp((point.clientX-bounds.left-bounds.width/2)/Math.max(1,bounds.width/2));
 return {x:Math.abs(x)<=deadzone?0:Math.sign(x)*(Math.abs(x)-deadzone)/(1-deadzone),y:0};
}
export function leverValue(clientY,bounds){
 const value=clamp(1-2*(clientY-bounds.top)/Math.max(1,bounds.height));
 return Math.abs(value)<.08?0:Math.sign(value)*(Math.abs(value)-.08)/.92;
}
export function bindRCTouchControls({root=document,onChange=()=>{},onFire=()=>{},enabled=()=>true}={}){
 const find=id=>root.querySelector(`#touch-${id}`),elements={stick:find('stick'),lever:find('throttle-lever'),brake:find('brake'),fire:find('fire')};
 const puck=find('stick-puck'),knob=find('throttle-puck'),listeners=[],owners=new Map();
 if(Object.values(elements).some(e=>!e)||!puck||!knob)return {reset(){},destroy(){}};
 let state={steer:0,throttle:0,brake:false};
 const listen=(el,type,fn,options)=>{el.addEventListener(type,fn,options);listeners.push([el,type,fn]);};
 function paintLever(){
  const offset=-state.throttle*(elements.lever.clientHeight-34)/2;
  knob.style.transform=`translate3d(0,${offset}px,0)`;
  elements.lever.style.setProperty('--lever-power',`${Math.abs(offset)}px`);
  elements.lever.style.setProperty('--lever-fill-top',state.throttle>=0?`calc(50% - ${Math.abs(offset)}px)`:'50%');
  elements.lever.setAttribute('aria-valuenow',Math.round(state.throttle*100));
 }
 const emit=()=>onChange({...state});
 function reset(){
  const held=[...owners];owners.clear();
  for(const [id,kind]of held){const el=elements[kind];try{if(el.hasPointerCapture(id))el.releasePointerCapture(id);}catch{}}
  state={steer:0,throttle:0,brake:false};puck.style.transform='translate3d(0,0,0)';elements.stick.setAttribute('aria-valuenow',0);
  elements.brake.classList.remove('active');elements.fire.classList.remove('active');paintLever();emit();
 }
 function move(kind,event){
  if(!enabled()){reset();return;}if(owners.get(event.pointerId)!==kind)return;event.preventDefault();
  if(kind==='stick'){
   const v=stickValue(event,elements.stick.getBoundingClientRect());state.steer=v.x;
   puck.style.transform=`translate3d(${v.x*(elements.stick.clientWidth/2-25)}px,${v.y*(elements.stick.clientHeight/2-25)}px,0)`;
   elements.stick.setAttribute('aria-valuenow',Math.round(v.x*100));emit();
  }else if(kind==='lever'){state.throttle=leverValue(event.clientY,elements.lever.getBoundingClientRect());paintLever();emit();}
 }
 function begin(kind,event){
  if(!enabled()||event.button>0||[...owners.values()].includes(kind))return;event.preventDefault();event.stopPropagation();owners.set(event.pointerId,kind);
  try{elements[kind].setPointerCapture(event.pointerId);}catch{}
  if(kind==='fire'){elements.fire.classList.add('active');onFire();}
  else if(kind==='brake'){state.brake=true;elements.brake.classList.add('active');emit();}
  else move(kind,event);
 }
 function release(event){
  const kind=owners.get(event.pointerId);if(!kind)return;owners.delete(event.pointerId);
  if(kind==='stick'){state.steer=0;puck.style.transform='translate3d(0,0,0)';elements.stick.setAttribute('aria-valuenow',0);}
  // Lift, cancellation and lost capture all spring back to neutral.
  try{if(elements[kind].hasPointerCapture(event.pointerId))elements[kind].releasePointerCapture(event.pointerId);}catch{}
  if(kind==='lever'){state.throttle=0;paintLever();}
  if(kind==='brake')state.brake=false;elements[kind].classList.remove('active');emit();
 }
 for(const [kind,el]of Object.entries(elements)){
  listen(el,'pointerdown',e=>begin(kind,e),{passive:false});listen(el,'pointermove',e=>move(kind,e),{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(el,type,release);
 }
 for(const kind of ['stick','lever'])listen(elements[kind],'keydown',event=>{
  if(!enabled()||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();const prop=kind==='stick'?'steer':'throttle';
  state[prop]=event.key==='Home'?0:event.key==='End'?1:clamp(state[prop]+(['ArrowUp','ArrowRight'].includes(event.key)?.1:-.1));
  if(kind==='lever')paintLever();else{puck.style.transform=`translate3d(${state.steer*(elements.stick.clientWidth/2-25)}px,0,0)`;elements.stick.setAttribute('aria-valuenow',Math.round(state.steer*100));}emit();
 });
 listen(elements.fire,'click',event=>{if(event.detail===0&&enabled())onFire();});
 listen(elements.brake,'keydown',event=>{if(enabled()&&[' ','Enter'].includes(event.key)){event.preventDefault();state.brake=true;elements.brake.classList.add('active');emit();}});
 listen(elements.brake,'keyup',event=>{if([' ','Enter'].includes(event.key)){state.brake=false;elements.brake.classList.remove('active');emit();}});
 for(const kind of ['stick','lever']){listen(elements[kind],'keyup',event=>{if(event.key.startsWith('Arrow')||event.key==='End'){if(kind==='lever'){state.throttle=0;paintLever();}else{state.steer=0;puck.style.transform='translate3d(0,0,0)';elements.stick.setAttribute('aria-valuenow',0);}emit();}});listen(elements[kind],'blur',reset);}
 const suppress=event=>{if(event.target.closest?.('#touch'))event.preventDefault();};
 for(const type of ['touchstart','touchmove','selectstart','contextmenu','dragstart'])listen(root,type,suppress,{passive:false});
 listen(window,'blur',reset);listen(window,'resize',reset);listen(window,'orientationchange',reset);listen(document,'visibilitychange',()=>{if(document.hidden)reset();});
 paintLever();emit();return {reset,destroy(){reset();for(const [el,type,fn]of listeners)el.removeEventListener(type,fn);}};
}
