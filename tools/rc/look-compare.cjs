// Look experiment: today's hub vs ?look=pixel, same spots, headless real GPU at 1920x1080 (the TV).
// Screenshots plus draw calls, triangles and frame times for each. Never a visible window.
//   node tools/rc/look-compare.cjs [outDir]
const path = require('node:path'),
  fs = require('node:fs');
const {chromium} = require(
  [process.env.PLAYWRIGHT_MODULE, path.join(__dirname, '../../web/smoke/node_modules/playwright'), '/Users/iantodd/Projects/guns-only/web/smoke/node_modules/playwright'].find(p => {
    try {
      return p && require.resolve(p);
    } catch {
      return false;
    }
  })
);
(async () => {
  const root = path.resolve(__dirname, '../..'),
    out = path.resolve(process.argv[2] || process.env.HOME + '/.local/state/rc-session/look-compare');
  fs.mkdirSync(out, {recursive: true});
  const server = await require('./serve-static.cjs')(path.join(root, 'web/wwwroot'), 19881);
  const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--mute-audio']});
  const report = {};
  try {
    for (const look of (process.env.LOOKS || 'classic,pixar').split(',')) {
      const context = await browser.newContext({viewport: {width: 1920, height: 1080}});
      await context.addInitScript(() => {
        window.qaPad = {id: 'qa', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, () => ({value: 0, pressed: false}))};
        Object.defineProperty(navigator, 'getGamepads', {configurable: true, writable: true, value: () => [window.qaPad]});
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:19881/rc/?audioQa=silent&telemetry=off${look === 'pixar' ? '' : '&look=' + look}`);
      await page.waitForFunction(() => window.__gunsOnlyRC?.snapshot().assets === 'blender' && !window.__gunsOnlyRC.snapshot().paused, null, {timeout: 120000});
      await page.waitForTimeout(3000);
      await page.screenshot({path: `${out}/${look}-start.png`});
      const set = (i, v) => page.evaluate(([i, v]) => ((window.qaPad.buttons[i].value = v), (window.qaPad.buttons[i].pressed = v > 0.5)), [i, v]);
      await set(7, 0.6);
      await page.waitForTimeout(2500);
      await page.screenshot({path: `${out}/${look}-drive.png`});
      await page.waitForTimeout(4000);
      await set(7, 0);
      const frames = await page.evaluate(() => window.__gunsOnlyRC.frames());
      const shadow = await page.evaluate(() => window.__gunsOnlyRC.board?.().shadow);
      const gpu = await page.evaluate(() => {
        const gl = document.querySelector('#view').getContext('webgl2'),
          e = gl.getExtension('WEBGL_debug_renderer_info');
        return gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      });
      report[look] = {frames, shadow, gpu, canvas: await page.evaluate(() => [document.querySelector('#view').width, document.querySelector('#view').height])};
      console.log(look, JSON.stringify(report[look]));
      await context.close();
    }
  } finally {
    fs.writeFileSync(out + '/report.json', JSON.stringify(report, null, 2));
    await browser.close();
    server.close();
  }
})();
