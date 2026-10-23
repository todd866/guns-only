// Real controller trip through both portal mouths in one document. The only seeded state is
// expedition progress, which makes the lab mouth available; movement and portal transitions are
// still performed by the packaged game loop.
const { chromium } = require('../../web/smoke/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(process.env.RC_QA_ROOT || '.rc-build-review');
const out = path.resolve(process.argv[2] || 'evidence/rc-open-world/portal-trip');
const base = process.argv[3] || 'http://rc.test';
const report = { base, packageRoot: root, errors: [], documents: 0, legs: [] };
const save = () => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'portal-trip.json'), JSON.stringify(report, null, 2)); };
const progress = { discovered: ['gate','housing','bx','school','ramp','hangars','runway','wic','dirt','golf','zoo','rec','diamond','boneyard','waterpark','lab'], specimens: ['gate','housing','bx','school','ramp','hangars','runway','wic','dirt','golf','zoo','rec','diamond','boneyard','waterpark'], wins: {}, raceWins: {}, body: 'buggy', shell: 'viper', paint: '#ed9145', bowlingBest: 0, golfBest: null };

(async () => {
  let browser, page;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(value => {
      localStorage.setItem('guns-only.rc.world.v1', JSON.stringify(value));
      window.__portalPad = { connected: true, mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 10 }, () => ({ value: 0, pressed: false })) };
      Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__portalPad] });
    }, progress);
    await context.route('http://rc.test/**', async route => {
      const u = new URL(route.request().url()), file = path.resolve(root, '.' + decodeURIComponent(u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const type = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
    });
    page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) report.documents++; });
    await page.goto(`${base}/rc/?track=hub&at=lab&audioQa=silent&telemetry=off&rivals=0`);
    await page.waitForFunction(() => window.__gunsOnlyRC?.snapshot().assets === 'blender', null, { timeout: 90000 });
    report.gpu = await page.evaluate(() => { const gl = document.querySelector('#view').getContext('webgl2'), e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER); });
    assert.ok(!/swiftshader|llvmpipe/i.test(report.gpu), `Hardware renderer required: ${report.gpu}`);
    await page.locator('#start').click();
    await page.evaluate(() => {
      const p = window.__portalPad, state = window.__portalTrip = { legs: [], transitions: [], last: null, distance: 0, maxStep: 0, ordinaryMaxStep: 0, target: [2530, -1200], region: 'base' };
      function tick() {
        const s = window.__gunsOnlyRC.snapshot(), region = s.x > 9000 ? 'alien' : 'base';
        if (region !== state.region) { state.transitions.push({ from: state.region, to: region, state: s }); state.legs.push({ region, state: s }); state.region = region; }
        state.target = region === 'base' ? [2530, -1200] : [10000, 200];
        const t = state.target, dx = t[0] - s.x, dz = t[1] - s.z, want = Math.atan2(dx, -dz), err = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw));
        if (state.last) { const d = Math.hypot(s.x - state.last.x, s.z - state.last.z); state.distance += d; state.maxStep = Math.max(state.maxStep, d); if (d < 25) state.ordinaryMaxStep = Math.max(state.ordinaryMaxStep, d); }
        state.last = { x: s.x, z: s.z, recoveries: s.recoveries };
        p.axes[0] = Math.max(-1, Math.min(1, err * 1.7)); p.buttons[6].value = 0; p.buttons[1].value = 0;
        const v = s.forwardSpeed, vmax = Math.min(8, Math.max(1, Math.hypot(dx, dz) * .4)); p.buttons[7].value = Math.max(0, Math.min(.72, .12 + (vmax - v) * .12));
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    await page.waitForFunction(() => window.__portalTrip?.transitions.length >= 1, null, { timeout: 120000 });
    await page.screenshot({ path: path.join(out, 'alien-side.png') });
    await page.waitForFunction(() => window.__portalTrip?.transitions.length >= 2, null, { timeout: 120000 });
    await page.waitForTimeout(2500);
    report.finish = await page.evaluate(() => ({ state: window.__gunsOnlyRC.snapshot(), trip: window.__portalTrip }));
    await page.screenshot({ path: path.join(out, 'portal-return.png') });
    assert.equal(report.documents, 1, 'Portal trip must stay in one document');
    assert.equal(report.finish.state.world.ready, true, 'World stream ready after return');
    assert.ok(report.finish.state.x > 2000 && report.finish.state.x < 3000, `Returned to base: ${report.finish.state.x}`);
    assert.deepEqual(report.finish.trip.transitions.map(t => [t.from, t.to]), [['base', 'alien'], ['alien', 'base']], 'Both portal directions completed');
    assert.equal(report.finish.state.recoveries, 0, 'Portal trip must not use rescue recovery');
    assert.ok(report.finish.state.world.specimens.length === 15, 'Seeded expedition progress preserved');
    assert.ok(report.finish.trip.distance > 20 && report.finish.trip.ordinaryMaxStep < 25, 'Controller movement stayed continuous between portal jumps');
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } catch (error) { report.failure = error.stack; if (page) { report.stateOnFailure = await page.evaluate(() => ({ state: window.__gunsOnlyRC?.snapshot(), trip: window.__portalTrip })).catch(() => null); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); } process.exitCode = 1; console.error(error); }
  finally { save(); await browser?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
