// RC visual-regression gate: fixed-view captures + perceptual diff against committed reference stills.
//   node tools/rc/look-gate.cjs capture <outdir> [view...] [--allow-software]
//   node tools/rc/look-gate.cjs compare <outdir> [--ref evidence/rc-look-ref] [--mode warn|fail]
//   node tools/rc/look-gate.cjs bless   <outdir> [--ref evidence/rc-look-ref]
// Run captures through: HEAVY_SLOT_LABEL=rc-look-gate heavy-slot -- node tools/rc/look-gate.cjs capture ...
// Camera: window.__gunsOnlyRC.place(pos,yaw) teleports the car, the chase rig supplies the camera
// (see docs/rc-look-gate.md). Perceptual functions are reused from tools/look-gate/features.mjs.
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const VIEWS_FILE = path.join(__dirname, 'look-views.json');
const THRESH_FILE = path.join(__dirname, 'look-thresholds.json');
const DEFAULT_REF = path.join(ROOT, 'evidence/rc-look-ref');
const SOFTWARE = /swiftshader|llvmpipe|software/i;

async function loadFeatures() {
  try { return await import(path.join(ROOT, 'tools/look-gate/features.mjs')); }
  catch (e) {
    if (/pngjs/.test(String(e.message))) throw Error('pngjs missing: run `npm ci --prefix tools/look-gate` (or symlink the main checkout\'s tools/look-gate/node_modules)');
    throw e;
  }
}

