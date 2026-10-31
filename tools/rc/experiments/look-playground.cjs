// Adventure playground look: arrive at the gate, then chase-cam frames from each element, plus a run down the wave slide.
const {chromium}=require('../../../web/smoke/node_modules/playwright');const path=require('node:path'),fs=require('node:fs');
(async()=>{const out=process.argv[2];fs.mkdirSync(out,{recursive:true});const srv=await require('../serve-static.cjs')(path.resolve(__dirname,'../../../web/wwwroot'),8898);let b;
const C=[-1450,0,2000],W=([x,y,z])=>[C[0]+x,C[1]+y,C[2]+z];
try{b=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});const p=await b.newPage({viewport:{width:1280,height:720}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 await p.goto('http://127.0.0.1:8898/rc/?track=hub&at=playground&audioQa=silent&telemetry=off');
 await p.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:90000});
 if(await p.locator('#start').isVisible())await p.locator('#start').click();
 await p.waitForTimeout(4500);await p.screenshot({path:`${out}/0-gate.png`});
 const shots=[['1-ramp',[0,.2,22],0],['2-deck-wave',[-4.2,2.15,-3],0],['3-spiral-top',[7,2.15,-2],Math.PI/2],['4-bridge',[-5,2.15,-2],-Math.PI/2],['5-lookout-drop',[-16,2.15,-2],-Math.PI/2],['6-seesaw',[6,.2,12],Math.PI/2],['7-merry-swings',[22,.2,-2],0],['8-overview',[30,.2,28],-Math.PI*.25]];
 for(const [tag,pos,yaw] of shots){await p.evaluate(([q,y])=>window.__gunsOnlyRC.place(q,y),[W(pos),yaw]);await p.waitForTimeout(1300);await p.screenshot({path:`${out}/${tag}.png`});}
 await p.evaluate(([q,y])=>window.__gunsOnlyRC.place(q,y),[W([-4.2,2.15,-4]),0]);await p.waitForTimeout(800);await p.keyboard.down('KeyW');
 for(const k of [1,2,3]){await p.waitForTimeout(550);await p.screenshot({path:`${out}/9-wave-run-${k}.png`});}
 await p.keyboard.up('KeyW');
 console.log(JSON.stringify({errs,snap:await p.evaluate(()=>{const s=window.__gunsOnlyRC.snapshot();return {x:s.world?.event,frames:window.__gunsOnlyRC.frames(),calls:window.__gunsOnlyRC.renderer().calls};})}));
}finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
