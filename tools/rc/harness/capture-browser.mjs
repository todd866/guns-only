// Run after slot clearance. Real browser inputs + video; no game-state teleportation.
import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.RC_CAPTURE_DIR||'/tmp/rc-browser-capture';fs.mkdirSync(out,{recursive:true});
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chromium',...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__rcFrameTimes=[];let previous;function sample(t){if(previous!==undefined)window.__rcFrameTimes.push(t-previous);previous=t;requestAnimationFrame(sample);}requestAnimationFrame(sample);});
 await page.goto(process.env.RC_URL||'http://127.0.0.1:8878/rc/?assets=blender');await page.locator('#start').click();
 const checkpoints=[];
 for(const phase of [{name:'acceleration',keys:['KeyW'],ms:1000},{name:'brake',keys:['KeyZ'],ms:1000},{name:'reverse',keys:['KeyS'],ms:1000}]){
  for(const key of phase.keys)await page.keyboard.down(key);await page.waitForTimeout(phase.ms);for(const key of phase.keys)await page.keyboard.up(key);
  checkpoints.push({phase:phase.name,state:await page.evaluate(()=>window.__gunsOnlyRC.snapshot())});
 }
 await page.keyboard.press('Escape');await page.screenshot({path:`${out}/gameplay.png`});
 const frames=await page.evaluate(()=>window.__rcFrameTimes);frames.sort((a,b)=>a-b);const p=q=>frames[Math.floor((frames.length-1)*q)];
 fs.writeFileSync(`${out}/capture.json`,JSON.stringify({errors,checkpoints,frameMs:{p50:p(.5),p95:p(.95),p99:p(.99),count:frames.length},notes:'Browser frame pacing, not fixed-step cadence. Reference measurement still pending.'},null,2));await context.close();
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();}
