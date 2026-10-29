// Halloween look: the spawn patch, a smash run through the slalom, and a porch street.
const {chromium}=require('../../../web/smoke/node_modules/playwright');const path=require('node:path'),fs=require('node:fs');
(async()=>{const out=process.argv[2];fs.mkdirSync(out,{recursive:true});const srv=await require('../serve-static.cjs')(path.resolve(__dirname,'../../../web/wwwroot'),8899);let b;
try{b=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});const p=await b.newPage({viewport:{width:1280,height:720}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 await p.goto('http://127.0.0.1:8899/rc/?track=hub&season=halloween&audioQa=silent&telemetry=off');
 await p.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:120000});
 if(await p.locator('#start').isVisible())await p.locator('#start').click();
 await p.waitForTimeout(4000);await p.screenshot({path:`${out}/0-spawn.png`});
 await p.evaluate(()=>window.__gunsOnlyRC.place([-3019.18,.3,-779.02],-.46584));await p.waitForTimeout(600);await p.keyboard.down('KeyW');for(const k of [1,2,3,4]){await p.waitForTimeout(450);await p.screenshot({path:`${out}/1-run-${k}.png`});}await p.keyboard.up('KeyW');
 const pumpkins=await p.evaluate(()=>window.__gunsOnlyRC.pumpkins());
 // Sit still and watch the sky for the first flyover.
 for(let k=0;k<16;k++){await p.waitForTimeout(1500);await p.screenshot({path:`${out}/sky-${String(k).padStart(2,'0')}.png`});}
 const banner=await p.evaluate(()=>document.getElementById('banner')?.textContent);
 const extra=JSON.parse(process.argv[3]||'[]');for(const [tag,pos,yaw] of extra){await p.evaluate(([q,y])=>window.__gunsOnlyRC.place(q,y),[pos,yaw]);await p.waitForTimeout(1500);await p.screenshot({path:`${out}/${tag}.png`});}
 console.log(JSON.stringify({errs,banner,pumpkins,frames:await p.evaluate(()=>window.__gunsOnlyRC.frames?.())}));
}finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
