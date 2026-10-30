// Chrome half of the app frame check: the same packaged game, window size and scripted drive in
// headless hardware Chromium, so the app is always judged against the browser in the same minute.
// Usage: node tools/rc/native/chrome-frames.cjs <web-dist> <WxH> <seconds>
const {chromium}=require('../../../web/smoke/node_modules/playwright');const path=require('node:path'),fs=require('node:fs');
(async()=>{const [root,size='1440x900',secs='15']=process.argv.slice(2),[w,h]=size.split('x').map(Number);
 const srv=await require('../serve-static.cjs')(path.resolve(root),8879);let b;
 try{b=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
  await p.goto('http://127.0.0.1:8879/rc/?audioQa=silent&telemetry=off');
  await p.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:180000});
  await p.locator('#start').click();await p.waitForTimeout(2000);
  await p.evaluate(fs.readFileSync(path.join(__dirname,'drive-script.js'),'utf8'));await p.waitForTimeout(Number(secs)*1000);
  console.log(await p.evaluate(()=>JSON.stringify({frames:window.__gunsOnlyRC.frames(),dpr:devicePixelRatio,css:[innerWidth,innerHeight],gpu:(()=>{const g=document.createElement('canvas').getContext('webgl2');const e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'?';})()})));
 }finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
