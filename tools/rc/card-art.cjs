// Capture the Saucer Springs AFB launcher poster from the playable game, without HUD.
// node tools/rc/card-art.cjs <out.png>. Headless hardware Chromium; silent audio.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../../web/smoke/node_modules/playwright');
const path=require('node:path');
(async()=>{let server,browser;
try{
 server=await require('./serve-static.cjs')(path.resolve(__dirname,'../../web/wwwroot'),8893);
 browser=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});
 const page=await browser.newPage({viewport:{width:900,height:1120}});
 await page.goto('http://127.0.0.1:8893/rc/?audioQa=silent&telemetry=off');
 await page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:90000});
 await page.waitForTimeout(3000);
 await page.addStyleTag({content:'body > :not(#view){visibility:hidden!important}'});
 await page.screenshot({path:process.argv[2]});
}finally{await browser?.close();await server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
