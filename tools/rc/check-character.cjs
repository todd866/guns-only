// In-engine character check: serve web/wwwroot, open rc/character-review.html (real three.js + characters.js),
// play every clip of one kind for 1.5 s and screenshot it, then report draw calls and rAF p50/p95 over 300 frames.
// node tools/rc/check-character.cjs [outdir=evidence/rc-characters] [--kind K] [clips...]  (other kinds write web-<kind>-<clip>.png; a clip subset writes web-check[-<kind>]-<clips>.json)  env: PLAYWRIGHT_MODULE, CHROMIUM_PATH, ALLOW_SOFTWARE_GL=1
// Headless full Chromium (hardware GPU); run under heavy-slot or remote-run.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../../web/smoke/node_modules/playwright');const path=require('node:path'),fs=require('node:fs');
(async()=>{const argv=process.argv.slice(2),ki=argv.indexOf('--kind'),kind=ki>=0?argv.splice(ki,2)[1]:'dino',tag=kind==='dino'?'':`${kind}-`;process.argv=[...process.argv.slice(0,2),...argv];
const out=path.resolve(process.argv[2]||path.join(__dirname,'../../evidence/rc-characters'));fs.mkdirSync(out,{recursive:true});
const port=8898,srv=await require('./serve-static.cjs')(path.resolve(__dirname,'../../web/wwwroot'),port);let b;
try{b=await chromium.launch({headless:true,channel:'chromium',executablePath:process.env.CHROMIUM_PATH,args:['--mute-audio','--enable-gpu','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1280,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('response',r=>{if(r.status()>=400&&!/favicon\.ico$/.test(r.url()))errs.push(`${r.status()} ${r.url()}`);});
await p.goto(`http://127.0.0.1:${port}/rc/character-review.html?kind=${kind}`);await p.waitForFunction(()=>window.__characterReview,null,{timeout:30000});
await p.evaluate(()=>window.__characterReview.ready);
const gpu=await p.evaluate(()=>window.__characterReview.gpu());const software=/swiftshader|llvmpipe|software/i.test(gpu);
if(software&&!process.env.ALLOW_SOFTWARE_GL)throw Error('Character review requires a hardware GPU: '+gpu);
const clips={};
const only=process.argv.slice(3),list=only.length?only:['idle','walk','run','jump','gallop'];
for(const name of list){await p.evaluate(n=>window.__characterReview.play(n),name);await p.waitForTimeout(name==='jump'?450:1500);
 const file=path.join(out,`web-${tag}${name}.png`);await p.screenshot({path:file});clips[name]={screenshot:path.relative(process.cwd(),file),calls:await p.evaluate(()=>window.__characterReview.calls())};
 if(name==='jump'||name==='takeoff'||name==='land')await p.waitForTimeout(1050);}
await p.evaluate(()=>window.__characterReview.play('run'));await p.waitForTimeout(300);
const frameMs=await p.evaluate(()=>window.__characterReview.frameTimes(300));
const report={kind,gpu,software,frameMs,drawCalls:await p.evaluate(()=>window.__characterReview.calls()),triangles:await p.evaluate(()=>window.__characterReview.triangles()),clips,errs};
fs.writeFileSync(path.join(out,only.length?`web-check-${tag}${only.join('-')}.json`:`web-check${tag?'-'+kind:''}.json`),JSON.stringify(report,null,2)+'\n');console.log('character-check',JSON.stringify(report));
if(errs.length)throw Error(errs.join('\n'));
}finally{await b?.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1});
