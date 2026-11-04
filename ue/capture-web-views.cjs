#!/usr/bin/env node
// Capture reference views from the web RC game for the Unreal parity spike.
// For each track it drives the same way tools/rc/look.cjs does, and at each moment records the
// screenshot plus the exact camera (position, quaternion, fov) and car pose from the debug API.
// Unreal renders the same views from ue/views/<track>.json, so the comparison is like for like.
//
//   node ue/capture-web-views.cjs [outDir=ue/views] [tracks...=hub housing bx]
// Headless full Chromium on the hardware GPU (refuses SwiftShader). Silent. Cleans up in finally.
const path = require('node:path');
const fs = require('node:fs');
// Loaded lazily so --placements-only works without Playwright installed.
const loadChromium = () => require(process.env.PLAYWRIGHT_MODULE || '../web/smoke/node_modules/playwright').chromium;

const out = path.resolve(process.argv[2] || path.join(__dirname, 'views'));
const tracks = process.argv.slice(3).length ? process.argv.slice(3) : ['hub', 'housing', 'bx'];
const PORT = 8898;
// The moments look.cjs uses: arrival (parked), run (2.5 s full throttle), turn (1.2 s right turn).
const MOMENTS = [
  { name: 'arrival', keys: [], ms: 600 },
  { name: 'run', keys: ['ArrowUp'], ms: 2500 },
  { name: 'turn', keys: ['ArrowUp', 'ArrowRight'], ms: 1200 },
];

// Where the web game puts each track's district GLB in the open world (districts.js insert()).
async function districtPlacement(track) {
  const zones = await import('../web/wwwroot/rc/open-world/district-zones.mjs');
  if (track === 'hub') {
    const { RESIDENTIAL_PARK } = await import('../web/wwwroot/rc/open-world/residential-frame.mjs');
    const p = RESIDENTIAL_PARK;
    return { glb: 'districts/skatepark.glb', anchor: (p.anchor ?? p.pos ?? p.position ?? [0, 0, 0]).slice(0, 3), yaw: Number(p.yaw ?? 0) };
  }
  if (!zones.DISTRICT_ZONES[track]) return null;
  return { glb: `districts/${track}.glb`, anchor: zones.districtOffset(track), yaw: 0 };
}

(async () => {
  if (process.argv[2] === '--placements-only') {
    for (const f of fs.readdirSync(path.join(__dirname, 'views')).filter((n) => n.endsWith('.json'))) {
      const file = path.join(__dirname, 'views', f);
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
      doc.district = await districtPlacement(doc.track);
      fs.writeFileSync(file, JSON.stringify(doc, null, 2));
      console.log(f, JSON.stringify(doc.district));
    }
    return;
  }
  fs.mkdirSync(out, { recursive: true });
  const serve = require('../tools/rc/serve-static.cjs');
  const srv = await serve(path.resolve(__dirname, '../web/wwwroot'), PORT);
  let browser;
  try {
    browser = await loadChromium().launch({ headless: true, channel: 'chromium', args: ['--mute-audio'] });
    for (const track of tracks) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`http://127.0.0.1:${PORT}/rc/?track=${track}&audioQa=silent&telemetry=off`);
      await page.waitForFunction(() => window.__gunsOnlyRC?.snapshot().assets === 'blender', null, { timeout: 90000 });
      if (await page.locator('#start').isVisible()) await page.locator('#start').click();
      await page.waitForFunction(() => !window.__gunsOnlyRC.snapshot().paused);
      const gpu = await page.evaluate(() => {
        const gl = document.querySelector('#view').getContext('webgl2');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      });
      if (/swiftshader|llvmpipe/i.test(gpu)) throw new Error(`hardware GPU required, got ${gpu}`);
      const views = [];
      for (const m of MOMENTS) {
        for (const k of m.keys) await page.keyboard.down(k);
        await page.waitForTimeout(m.ms);
        for (const k of m.keys) await page.keyboard.up(k);
        const shot = `${track}-${m.name}.png`;
        await page.screenshot({ path: path.join(out, shot) });
        const pose = await page.evaluate(() => {
          const api = window.__gunsOnlyRC;
          const s = api.snapshot();
          return { camera: api.camera?.() ?? null, car: { x: s.x, y: s.y, z: s.z, yaw: s.yaw, speed: s.speed } };
        });
        if (!pose.camera) throw new Error('this build has no __gunsOnlyRC.camera(); use a build with the parity hook');
        views.push({ name: m.name, screenshot: shot, ...pose });
      }
      fs.writeFileSync(path.join(out, `${track}.json`), JSON.stringify({
        track, gpu, viewport: [1280, 800], capturedAt: new Date().toISOString(),
        // three.js convention: metres, +Y up, right-handed, camera looks down its local -Z.
        frame: 'three-yup-rh-m', district: await districtPlacement(track), views,
      }, null, 2));
      console.log(`${track}: ${views.length} views -> ${path.join(out, track + '.json')}`);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise((r) => srv.close(r));
  }
})().catch((e) => { console.error(e); process.exit(1); });
