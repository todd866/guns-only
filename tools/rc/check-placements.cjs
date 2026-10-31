// In-engine placements check: serve web/wwwroot, open rc/placements-review.html (real three.js + placements.js),
// screenshot the example picnic area (overview + close) and the kit line-up, then report main-pass draw calls (with and
// without the placements; renderer.info resets after the shadow passes, which cost the same again per shadow light) and rAF p50/p95 over 300 frames, for the example and for a
// 312-item stress copy. node tools/rc/check-placements.cjs [outdir=evidence/rc-placements]
// env: PLAYWRIGHT_MODULE, CHROMIUM_PATH, ALLOW_SOFTWARE_GL=1. Headless full Chromium; run under heavy-slot or remote-run.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../../web/smoke/node_modules/playwright');const path=require('node:path'),fs=require('node:fs');
(async()=>{const out=path.resolve(process.argv[2]||path.join(__dirname,'../../evidence/rc-placements'));fs.mkdirSync(out,{recursive:true});
const port=8899,srv=await require('./serve-static.cjs')(path.resolve(__dirname,'../../web/wwwroot'),port);let b;
try{b=await chromium.launch({headless:true,channel:'chromium',executablePath:process.env.CHROMIUM_PATH,args:['--mute-audio','--enable-gpu','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1280,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/^Failed to load resource/.test(m.text()))errs.push('console: '+m.text());});  // 4xx are judged by URL below
p.on('response',r=>{if(r.status()>=400&&!/favicon\.ico$/.test(r.url()))errs.push(`${r.status()} ${r.url()}`);});
await p.goto(`http://127.0.0.1:${port}/rc/placements-review.html`);await p.waitForFunction(()=>window.__placementsReview,null,{timeout:30000});
const loaded=await p.evaluate(()=>window.__placementsReview.ready);
const gpu=await p.evaluate(()=>window.__placementsReview.gpu());const software=/swiftshader|llvmpipe|software/i.test(gpu);
if(software&&!process.env.ALLOW_SOFTWARE_GL)throw Error('Placements review requires a hardware GPU: '+gpu);
const R=(fn,...a)=>p.evaluate(([fn,a])=>window.__placementsReview[fn](...a),[fn,a]);
const views={};
for(const [name,file] of [['example','web-review.png'],['close','web-close.png'],['kit','web-kit.png']]){
 const counts=await R('show',name);await p.waitForTimeout(600);const f=path.join(out,file);await p.screenshot({path:f});
 views[name]={screenshot:path.relative(process.cwd(),f),counts,drawCalls:await R('placementCalls'),triangles:await R('triangles')};}
await R('show','example');await p.waitForTimeout(300);
const exampleFrameMs=await R('frameTimes',300);
const stressCounts=await R('stress',8);await p.waitForTimeout(600);const sf=path.join(out,'web-stress.png');await p.screenshot({path:sf});
const stress={screenshot:path.relative(process.cwd(),sf),counts:stressCounts,drawCalls:await R('placementCalls'),triangles:await R('triangles'),frameMs:await R('frameTimes',300)};
const report={gpu,software,loaded,example:{...views.example,frameMs:exampleFrameMs},close:views.close,kit:views.kit,stress,errs};
fs.writeFileSync(path.join(out,'web-check.json'),JSON.stringify(report,null,2)+'\n');console.log('placements-check',JSON.stringify(report));
if(errs.length)throw Error(errs.join('\n'));
}finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
