// Drift look: a real race, hold Shift through a turn, capture the spark tiers and the turbo exit.
const {chromium}=require('../../../web/smoke/node_modules/playwright');const path=require('node:path'),fs=require('node:fs');
(async()=>{const out=process.argv[2];fs.mkdirSync(out,{recursive:true});const srv=await require('../serve-static.cjs')(path.resolve(__dirname,'../../../web/wwwroot'),8897);let b;
try{b=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});const p=await b.newPage({viewport:{width:1280,height:720}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`http://127.0.0.1:8897/rc/?event=${process.env.EVENT||'gate-guard'}&mode=race&audioQa=silent&telemetry=off`);
 await p.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:90000});
 if(await p.locator('#start').isVisible())await p.locator('#start').click();
 await p.waitForTimeout(3300);await p.keyboard.down('KeyW');await p.waitForTimeout(2200);
 const log=[];const snap=async tag=>{const s=await p.evaluate(()=>{const s=window.__gunsOnlyRC.snapshot();return {drifting:s.drifting,speed:+s.speed?.toFixed?.(1)||s.speed};});log.push({tag,...s});await p.screenshot({path:`${out}/${tag}.png`});};
 await p.keyboard.down('ShiftLeft');await p.keyboard.down('KeyA');
 for(const [tag,ms] of [['1-hop',150],['2-blue',650],['3-orange',600],['4-purple',800]]){await p.waitForTimeout(ms);await snap(tag);}
 await p.keyboard.up('ShiftLeft');await p.keyboard.up('KeyA');await p.waitForTimeout(150);await snap('5-turbo');
 await p.keyboard.up('KeyW');console.log(JSON.stringify({errs,log}));
}finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
