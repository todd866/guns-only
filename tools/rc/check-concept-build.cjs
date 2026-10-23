const {chromium}=require('../../web/smoke/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{let browser;const out=path.resolve('evidence/rc-open-world/concept-build');fs.mkdirSync(out,{recursive:true});try{
 browser=await chromium.launch({headless:true,channel:'chromium'});const context=await browser.newContext({viewport:{width:1280,height:720}});const root=path.resolve('.rc-build-review');
 await context.route('http://rc.test/**',async r=>{const u=new URL(r.request().url()),p=path.resolve(root,'.'+(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));if(!p.startsWith(root+'/')||!fs.existsSync(p))return r.fulfill({status:404,body:''});await r.fulfill({contentType:({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[path.extname(p)]||'application/octet-stream',body:fs.readFileSync(p)});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const reports=[];for(const [id,q]of [['gate','event=gate-guard&mode=race'],['beach','event=splash-down&mode=race'],['ice','event=ice-patrol&mode=race'],['cold','event=cold-start&mode=race'],['portal','event=night-wave&mode=race']]){
 await page.goto('http://rc.test/rc/?audioQa=silent&telemetry=off&'+q);
 if(id==='portal'){await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('guns-only.rc.world.v1')||'{}');p.specimens=['gate','housing','bx','school','ramp','hangars','runway','wic','dirt','golf','zoo','rec','diamond','boneyard','waterpark'];p.discovered=['gate','lab'];localStorage.setItem('guns-only.rc.world.v1',JSON.stringify(p));});await page.reload();}
 await page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:90000});await page.locator('#start').click();await page.waitForTimeout(600);await page.screenshot({path:path.join(out,id+'-start.png')});await page.waitForTimeout(2700);await page.keyboard.down('KeyW');await page.waitForTimeout(2500);await page.keyboard.up('KeyW');await page.screenshot({path:path.join(out,id+'-drive.png')});reports.push({id,state:await page.evaluate(()=>window.__gunsOnlyRC.snapshot()),draw:await page.evaluate(()=>window.__gunsOnlyRC.renderer())});
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports,errors},null,2));console.log(JSON.stringify({reports:reports.map(r=>({id:r.id,x:r.state.x,y:r.state.y,z:r.state.z,draw:r.draw})),errors}));if(errors.length)process.exitCode=1;
 }finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
