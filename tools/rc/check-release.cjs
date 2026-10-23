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
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const ready=()=>page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender'&&!document.querySelector('#start').disabled,null,{timeout:90000});
  const visit=async query=>{await page.goto(`${base}/rc/?${query}&audioQa=silent&telemetry=off`);await ready();};
  await visit('');
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('#view').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(e?e.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});
  assert.ok(!/swiftshader|llvmpipe/i.test(gpu),'Hardware acceptance requires an actual GPU');
  const boot=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());
  assert.equal(boot.track,'hub');assert.equal(boot.world.ready,true);assert.equal(boot.audioSilent,true);
  results.push({name:'default-open-world',gpu,state:boot});await page.screenshot({path:path.join(out,'open-world.png')});
  await page.locator('#menu-map').click();assert.equal(await page.locator('#world-panel').isVisible(),true);await page.screenshot({path:path.join(out,'map.png')});
  await page.locator('#map-close').click();await page.locator('#start').click();await page.waitForTimeout(500);
  await page.screenshot({path:path.join(out,'open-world-drive.png')});
  for(const [name,query,guide]of [['bx-free','track=bx','course'],['bx-connected','track=hub&event=district-bx&mode=drive','bx']]){
   await visit(query);await page.locator('#start').click();
   await page.waitForFunction(expected=>window.__gunsOnlyRC.snapshot().guide===expected,guide);
   await page.keyboard.press('KeyB');await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>window.__gunsOnlyRC.snapshot().guide),guide,'Free Drive guidance survives difficulty toggle');
   await page.keyboard.down('KeyW');await page.waitForTimeout(1400);await page.keyboard.up('KeyW');
   const state=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());assert.ok(state.travel>1);assert.equal(state.guide,guide);
   results.push({name,state});await page.screenshot({path:path.join(out,`${name}.png`)});
  }
  await visit('track=bx&mode=race');await page.locator('#start').click();
  if(await page.evaluate(()=>window.__gunsOnlyRC.snapshot().mode==='bigKid'))await page.keyboard.press('KeyB');
  await page.waitForFunction(()=>window.__gunsOnlyRC.snapshot().guide==='course');
  await page.keyboard.press('KeyB');await page.waitForFunction(()=>window.__gunsOnlyRC.snapshot().guide===null);
  results.push({name:'race-assist-mode',passed:true});
  await visit('track=bx&mode=furball');await page.locator('#start').click();
  await page.waitForFunction(()=>window.__gunsOnlyRC.snapshot().guide===null);results.push({name:'furball',passed:true});
  await page.setViewportSize({width:390,height:844});await visit('');
  await page.screenshot({path:path.join(out,'phone-portrait.png')});
  await page.locator('#menu-map').click();await page.screenshot({path:path.join(out,'phone-portrait-map.png')});
  await page.setViewportSize({width:667,height:375});await visit('');
  const b=await page.locator('#start').boundingBox();assert.ok(b&&b.y>=0&&b.y+b.height<=375);
  await page.screenshot({path:path.join(out,'phone.png')});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({gpu,errors,checks:results.map(r=>r.name)},null,2));
 }finally{await browser?.close();fs.writeFileSync(path.join(out,'release.json'),JSON.stringify({base,errors,results},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
