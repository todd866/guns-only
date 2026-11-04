// Laser turret look: a real race, give the player the turret behind the pack, fire, capture frames.
const {chromium}=require('../../../web/smoke/node_modules/playwright');const path=require('node:path'),fs=require('node:fs');
(async()=>{const out=process.argv[2];fs.mkdirSync(out,{recursive:true});const srv=await require('../serve-static.cjs')(path.resolve(__dirname,'../../../web/wwwroot'),8896);let b;
try{b=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});const p=await b.newPage({viewport:{width:1280,height:720}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://127.0.0.1:8896/rc/?event=gate-guard&mode=race&audioQa=silent&telemetry=off');
 await p.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:90000});
 if(await p.locator('#start').isVisible())await p.locator('#start').click();
 await p.waitForTimeout(3300);await p.keyboard.down('KeyW');await p.waitForTimeout(600);
 await p.evaluate(()=>window.__gunsOnlyRC.give('laser'));await p.waitForTimeout(300);await p.screenshot({path:`${out}/0-held.png`});
 await p.keyboard.press('KeyF');
 for(const [k,ms] of [[1,120],[2,120],[3,120],[4,120],[5,120],[6,120],[7,400]]){await p.waitForTimeout(ms);await p.screenshot({path:`${out}/${k}-firing.png`});}
 await p.keyboard.up('KeyW');console.log(JSON.stringify({errs,snap:await p.evaluate(()=>{const s=window.__gunsOnlyRC.snapshot();return {place:s.place,item:s.item};})}));
}finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
