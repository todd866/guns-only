// Sustained, headless Chromium route QA. This is intentionally a harness only:
// it drives through the real UI and records honest movement/frame samples.
const { chromium } = require('../../web/smoke/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path');

const OUT = path.resolve(process.argv[2] || 'evidence/rc-open-world/sustained');
const ROOT = path.resolve(process.env.RC_QA_ROOT || path.join(__dirname, '../../web/wwwroot'));
const COURSES = [
  ['paper-route', 'track=hub&event=paper-route&mode=race'],
  ['district-bx', 'track=hub&event=district-bx&mode=race'],
  ['rink-drift-night', 'track=hub&event=rink-drift&mode=race&night=1'],
];
const percentile = (a, p) => { const x = [...a].sort((u, v) => u - v); return x.length ? x[Math.min(x.length - 1, Math.floor((x.length - 1) * p))] : null; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true }); let browser; const errors = [], results = [];
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext({hasTouch:true});
    await context.route('http://rc.test/**', async route => {
      const u = new URL(route.request().url()), name = decodeURIComponent(u.pathname.endsWith('/') ? `${u.pathname}index.html` : u.pathname), file = path.resolve(ROOT, `.${name}`);
      if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const type = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
    });
    const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(e.stack || e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const ready = () => page.waitForFunction(() => window.__gunsOnlyRC?.snapshot().assets === 'blender' && !document.querySelector('#start')?.disabled, null, { timeout: 60000 });
    await page.goto('http://rc.test/rc/?track=hub&audioQa=silent&telemetry=off'); await ready();
    const gpu = await page.evaluate(() => { const gl = document.querySelector('#view').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
    if (/swiftshader|llvmpipe/i.test(gpu)) throw Error(`software renderer reported: ${gpu}`);
    await context.addInitScript(()=>{window.__pad={connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:10},()=>({value:0,pressed:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.__pad]});});
    for (const [id, query] of COURSES) {
      await page.goto(`http://rc.test/rc/?${query}&rivals=0&audioQa=silent&telemetry=off`); await ready(); await page.locator('#start').click();
      await page.evaluate(() => { const samples=[],frames=[];window.__sustained={samples,frames};let last=performance.now(),node=0,previousTravel=0,total=0;
        const tick=now=>{const s=window.__gunsOnlyRC.snapshot(),line=window.__gunsOnlyRC.line(),n=line.length,at=i=>line[(i%n+n)%n];frames.push(Math.max(0,now-last));last=now;total+=Math.max(0,s.travel-previousTravel);previousTravel=s.travel;
          if(s.finished){window.__pad.buttons[7].value=0;const again=document.querySelector('#again');if(again){window.__sustained.finishes=(window.__sustained.finishes||0)+1;again.click();node=0;previousTravel=0;}}
          else {for(let i=0;i<n;i++){const p=at(node),dx=p[0]-s.x,dz=p[1]-s.z,d=Math.hypot(dx,dz),ahead=dx*Math.sin(s.yaw)-dz*Math.cos(s.yaw);if(d<1.5||ahead<0&&d<5)node++;else break;}
            let target=at(node),j=node;while(Math.hypot(target[0]-s.x,target[1]-s.z)<1.6+s.speed*.35&&j<node+n)target=at(++j);const want=Math.atan2(target[0]-s.x,-(target[1]-s.z)),err=Math.atan2(Math.sin(want-s.yaw),Math.cos(want-s.yaw)),steer=Math.max(-1,Math.min(1,err*2.2)),vmax=5.5*(1-Math.min(.6,Math.abs(err)));
            window.__pad.axes[0]=Math.sign(steer)*(.12+Math.abs(steer)*.88);window.__pad.buttons[7].value=s.forwardSpeed<vmax?1:.15;window.__pad.buttons[1].value=s.forwardSpeed>vmax+1?1:0;}
          samples.push({t:now,x:s.x,z:s.z,speed:s.speed,travel:total,tiles:s.world.tiles,gate:s.gate});window.__sustained.total=total;requestAnimationFrame(tick);};requestAnimationFrame(tick);});
      const before=await page.evaluate(()=>window.__gunsOnlyRC.snapshot());await page.waitForTimeout(60000);const after=await page.evaluate(()=>window.__gunsOnlyRC.snapshot()),data=await page.evaluate(()=>window.__sustained);const moving=data.samples.filter(s=>s.speed>.5).length;
      const result={course:id,before,after,movement:{travelDelta:data.total,movingFraction:moving/data.samples.length},frames:{p50:percentile(data.frames,.5),p95:percentile(data.frames,.95),max:Math.max(...data.frames),count:data.frames.length},finishes:data.finishes||0,samples:data.samples};results.push(result);await page.screenshot({path:path.join(OUT,id+'.png')});console.log(id,JSON.stringify({movement:result.movement,frames:result.frames,finishes:result.finishes}));if(data.total<50||moving/data.samples.length<.5)throw Error(id+': insufficient sustained movement');
    }
    // Mobile controls: real pointer input on the touch throttle, with no state injection.
    const mobilePage = await context.newPage();await mobilePage.setViewportSize({width:667,height:375}); await mobilePage.goto('http://rc.test/rc/?track=hub&at=gate&audioQa=silent'); await mobilePage.waitForFunction(() => window.__gunsOnlyRC?.snapshot().assets === 'blender'); await mobilePage.locator('#start').click(); const touch = mobilePage.locator('[data-key="KeyW"]'); const box = await touch.boundingBox(); await mobilePage.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await mobilePage.mouse.down(); await mobilePage.waitForTimeout(1500); await mobilePage.mouse.up(); const mobile = await mobilePage.evaluate(() => window.__gunsOnlyRC.snapshot()); await mobilePage.screenshot({ path: path.join(OUT, 'mobile.png') }); results.push({ course: 'mobile-input', movement: mobile }); if(mobile.travel<2)throw Error('Mobile throttle did not move');await mobilePage.close();
    const report = { gpu, errors, results, night: { status: 'tested', event:'rink-drift', note:'Forced-night course; Dreamland unlock rules covered separately.' } }; fs.writeFileSync(path.join(OUT, 'sustained.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); if (errors.length) process.exitCode = 1;
  } finally { fs.writeFileSync(path.join(OUT, 'partial-results.json'), JSON.stringify({ errors, results }, null, 2)); await browser?.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
