import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Behavioural test of the real inline upgrade gate in every page (owner on Starlink, Build 379:
// a hard 30 s cap failed a slow upgrade with "Part of the simulator failed to load"). The gate
// script is extracted verbatim and run against a fake service worker and a fake clock.
const PAGES = [
  "../../../index.html",
  "../../../cobra-lab/index.html",
  "../../../indoor/index.html",
  "../../../medevac/index.html",
  "../../../okanagan/index.html",
  "../../../weekend-ride/index.html",
];

async function gateSource(page) {
  const html = await readFile(new URL(page, import.meta.url), "utf8");
  const start = html.lastIndexOf("<script>", html.indexOf("globalThis.__gunsPrebootReady = (async () =>"));
  const end = html.indexOf("</script>", start);
  assert.ok(start >= 0 && end > start, `${page} has an inline upgrade gate`);
  return html.slice(start + "<script>".length, end);
}

function worker(build) {
  return { scriptURL: `https://guns-only.com/service-worker.js?v=${build}` };
}

function harness({ installingFor = 0, waitingFor = 0, activateAt = Infinity } = {}) {
  let now = 0;
  const intervals = new Map();
  let nextId = 1;
  const listeners = new Map();
  const statusNode = { textContent: "" };
  const fresh = worker("__RELEASE_BUILD__");
  const handoffs = [];
  // The waiting replacement activates only when the page asks for it (skipWaiting on request).
  fresh.postMessage = (message) => {
    handoffs.push(message);
    if (message?.type === "guns-skip-waiting" && message.build === "__RELEASE_BUILD__")
      activateAt = Math.min(activateAt, now + 500);
  };
  const sw = {
    controller: worker("378"),
    async getRegistrations() { return [{ active: this.controller, waiting: null, installing: null }]; },
    async getRegistration() {
      if (now < installingFor) return { installing: fresh, waiting: null, active: this.controller };
      if (now < installingFor + waitingFor) return { installing: null, waiting: fresh, active: this.controller };
      return { installing: null, waiting: null, active: this.controller };
    },
    register: async () => ({}),
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const context = vm.createContext({
    URL,
    URLSearchParams,
    Error,
    Promise,
    console,
    location: { href: "https://guns-only.com/okanagan/", search: "", reload() {} },
    navigator: { serviceWorker: sw },
    addEventListener() {},
    removeEventListener() {},
    document: {
      getElementById: (id) => (id === "boot-status" ? statusNode : null),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      documentElement: { dataset: {}, classList: { add() {}, remove() {}, toggle() {} } },
      body: { dataset: {}, classList: { add() {}, remove() {}, toggle() {} } },
    },
    Date: { now: () => now },
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms, due: now + ms }); return id; },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms, due: now + ms, once: true }); return id; },
    clearTimeout: (id) => intervals.delete(id),
    location_reload: () => {},
  });
  context.globalThis = context;
  async function advance(ms) {
    const target = now + ms;
    while (true) {
      const due = [...intervals.entries()].filter(([, t]) => t.due <= target)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      const [id, timer] = due;
      now = timer.due;
      if (now >= activateAt && sw.controller !== fresh) {
        sw.controller = fresh;
        listeners.get("controllerchange")?.();
      }
      if (timer.once) intervals.delete(id); else timer.due += timer.ms;
      await timer.fn();
      await new Promise((resolve) => setImmediate(resolve));
    }
    now = target;
    if (now >= activateAt && sw.controller !== fresh) {
      sw.controller = fresh;
      listeners.get("controllerchange")?.();
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { context, advance, statusNode, handoffs };
}

// The gate arms its timer after awaiting getRegistrations(); let that land before the clock moves.
async function settle() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function outcome(promise) {
  let state = "pending";
  promise.then(() => { state = "resolved"; }, (error) => { state = `rejected: ${error.message}`; });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return state;
}

for (const page of PAGES) {
  test(`${page}: a slow download keeps waiting past 30 s and boots when it lands`, async () => {
    const h = harness({ installingFor: 90_000, waitingFor: 5_000, activateAt: 95_000 });
    vm.runInContext(await gateSource(page), h.context);
    await settle();
    const gate = h.context.__gunsPrebootReady;
    await h.advance(45_000);
    assert.equal(await outcome(gate), "pending", "still downloading at 45 s must not fail");
    if (page === "../../../index.html") assert.equal(h.statusNode.textContent, "DOWNLOADING UPDATE…");
    await h.advance(60_000);
    assert.equal(await outcome(gate), "resolved");
  });

  test(`${page}: a finished update waiting on old clients is handed over and boots`, async () => {
    const h = harness({ waitingFor: 300_000 });
    vm.runInContext(await gateSource(page), h.context);
    await settle();
    const gate = h.context.__gunsPrebootReady;
    await h.advance(3_000);
    assert.equal(JSON.stringify(h.handoffs), JSON.stringify([{ type: "guns-skip-waiting", build: "__RELEASE_BUILD__" }]),
      "this page is an old-worker client itself: it must ask the replacement to take over, once");
    if (page === "../../../index.html") assert.equal(h.statusNode.textContent, "UPDATE READY · SWITCHING…");
    await h.advance(2_000);
    assert.equal(await outcome(gate), "resolved");
  });

  test(`${page}: no replacement worker at all still fails closed after 30 s`, async () => {
    const h = harness();
    vm.runInContext(await gateSource(page), h.context);
    await settle();
    const gate = h.context.__gunsPrebootReady;
    gate.catch(() => {});
    await h.advance(25_000);
    assert.equal(await outcome(gate), "pending");
    await h.advance(10_000);
    assert.equal(await outcome(gate), "rejected: Release update unavailable; saved release retained");
  });
}
