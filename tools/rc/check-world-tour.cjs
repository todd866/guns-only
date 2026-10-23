// One uninterrupted base journey: ordinary controller input, no state writes,
// recovery, fast travel or page reloads. Run against a package or a live URL.
const {chromium}=require('../../web/smoke/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.RC_QA_ROOT||'.rc-dist');
const out=path.resolve(process.argv[2]||'evidence/rc-open-world/world-tour');
const base=process.argv[3]||'http://rc.test';
const report={base,errors:[],legs:[],documents:0};
const save=()=>fs.writeFileSync(path.join(out,'tour.json'),JSON.stringify(report,null,2));
(async()=>{
 fs.mkdirSync(out,{recursive:true});let browser,page;
 try{
  const {buildRoadGraph,roadRoute,WORLD_LINKS}=await import('../../web/wwwroot/rc/open-world/navigation.mjs');
  const overview=JSON.parse(fs.readFileSync(path.join(root,'rc/assets/world/overview.json')));
  const graph=buildRoadGraph([...overview.roads,...WORLD_LINKS]);
  browser=await chromium.launch({headless:true,channel:'chromium'});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.addInitScript(()=>{
   window.__tourPad={connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:10},()=>({value:0,pressed:false}))};
   Object.defineProperty(navigator,'getGamepads',{value:()=>[window.__tourPad]});
  });
  if(!process.argv[3])await context.route('http://rc.test/**',async route=>{
   const u=new URL(route.request().url()),file=path.resolve(root,'.'+decodeURIComponent(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const type={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream';
   await route.fulfill({status:200,contentType:type,body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(`${m.text()} (${m.location().url})`);});
  page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())report.documents++;});
  await page.goto(`${base}/rc/?audioQa=silent&telemetry=off&rivals=0`);
  await page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender'&&!document.querySelector('#start').disabled,null,{timeout:90000});
  report.gpu=await page.evaluate(()=>{const gl=document.querySelector('#view').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(e?e.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});
  assert.ok(!/swiftshader|llvmpipe/i.test(report.gpu),'Hardware renderer required');
  await page.locator('#start').click();
  if(await page.evaluate(()=>window.__gunsOnlyRC.snapshot().mode==='kid'))await page.keyboard.press('KeyB');
  report.start=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());
  assert.equal(report.start.track,'hub');assert.equal(report.start.audioSilent,true);
  await page.screenshot({path:path.join(out,'main-gate.png')});
  // Keep ordinary input and measurements in the page so host polling does not
  // affect the frame cadence. Only the synthetic controller is writable.
  await page.evaluate(()=>{
   const state=window.__tour={samples:[],frames:[],cells:new Set(),distance:0,maxStep:0,last:null,leg:null};
   let lastTime=performance.now(),sampleAt=0;
   const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
   function frame(now){
    const s=window.__gunsOnlyRC.snapshot(),p=window.__tourPad,l=state.leg;
    state.frames.push(now-lastTime);lastTime=now;
    if(state.last){const d=Math.hypot(s.x-state.last.x,s.z-state.last.z);state.distance+=d;state.maxStep=Math.max(state.maxStep,d);}state.last=s;
    state.cells.add(`${Math.floor(s.x/256)},${Math.floor(s.z/256)}`);
    if(now>sampleAt){state.samples.push({ms:now,x:s.x,y:s.y,z:s.z,speed:s.speed,recoveries:s.recoveries,ready:s.world.ready,tiles:s.world.tiles,guide:s.guide});sampleAt=now+500;}
    p.buttons[6].value=p.buttons[7].value=0;p.buttons[1].value=1;p.axes[0]=0;
    if(l&&!l.done){
     const points=l.points;
     while(l.node<points.length-1){const dx=points[l.node][0]-s.x,dz=points[l.node][1]-s.z,d=Math.hypot(dx,dz),ahead=(dx*Math.sin(s.yaw)-dz*Math.cos(s.yaw))*(l.reverse?-1:1);if(d<2||ahead<0&&d<5)l.node++;else break;}
     const end=points.at(-1),remaining=Math.hypot(end[0]-s.x,end[1]-s.z);
     if(l.node===points.length-1&&remaining<.8&&s.speed<.6)l.done=true;
     else{
      let i=l.node,target=points[i];const look=2+Math.abs(s.speed)*.3;
      while(i<points.length-1&&Math.hypot(target[0]-s.x,target[1]-s.z)<look)target=points[++i];
      const want=Math.atan2(target[0]-s.x,-(target[1]-s.z))+(l.reverse?Math.PI:0);
      const error=Math.atan2(Math.sin(want-s.yaw),Math.cos(want-s.yaw));
      const steer=clamp(error*1.7*(l.reverse?-1:1),-1,1);
      p.axes[0]=Math.sign(steer)*(.12+Math.abs(steer)*.88);
      const vmax=Math.min(l.speed,Math.max(1,l.speed*(1-Math.min(.85,Math.abs(error)))),Math.sqrt(Math.max(0,remaining-.35)*4));
      const v=s.forwardSpeed*(l.reverse?-1:1);
      p.buttons[l.reverse?6:7].value=v<vmax?1:0;
      p.buttons[1].value=v>vmax+.3?1:0;
     }
    }
    requestAnimationFrame(frame);
   }requestAnimationFrame(frame);
  });
  const legs=[
   {id:'road-to-bx',destination:'The BX',end:[-546,797],road:true,speed:10},
   {id:'inside-bx',end:[-546,779.2],speed:3},
   {id:'leave-bx',end:[-546,797],reverse:true,speed:3},
   {id:'road-to-school',destination:'Little Nellie Elementary',end:[-1228,724],road:true,speed:10},
   {id:'inside-school',end:[-1228,657],speed:3},
   {id:'leave-school',end:[-1228,724],reverse:true,speed:3},
  ];
  for(const leg of legs){
   const s=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());
   if(leg.destination){await page.locator('#atlas').click();await page.getByTitle(`Set route to ${leg.destination}`,{exact:true}).click();await page.locator('#map-close').click();}
   const vertices=leg.road?roadRoute(graph,[s.x,s.z],leg.end):[[s.x,s.z],leg.end];
   assert.ok(vertices.length>1,`${leg.id}: route must connect`);
   const points=[];for(let i=1;i<vertices.length;i++){const a=vertices[i-1],b=vertices[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);for(let j=0;j<n;j++)points.push([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);}points.push(leg.end);
   await page.evaluate(l=>{window.__tour.leg={...l,node:1,done:false};},{...leg,points});
   const started=Date.now();let previous=s.travel,stuck=0;
   for(;;){
    await page.waitForTimeout(10000);
    const current=await page.evaluate(()=>({state:window.__gunsOnlyRC.snapshot(),leg:window.__tour.leg}));
    console.log(JSON.stringify({leg:leg.id,seconds:Math.round((Date.now()-started)/1000),node:current.leg.node,total:points.length,x:current.state.x,z:current.state.z,travel:current.state.travel,speed:current.state.speed}));
    assert.equal(current.state.recoveries,0,'Journey must not recover or fast travel');
    if(current.leg.done){report.legs.push({id:leg.id,seconds:(Date.now()-started)/1000,state:current.state,route:vertices});save();break;}
    stuck=current.state.travel-previous<1?stuck+1:0;previous=current.state.travel;
    assert.ok(stuck<4,`${leg.id}: no progress for 40 seconds`);
    assert.ok(Date.now()-started<480000,`${leg.id}: journey timed out`);
   }
   await page.screenshot({path:path.join(out,`${leg.id}.png`)});
  }
  report.finish=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());
  assert.equal(report.documents,1,'Journey must keep the same document');
  assert.ok(await page.evaluate(()=>window.__tour.maxStep<2),'No discontinuous position changes');
  assert.ok(await page.evaluate(()=>window.__tour.distance>3000),'Sustained journey across the base');
  for(const id of ['gate','bx','school'])assert.ok(report.finish.world.discovered.includes(id),`${id} was discovered through driving`);
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.failure=error.stack;process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.error(error);}
 finally{
  if(page)report.driving=await page.evaluate(()=>{const s=window.__tour;if(!s)return null;const f=[...s.frames].sort((a,b)=>a-b);return {distance:s.distance,maxStep:s.maxStep,cells:[...s.cells],frames:{p50:f[Math.floor(f.length*.5)],p95:f[Math.floor(f.length*.95)],count:f.length},samples:s.samples,leg:s.leg};}).catch(()=>null);
  save();await browser?.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
