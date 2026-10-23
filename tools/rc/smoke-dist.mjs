// RC deploy gate, browser half: boot the PACKAGED site (what ships) headless and play a moment of
// every track and Furball; check the start action fits a phone held sideways. Exit 1 on failure.
//   node tools/rc/smoke-dist.mjs DIST_DIR [BASE_URL]   (BASE_URL: smoke a live site instead)
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(ROOT, 'web/smoke/node_modules/playwright'));
const serve = require('./serve-static.cjs');
const [dist, live] = process.argv.slice(2);
const srv = live ? null : await serve(path.resolve(dist), 0);
const base = live ?? `http://127.0.0.1:${srv.address().port}`;
let browser, failed = 0;
const say = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
try {
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ready = p => p.waitForFunction(() => window.__gunsOnlyRC?.snapshot().assets === 'blender' && !document.querySelector('#start').disabled, null, { timeout: 90000 });
  const drive = async (p, minimumTravel) => {
    await p.keyboard.down('KeyW');
    try {
      await p.waitForFunction(min => { const s=window.__gunsOnlyRC.snapshot();return Number.isFinite(s.speed)&&s.speed>.1&&s.travel>min; }, minimumTravel, {timeout:15000});
    } finally { await p.keyboard.up('KeyW'); }
  };
  // The hub is the shipped default: prove it boots as a connected world before
  // exercising the individual race and furball entry points.
  {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      await p.goto(`${base}/rc/?audioQa=silent&gfx=classic&telemetry=off`); await ready(p);
      const boot = await p.evaluate(() => window.__gunsOnlyRC.snapshot());
      say(errors.length === 0 && boot.track === 'hub' && boot.world?.ready === true, `Default hub: ${boot.world?.event ?? 'unavailable'}${errors.length ? ' errors: ' + errors.join(' | ') : ''}`);
      await p.locator('#start').click(); await drive(p, .1);
      const moving = await p.evaluate(() => window.__gunsOnlyRC.snapshot());
      say(Number.isFinite(moving.speed) && moving.speed > 0.1 && moving.travel > 0.1, `Default hub moving: ${Number(moving.travel).toFixed(2)}m at ${Number(moving.speed).toFixed(2)}m/s`);
    } catch (e) { say(false, `Default hub: ${e.message.split('\n')[0]}`); } finally { await p.close(); }
  }
  for (const [label, query, button] of [['Liberty Loop', 'track=housing', '#start'], ['The BX', 'track=bx', '#start'], ['The School', 'track=school', '#start'], ['Race', 'track=housing', '#menu-race'], ['Furball', 'track=housing', '#menu-furball']]) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      await p.goto(`${base}/rc/?${query}&audioQa=silent&gfx=classic&telemetry=off`); await ready(p);
      await p.locator(button).click();
      if(button==='#start')await drive(p,.01);
      else await p.waitForTimeout(2500);
      const moving = await p.evaluate(() => window.__gunsOnlyRC.snapshot());
      const gate = await p.locator('#gate').innerText();
      const moved = button === '#start' ? Number.isFinite(moving.speed) && moving.speed > 0.1 && moving.travel > 0.01 : true;
      say(errors.length === 0 && gate.length > 0 && moved, `${label}: ${gate} (${Number(moving.travel).toFixed(2)}m, ${Number(moving.speed).toFixed(2)}m/s)${errors.length ? ' errors: ' + errors.join(' | ') : ''}`);
    } catch (e) { say(false, `${label}: ${e.message.split('\n')[0]}`); } finally { await p.close(); }
  }
  for (const [w, h] of [[844, 390], [667, 375]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    try {
      await p.goto(`${base}/rc/?audioQa=silent&gfx=classic&telemetry=off`); await ready(p);
      const box = await p.locator('#start').boundingBox();
      say(box && box.y >= 0 && box.y + box.height <= h, `phone ${w}x${h}: Drive button on screen`);
    } catch (e) { say(false, `phone ${w}x${h}: ${e.message.split('\n')[0]}`); } finally { await p.close(); }
  }
} finally { await browser?.close(); srv?.close(); }
console.log(failed ? `smoke-dist: ${failed} failed` : 'smoke-dist: all passed'); process.exit(failed ? 1 : 0);
