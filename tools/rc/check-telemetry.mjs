// Packaged RC browser integration, all HTTP fulfilled locally (no production writes).
import fs from 'node:fs/promises'; import path from 'node:path'; import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('../../web/smoke/node_modules/playwright');
const root=path.resolve(process.argv[2]??'.rc-dist');
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json','.glb':'model/gltf-binary','.wav':'audio/wav','.mp3':'audio/mpeg'};
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),rows=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!=='https://guns-only.com')return route.abort();
   if(u.pathname==='/telemetry') { rows.push(...route.request().postDataJSON().rows); return route.fulfill({status:200,body:'{}',contentType:'application/json'}); }
   const file=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));
   if(!file.startsWith(root+path.sep))return route.abort();
   try{return route.fulfill({body:await fs.readFile(file),contentType:mime[path.extname(file)]??'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
 });
 // No consent preset: a never-asked player must record by default.
 const ready=()=>page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender'&&!document.querySelector('#start').disabled,null,{timeout:90000});
 await page.goto('https://guns-only.com/rc/?audioQa=silent&gfx=classic');
 await ready();
 if(await page.locator('#start').isVisible())await page.locator('#start').click(); else await page.keyboard.press('KeyW');
 // The hub starts in the plaza skate park: E opens its goal card, then run out the clock.
 await page.waitForTimeout(1500);
 await page.keyboard.press('KeyE');
 await page.locator('#skate-go').click({timeout:15000});
 await page.waitForFunction(()=>window.__gunsOnlyRC.skate()?.left>0);
 await page.evaluate(()=>window.__gunsOnlyRC.skate(0));
 await page.waitForFunction(()=>!window.__gunsOnlyRC.skate()&&document.querySelector('#skate-go')?.textContent.includes('Run again'),null,{timeout:15000});
 await page.evaluate(()=>document.querySelector('#skate-free').click());
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
 await page.waitForFunction(()=>indexedDB.databases().then(d=>d.some(x=>x.name==='guns-rc-telemetry-outbox')));
 await page.waitForTimeout(500);
 const codes=rows.map(r=>r.code);
 for(const code of ['session_start','first_input','skate_start','skate_end','choice','session_end'])assert.ok(codes.includes(code),`missing ${code}: ${codes.join(',')}`);
 assert.equal(rows.find(r=>r.code==='boot')?.assets,'blender','boot records loaded assets');
 assert.ok(rows.some(r=>r.code==='visit'),'hub visit recorded');
 assert.equal(rows.filter(r=>r.code==='error').length,0,'no script errors reported');
 const end=rows.find(r=>r.code==='skate_end');
 assert.equal(end.park,'intro'); assert.equal(end.reason,'time');
 assert.equal(rows.find(r=>r.code==='choice').choice,'skate_free');
 assert.equal(rows.filter(r=>r.code==='mute').length,0);
 assert.ok(rows.every(r=>!('ua' in r)&&!('ip' in r)&&!('user' in r)),'rows stay anonymous');
 assert.equal(errors.length,0,errors.join('\n'));
 const count=rows.length;
 await page.goto('https://guns-only.com/rc/?audioQa=silent&gfx=classic&telemetry=off');
 await ready();
 if(await page.locator('#start').isVisible())await page.locator('#start').click(); else await page.keyboard.press('KeyW');
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
 await page.waitForTimeout(500);
 assert.equal(rows.length,count,'query opt out must send nothing');
 await page.evaluate(()=>localStorage.setItem('guns-only.telemetry-sharing.v1','disabled'));
 await page.goto('https://guns-only.com/rc/?audioQa=silent&gfx=classic');
 await ready();
 if(await page.locator('#start').isVisible())await page.locator('#start').click(); else await page.keyboard.press('KeyW');
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
 await page.waitForTimeout(500);
 assert.equal(rows.length,count,'Settings opt out must send nothing');
 console.log(JSON.stringify({ok:true,events:count,renderer:'SwiftShader; functional check only',checks:['default on with no stored setting','boot + first visit','plaza skate run start/end + choice','first input','real IndexedDB','session end best-effort hook','query opt out','Settings opt out','no initial mute event']}));
}finally{await browser?.close();}
