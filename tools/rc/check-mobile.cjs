// Real touch gestures, not synthetic clicks: keeps the phone driving path covered.
const {chromium}=require('../../web/smoke/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]||root+'/evidence/rc-open-world/mobile');fs.mkdirSync(out,{recursive:true});
 let browser,server;const errors=[],report={viewports:[]};
 try{
  let base=process.argv[3];if(!base){server=await require('./serve-static.cjs')(path.resolve(process.env.RC_QA_ROOT||root+'/web/wwwroot'),19869);base='http://127.0.0.1:19869';}
  browser=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/rc/?audioQa=silent&telemetry=off');
  await page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender'&&!window.__gunsOnlyRC.snapshot().paused,null,{timeout:90000});
  const controls=['#touch-fire','#touch-brake','#touch-throttle-lever','#touch-stick'];
  const fit=async label=>{
   const geometry=await page.evaluate(selectors=>selectors.map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();return {selector,x:r.x,y:r.y,width:r.width,height:r.height,visible:getComputedStyle(el).display!=='none',scroll:el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1};}),controls);
   const {width,height}=page.viewportSize();for(const r of geometry){assert.ok(r.visible&&r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,`${label}: ${r.selector} fits viewport`);assert.ok(r.width>=44&&r.height>=44,`${label}: usable touch target`);assert.ok(!r.scroll,`${label}: labels fit`);}
   for(let i=0;i<geometry.length;i++)for(let j=i+1;j<geometry.length;j++){const a=geometry[i],b=geometry[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`${label}: controls do not overlap`);}
   if(process.env.RC_VIEWPORT_HELPER){const {assertViewport}=await import(process.env.RC_VIEWPORT_HELPER);await assertViewport(page,{primary:['#view'],controls:controls.map(selector=>({selector,minWidth:44,minHeight:44}))});}
   const steering=geometry.find(r=>r.selector==='#touch-stick'),throttle=geometry.find(r=>r.selector==='#touch-throttle-lever'),brake=geometry.find(r=>r.selector==='#touch-brake');assert.ok(steering.x+steering.width<throttle.x,'steering left, throttle right');assert.ok(brake.x>steering.x+steering.width,'brake on right');
   report.viewports.push({label,geometry});await page.screenshot({path:out+'/'+label+'.png'});
  };
  await fit('portrait');
  const cdp=await context.newCDPSession(page),points=new Map();
  const send=(type)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...points.values()]});
  const down=async(id,selector,fx=.5,fy=.5)=>{await page.locator(selector).waitFor({state:'visible'});const b=await page.locator(selector).boundingBox();points.set(id,{id,x:b.x+b.width*fx,y:b.y+b.height*fy});await send('touchStart');};
  const move=async(id,selector,fx,fy)=>{const b=await page.locator(selector).boundingBox();points.set(id,{id,x:b.x+b.width*fx,y:b.y+b.height*fy});await send('touchMove');};
  const up=async id=>{points.delete(id);await send('touchEnd');};
  const start=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());
  await down(1,'#touch-throttle-lever',.5,.08);await down(2,'#touch-stick',.9,.5);await page.waitForTimeout(650);
  const moving=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());assert.ok(moving.travel>start.travel+.15,'two-thumb input drives the car');assert.ok(Math.abs(moving.steer)>.2,'steering is analog while accelerating');
  await up(2);await up(1);
  assert.equal(await page.locator('#touch-stick').getAttribute('aria-valuenow'),'0');assert.equal(await page.locator('#touch-throttle-lever').getAttribute('aria-valuenow'),'0','lifting throttle springs to neutral');
  // Continuous modulation, neutral band and reverse, using browser touch input.
  await down(1,'#touch-throttle-lever',.5,.25);const partial=Number(await page.locator('#touch-throttle-lever').getAttribute('aria-valuenow'));assert.ok(partial>20&&partial<60);
  await move(1,'#touch-throttle-lever',.5,.5);assert.equal(await page.locator('#touch-throttle-lever').getAttribute('aria-valuenow'),'0');
  await move(1,'#touch-throttle-lever',.5,.92);assert.ok(Number(await page.locator('#touch-throttle-lever').getAttribute('aria-valuenow'))<-70);await page.waitForTimeout(500);await up(1);
  await down(2,'#touch-stick',.75,.5);const lateral=await page.locator('#touch-stick').getAttribute('aria-valuenow');await move(2,'#touch-stick',.75,-.7);assert.equal(await page.locator('#touch-stick').getAttribute('aria-valuenow'),lateral,'vertical drift preserves steering outside the pad');await up(2);assert.equal(await page.locator('#touch-stick').getAttribute('aria-valuenow'),'0');
  await down(1,'#touch-throttle-lever',.5,.05);await down(2,'#touch-brake');await page.waitForTimeout(800);await up(1);await up(2);
  await down(1,'#touch-brake');await page.waitForTimeout(800);await up(1);
  report.braking=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());assert.ok(report.braking.speed<1,'brake stops the car');
  // A supplied item isolates the fire control; pickup acquisition is covered by check-new-player.
  await page.evaluate(()=>window.__gunsOnlyRC.give('zoom'));await down(1,'#touch-fire');await page.waitForTimeout(850);await up(1);
  assert.equal(await page.evaluate(()=>window.__gunsOnlyRC.snapshot().item),null,'touch fire uses the held item');
  assert.equal(await page.evaluate(()=>getSelection().toString()),'','holding a control does not select text');
  const initialViewport=await page.evaluate(()=>({x:scrollX,y:scrollY,scale:visualViewport.scale}));
  await down(1,'#touch-throttle-lever',.5,.5);await page.waitForTimeout(1500);await move(1,'#touch-throttle-lever',.5,.1);await up(1);
  assert.equal(await page.evaluate(()=>getSelection().toString()),'','long press and drag do not select labels');assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY,scale:visualViewport.scale})),initialViewport,'controls do not scroll or zoom page');
  const protections=await page.evaluate(()=>{const control=document.querySelector('#touch-throttle-lever'),p=document.createElement('p');p.textContent='Selectable menu text';document.body.append(p);const result={};for(const type of ['selectstart','contextmenu','dragstart']){const a=new Event(type,{bubbles:true,cancelable:true}),b=new Event(type,{bubbles:true,cancelable:true});control.dispatchEvent(a);p.dispatchEvent(b);result[type]=a.defaultPrevented&&!b.defaultPrevented;}result.css=getComputedStyle(control).userSelect==='none'&&getComputedStyle(control).touchAction==='none';p.remove();return result;});assert.ok(Object.values(protections).every(Boolean),'selection/callout protections stay scoped to controls');report.protections=protections;
  await down(1,'#touch-throttle-lever',.5,.08);
  await page.locator('#atlas').tap();points.clear();await send('touchCancel');assert.equal(await page.locator('#touch-throttle-lever').getAttribute('aria-valuenow'),'0','map clears throttle');assert.ok(!await page.locator('#touch').isVisible(),'map hides driving controls');await page.screenshot({path:out+'/portrait-map.png'});await page.locator('#map-close').tap();
  await page.locator('#garage').tap();await page.screenshot({path:out+'/portrait-garage.png'});await page.locator('#garage-close').tap();
  // Cancellation, then a fresh gesture, must leave no stuck capture or power.
  await down(1,'#touch-throttle-lever',.5,.05);points.clear();await send('touchCancel');assert.equal(await page.locator('#touch-throttle-lever').getAttribute('aria-valuenow'),'0');
  await down(1,'#touch-throttle-lever',.5,.05);await down(2,'#touch-stick',.8,.5);await page.setViewportSize({width:844,height:390});await page.waitForTimeout(150);points.clear();await send('touchCancel');assert.equal(await page.locator('#touch-throttle-lever').getAttribute('aria-valuenow'),'0');assert.equal(await page.locator('#touch-stick').getAttribute('aria-valuenow'),'0','orientation change clears both thumbs');
  await down(1,'#touch-throttle-lever',.5,.08);await page.locator('#pause').tap();points.clear();await send('touchCancel');assert.ok(!await page.locator('#touch').isVisible());await page.locator('#resume').tap();assert.equal(await page.locator('#touch-throttle-lever').getAttribute('aria-valuenow'),'0','resume has no stale power');
  for(const [label,viewport]of [['small-phone',{width:360,height:640}],['landscape',{width:844,height:390}]]){await page.setViewportSize(viewport);await page.waitForTimeout(150);await fit(label);}
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{for(const el of document.querySelectorAll('button,select,label'))el.style.fontSize=parseFloat(getComputedStyle(el).fontSize)*2+'px';});await fit('portrait-double-text');
  await page.locator('#garage').tap();await page.screenshot({path:out+'/portrait-garage-double-text.png'});await page.locator('#garage-close').tap();
  const desktop=await browser.newPage({viewport:{width:1366,height:768}});desktop.on('pageerror',e=>errors.push(e.message));await desktop.goto(base+'/rc/?audioQa=silent&telemetry=off');await desktop.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender');assert.ok(!await desktop.locator('#touch').isVisible(),'desktop keeps keyboard/gamepad layout');await desktop.screenshot({path:out+'/laptop.png'});
  assert.deepEqual(errors,[]);report.errors=errors;fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('Mobile steering/throttle/brake/fire, cancellation, map/garage and viewport checks passed:',out);
 }finally{await browser?.close();server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
