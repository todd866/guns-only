// Render the production Rapier factory, unchanged, for the aircraft picker.
// node tools/assets/generators/menu-posters/rapier-model.mjs --output /absolute/new-poster.png
// Requires web/smoke's Playwright installation. Outputs are never overwritten.
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { access, open, readFile, realpath, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const WWWROOT = path.join(ROOT, "web/wwwroot");
const requireFromSmoke = createRequire(path.join(ROOT, "web/smoke/package.json"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (root, candidate) => candidate.startsWith(root + path.sep);
const GENERATOR_SOURCE = await readFile(SELF);
const GENERATOR_SHA256 = sha256(GENERATOR_SOURCE);

export function parseArguments(args) {
  if (args.length !== 2 || args[0] !== "--output" || !path.isAbsolute(args[1])
      || path.extname(args[1]).toLowerCase() !== ".png") {
    throw new Error("Usage: rapier-model.mjs --output /absolute/new-poster.png");
  }
  const output = path.resolve(args[1]);
  if (inside(WWWROOT, output)) throw new Error("Write a retained source PNG outside web/wwwroot.");
  return { output, provenance: output.slice(0, -4) + ".provenance.json" };
}

export async function writePosterOutputs(options, png, provenance) {
  const created = [];
  try {
    for (const [file, bytes] of [
      [options.output, png],
      [options.provenance, JSON.stringify(provenance, null, 2) + "\n"],
    ]) {
      const handle = await open(file, "wx");
      created.push(file);
      try { await handle.writeFile(bytes); } finally { await handle.close(); }
    }
  } catch (error) {
    // Only paths exclusively created by this call are removed; an existing sidecar is preserved.
    await Promise.allSettled(created.map(file => unlink(file)));
    throw error;
  }
}

function documentSource(nonce) {
  return `<!doctype html><meta charset="utf-8"><title>Production Rapier model poster</title>
<link rel="icon" href="data:,">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}
body{background:radial-gradient(ellipse at 52% 44%,#33414a 0%,#18242d 45%,#080e16 82%)}
canvas{display:block;width:100%;height:100%}</style>
<script type="module">
import * as THREE from '/vendor/three.module.js';
import { createRapier, createLitEnvironment } from '/render/scene/scene_builders.js?poster=${nonce}';
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
renderer.setPixelRatio(1); renderer.setSize(1000,1000);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0x000000,0); document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const environment = createLitEnvironment(renderer); scene.environment = environment.texture;
const rapier = createRapier(); scene.add(rapier); rapier.updateMatrixWorld(true);
const lights = [
  { type:'HemisphereLight',sky:0xdce8f0,ground:0x18212a,intensity:1.25 },
  { type:'DirectionalLight',color:0xffead3,intensity:3.4,position:[-7,10,-8] },
  { type:'DirectionalLight',color:0xb8d4ee,intensity:2.1,position:[8,5,7] },
  { type:'DirectionalLight',color:0xffffff,intensity:0.8,position:[4,1,-10] },
];
for (const spec of lights) {
  const light = spec.type === 'HemisphereLight'
    ? new THREE.HemisphereLight(spec.sky,spec.ground,spec.intensity)
    : new THREE.DirectionalLight(spec.color,spec.intensity);
  if (spec.position) light.position.fromArray(spec.position); scene.add(light);
}
const bounds = new THREE.Box3().setFromObject(rapier);
const target = bounds.getCenter(new THREE.Vector3());
const camera = new THREE.OrthographicCamera(-10,10,10,-10,0.1,100);
camera.position.copy(target).add(new THREE.Vector3(10,8,-17)); camera.lookAt(target);
camera.updateMatrixWorld(true);
// Fit actual vertices into the intersection of centered 9:16 and 16:10 cover crops.
// Only the camera moves: the production mesh's transform, materials and definition stay intact.
const viewBounds = new THREE.Box3(); let triangles=0,meshes=0;
rapier.traverse(mesh => {
  if (!mesh.isMesh) return;
  meshes++; const p=mesh.geometry.attributes.position;
  triangles += (mesh.geometry.index?.count ?? p.count)/3;
  for(let i=0;i<p.count;i++) viewBounds.expandByPoint(new THREE.Vector3()
    .fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse));
});
const viewSize=viewBounds.getSize(new THREE.Vector3());
const half=Math.max(viewSize.x/0.53,viewSize.y/0.58)/2;
const centre=viewBounds.getCenter(new THREE.Vector3());
camera.left=centre.x-half; camera.right=centre.x+half;
camera.bottom=centre.y-half; camera.top=centre.y+half; camera.updateProjectionMatrix();
renderer.compile(scene,camera); renderer.render(scene,camera);
await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
renderer.render(scene,camera);
const gl=renderer.getContext(), debug=gl.getExtension('WEBGL_debug_renderer_info');
const projectedBounds={min:[Infinity,Infinity],max:[-Infinity,-Infinity]};
rapier.traverse(mesh=>{
  if(!mesh.isMesh)return; const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).project(camera);
    const point=[(v.x+1)/2,(1-v.y)/2];
    for(let j=0;j<2;j++){projectedBounds.min[j]=Math.min(projectedBounds.min[j],point[j]);
      projectedBounds.max[j]=Math.max(projectedBounds.max[j],point[j]);}
  }
});
window.posterResult={
  factory:'createRapier()',definitionOverride:false,materialOverride:false,
  model:{airframeId:rapier.userData.airframeId,definitionRevision:rapier.userData.definitionRevision,
    position:rapier.position.toArray(),quaternion:rapier.quaternion.toArray(),scale:rapier.scale.toArray(),
    bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},meshes,triangles,projectedBounds},
  camera:{type:camera.type,position:camera.position.toArray(),target:target.toArray(),
    quaternion:camera.quaternion.toArray(),left:camera.left,right:camera.right,top:camera.top,
    bottom:camera.bottom,near:camera.near,far:camera.far},
  lights,environmentFactory:'createLitEnvironment(renderer)',
  rendering:{width:1000,height:1000,pixelRatio:1,antialias:true,toneMapping:'ACESFilmicToneMapping',
    exposure:renderer.toneMappingExposure,outputColorSpace:renderer.outputColorSpace,
    background:'CSS radial gradient; exact source retained in document hash',
    renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
    vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),
    version:gl.getParameter(gl.VERSION),drawCalls:renderer.info.render.calls,
    triangles:renderer.info.render.triangles},
  shaderDiagnostics:renderer.info.programs.map(p=>({name:p.name,runnable:p.diagnostics?.runnable??null}))
};
</script>`;
}

export async function renderPoster(options) {
  const parent = await realpath(path.dirname(options.output));
  if (inside(await realpath(WWWROOT), parent + path.sep)) {
    throw new Error("Output directory resolves inside web/wwwroot.");
  }
  for (const output of [options.output, options.provenance]) {
    try { await access(output); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    throw new Error(`Refusing to overwrite ${output}`);
  }
  const { chromium } = requireFromSmoke("playwright");
  const playwrightVersion = requireFromSmoke("playwright/package.json").version;
  const nonce = randomUUID(), served = new Map(), errors = [];
  const html = Buffer.from(documentSource(nonce));
  const webRoot = await realpath(WWWROOT);
  let browser, server;
  const cleanup = async () => {
    await browser?.close().catch(() => {});
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
  const interrupt = () => { void cleanup().finally(() => process.exit(130)); };
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  try {
    server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        let bytes, relative;
        if (url.pathname === "/__rapier-poster.html") {
          bytes = html; relative = "generated:poster-document";
        } else {
          const candidate = path.resolve(webRoot, "." + decodeURIComponent(url.pathname));
          if (!inside(webRoot, candidate) || ![".js", ".json"].includes(path.extname(candidate))) {
            response.writeHead(404).end(); return;
          }
          const actual = await realpath(candidate);
          if (!inside(webRoot, actual)) throw new Error("Source path escapes web root");
          bytes = await readFile(actual); relative = path.relative(ROOT, actual);
        }
        const hash = sha256(bytes), previous = served.get(relative);
        if (previous && previous.sha256 !== hash) throw new Error(`Source changed during render: ${relative}`);
        served.set(relative, { path:relative,bytes:bytes.length,sha256:hash });
        response.writeHead(200, {
          "Content-Type": relative === "generated:poster-document" ? "text/html"
            : relative.endsWith(".json") ? "application/json" : "text/javascript",
          "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff",
        }).end(bytes);
      } catch (error) { errors.push(error.message); response.writeHead(500).end("Render source error"); }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const launchArgs = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
    browser = await chromium.launch({ headless:true,args:launchArgs });
    const context = await browser.newContext({ viewport:{width:1000,height:1000},deviceScaleFactor:1 });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${origin}/__rapier-poster.html?fresh=${nonce}`, {waitUntil:"networkidle"});
    await page.waitForFunction(() => !!window.posterResult, null, {timeout:60000});
    const result = await page.evaluate(() => window.posterResult);
    if (result.shaderDiagnostics.some(p => p.runnable === false)) errors.push("Shader compilation failed");
    if (errors.length) throw new Error(errors.join("\n"));
    const png = await page.screenshot({type:"png",animations:"disabled"});
    for (const source of served.values()) {
      if (source.path.startsWith("generated:")) continue;
      if (sha256(await readFile(path.join(ROOT, source.path))) !== source.sha256) {
        throw new Error(`Source changed before capture completed: ${source.path}`);
      }
    }
    if (sha256(await readFile(SELF)) !== GENERATOR_SHA256) {
      throw new Error("Poster generator changed during capture; rerun from stable source.");
    }
    const provenance = {
      schema:"guns-only.production-model-poster.v1",createdAt:new Date().toISOString(),
      fiction:true,sourceKind:"actual-production-factory-render",...result,
      browser:{engine:"Chromium",version:browser.version(),playwrightVersion,headless:true,launchArgs},
      cachePolicy:"new browser context and ephemeral origin; no-store responses and unique entry URL",
      documentNonce:nonce,
      generator:{path:path.relative(ROOT,SELF),bytes:GENERATOR_SOURCE.length,sha256:GENERATOR_SHA256},
      servedSources:[...served.values()].sort((a,b)=>a.path.localeCompare(b.path)),
      output:{file:path.basename(options.output),mimeType:"image/png",width:1000,height:1000,
        bytes:png.length,sha256:sha256(png)},
    };
    await writePosterOutputs(options, png, provenance);
    return provenance;
  } finally {
    process.removeListener("SIGINT",interrupt); process.removeListener("SIGTERM",interrupt);
    await cleanup();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  try {
    const result = await renderPoster(parseArguments(process.argv.slice(2)));
    console.log(JSON.stringify({output:result.output,model:result.model},null,2));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
