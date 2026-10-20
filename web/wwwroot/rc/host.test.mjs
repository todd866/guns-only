import test from 'node:test';import assert from 'node:assert/strict';import {openRC} from './host.js';
test('RC entry owns only its pause, rejects foreign exits, restores focus and disposes frame',async()=>{const pauses=[],events=new Map();let frame=null,focused=0;
 globalThis.location={origin:'http://localhost'};globalThis.window={addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
 globalThis.document={activeElement:{focus:()=>focused++},getElementById:()=>frame,createElement:()=>({style:{},contentWindow:{focus(){}},addEventListener(){},remove(){frame=null;}}),body:{append:f=>frame=f}};
 openRC(v=>pauses.push(v));const child=frame.contentWindow;openRC(v=>pauses.push(v));assert.deepEqual(pauses,[true]);
 events.get('message')({origin:'https://foreign',source:child,data:{type:'guns-only-rc-exit'}});assert.ok(frame);
 events.get('message')({origin:location.origin,source:child,data:{type:'guns-only-rc-exit'}});assert.equal(frame,null);assert.deepEqual(pauses,[true,false]);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(focused,1);assert.equal(events.size,0);
 delete globalThis.document;delete globalThis.window;delete globalThis.location;
});
