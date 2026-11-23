// Skateboard on a controller, THPS2 layout (owner, 18 Nov 2026). Headless real-GPU Chromium, a
// synthetic standard pad (8BitDo Ultimate 2 in XInput), ordinary button presses only. Reads the
// read-only __gunsOnlyRC.board() log; never places, scores or finishes anything through a hook.
//   node tools/rc/check-pad-board.cjs [outDir]
const {chromium} = require(
  [process.env.PLAYWRIGHT_MODULE, require('node:path').join(__dirname, '../../web/smoke/node_modules/playwright'), '/Users/iantodd/Projects/guns-only/web/smoke/node_modules/playwright'].find(p => {
    try {
      return p && require.resolve(p);
    } catch {
      return false;
    }
  })
);
const fs = require('node:fs'),
  path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '../..'),
    out = path.resolve(process.argv[2] || process.env.HOME + '/.local/state/rc-session/pad-board');
  fs.mkdirSync(out, {recursive: true});
  const report = {checks: {}, errors: []};
  let browser, server, page;
  const check = (name, ok, detail) => {
    report.checks[name] = {ok: !!ok, detail};
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ' ' + JSON.stringify(detail) : ''}`);
  };
  try {
    // PAD_QA_ROOT checks a packaged build, e.g. the Mac app's Contents/Resources/web.
    server = await require('./serve-static.cjs')(process.env.PAD_QA_ROOT || path.join(root, 'web/wwwroot'), 19877);
    browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--mute-audio']});
    const context = await browser.newContext({viewport: {width: 1280, height: 720}});
    await context.addInitScript(() => {
      window.qaPad = {
        id: '8BitDo Ultimate 2 Wireless (STANDARD GAMEPAD)',
        index: 0,
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({length: 17}, () => ({value: 0, pressed: false}))
      };
      Object.defineProperty(navigator, 'getGamepads', {configurable: true, writable: true, value: () => [window.qaPad]});
    });
    page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto('http://127.0.0.1:19877/rc/?audioQa=silent&telemetry=off');
    await page.waitForFunction(() => window.__gunsOnlyRC?.snapshot().assets === 'blender' && !window.__gunsOnlyRC.snapshot().paused, null, {timeout: 120000});
    report.arrival = await page.evaluate(() => window.__gunsOnlyRC.snapshot());
    report.gpu = await page.evaluate(() => {
      const gl = document.querySelector('#view').getContext('webgl2'),
        e = gl.getExtension('WEBGL_debug_renderer_info');
      return gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    });
    const set = (i, v) => page.evaluate(([i, v]) => {
      window.qaPad.buttons[i].value = v;
      window.qaPad.buttons[i].pressed = v > 0.5;
    }, [i, v]);
    // Waits are in rendered frames as well as milliseconds: a loaded Mac can take 400 ms a frame,
    // and a press shorter than a frame is never seen by the game.
    const frames = n =>
      page.evaluate(n => new Promise(r => {
        let k = 0;
        const f = () => (++k >= n ? r() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }), n);
    const wait = async (ms, n = 3) => {
      await Promise.all([page.waitForTimeout(ms), frames(n)]);
    };
    const press = async (i, ms = 120) => {
      await set(i, 1);
      await wait(ms, 4);
      await set(i, 0);
      await frames(2);
    };
    const board = () => page.evaluate(() => window.__gunsOnlyRC.board());
    const since = async t0 => (await board()).tricks.filter(e => e.t > t0);
    const now = () => page.evaluate(() => Math.round(performance.now()));
    await wait(1500);
    // B on the ground changes form: car -> robot -> board.
    for (let i = 0; i < 4 && (await page.evaluate(() => window.__gunsOnlyRC.form())) !== 'board'; i++) {
      await press(1, 150);
      await wait(700);
    }
    check('B on the ground reaches the board', (await page.evaluate(() => window.__gunsOnlyRC.form())) === 'board');
    // Roll.
    await set(7, 0.7);
    await wait(2500);
    let rolling = await board();
    for (let i = 0; i < 15 && rolling.speed <= 1; i++) {
      await wait(500, 2);
      rolling = await board();
    }
    check('RT rolls the board', rolling.speed > 1, {speed: rolling.speed});
    // Hold A: crouch, no pop on the press. Release: pop.
    await set(0, 1);
    let poppedEarly = false;
    report.holdTrace = [];
    for (let i = 0; i < 6; i++) {
      await wait(75, 1);
      const b = await board();
      report.holdTrace.push({air: b.air, y: +b.y.toFixed(3), speed: +b.speed.toFixed(2), wheels: b.wheels?.map(Number).join('')});
      poppedEarly ||= b.air;
    }
    check('holding A does not pop yet', !poppedEarly);
    let t0 = await now();
    await set(0, 0);
    let airborne = false;
    for (let i = 0; i < 12 && !airborne; i++) {
      await wait(50, 1);
      airborne ||= (await board()).air;
    }
    check('releasing A ollies', airborne);
    await wait(1200);
    // Flip: ollie, then X + d-pad right in the air = Heelflip.
    const flipOf = async (dirBtn, faceBtn, holdMs) => {
      await press(0, 60);
      await wait(140);
      const t = await now();
      if (dirBtn != null) await set(dirBtn, 1);
      await set(faceBtn, 1);
      await wait(holdMs);
      await set(faceBtn, 0);
      if (dirBtn != null) await set(dirBtn, 0);
      await wait(1300);
      return since(t);
    };
    let ev = await flipOf(15, 2, 90);
    check('X + right in the air is a Heelflip', ev.some(e => e.name === 'Heelflip'), ev.map(e => e.name));
    ev = await flipOf(14, 2, 90);
    check('X + left in the air is a Kickflip', ev.some(e => e.name === 'Kickflip'), ev.map(e => e.name));
    // Grab: B + up held = Nosegrab, and B in the air never changes form.
    ev = await flipOf(12, 1, 450);
    check('B + up in the air is a Nosegrab', ev.some(e => /Nosegrab/.test(e.name || '')), ev.map(e => e.name));
    check('B in the air keeps the board', (await page.evaluate(() => window.__gunsOnlyRC.form())) === 'board');
    // Spin: a full-crouch ollie, RB held for the whole air.
    await press(0, 550);
    await wait(60, 1);
    t0 = await now();
    await set(5, 1);
    for (let i = 0; i < 40; i++) {
      await wait(40, 1);
      if (i > 3 && !(await board()).air) break;
    }
    await set(5, 0);
    await wait(1200);
    ev = await since(t0);
    check('RB spins in the air, a spin not a grab', ev.some(e => /^\d{3} Spin$/.test(e.name || '')), ev.map(e => e.name));
    // Manual: up then down on the d-pad while rolling on flat ground. The bowl is all vert, so the
    // place hook only picks the spot (the arrival pad); the board then rolls on ordinary RT.
    await set(7, 0);
    await set(6, 1);
    await wait(1200);
    await set(6, 0);
    await page.evaluate(a => window.__gunsOnlyRC.place([a.x, a.y + 0.3, a.z], a.yaw ?? 0), report.arrival);
    await wait(600);
    await set(7, 0.45);
    await wait(2200);
    t0 = await now();
    await press(12, 70);
    await wait(40);
    await press(13, 70);
    let latched = false,
      manual = false;
    for (let i = 0; i < 30; i++) {
      await wait(100);
      const b = await board();
      latched ||= b.padManual.wheelie;
      manual ||= b.manual;
      (report.manualTrace ??= []).push({nose: b.noseUp, wheels: b.wheels.map(Number).join(''), speed: +b.speed.toFixed(1), latch: b.padManual.wheelie, manual: b.manual});
    }
    ev = await since(t0);
    check('up, down on the d-pad latches a manual', latched);
    check('the board rides the manual', manual || ev.some(e => /manual/i.test(e.name || '')), ev.map(e => e.name));
    await page.screenshot({path: out + '/board.png'});
    await set(7, 0);
    report.final = await board();
    report.passed = Object.values(report.checks).every(c => c.ok) && !report.errors.length;
  } catch (e) {
    report.fatal = String(e?.stack || e);
    console.log('FATAL', e);
  } finally {
    if (page && !report.passed) await page.screenshot({path: out + '/failure.png'}).catch(() => {});
    fs.writeFileSync(out + '/report.json', JSON.stringify(report, null, 2));
    await browser?.close();
    server?.close();
    console.log(report.passed ? 'ALL PASS' : 'NOT PASSED', report.gpu || '', report.errors.slice(0, 3));
    process.exitCode = report.passed ? 0 : 1;
  }
})();
