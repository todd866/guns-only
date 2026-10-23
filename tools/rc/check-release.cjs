// Silent release smoke. Uses packaged files without a server, or a supplied HTTPS deployment.
// RC_QA_ROOT=.rc-release-dist node tools/rc/check-release.cjs [evidence-dir] [https://deployment]
const {chromium}=require('../../web/smoke/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(process.env.RC_QA_ROOT||'.rc-release-dist');
 const out=path.resolve(process.argv[2]||'evidence/rc-open-world/release');
 const base=process.argv[3]||'http://rc.test';
 if(process.argv[3])assert.equal(new URL(base).protocol,'https:');
 fs.mkdirSync(out,{recursive:true});let browser;const errors=[],results=[];
 try{
  browser=await chromium.launch({headless:true,channel:'chromium'});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  if(!process.argv[3])await context.route('http://rc.test/**',async route=>{
   const u=new URL(route.request().url()),file=path.resolve(root,'.'+decodeURIComponent(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const type={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream';
   await route.fulfill({status:200,contentType:type,body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(`${m.text()} (${m.location().url})`);});
  const ready=()=>page.waitForFunction(()=>{const s=window.__gunsOnlyRC?.snapshot();return s?.assets==='blender'&&!s.paused&&document.querySelector('#brief')?.hidden},null,{timeout:90000});
  const visit=async query=>{await page.goto(`${base}/rc/?${query}&audioQa=silent&telemetry=off`);await ready();};
  await visit('');
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('#view').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(e?e.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});
  assert.ok(!/swiftshader|llvmpipe/i.test(gpu),'Hardware acceptance requires an actual GPU');
  const boot=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());
  assert.equal(boot.track,'hub');assert.equal(boot.world.ready,true);assert.equal(boot.audioSilent,true);
  results.push({name:'default-open-world',gpu,state:boot});await page.screenshot({path:path.join(out,'open-world.png')});
  assert.equal(boot.paused,false);assert.equal(await page.locator('#brief').isVisible(),false);
  await page.locator('#pause').click();await page.locator('#options summary').click();await page.locator('#menu-map').click();assert.equal(await page.locator('#world-panel').isVisible(),true);await page.screenshot({path:path.join(out,'map.png')});
  await page.locator('#map-close').click();await page.locator('#resume').click();await page.waitForTimeout(500);
  await page.screenshot({path:path.join(out,'open-world-drive.png')});
  await visit('');await page.locator('#pause').click();await page.locator('#choose-course').click();
  assert.equal(await page.locator('.rc-race-menu [data-event="district-housing"]').isDisabled(),true,'Fresh housing card is locked');
  await page.locator('.rc-race-menu [data-close]').click();
  await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('guns-only.rc.world.v1')||'{}');p.discovered=[...new Set(['gate','housing','bx','school',...(p.discovered||[])])];localStorage.setItem('guns-only.rc.world.v1',JSON.stringify(p));});
  await visit('');
  for(const id of ['housing','bx','school']){
   await page.locator('#pause').click();await page.locator('#choose-course').click();await page.locator(`.rc-race-menu [data-event="district-${id}"]`).click();await ready();
   const state=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());
   assert.equal(state.track,'hub');assert.equal(state.world.event,`district-${id}`);assert.equal(state.audioSilent,true);
  }
  results.push({name:'connected-district-menu',passed:true});
  for(const [name,query,guide]of [['bx-free','track=bx','bx'],['bx-connected','track=hub&event=district-bx&mode=drive','bx']]){
   await visit(query);
   await page.waitForFunction(expected=>window.__gunsOnlyRC.snapshot().guide===expected,guide);
   await page.keyboard.press('KeyB');await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>window.__gunsOnlyRC.snapshot().guide),guide,'Free Drive guidance survives difficulty toggle');
   await page.keyboard.down('KeyW');await page.waitForTimeout(1400);await page.keyboard.up('KeyW');
   const state=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());assert.ok(state.travel>1);assert.equal(state.guide,guide);
   results.push({name,state});await page.screenshot({path:path.join(out,`${name}.png`)});
  }
  await visit('track=hub&event=district-bx&mode=race');
  if(await page.evaluate(()=>window.__gunsOnlyRC.snapshot().mode==='bigKid'))await page.keyboard.press('KeyB');
  await page.waitForFunction(()=>window.__gunsOnlyRC.snapshot().guide==='course');
  await page.keyboard.press('KeyB');await page.waitForFunction(()=>window.__gunsOnlyRC.snapshot().guide===null);
  results.push({name:'race-assist-mode',passed:true});
  await visit('track=hub&event=district-bx&mode=furball');
  await page.waitForFunction(()=>window.__gunsOnlyRC.snapshot().guide===null);results.push({name:'furball',passed:true});
  for(const legacy of ['base','housing','bx','school']){await visit(`track=${legacy}`);const state=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());assert.ok(state.world,'Legacy entry retains connected world');results.push({name:`legacy-${legacy}`,world:true});}
  const failedWorld=await context.newPage();
  await failedWorld.route('**/assets/world/manifest.json',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await failedWorld.goto(`${base}/rc/?audioQa=silent&telemetry=off`);
  await failedWorld.waitForSelector('button:text("Retry")',{timeout:90000});
  assert.equal(await failedWorld.evaluate(()=>Boolean(window.__gunsOnlyRC)) ,false,'Failed world load must not expose a tiny fallback game');
  results.push({name:'failed-world-download',retry:true});await failedWorld.close();
  await page.setViewportSize({width:390,height:844});await visit('');
  await page.screenshot({path:path.join(out,'phone-portrait.png')});
  await page.locator('#pause').click();await page.locator('#options summary').click();await page.locator('#menu-map').click();await page.screenshot({path:path.join(out,'phone-portrait-map.png')});
  await page.setViewportSize({width:667,height:375});await visit('');
  const b=await page.locator('#pause').boundingBox();assert.ok(b&&b.y>=0&&b.y+b.height<=375);
  await page.screenshot({path:path.join(out,'phone.png')});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({gpu,errors,checks:results.map(r=>r.name)},null,2));
 }finally{await browser?.close();fs.writeFileSync(path.join(out,'release.json'),JSON.stringify({base,errors,results},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
