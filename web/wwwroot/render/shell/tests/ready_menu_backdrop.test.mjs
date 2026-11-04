import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mountReadyMenuBackdrop } from "../ready_menu_backdrop.js";

const [index, app, moduleSource] = await Promise.all([
  readFile(new URL("../../../index.html", import.meta.url), "utf8"),
  readFile(new URL("../../../app.js", import.meta.url), "utf8"),
  readFile(new URL("../ready_menu_backdrop.js", import.meta.url), "utf8"),
]);

test("the picker mounts a live backdrop canvas and wires it before boot", () => {
  assert.match(index, /id="ready-menu-backdrop"/);
  assert.match(index, /#ready-menu-backdrop\s*\{[\s\S]*?z-index:\s*11/);
  assert.match(app, /import \{ mountReadyMenuBackdrop \} from "\.\/render\/shell\/ready_menu_backdrop\.js/);
  assert.match(app, /mountReadyMenuBackdrop\(\)/);
  assert.doesNotMatch(
    index,
    /:root #ready-screen\[data-mode="program"\]\s*\{[\s\S]*?menu-hangar\.webp/,
    "program picker must not stack a static slab raster over the live canvas",
  );
});

test("mountReadyMenuBackdrop pauses when the document is hidden", () => {
  assert.match(moduleSource, /visibilitychange/);
  assert.match(moduleSource, /visibilityState === "hidden"/);
  assert.match(moduleSource, /cancelAnimationFrame/);
});

test("mountReadyMenuBackdrop returns a disposer and paints without throwing", () => {
  globalThis.Path2D = class Path2D {};
  const canvas = {
    clientWidth: 320,
    clientHeight: 200,
    width: 0,
    height: 0,
    hidden: false,
    getContext: () => ({
      setTransform() {},
      scale() {},
      createLinearGradient() {
        return { addColorStop() {} };
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
      fillRect() {},
      fill() {},
      beginPath() {},
      ellipse() {},
      save() {},
      restore() {},
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "",
    }),
  };
  const boot = { classList: { contains: (name) => name === "ready" ? false : false } };
  const ready = {
    classList: { contains: (name) => name === "visible" },
    getAttribute: () => "program",
  };
  const observers = [];
  const win = {
    devicePixelRatio: 1,
    innerWidth: 1280,
    requestAnimationFrame(fn) {
      this._raf = fn;
      return 1;
    },
    cancelAnimationFrame() {
      this._raf = null;
    },
    ResizeObserver: class {
      constructor(cb) { this.cb = cb; }
      observe() { observers.push(this); }
      disconnect() {}
    },
    MutationObserver: class {
      constructor() {}
      observe() {}
      disconnect() {}
    },
  };
  const doc = {
    visibilityState: "visible",
    documentElement: { getAttribute: () => null },
    querySelector(sel) {
      if (sel === "#ready-menu-backdrop") return canvas;
      if (sel === "#boot") return boot;
      if (sel === "#ready-screen") return ready;
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const dispose = mountReadyMenuBackdrop({ document: doc, window: win, canvas });
  assert.equal(typeof dispose, "function");
  dispose();
});