// Mean absolute sRGB difference (0-255) of two RGBA images already downsampled to the same size.
function pixelMad(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw Error(`size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  let sum = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 4) { sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); n += 3; }
  return n ? sum / n : 0;
}

// Distances between two PNG buffers: palette, structure, 64x40 pixel MAD, and edge-energy ratio.
async function diffBuffers(bufA, bufB) {
  const F = await loadFeatures();
  const fa = F.extractFeaturesFromBuffer(bufA), fb = F.extractFeaturesFromBuffer(bufB);
  const small = buf => F.downsampleRgba(F.decodePng(buf), 64);
  return {
    palette: F.paletteDistance(fa, fb),
    structure: F.structureDistance(fa, fb),
    pixelMad: pixelMad(small(bufA), small(bufB)),
    edgeRatio: (fa.groundEdgeEnergy + 1e-9) / (fb.groundEdgeEnergy + 1e-9),
  };
}

function thresholdsFor(th, view) { return { ...th.default, ...(th.views?.[view] || {}) }; }

// Returns the list of exceeded limits (empty = pass).
function judge(d, t) {
  const issues = [];
  if (d.palette > t.maxPalette) issues.push(`palette ${d.palette.toFixed(3)} > ${t.maxPalette}`);
  if (d.structure > t.maxStructure) issues.push(`structure ${d.structure.toFixed(3)} > ${t.maxStructure}`);
  if (d.pixelMad > t.maxPixelMad) issues.push(`pixelMad ${d.pixelMad.toFixed(2)} > ${t.maxPixelMad}`);
  if (d.edgeRatio < t.edgeRatio[0] || d.edgeRatio > t.edgeRatio[1]) issues.push(`edgeRatio ${d.edgeRatio.toFixed(2)} outside [${t.edgeRatio}]`);
  return issues;
}

function parse(argv) {
  const o = { pos: [], ref: DEFAULT_REF, allowSoftware: false, mode: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ref') o.ref = path.resolve(argv[++i]);
    else if (argv[i] === '--mode') o.mode = argv[++i];
    else if (argv[i] === '--allow-software') o.allowSoftware = true;
    else o.pos.push(argv[i]);
  }
  return o;
}

function pct(s, q) { return s[Math.min(s.length - 1, Math.floor(s.length * q))]; }

async function capture(outdir, names, allowSoftware) {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || [path.join(ROOT, 'web/smoke/node_modules/playwright'), path.join(ROOT, '../../web/smoke/node_modules/playwright')].find(p => fs.existsSync(p)));
  const cfg = JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8'));
  const list = names.length ? names : Object.keys(cfg.views);
  for (const n of list) if (!cfg.views[n]) throw Error(`unknown view ${n}; have ${Object.keys(cfg.views).join(', ')}`);
  fs.mkdirSync(outdir, { recursive: true });
  const port = 8900 + (process.pid % 90);
  const srv = await require('./serve-static.cjs')(path.join(ROOT, 'web/wwwroot'), port);
  const meta = { capturedAt: new Date().toISOString(), viewport: cfg.viewport, gpu: null, views: {} };
  let b;
  try {
    b = await chromium.launch({ headless: true, channel: 'chromium', executablePath: process.env.CHROMIUM_PATH, args: ['--mute-audio'] });
    for (const name of list) {
      const v = cfg.views[name], errs = [];
      const p = await b.newPage({ viewport: cfg.viewport, deviceScaleFactor: 1 });
      p.on('pageerror', e => errs.push(e.message));
      try {
        await p.goto(`http://127.0.0.1:${port}/rc/?${v.query}&audioQa=silent&telemetry=off`);
        await p.waitForFunction(() => window.__gunsOnlyRC?.snapshot().assets === 'blender', null, { timeout: 90000 });
        if (await p.locator('#start').isVisible()) await p.locator('#start').click();
        await p.waitForFunction(() => !window.__gunsOnlyRC.snapshot().paused, null, { timeout: 30000 });
        const gpu = await p.evaluate(() => { const gl = document.querySelector('#view').getContext('webgl2'), e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER); });
        if (SOFTWARE.test(gpu) && !allowSoftware) throw Error('software renderer (' + gpu + '); pass --allow-software to override');
        meta.gpu = gpu;
        // Teleport: snap y to the ground by raycasting down, then let the chase camera converge.
        await p.evaluate(({ pos, yaw }) => {
          const R = window.__gunsOnlyRC, hit = R.collision().raycast([pos[0], 400, pos[2]], [0, -1, 0], 800);
          const y = hit ? 400 - hit.dist + 0.5 : pos[1] + 0.5;
          R.place([pos[0], y, pos[2]], yaw);
        }, v);
        await p.waitForFunction(() => { const s = window.__gunsOnlyRC.snapshot(); return !s.world || s.world.ready; }, null, { timeout: 90000 });
        const settled = await p.evaluate(() => new Promise(res => {
          const R = window.__gunsOnlyRC; let last = R.camera().pos, calm = 0, n = 0;
          const f = () => { const c = R.camera().pos, d = Math.hypot(c[0] - last[0], c[1] - last[1], c[2] - last[2]); last = c; calm = d < 0.002 ? calm + 1 : 0; n++; if (calm >= 20 || n > 600) res({ frames: n, calm }); else requestAnimationFrame(f); };
          requestAnimationFrame(f);
        }));
        // Ground detail (pebbles, cracks, scatter) streams in cell by cell after a teleport: let its queue drain.
        await p.waitForFunction(() => { const n = window.__gunsOnlyRC.nearDetail?.(); return !n || n.queued === 0; }, null, { timeout: 60000 });
        await p.evaluate(() => document.querySelector('#pause').click());
        await p.waitForFunction(() => window.__gunsOnlyRC.snapshot().paused);
        // Pause menu and HUD are not part of the world look: hide everything but the canvas.
        await p.evaluate(() => { const cv = document.querySelector('#view'); document.querySelectorAll('body *').forEach(el => { if (el !== cv && !el.contains(cv)) { el.dataset.lgVis = el.style.visibility; el.style.setProperty('visibility', 'hidden', 'important'); } }); });
        await p.waitForTimeout(400);
        // Paused, the frame must stop changing: re-shoot until two consecutive stills agree (late tiles/textures).
        const F = await loadFeatures(), shot = async () => F.downsampleRgba(F.decodePng(await p.screenshot()), 160);
        let prev = await shot(), stableTries = 0;
        for (; stableTries < 20; stableTries++) { await p.waitForTimeout(700); const cur = await shot(); const d = pixelMad(prev, cur); prev = cur; if (d < 0.05) break; }
        const cam = await p.evaluate(() => window.__gunsOnlyRC.camera());
        await p.screenshot({ path: path.join(outdir, name + '.png') });
        // Frame statistics need a live sim: resume, sample 300 rAF intervals.
        await p.evaluate(() => { document.querySelectorAll('[data-lg-vis]').forEach(el => { el.style.removeProperty('visibility'); if (el.dataset.lgVis) el.style.visibility = el.dataset.lgVis; delete el.dataset.lgVis; }); });
        await p.evaluate(() => document.querySelector('#pause').click());
        await p.waitForFunction(() => !window.__gunsOnlyRC.snapshot().paused);
        const ft = await p.evaluate(() => new Promise(r => { const s = []; let last = performance.now(); const f = now => { s.push(now - last); last = now; if (s.length < 301) requestAnimationFrame(f); else r(s.slice(1)); }; requestAnimationFrame(f); }));
        ft.sort((a, c) => a - c);
        meta.views[name] = {
          camera: { pos: cam.pos.map(x => +x.toFixed(2)), yaw: +cam.yaw.toFixed(3), pitch: +cam.pitch.toFixed(3), fov: cam.fov }, settled, stableTries,
          frameMs: { samples: ft.length, p50: +pct(ft, .5).toFixed(2), p95: +pct(ft, .95).toFixed(2), p99: +pct(ft, .99).toFixed(2), max: +ft[ft.length - 1].toFixed(2) },
          drawCalls: await p.evaluate(() => window.__gunsOnlyRC.renderer().calls),
          pixelRatio: await p.evaluate(() => devicePixelRatio), errors: errs,
        };
        console.log(name.padEnd(18), JSON.stringify({ p50: meta.views[name].frameMs.p50, p95: meta.views[name].frameMs.p95, calls: meta.views[name].drawCalls, errors: errs.length }));
      } finally { await p.close(); }
    }
  } finally { await b?.close(); srv.close(); }
  fs.writeFileSync(path.join(outdir, 'capture.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log('gpu:', meta.gpu, '->', outdir);
}

async function compare(outdir, refdir, modeOverride) {
  const th = JSON.parse(fs.readFileSync(THRESH_FILE, 'utf8')), mode = modeOverride || th.mode || 'warn';
  const names = fs.readdirSync(outdir).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort();
  if (!names.length) throw Error('no PNGs in ' + outdir);
  const rows = []; let failing = 0, missing = 0;
  for (const n of names) {
    const rp = path.join(refdir, n + '.png');
    if (!fs.existsSync(rp)) { rows.push({ n, status: 'NO-REF' }); missing++; continue; }
    const d = await diffBuffers(fs.readFileSync(path.join(outdir, n + '.png')), fs.readFileSync(rp));
    const issues = judge(d, thresholdsFor(th, n));
    if (issues.length) failing++;
    rows.push({ n, d, issues, status: issues.length ? (mode === 'fail' ? 'FAIL' : 'WARN') : 'ok' });
  }
  console.log(`${'view'.padEnd(18)} ${'palette'.padStart(8)} ${'struct'.padStart(8)} ${'pixMAD'.padStart(8)} ${'edgeR'.padStart(7)}  status`);
  for (const r of rows) console.log(r.d ? `${r.n.padEnd(18)} ${r.d.palette.toFixed(3).padStart(8)} ${r.d.structure.toFixed(3).padStart(8)} ${r.d.pixelMad.toFixed(2).padStart(8)} ${r.d.edgeRatio.toFixed(2).padStart(7)}  ${r.status}${r.issues.length ? '  ' + r.issues.join('; ') : ''}` : `${r.n.padEnd(18)} ${'-'.padStart(8)} ${'-'.padStart(8)} ${'-'.padStart(8)} ${'-'.padStart(7)}  ${r.status}`);
  console.log(`mode=${mode} exceeded=${failing} missing-ref=${missing}`);
  return rows.length && (failing || missing) && mode === 'fail' ? 1 : 0;
}

// Overwrites the reference stills in place; a view dropped from look-views.json leaves its old still
// behind (move it to the Trash by hand) and is reported here.
function bless(outdir, refdir) {
  const pngs = fs.readdirSync(outdir).filter(f => f.endsWith('.png'));
  if (!pngs.length || !fs.existsSync(path.join(outdir, 'capture.json'))) throw Error('outdir needs PNGs and capture.json');
  fs.mkdirSync(refdir, { recursive: true });
  const stale = fs.readdirSync(refdir).filter(f => f.endsWith('.png') && !pngs.includes(f));
  for (const f of [...pngs, 'capture.json']) fs.copyFileSync(path.join(outdir, f), path.join(refdir, f));
  console.log(`blessed ${pngs.length} stills -> ${refdir}`);
  if (stale.length) console.log('note: stale reference stills not in this capture: ' + stale.join(', '));
}

module.exports = { pixelMad, diffBuffers, judge, thresholdsFor };

if (require.main === module) {
  const [cmd, outdir, ...rest] = process.argv.slice(2), o = parse(rest);
  (async () => {
    if (!cmd || !outdir) throw Error('usage: look-gate.cjs capture|compare|bless <outdir> [...]');
    if (cmd === 'capture') await capture(path.resolve(outdir), o.pos, o.allowSoftware);
    else if (cmd === 'compare') process.exitCode = await compare(path.resolve(outdir), o.ref, o.mode);
    else if (cmd === 'bless') bless(path.resolve(outdir), o.ref);
    else throw Error('unknown command ' + cmd);
  })().catch(e => { console.error(e.message || e); process.exitCode = 2; });
}
