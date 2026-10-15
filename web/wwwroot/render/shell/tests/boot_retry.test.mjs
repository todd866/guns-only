import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../../../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
const bootstrap = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
// Run the actual bootstrap control flow. Replace only the import operator with a test loader,
// so these tests need neither a browser nor Node's experimental VM module support.
const source = `(async () => {${bootstrap.replace(/\bimport\(/g, "loadModule(")}})()`;

function harness({ failure = "module", storage = new Map(), denied = "", fallbackFails = false,
  build = "test-build" } = {}) {
  const observed = { reloads: 0, fallback: 0, fatal: false, hidden: false, loads: [] };
  const cause = new Error(failure === "gate"
    ? "Release update unavailable; saved release retained" : "Network fetch failed");
  const info = { setAttribute(name, value) { this[name] = value; } };
  const context = vm.createContext({
    Error, console: { error() {} }, releaseBuild: build,
    location: { href: "https://example.test/?mission=1", reload() { observed.reloads++; } },
    navigator: {},
    sessionStorage: {
      getItem(key) { if (denied === "read") throw new Error("Denied"); return storage.get(key) ?? null; },
      setItem(key, value) { if (denied === "write") throw new Error("Denied"); storage.set(key, value); },
    },
    __gunsPrebootReady: failure === "gate" ? Promise.reject(cause) : Promise.resolve(),
    document: {
      createElement() {
        return { setAttribute() {}, events: {}, addEventListener(name, fn) { this.events[name] = fn; } };
      },
      head: { append(script) { script.events[failure === "classic" ? "error" : "load"](); } },
      querySelector(selector) {
        if (selector === "#fatal-message") return info;
        return { classList: { add() {
          if (selector === "#fatal") observed.fatal = true;
          if (selector === "#boot") observed.hidden = true;
        } } };
      },
    },
    async loadModule(path) {
      observed.loads.push(path);
      if (path.startsWith("./app.js")) { if (failure) throw cause; return {}; }
      if (fallbackFails) throw new Error("Fallback unavailable");
      if (path.includes("inapp_browser")) return { detectEmbeddedBrowser: () => ({}) };
      return { bootFallbackModel: (model) => model, mountBootFallback: () => { observed.fallback++; return true; } };
    },
  });
  return { run: () => vm.runInContext(source, context), observed, storage, info };
}

for (const failure of ["module", "classic", "gate"]) {
  test(`${failure}: reload once per build, then reveal the fallback`, async () => {
    const storage = new Map();
    const first = harness({ failure, storage });
    await first.run();
    assert.equal(first.observed.reloads, 1);
    assert.equal(storage.get("guns-boot-retry"), "test-build");
    assert.equal(first.observed.hidden, false, "keep loading cover until navigation");
    assert.equal(first.observed.fallback, 0);
    assert.equal(first.observed.fatal, false);
    const second = harness({ failure, storage });
    await second.run();
    assert.equal(second.observed.reloads, 0);
    assert.equal(second.observed.fallback, 1);
    assert.equal(second.observed.hidden, true);
    const nextBuild = harness({ failure, storage, build: "new-build" });
    await nextBuild.run();
    assert.equal(nextBuild.observed.reloads, 1, "a new build gets its own retry");
  });
}

for (const denied of ["read", "write"]) {
  test(`denied storage ${denied}: fallback without a reload loop`, async () => {
    const h = harness({ denied });
    await h.run();
    assert.equal(h.observed.reloads, 0);
    assert.equal(h.observed.fallback, 1);
  });
}

test("failed fallback imports reveal static fatal markup with detail in its tooltip", async () => {
  const h = harness({ storage: new Map([["guns-boot-retry", "test-build"]]), fallbackFails: true });
  await h.run();
  assert.equal(h.observed.fatal, true);
  assert.match(h.info.title, /Network fetch failed/);
  assert.match(h.info.title, /https:\/\/example.test/);
  assert.match(h.info["aria-label"], /Technical detail:/);
  assert.equal(h.info.textContent, undefined);
});

test("successful import does not clear the retry until the first frame succeeds", async () => {
  const h = harness({ failure: null, storage: new Map([["guns-boot-retry", "test-build"]]) });
  await h.run();
  assert.equal(h.storage.get("guns-boot-retry"), "test-build");
  assert.equal(h.observed.reloads, 0);
  assert.equal(h.observed.fallback, 0);
  const ready = app.match(/if \(firstFrame\) \{([\s\S]*?)\n      \}/)[1];
  for (const denied of [false, true]) {
    let removed = false;
    let shown = false;
    vm.runInNewContext(ready, {
      firstFrame: true,
      sessionStorage: { removeItem(key) {
        assert.equal(key, "guns-boot-retry");
        if (denied) throw new Error("Denied");
        removed = true;
      } },
      setBootStatus: (stage) => assert.equal(stage, "ready"),
      bootScreen: { setAttribute() {}, classList: { add() { shown = true; } } },
      markShellMilestone() {},
    });
    assert.equal(removed, !denied);
    assert.equal(shown, true, "storage denial must not prevent successful boot");
  }
});

test("loading stages advance the gauge without exposing machinery", () => {
  const progress = html.match(/globalThis\.__gunsSetBootProgress = \(phase\) => \{[\s\S]*?\n    \};/)[0];
  const status = {};
  const gauge = { style: { setProperty(name, value) { gauge.fill = value; } },
    setAttribute(name, value) { this[name] = value; } };
  const boot = { dataset: {} };
  const context = vm.createContext({ document: {
    getElementById: (id) => ({ "boot-status": status, "boot-progress": gauge, boot })[id],
  } });
  vm.runInContext(progress, context);
  for (const [stage, value] of Object.entries({ files: 0, update: 20, switching: 40, runtime: 40,
    model: 70, scene: 90, ready: 100 })) {
    context.__gunsSetBootProgress(stage);
    assert.equal(status.textContent, stage === "update" ? "Updating" : "Loading");
    assert.equal(gauge.fill, `${value}%`);
    assert.equal(gauge["aria-valuenow"], String(value));
    assert.equal(boot.dataset.phase, stage);
  }
  for (const stage of ["runtime", "model", "scene", "ready"]) assert.ok(app.includes(`setBootStatus("${stage}")`));
});

test("the classic copy handler works for both cards, including a denied clipboard", async () => {
  const start = html.indexOf('    document.addEventListener("click", async (event) => {');
  const copySource = html.slice(start, html.indexOf("</script>", start));
  for (const denied of [false, true]) {
    let onClick;
    let copied;
    let prompt;
    vm.runInNewContext(copySource, {
      document: { addEventListener(type, handler) { assert.equal(type, "click"); onClick = handler; } },
      location: { href: "https://example.test/?mission=1" },
      navigator: { clipboard: { async writeText(text) {
        if (denied) throw new Error("Denied");
        copied = text;
      } } },
      window: { prompt(label, text) { prompt = { label, text }; } },
    });
    for (const copyUrl of ["https://example.test/?mission=2", undefined]) {
      const button = { dataset: { copyUrl }, textContent: "Copy link" };
      await onClick({ target: { closest(selector) {
        assert.equal(selector, "#shell-fallback-copy, #fatal-copy");
        return button;
      } } });
      const expected = copyUrl || "https://example.test/?mission=1";
      if (denied) {
        assert.deepEqual(prompt, { label: "Copy link", text: expected });
        assert.equal(button.textContent, "Copy link", "do not claim a failed copy succeeded");
      } else {
        assert.equal(copied, expected);
        assert.equal(button.textContent, "Link copied");
      }
    }
  }
});
