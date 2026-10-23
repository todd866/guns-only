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
 await page.addInitScript(()=>localStorage.setItem('guns-only.telemetry-sharing.v1','enabled'));
 await page.goto('https://guns-only.com/rc/?track=housing&audioQa=silent&gfx=classic');
 await page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender'&&!document.querySelector('#start').disabled,null,{timeout:90000});
 await page.locator('#menu-race').click();
 await page.keyboard.press('Escape');
 await page.locator('#menu-furball').click();
 await page.keyboard.press('Escape');
 await page.locator('#start').click();
 // Force the lifecycle flush while keeping the document alive, then verify real IndexedDB.
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
 await page.waitForFunction(()=>indexedDB.databases().then(d=>d.some(x=>x.name==='guns-rc-telemetry-outbox')));
 await page.waitForTimeout(500);
 assert.ok(rows.some(r=>r.code==='first_input'&&r.source==='button'));
 assert.equal(rows.filter(r=>r.code==='race_start').length,2);
 assert.equal(rows.filter(r=>r.code==='race_quit').length,2);
 assert.ok(rows.some(r=>r.code==='session_end'));
 assert.equal(rows.filter(r=>r.code==='mute').length,0);
 assert.equal(errors.length,0,errors.join('\n'));
 const count=rows.length;
 await page.goto('https://guns-only.com/rc/?track=housing&audioQa=silent&gfx=classic&telemetry=off');
 await page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender'&&!document.querySelector('#start').disabled,null,{timeout:90000});
 await page.locator('#menu-race').click();
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
 await page.waitForTimeout(500);
 assert.equal(rows.length,count,'query opt out must send nothing');
 console.log(JSON.stringify({ok:true,events:count,renderer:'SwiftShader; functional check only',checks:['menu Race/Furball entry','replacement and free-drive quits','first input','real IndexedDB','session end best-effort hook','query opt out','no initial mute event']}));
}finally{await browser?.close();}
