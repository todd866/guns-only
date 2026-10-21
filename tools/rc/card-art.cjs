// Renders the Area 51½ picker card art (900×1600 portrait) from the real game, HUD hidden.
// node tools/rc/card-art.cjs <out.png>   env: PLAYWRIGHT_MODULE, CHROMIUM_PATH. Headless.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const path=require('node:path');
(async()=>{const srv=await require('./serve-static.cjs')(path.resolve(__dirname,'../../web/wwwroot'),8893);let browser;
try{browser=await chromium.launch({headless:true,channel:'chromium',executablePath:process.env.CHROMIUM_PATH});
const page=await browser.newPage({viewport:{width:900,height:1600}});
await page.goto('http://127.0.0.1:8893/rc/?track=housing');await page.waitForFunction(()=>['blender','failed'].includes(window.__gunsOnlyRC?.snapshot().assets),null,{timeout:30000});
await page.locator('#start').click();await page.keyboard.down('KeyW');await page.waitForTimeout(Number(process.env.DRIVE_MS||1600));
await page.addStyleTag({content:'header,#instruments,#map,#banner,#touch,#result{display:none!important}'});
await page.keyboard.press('Escape');await page.waitForTimeout(300);await page.screenshot({path:process.argv[2]});
}finally{await browser?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
