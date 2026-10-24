// Saucer Springs look + frame-time check: drive each track briefly, capture frames, report rAF timing.
// node tools/rc/look.cjs <outdir> [tracks...]  env: PLAYWRIGHT_MODULE, CHROMIUM_PATH. Headless, hardware GPU.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../../web/smoke/node_modules/playwright');const path=require('node:path');
(async()=>{const out=process.argv[2]||'.',tracks=process.argv.slice(3).length?process.argv.slice(3):['hub','housing','bx'];
require('node:fs').mkdirSync(out,{recursive:true});
const srv=await require('./serve-static.cjs')(path.resolve(__dirname,'../../web/wwwroot'),8897);let b;
try{b=await chromium.launch({headless:true,channel:'chromium',executablePath:process.env.CHROMIUM_PATH,args:['--mute-audio']});
for(const t of tracks){const p=await b.newPage({viewport:{width:1280,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://127.0.0.1:8897/rc/?track=${t}&audioQa=silent&telemetry=off`);await p.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:60000});
if(await p.locator('#start').isVisible())await p.locator('#start').click();
await p.waitForFunction(()=>!window.__gunsOnlyRC.snapshot().paused);
const gpu=await p.evaluate(()=>{const gl=document.querySelector('#view').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});if(/swiftshader|llvmpipe/i.test(gpu))throw Error('Visual acceptance requires hardware GPU: '+gpu);
await p.screenshot({path:`${out}/${t}-arrival.png`});await p.locator('#view').focus();await p.keyboard.down('KeyW');await p.waitForTimeout(2500);await p.keyboard.down('KeyD');await p.waitForTimeout(700);await p.screenshot({path:`${out}/${t}-turn.png`});await p.keyboard.up('KeyD');
const ft=await p.evaluate(()=>new Promise(r=>{const s=[];let last=performance.now();const f=now=>{s.push(now-last);last=now;if(s.length<300)requestAnimationFrame(f);else{s.sort((a,b)=>a-b);r({p50:s[150].toFixed(1),p95:s[285].toFixed(1),max:s[299].toFixed(1)});}};requestAnimationFrame(f);}));
await p.waitForTimeout(1500);await p.screenshot({path:`${out}/${t}-run.png`});await p.keyboard.up('KeyW');
console.log(t,JSON.stringify({gpu,frameMs:ft,errs,calls:await p.evaluate(()=>window.__gunsOnlyRC.renderer().calls)}));await p.close();if(errs.length)throw Error(errs.join('\n'));}
}finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
