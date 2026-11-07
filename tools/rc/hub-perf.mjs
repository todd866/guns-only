// Hub skatepark frame budget. Headless Chromium on a real GPU (never a visible window).
// Prints draw calls, triangles, CPU submit time and driving hitches for the neighbourhood start.
//   node tools/rc/hub-perf.mjs
// Software renderers are refused unless --allow-software, and those numbers are labelled.
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(pathToFileURL(path.join(root, 'tools/rc/look-gate.cjs')));
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ||
  [path.join(root, 'web/smoke/node_modules/playwright'), '/Users/iantodd/Projects/guns-only/web/smoke/node_modules/playwright'].find(
    p => {
      try {
        require(p);
        return true;
      } catch {
        return false;
      }
    }
  );
if (!playwrightPath) throw Error('playwright not found; set PLAYWRIGHT_MODULE');
const {chromium} = require(playwrightPath);
const serve = require(path.join(root, 'tools/rc/serve-static.cjs'));
const allowSoftware = process.argv.includes('--allow-software');
const SOFTWARE = /swiftshader|llvmpipe|software/i;

const port = 8940 + (process.pid % 50);
const srv = await serve(path.join(root, 'web/wwwroot'), port);
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--mute-audio']
});
const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
const logs = [];
page.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') logs.push(`${message.type()}: ${message.text()}`);
});
page.on('pageerror', error => logs.push(`pageerror: ${error.message}`));
try {
  await page.goto(`http://127.0.0.1:${port}/rc/?track=hub&audioQa=silent&telemetry=off`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForFunction(() => window.__gunsOnlyRC?.snapshot().assets === 'blender', null, {timeout: 120000});
  await page.waitForFunction(() => window.__gunsOnlyRC.snapshot().paused === false, null, {timeout: 120000});
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('#view').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
  const software = SOFTWARE.test(gpu);
  if (software && !allowSoftware) throw Error(`software renderer (${gpu}); pass --allow-software and do not treat the numbers as a GPU budget`);
  await page.evaluate(() => {
    const pos = [-3023.07, 0, -776.51];
    const hit = window.__gunsOnlyRC.collision().raycast([pos[0], 400, pos[2]], [0, -1, 0], 800);
    const y = hit ? 400 - hit.dist + 0.5 : 0.5;
    window.__gunsOnlyRC.place([pos[0], y, pos[2]], -0.466);
  });
  await page.waitForFunction(
    () => {
      const world = window.__gunsOnlyRC.snapshot().world;
      return world?.ready && (window.__gunsOnlyRC.nearDetail?.()?.queued ?? 0) === 0;
    },
    null,
    {timeout: 90000}
  );
  const loaded = await page.evaluate(
    () =>
      new Promise(resolve => {
        const samples = [];
        let last = performance.now();
        let readyAt = 0;
        const step = now => {
          samples.push(now - last);
          last = now;
          const names = new Set();
          window.__gunsOnlyRC.scene().traverse(o => {
            if (o.name?.startsWith('District_')) names.add(o.name);
          });
          if (names.size >= 4 && !readyAt) readyAt = samples.length;
          const waiting = names.size < 4 ? samples.length < 200 : samples.length < readyAt + 40;
          if (waiting) requestAnimationFrame(step);
          else resolve({samples, districts: [...names]});
        };
        requestAnimationFrame(step);
      })
  );
  await page.waitForTimeout(400);
  const budget = await page.evaluate(() => {
    const scene = window.__gunsOnlyRC.scene();
    const cam = window.__gunsOnlyRC.camera();
    const fov = (cam.fov * Math.PI) / 180;
    const aspect = 1920 / 1080;
    const hx = Math.atan(Math.tan(fov / 2) * aspect) + 0.15;
    const fx = Math.sin(cam.yaw) * Math.cos(cam.pitch);
    const fy = Math.sin(cam.pitch);
    const fz = -Math.cos(cam.yaw) * Math.cos(cam.pitch);
    const groups = new Map();
    let flagged = 0;
    let flaggedTris = 0;
    let cone = 0;
    let coneTris = 0;
    let shadowTris = 0;
    scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const pos = o.geometry?.attributes?.position;
      if (!pos) return;
      const inst = o.isInstancedMesh ? o.count : 1;
      const tris = ((o.geometry.index ? o.geometry.index.count : pos.count) / 3) * inst;
      const local = o.boundingSphere || o.geometry.boundingSphere;
      const name = (o.name || o.parent?.name || 'mesh').split(':')[0].replace(/-?\d+$/, '');
      flagged++;
      flaggedTris += tris;
      if (o.castShadow) shadowTris += tris;
      let inCone = true;
      if (local) {
        const center = local.center.clone().applyMatrix4(o.matrixWorld);
        const scale = o.getWorldScale(center.clone());
        const radius = local.radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
        const dx = center.x - cam.pos[0];
        const dy = center.y - cam.pos[1];
        const dz = center.z - cam.pos[2];
        const dist = Math.hypot(dx, dy, dz);
        const ahead = dx * fx + dy * fy + dz * fz;
        inCone =
          dist <= radius + 2 ||
          (ahead > -radius && Math.acos(Math.min(1, Math.max(-1, ahead / (dist || 1)))) < hx + radius / (dist || 1));
      }
      if (!inCone) return;
      cone++;
      coneTris += tris;
      const g = groups.get(name) || {meshes: 0, tris: 0, shadow: 0};
      g.meshes++;
      g.tris += tris;
      if (o.castShadow) g.shadow++;
      groups.set(name, g);
    });
    return {
      flagged,
      flaggedTris: Math.round(flaggedTris),
      cone,
      coneTris: Math.round(coneTris),
      shadowTris: Math.round(shadowTris),
      groups: [...groups.entries()]
        .map(([name, g]) => ({name, meshes: g.meshes, tris: Math.round(g.tris), shadow: g.shadow}))
        .sort((a, b) => b.tris - a.tris)
        .slice(0, 16)
    };
  });
  const steady = await page.evaluate(
    () =>
      new Promise(resolve => {
        window.__gunsOnlyRC.profile();
        const samples = [];
        let last = performance.now();
        const step = now => {
          const dt = now - last;
          last = now;
          const r = window.__gunsOnlyRC.renderer();
          samples.push({dt, calls: r.calls, tris: r.triangles});
          if (samples.length < 90) requestAnimationFrame(step);
          else resolve({samples: samples.slice(8), cpu: window.__gunsOnlyRC.profile()});
        };
        requestAnimationFrame(step);
      })
  );
  await page.keyboard.down('KeyW');
  const drive = await page.evaluate(
    () =>
      new Promise(resolve => {
        const samples = [];
        const tasks = [];
        let observer = null;
        try {
          observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) tasks.push(Math.round(entry.duration));
          });
          observer.observe({type: 'longtask', buffered: false});
        } catch {}
        let last = performance.now();
        const step = now => {
          samples.push(now - last);
          last = now;
          if (samples.length < 150) requestAnimationFrame(step);
          else {
            observer?.disconnect();
            const r = window.__gunsOnlyRC.renderer();
            resolve({
              samples: samples.slice(4),
              calls: r.calls,
              tris: r.triangles,
              travel: window.__gunsOnlyRC.snapshot().travel,
              longTasks: tasks
            });
          }
        };
        requestAnimationFrame(step);
      })
  );
  await page.keyboard.up('KeyW');
  const pct = (values, q) => {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * q))];
  };
  const dts = steady.samples.map(s => s.dt);
  const report = {
    gpu,
    software,
    label: software ? 'software-renderer' : 'gpu',
    viewport: '1920x1080',
    calls: Math.round(steady.samples.reduce((n, s) => n + s.calls, 0) / steady.samples.length),
    tris: Math.round(steady.samples.reduce((n, s) => n + s.tris, 0) / steady.samples.length),
    districts: loaded.districts,
    logs: logs.slice(0, 8),
    loadHitchMs: +Math.max(...loaded.samples).toFixed(1),
    budget,
    cpuUpdateMs: steady.cpu.update,
    cpuRenderMs: steady.cpu.render,
    frameMs: {
      p50: +pct(dts, 0.5).toFixed(2),
      p95: +pct(dts, 0.95).toFixed(2),
      max: +Math.max(...dts).toFixed(2),
      note: 'rAF interval; headless may clamp this. cpuRenderMs is the submit cost.'
    },
    drive: {
      p50: +pct(drive.samples, 0.5).toFixed(2),
      p95: +pct(drive.samples, 0.95).toFixed(2),
      max: +Math.max(...drive.samples).toFixed(2),
      over50: drive.samples.filter(x => x > 50).length,
      calls: drive.calls,
      tris: drive.tris,
      travel: +drive.travel.toFixed(1),
      longTaskMax: drive.longTasks.length ? Math.max(...drive.longTasks) : 0,
      longTasksOver50: drive.longTasks.filter(ms => ms > 50).length
    }
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  srv.close();
}
