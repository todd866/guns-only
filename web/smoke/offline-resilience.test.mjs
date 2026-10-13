import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
const browserType = process.env.OFFLINE_BROWSER === 'webkit' ? webkit : chromium;

test('real worker: stalled online, offline, body failure, upgrade and durable incident journal', { timeout: 90000 }, async () => {
  const source = await readFile(new URL('../wwwroot/service-worker.js', import.meta.url), 'utf8');
  // Exercise actual handlers with a shorter clock, not a replacement implementation.
  assert.match(source, /NETWORK_DEADLINE_MS = 8_000/);
  const initialBuild = '100';
  const nextBuild = '101';
  let build = initialBuild;
  let serverOffline = false;
  const modes = new Map();
  const requests = new Map();
  const sockets = new Set();
  const files = new Map([
    ['/index.html', '<!doctype html><title>Offline fixture</title><p>saved shell</p>'],
    ['/app.js', 'globalThis.fixture = true;'],
    ['/content/page.terrain', 'complete terrain bundle'],
  ]);
  const server = http.createServer((req, res) => {
    if (serverOffline) { req.socket.destroy(); return; }
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    if (process.env.OFFLINE_DEBUG) console.log('request', req.url);
    requests.set(pathname, (requests.get(pathname) ?? 0) + 1);
    const mode = modes.get(pathname);
    if (mode === 'headers') return;
    if (mode === 'body') { res.writeHead(200, { 'content-type': 'text/html' }); res.write('partial'); return; }
    if (mode === '503') { res.writeHead(503); res.end('unavailable'); return; }
    if (pathname === '/service-worker.js') {
      res.setHeader('content-type', 'application/javascript');
      res.setHeader('cache-control', 'no-store');
      let worker = source.replaceAll('__RELEASE_BUILD__', build).replace('NETWORK_DEADLINE_MS = 8_000', 'NETWORK_DEADLINE_MS = 250');
      if (process.env.OFFLINE_DEBUG) worker = worker.replace('await diagnostic("install-failed", MANIFEST_URL);', 'await fetch("/debug?error=" + encodeURIComponent(String(error))); await diagnostic("install-failed", MANIFEST_URL);');
      res.end(worker);
    } else if (pathname === '/offline-manifest.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ build, assets: [...files].map(([url, body]) => ({ url,
        size: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex'),
        core: !url.endsWith('.terrain'),
      })) }));
    } else {
      const body = files.get(pathname === '/' ? '/index.html' : pathname);
      res.writeHead(body === undefined ? 404 : 200, { 'content-type': pathname.endsWith('.js') ? 'application/javascript' : 'text/html' });
      res.end(body ?? 'missing');
    }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  const profile = await mkdtemp(path.join(os.tmpdir(), 'guns-offline-'));
  let context;
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    // This host's WebKit persistent profiles silently lose even a minimal Cache.put.
    // Use its isolated context for engine behavior; Chromium covers true profile reopening.
    if (browserType === webkit) {
      browser = await webkit.launch({ headless: true });
      context = await browser.newContext();
    } else context = await browserType.launchPersistentContext(profile, { headless: true });
    // WebKit's emulated-offline mode bypasses even constant-response workers on this host.
    // A dead fixture socket tests real loss of transport without that automation defect.
    const setOffline = async value => { if (browser) serverOffline = value; else await context.setOffline(value); };
    let page = context.pages()[0] ?? await context.newPage();
    await page.goto(origin);
    await page.evaluate(async build => {
      await navigator.serviceWorker.register(`/service-worker.js?v=${build}`);
      const reg = await navigator.serviceWorker.getRegistration();
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('install timeout '+reg?.installing?.state)), 10000))]);
    }, initialBuild);
    console.log("initial worker installed");
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const fetchText = path => page.evaluate(async path => {
      const response = await fetch(path);
      return { status: response.status, text: await response.text(), online: navigator.onLine };
    }, path);
    // Navigation mode really goes through the navigation branch, including body consumption.
    for (const mode of ['headers', 'body', '503']) {
      modes.set('/', mode);
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 5000 });
      assert.match(await page.textContent('body'), /saved shell/);
      assert.equal(await page.evaluate(() => navigator.onLine), true);
    }
    console.log('navigation failure matrix passed');
    modes.delete('/');
    const terrain = await fetchText('/content/page.terrain');
    assert.equal(terrain.text, 'complete terrain bundle');
    await page.waitForFunction(async build => !!(await (await caches.open(`guns-only-${build}`)).match('/content/page.terrain')), initialBuild);
    modes.set('/content/page.terrain', 'headers');
    const before = requests.get('/content/page.terrain');
    assert.equal((await fetchText('/content/page.terrain')).text, terrain.text);
    assert.equal(requests.get('/content/page.terrain'), before, 'saved terrain must not wait for any network');
    await setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.match(await page.textContent('body'), /saved shell/);
    assert.equal((await fetchText(`/app.js?v=${initialBuild}`)).status, 200);
    await setOffline(false);

    console.log("offline assets passed");
    const diagnostics = () => page.evaluate(() => new Promise(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = event => { channel.port1.close(); resolve(event.data.incidents); };
      navigator.serviceWorker.controller.postMessage({ type: 'offline-diagnostics' }, [channel.port2]);
    }));
    let rows = await diagnostics();
    assert.ok(rows.some(row => row.type === 'network-timeout'));
    assert.ok(rows.some(row => row.type === 'http-error' && row.status === 503));
    assert.ok(rows.some(row => row.type === 'cache-fallback'));
    assert.ok(rows.every(row => !JSON.stringify(row).includes('http:')));
    const count = rows.length;
    if (!browser) {
      await context.close(); context = null;
      context = await browserType.launchPersistentContext(profile, { headless: true });
      page = context.pages()[0];
    }
    await setOffline(true);
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    rows = await diagnostics();
    assert.ok(rows.length >= count, 'incidents must survive closing and reopening the browser');
    await setOffline(false);

    // Failed replacement leaves the working worker and its saved shell intact.
    console.log(browser ? 'WebKit offline journal passed (persistent-profile host limitation)' : 'browser restart journal passed');
    build = nextBuild;
    files.set('/app.js', 'globalThis.fixture = "next";');
    files.set('/index.html', '<!doctype html><title>Next shell</title><p>new shell</p>');
    modes.set('/app.js', '503');
    await page.evaluate(async build => {
      const registration = await navigator.serviceWorker.register(`/service-worker.js?v=${build}`);
      const installing = registration.installing;
      if (installing && installing.state !== 'redundant') await new Promise(resolve => {
        installing.addEventListener('statechange', () => { if (installing.state === 'redundant') resolve(); });
      });
    }, nextBuild);
    assert.equal(new URL(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).searchParams.get('v'), initialBuild);
    assert.ok((await diagnostics()).some(row => row.type === 'install-failed'));
    await page.reload();
    assert.match(await page.textContent('body'), /saved shell/, 'fresh HTML must not replace the old shell before its runtime is ready');
    console.log('failed update preserves release');
    modes.delete('/app.js');
    await page.evaluate(async build => {
      const registration = await navigator.serviceWorker.register(`/service-worker.js?v=${build}`);
      await registration.update();
    }, nextBuild);
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed');
    assert.equal(new URL(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).searchParams.get('v'), initialBuild,
      'a prepared update must not take over an in-flight old client');
    await page.close();
    // No controlled documents remain; allow the browser's activation task to run.
    await new Promise(resolve => setTimeout(resolve, 250));
    page = await context.newPage();
    await page.goto(origin);
    await page.waitForFunction(build => navigator.serviceWorker.controller?.scriptURL.endsWith(`v=${build}`), nextBuild);
    await page.reload();
    assert.equal((await fetchText(`/app.js?v=${nextBuild}`)).text, 'globalThis.fixture = "next";');
    // Old terrain is reusable only after comparison with the new release's content digest.
    assert.equal((await fetchText('/content/page.terrain')).text, terrain.text);
    assert.ok((await page.evaluate(() => caches.keys())).includes(`guns-only-${initialBuild}`));
  } finally {
    await context?.close();
    await browser?.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
});
