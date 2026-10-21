// Area 51½ real-keyboard lap in headless Chromium (background, no visible window).
// node tools/rc/check-lap.cjs <outdir>   env: PLAYWRIGHT_MODULE, CHROMIUM_PATH, Q (query string). Run under heavy-slot.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');const fs=require('node:fs');
const path=require('node:path');const ROOT=path.resolve(__dirname,'../../web/wwwroot'),OUT=process.argv[2]||'.',PORT=Number(process.env.PORT||8891);
(async()=>{const srv=await require('./serve-static.cjs')(ROOT,PORT);let browser;
try{await new Promise(r=>setTimeout(r,800));browser=await chromium.launch({headless:true,channel:'chromium',executablePath:process.env.CHROMIUM_PATH});
const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto(`http://127.0.0.1:${PORT}/rc/${process.env.Q||''}`);await page.waitForFunction(()=>['blender','failed'].includes(window.__gunsOnlyRC?.snapshot().assets),null,{timeout:30000});
await page.locator('#start').click();const held=new Set();const pts=[[0,0],[0,-22],[0,-36],[22,-36],[38,-23],[38,-8],[38,22],[38,35],[12,35],[0,0]];
let st,shots=new Set(),t0=Date.now(),frames=[];
while(Date.now()-t0<90000){st=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());
 for(const g of [1,3,5,6,8])if(st.gate===g&&!shots.has(g)){shots.add(g);await page.screenshot({path:`${OUT}/gate${g}.png`});}
 if(st.finished)break;const p=pts[st.gate];const a=Math.atan2(p[0]-st.x,-(p[1]-st.z));const e=Math.atan2(Math.sin(a-st.yaw),Math.cos(a-st.yaw));
 const want=new Set();if(st.speed<(Math.abs(e)>.5?3:7))want.add('KeyW');if(e>.08)want.add('KeyD');if(e<-.08)want.add('KeyA');
 for(const k of held)if(!want.has(k)){await page.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}
 await page.waitForTimeout(60);}
for(const k of held)await page.keyboard.up(k);await page.screenshot({path:`${OUT}/end.png`});
const gpu=await page.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'?';});
const res={state:st,errors,gpu,wall:(Date.now()-t0)/1000};fs.writeFileSync(`${OUT}/lap.json`,JSON.stringify(res,null,1));console.log(JSON.stringify({finished:st.finished,gate:st.gate,time:st.time,hits:st.hits,rec:st.recoveries,assets:st.assets,errors,gpu,wall:res.wall}));
}finally{await browser?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
