import test from 'node:test';
import assert from 'node:assert/strict';
import {bindRCTouchControls,leverValue,stickValue} from './touch-controls.mjs';
const bounds={left:0,top:0,width:100,height:100};
test('stick clamps and both controls have forgiving neutral zones',()=>{
 assert.deepEqual(stickValue({clientX:52,clientY:49},bounds),{x:0,y:0});
 const corner=stickValue({clientX:1000,clientY:-1000},bounds);assert.ok(Math.abs(Math.hypot(corner.x,corner.y)-1)<1e-9);
 for(const y of [47,50,53])assert.equal(leverValue(y,bounds),0);
 assert.equal(leverValue(0,bounds),1);assert.equal(leverValue(100,bounds),-1);
});
class Element{
 constructor(){this.events=new Map();this.style={setProperty(){}};this.clientHeight=this.clientWidth=100;this.captured=new Set();this.classList={add(){},remove(){}};}
 addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
 removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
 dispatch(type,event={}){for(const fn of this.events.get(type)??[])fn({type,preventDefault(){},stopPropagation(){},currentTarget:this,target:this,...event});}
 getBoundingClientRect(){return bounds;}
 setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);}
 setAttribute(){}closest(){return this;}
}
function fixture(run){
 const originals={window:globalThis.window,document:globalThis.document},elements={};
 for(const id of ['stick','throttle-lever','stick-puck','throttle-puck','brake','fire'])elements[id]=new Element();
 const root=new Element();root.querySelector=s=>elements[s.replace('#touch-','')];
 globalThis.window=new Element();globalThis.document=new Element();let state,fire=0,grab=false,enabled=true;
 const controls=bindRCTouchControls({root,onChange:s=>state=s,onFire:()=>fire++,onGrab:value=>grab=value,enabled:()=>enabled});
 try{run({root,elements,controls,get state(){return state},get fire(){return fire},get grab(){return grab},disable(){enabled=false}});}
 finally{controls.destroy();for(const [key,value]of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
}
test('two thumbs steer and modulate spring-return power; brake and fire remain independent',()=>fixture(f=>{
 const e=f.elements;e.stick.dispatch('pointerdown',{pointerId:1,clientX:100,clientY:50});e['throttle-lever'].dispatch('pointerdown',{pointerId:2,clientY:0});
 assert.deepEqual(f.state,{steer:1,throttle:1,brake:false});
 e.stick.dispatch('pointerdown',{pointerId:3,clientX:0,clientY:50});assert.equal(f.state.steer,1,'second pointer cannot steal stick');
 e['throttle-lever'].dispatch('pointerup',{pointerId:2});e['throttle-lever'].dispatch('lostpointercapture',{pointerId:2});assert.equal(f.state.throttle,0,'normal lift releases power');
 e.brake.dispatch('pointerdown',{pointerId:2});assert.equal(f.state.brake,true);e.brake.dispatch('pointerup',{pointerId:2});assert.equal(f.state.brake,false);
 e.fire.dispatch('pointerdown',{pointerId:2});e.fire.dispatch('pointerup',{pointerId:2});assert.equal(f.fire,1);
 e.stick.dispatch('pointerup',{pointerId:1});assert.equal(f.state.steer,0);assert.equal(f.state.throttle,0);
}));
test('cancel and lost capture release power; menu reset releases captures and every input',()=>fixture(f=>{
 const e=f.elements;
 for(const reason of ['pointercancel','lostpointercapture']){e['throttle-lever'].dispatch('pointerdown',{pointerId:2,clientY:0});e['throttle-lever'].dispatch(reason,{pointerId:2});assert.equal(f.state.throttle,0);}
 e.stick.dispatch('pointerdown',{pointerId:1,clientX:100,clientY:50});e['throttle-lever'].dispatch('pointerdown',{pointerId:2,clientY:0});e.brake.dispatch('pointerdown',{pointerId:3});
 f.controls.reset();assert.deepEqual(f.state,{steer:0,throttle:0,brake:false});for(const el of Object.values(e))assert.equal(el.captured.size,0);
 e.stick.dispatch('pointermove',{pointerId:1,clientX:100,clientY:50});assert.equal(f.state.steer,0);
}));
test('backgrounding, disabled moves and destroy cannot leave a runaway car',()=>fixture(f=>{
 const e=f.elements,setPower=()=>e['throttle-lever'].dispatch('pointerdown',{pointerId:2,clientY:0});
 setPower();window.dispatch('blur');assert.equal(f.state.throttle,0);
 setPower();document.hidden=true;document.dispatch('visibilitychange');assert.equal(f.state.throttle,0);
 setPower();f.disable();e['throttle-lever'].dispatch('pointermove',{pointerId:2,clientY:0});assert.equal(f.state.throttle,0);
 f.controls.destroy();for(const el of [...Object.values(e),window,document])for(const callbacks of el.events.values())assert.equal(callbacks.size,0);
}));

test('horizontal steering ignores vertical drift; throttle modulates and reverses',()=>fixture(f=>{
 const e=f.elements;e.stick.dispatch('pointerdown',{pointerId:1,clientX:75,clientY:50});const steer=f.state.steer;
 e.stick.dispatch('pointermove',{pointerId:1,clientX:75,clientY:-1000});assert.equal(f.state.steer,steer);
 e['throttle-lever'].dispatch('pointerdown',{pointerId:2,clientY:25});assert.ok(f.state.throttle>0&&f.state.throttle<.5);
 e['throttle-lever'].dispatch('pointermove',{pointerId:2,clientY:75});assert.ok(f.state.throttle<0&&f.state.throttle>-.5);
 e['throttle-lever'].dispatch('pointermove',{pointerId:2,clientY:50});assert.equal(f.state.throttle,0);
 window.dispatch('resize');assert.deepEqual(f.state,{steer:0,throttle:0,brake:false});
 e['throttle-lever'].dispatch('pointerdown',{pointerId:2,clientY:0});window.dispatch('orientationchange');assert.equal(f.state.throttle,0);
}));

test('selection and context-menu prevention is scoped to the touch controls',()=>fixture(f=>{
 for(const type of ['touchstart','touchmove','selectstart','contextmenu','dragstart']){
  let prevented=false;f.root.dispatch(type,{target:f.elements.stick,preventDefault(){prevented=true;}});assert.equal(prevented,true,type);
  prevented=false;f.root.dispatch(type,{target:{closest:()=>null},preventDefault(){prevented=true;}});assert.equal(prevented,false,`${type} leaves normal text alone`);
 }
}));

test('holding Fire holds the skate grab, releases on cancellation and still fires only once',()=>fixture(f=>{
 for(const reason of ['pointerup','pointercancel','lostpointercapture']){
  const before=f.fire;f.elements.fire.dispatch('pointerdown',{pointerId:4});
  assert.equal(f.grab,true);f.elements.fire.dispatch('pointermove',{pointerId:4});assert.equal(f.fire,before+1);
  f.elements.fire.dispatch(reason,{pointerId:4});assert.equal(f.grab,false);
 }
 f.elements.fire.dispatch('pointerdown',{pointerId:4});f.controls.reset();assert.equal(f.grab,false);
 f.elements.fire.dispatch('pointerdown',{pointerId:4});window.dispatch('blur');assert.equal(f.grab,false);
}));
