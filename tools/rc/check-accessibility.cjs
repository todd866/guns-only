// Silent, background acceptance of the connected base and retained district modes.
const {chromium}=require('../../web/smoke/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
(async()=>{const out=path.resolve(process.argv[2]||'evidence/rc-open-world');fs.mkdirSync(out,{recursive:true});const root=path.resolve(process.env.RC_QA_ROOT||path.join(__dirname,'../../web/wwwroot'));let browser;const errors=[],results=[];
try{browser=await chromium.launch({headless:true,channel:'chromium'});const context=await browser.newContext();await context.route('http://rc.test/**',async route=>{const u=new URL(route.request().url()),name=decodeURIComponent(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname),file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:''});return;}const type={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream';await route.fulfill({status:200,contentType:type,body:fs.readFileSync(file)});});const page=await context.newPage();await page.setViewportSize({width:1440,height:900});page.on('pageerror',e=>errors.push(e.stack??e.message));page.on('console',m=>{if(process.env.RC_QA_TRACE)console.log(m.text());if(m.type()==='error')errors.push(m.text());});
const ready=()=>page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender'&&!document.querySelector('#start').disabled,null,{timeout:60000});
await page.goto('http://rc.test/rc/?audioQa=silent&telemetry=off');await ready();await page.screenshot({path:path.join(out,'01-world-menu.png')});
const gpu=await page.evaluate(()=>{const gl=document.querySelector('#view').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});

await page.locator('#menu-map').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#world-panel').isVisible(),false,'Menu Tab must navigate, not open map');assert.equal(await page.evaluate(()=>document.activeElement.id),'menu-garage');
for(const [opener,panel,close] of [['menu-map','world-panel','map-close'],['menu-garage','garage-panel','garage-close'],['keys','keys-panel','keys-close']]){
 await page.locator('#'+opener).focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),close);
 assert.equal(await page.locator('header').evaluate(e=>e.inert),true);
 if(panel==='garage-panel')await page.locator('#body').selectOption('monster');
 const items=await page.locator('#'+panel).locator('button:enabled,select:enabled,a[href]').count();
 for(let i=0;i<items+2;i++){const previous=await page.evaluate(()=>document.activeElement.outerHTML);await page.keyboard.press('Tab');if(items>1)assert.notEqual(await page.evaluate(()=>document.activeElement.outerHTML),previous,'Tab advances past disabled selects');assert.equal(await page.evaluate(id=>document.activeElement.closest('#'+id)!=null,panel),true);}
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),opener);assert.equal(await page.locator('header').evaluate(e=>e.inert),false);
 results.push({modal:panel,focusTrap:true,focusReturn:true,backgroundInert:true});
}
await page.locator('#start').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#brief').isVisible(),false);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'resume');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'view');
for(const size of [{width:1280,height:720},{width:390,height:844},{width:667,height:375}]){
 await page.setViewportSize(size);await page.keyboard.press('Escape');
 for(const [id,opener]of [['brief',null],['world-panel','menu-map'],['garage-panel','menu-garage'],['keys-panel','keys']]){
  if(opener)await page.locator('#'+opener).click();
  const bounds=await page.locator('#'+id).boundingBox();assert.ok(bounds.x>=-1&&bounds.y>=-1&&bounds.x+bounds.width<=size.width+1&&bounds.y+bounds.height<=size.height+1,JSON.stringify({id,size,bounds}));
  await page.screenshot({path:path.join(out,`${size.width}-${id}.png`)});
  if(opener)await page.keyboard.press('Escape');
 }
 await page.locator('#resume').click();
}
await page.setViewportSize({width:640,height:360});await page.keyboard.press('Escape');await page.locator('#menu-map').click();const zoomBounds=await page.locator('#world-panel').boundingBox();assert.ok(zoomBounds.y>=0&&zoomBounds.y+zoomBounds.height<=360,'200% equivalent CSS viewport reflow');await page.locator('#world-event').focus();await page.locator('#world-race').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'zoom-equivalent-200-map.png')});await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:720});
await page.goto('http://rc.test/rc/?event=gate-guard&mode=race&audioQa=silent&telemetry=off');await ready();await page.locator('#menu-garage').click();assert.equal(await page.locator('#body').isDisabled(),true);await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement.id),'garage-close','Race garage skips disabled Vehicle');await page.keyboard.press('Escape');
const names=await page.locator('button').evaluateAll(nodes=>nodes.filter(n=>!n.hidden&&!n.closest('[hidden]')).map(n=>({id:n.id,name:n.getAttribute('aria-label')||n.textContent.trim()||n.title})));assert.ok(names.every(n=>n.name),'Visible buttons have accessible names');
fs.writeFileSync(path.join(out,'accessibility.json'),JSON.stringify({gpu,errors,results,names,limits:'DOM and keyboard checks; no screen reader user session or nonvisual driving claim'},null,2));assert.deepEqual(errors,[]);
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
