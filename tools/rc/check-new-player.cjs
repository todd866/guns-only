// Fresh profile, visible controls and controller input. Never grants discoveries,
// writes game state, teleports, or finishes a race through a debug hook.
const {chromium}=require('../../web/smoke/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]||root+'/evidence/rc-open-world/new-player');fs.mkdirSync(out,{recursive:true});
 let browser,server,page;const errors=[],report={};
 try{
  let base=process.argv[3];if(!base){server=await require('./serve-static.cjs')(path.resolve(process.env.RC_QA_ROOT||root+'/web/wwwroot'),19867);base='http://127.0.0.1:19867';}
  browser=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.addInitScript(()=>{window.qaPad={connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:10},()=>({value:0,pressed:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.qaPad]});});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/rc/?audioQa=silent&telemetry=off');
  const ready=()=>page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender'&&!window.__gunsOnlyRC.snapshot().paused,null,{timeout:90000});
  await ready();report.arrival=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());
  assert.equal(report.arrival.audioSilent,true);assert.ok(!report.arrival.world.discovered.includes('housing'));
  await page.screenshot({path:out+'/arrival.png'});
  assert.ok(await page.locator('#interact').isVisible(),'A nearby race is offered on the first screen');
  await page.locator('#view').focus();await page.keyboard.press('KeyE');await ready();
  assert.equal(await page.evaluate(()=>window.__gunsOnlyRC.snapshot().world.event),'gate-guard');
  assert.equal(new URL(page.url()).searchParams.get('mode'),'race');
  await page.keyboard.down('KeyX');await page.waitForTimeout(5000);await page.keyboard.up('KeyX');
  await page.locator('#pause').click();await page.locator('#start').click();await ready();
  assert.ok(!new URL(page.url()).searchParams.has('event'));
  console.log('Fresh nearby-race prompt and keyboard entry passed');
  // The first visit must offer a normal race without doing an exploration chore.
  await page.locator('#atlas').click();await page.locator('#world-event').selectOption('district-housing');
  assert.equal(await page.locator('#world-race').isEnabled(),true);
  assert.equal(await page.locator('#world-event option[value="dreamland"]').count(),0);
  await page.screenshot({path:out+'/choose-race.png'});
  await page.locator('#world-race').click();await ready();
  report.race=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());assert.equal(report.race.world.event,'district-housing');assert.equal(report.race.rivals.length,7);
  await page.screenshot({path:out+'/grid.png'});console.log('Fresh Map housing race started with seven rivals');
  // Drive the real three-lap course with ordinary gamepad inputs. The seam below
  // reads position and course geometry only; it cannot move or finish the car.
  await page.evaluate(()=>{
   const line=window.__gunsOnlyRC.line(),first=window.__gunsOnlyRC.snapshot();let node=line.reduce((b,p,i)=>Math.hypot(p[0]-first.x,p[1]-first.z)<Math.hypot(line[b][0]-first.x,line[b][1]-first.z)?i:b,0);
   window.qaDrive={samples:[],done:false};let sampleAt=0;
   function frame(now){const s=window.__gunsOnlyRC.snapshot(),pad=window.qaPad,at=i=>line[(i+line.length)%line.length];pad.buttons[6].value=pad.buttons[7].value=0;pad.axes[0]=0;
    if(s.finished){window.qaDrive.done=true;return;}
    if(!s.paused){
     for(let k=0;k<line.length;k++){const p=at(node),dx=p[0]-s.x,dz=p[1]-s.z,d=Math.hypot(dx,dz),ahead=dx*Math.sin(s.yaw)-dz*Math.cos(s.yaw);if(d<1.5||(ahead<0&&d<4))node++;else break;}
     let i=node,target=at(i),look=1.6+s.speed*.3;while(Math.hypot(target[0]-s.x,target[1]-s.z)<look&&i<node+line.length)target=at(++i);
     const want=Math.atan2(target[0]-s.x,-(target[1]-s.z)),err=Math.atan2(Math.sin(want-s.yaw),Math.cos(want-s.yaw));
     const steer=Math.max(-1,Math.min(1,err*1.7));pad.axes[0]=Math.sign(steer)*(.12+Math.abs(steer)*.88);
     const vmax=Math.max(2.5,7.5*(1-Math.min(.8,Math.abs(err)))),throttle=Math.max(-.6,Math.min(.8,.1+(vmax-s.forwardSpeed)*.3));pad.buttons[throttle<0?6:7].value=Math.abs(throttle);
     pad.buttons[2].value=s.item?1:0;pad.buttons[2].pressed=!!s.item;
    }
    if(now>sampleAt){window.qaDrive.samples.push({lap:s.lap,gate:s.gate,x:s.x,z:s.z,travel:s.travel,recoveries:s.recoveries,near:s.rivals.filter(r=>Math.hypot(r.x-s.x,r.z-s.z)<15).length});sampleAt=now+1000;}
    requestAnimationFrame(frame);
   }requestAnimationFrame(frame);
  });
  for(let waited=0;waited<300;waited+=10){await page.waitForTimeout(10000);const state=await page.evaluate(()=>({s:window.__gunsOnlyRC.snapshot(),done:window.qaDrive?.done}));console.log(JSON.stringify({seconds:waited+10,lap:state.s.lap,gate:state.s.gate,travel:Math.round(state.s.travel),recoveries:state.s.recoveries}));if(state.done)break;}
  assert.ok(await page.evaluate(()=>window.qaDrive?.done),'Three laps must finish through controller input');
  report.finished=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());report.samples=await page.evaluate(()=>window.qaDrive.samples);
  assert.equal(report.finished.finished,true);assert.equal(report.finished.lapTimes.length,3);
  assert.ok(report.samples.some(s=>s.near>0),'Rivals must be visible during the race');
  await page.screenshot({path:out+'/finish.png'});
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('guns-only.rc.world.v1')).raceWins['district-housing']>0),'Race finish is saved');
  await page.locator('#explore').click();await ready();assert.ok(!new URL(page.url()).searchParams.has('event'));
  assert.ok(await page.locator('#garage').isVisible(),'Free-drive controls return');
  await page.locator('#garage').click();await page.locator('#garage-close').click();
  const before=await page.evaluate(()=>window.__gunsOnlyRC.snapshot().travel);await page.keyboard.down('KeyX');await page.waitForTimeout(1500);await page.keyboard.up('KeyX');
  assert.ok(await page.evaluate(v=>window.__gunsOnlyRC.snapshot().travel>v+1,before));
  await page.screenshot({path:out+'/back-in-base.png'});
  await page.locator('#atlas').click();await page.locator('#world-event').selectOption('district-bx');await page.locator('#world-race').click();await ready();
  assert.equal(await page.evaluate(()=>window.__gunsOnlyRC.snapshot().world.event),'district-bx');
  assert.deepEqual(errors,[]);report.passed=true;console.log('Fresh arrival → Map → housing race → three laps → return to exploration passed');
 }finally{if(page&&!report.passed){report.lastState=await page.evaluate(()=>window.__gunsOnlyRC?.snapshot()).catch(()=>null);report.samples=await page.evaluate(()=>window.qaDrive?.samples).catch(()=>null);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});}report.errors=errors;fs.writeFileSync(out+'/journey.json',JSON.stringify(report,null,2));await browser?.close();server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
