// Before/after captures for ground detail: same spots with ?detail=off and on. Headless, hardware GPU.
// node tools/rc/experiments/look-detail.cjs <outdir> [extra query]
const {chromium}=require('../../../web/smoke/node_modules/playwright');const path=require('node:path'),fs=require('node:fs');
(async()=>{const out=process.argv[2],extra=process.argv[3]||'';fs.mkdirSync(out,{recursive:true});
const srv=await require('../serve-static.cjs')(path.resolve(__dirname,'../../../web/wwwroot'),8899);let b;
try{b=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});
for(const at of (process.env.AT||'').split(',')){for(const detail of ['off','on']){const p=await b.newPage({viewport:{width:1280,height:720}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`http://127.0.0.1:8899/rc/?track=hub${at?'&at='+at:''}&audioQa=silent&telemetry=off&detail=${detail}${extra}`);
 await p.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:90000});
 if(await p.locator('#start').isVisible())await p.locator('#start').click();
 await p.waitForTimeout(4000);await p.screenshot({path:`${out}/${at||'start'}-${detail}-arrival.png`});if(at){const info=await p.evaluate(()=>({nd:window.__gunsOnlyRC.nearDetail(),frames:window.__gunsOnlyRC.frames()}));console.log(at,detail,JSON.stringify(info));await p.close();continue;}
 // Turn toward the lawn and drive a few seconds.
 await p.keyboard.down('KeyW');await p.keyboard.down('KeyA');await p.waitForTimeout(1300);await p.keyboard.up('KeyA');await p.waitForTimeout(2200);await p.keyboard.up('KeyW');await p.waitForTimeout(1800);
 await p.screenshot({path:`${out}/${detail}-drive.png`});
 const info=await p.evaluate(()=>({nd:window.__gunsOnlyRC.nearDetail(),calls:window.__gunsOnlyRC.renderer().calls,frames:window.__gunsOnlyRC.frames()}));
 console.log(detail,JSON.stringify(info),errs.length?'ERRORS '+errs.join(' | '):'');await p.close();}}
}finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
