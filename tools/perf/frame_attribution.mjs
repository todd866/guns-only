#!/usr/bin/env node
// Engine-wide frame attribution probe.
//
// Answers one question with numbers: where does the frame actually go, per mode and per DPR?
// Non-invasive: every probe is installed from the harness via addInitScript, so the published
// bundle under test is byte-identical to production (one-engine doctrine).
//
// Method
//  - rAF callback wrapper: total main-thread work inside the render loop, grouped by frame.
//  - Optional WebGL/2D-canvas call counting (a second pass, because the counting wrappers
//    themselves cost JS time and must not pollute the authoritative frame numbers).
//  - EXT_disjoint_timer_query_webgl2 when Chromium exposes it, otherwise inference:
//    (frame delta - main-thread callback ms) is GPU/compositor/idle.
//  - Fill isolation by viewport scaling at fixed DPR.

import http from "node:http";
import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
import process from "node:process";
import { serveStatic } from "../../web/wwwroot/render/hud/tests/harness/static_server.mjs";

// node_modules is gitignored and lives only in the primary checkout; a worktree has none.
const requireFromSmoke = createRequire(
  process.env.GUNS_SMOKE_PACKAGE
    ?? new URL("../../web/smoke/package.json", import.meta.url),
);
const { chromium } = requireFromSmoke("playwright");

const PORT = Number(process.env.PORT ?? 5251);
const WWWROOT = process.env.GUNS_WWWROOT ?? "/tmp/guns-perf-attr/wwwroot";
const OUT = process.env.OUT ?? "/tmp/frame-attribution";

async function serveOnFixedPort(root, port) {
  const original = http.Server.prototype.listen;
  http.Server.prototype.listen = function listen(_p, host, cb) {
    return original.call(this, port, host, cb);
  };
  try {
    return await serveStatic(root);
  } finally {
    http.Server.prototype.listen = original;
  }
}

// ---------------------------------------------------------------------------
// Page probe (stringified into addInitScript)
// ---------------------------------------------------------------------------
function probeSource(countGl) {
  return `(() => {
  const P = {
    frames: [],          // one row per animation frame
    capturing: false,
    countGl: ${countGl},
    gl: null,
    ext: null,
    gpuQueue: [],
    gpuSamples: [],
    hud2d: [],
    notes: [],
  };
  globalThis.__perf = P;

  const zero = () => ({
    draw: 0, tris: 0, useProgram: 0, bindTexture: 0, uniform: 0,
    bufferData: 0, texImage: 0, bindFB: 0, clear: 0, vap: 0,
    readPixels: 0, finish: 0, flush: 0, getError: 0, getParameter: 0,
    readback: 0,
    c2dOps: 0, c2dText: 0, c2dPath: 0, c2dDrawImage: 0, c2dGetImageData: 0,
    c2dClear: 0, c2dCanvases: 0,
  });
  let counters = zero();
  P.counters = counters;

  // --- rAF wrapper -----------------------------------------------------------
  const rawRAF = globalThis.requestAnimationFrame.bind(globalThis);
  let currentFrameTs = -1;
  let currentRow = null;
  const finishRow = () => {
    if (!currentRow) return;
    if (P.capturing) P.frames.push(currentRow);
    currentRow = null;
  };
  globalThis.requestAnimationFrame = (callback) => rawRAF((ts) => {
    if (ts !== currentFrameTs) {
      finishRow();
      currentFrameTs = ts;
      currentRow = { ts, cb: 0, n: 0, gl: null, gpu: null };
      if (P.countGl) { counters = zero(); P.counters = counters; }
      if (P.ext && P.gl && P.gpuQueue.length < 4) beginGpuQuery();
    }
    const row = currentRow;
    const t0 = performance.now();
    try { callback(ts); }
    finally {
      const dt = performance.now() - t0;
      if (row) { row.cb += dt; row.n += 1; if (dt > (row.max ?? 0)) row.max = dt; }
      if (P.countGl && row) row.gl = { ...counters };
      endGpuQuery();
      pollGpuQueries();
    }
  });

  // Close the row after all rAF callbacks for this timestamp have run.
  const closeLoop = () => { finishRow(); rawRAF(closeLoop); };
  rawRAF(closeLoop);

  // --- GPU timer queries -----------------------------------------------------
  let activeQuery = null;
  function beginGpuQuery() {
    const gl = P.gl, ext = P.ext;
    if (!gl || !ext || activeQuery) return;
    try {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      activeQuery = { q, ts: currentFrameTs, row: currentRow };
    } catch (e) { P.ext = null; P.notes.push("beginQuery failed: " + e.message); }
  }
  function endGpuQuery() {
    const gl = P.gl, ext = P.ext;
    if (!gl || !ext || !activeQuery) return;
    try {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      P.gpuQueue.push(activeQuery);
      activeQuery = null;
    } catch (e) { activeQuery = null; }
  }
  function pollGpuQueries() {
    const gl = P.gl, ext = P.ext;
    if (!gl || !ext || P.gpuQueue.length === 0) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    for (let i = P.gpuQueue.length - 1; i >= 0; i--) {
      const entry = P.gpuQueue[i];
      let done = false;
      try { done = gl.getQueryParameter(entry.q, gl.QUERY_RESULT_AVAILABLE); }
      catch { done = true; }
      if (!done) continue;
      P.gpuQueue.splice(i, 1);
      if (disjoint) { gl.deleteQuery(entry.q); continue; }
      let ns = 0;
      try { ns = gl.getQueryParameter(entry.q, gl.QUERY_RESULT); } catch { }
      gl.deleteQuery(entry.q);
      const ms = ns / 1e6;
      if (entry.row) entry.row.gpu = ms;
      if (P.capturing) P.gpuSamples.push(ms);
    }
  }

  // --- context capture -------------------------------------------------------
  const rawGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = rawGetContext.call(this, type, ...rest);
    if (ctx && (type === "webgl2" || type === "webgl") && !P.gl) {
      P.gl = ctx;
      try {
        P.ext = ctx.getExtension("EXT_disjoint_timer_query_webgl2") || null;
      } catch { P.ext = null; }
      P.notes.push("gl=" + type + " timerExt=" + (P.ext ? "yes" : "no"));
      try {
        const dbg = ctx.getExtension("WEBGL_debug_renderer_info");
        if (dbg) P.renderer = String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      } catch { }
    }
    if (ctx && type === "2d") {
      P.hud2d.push({ canvas: this });
      if (P.countGl) instrument2d(ctx);
    }
    return ctx;
  };

  function instrument2d(ctx) {
    if (ctx.__perfWrapped) return;
    ctx.__perfWrapped = true;
    const bump = (key) => { counters.c2dOps++; if (key) counters[key]++; };
    const wrap = (name, key) => {
      const fn = ctx[name];
      if (typeof fn !== "function") return;
      ctx[name] = function (...args) { bump(key); return fn.apply(this, args); };
    };
    for (const n of ["fillText", "strokeText"]) wrap(n, "c2dText");
    for (const n of ["stroke", "fill", "beginPath", "moveTo", "lineTo", "arc",
      "rect", "closePath", "quadraticCurveTo", "bezierCurveTo", "ellipse"]) wrap(n, "c2dPath");
    for (const n of ["drawImage"]) wrap(n, "c2dDrawImage");
    for (const n of ["getImageData"]) wrap(n, "c2dGetImageData");
    for (const n of ["clearRect", "fillRect", "strokeRect"]) wrap(n, "c2dClear");
    for (const n of ["save", "restore", "translate", "rotate", "scale", "setTransform",
      "createLinearGradient", "createRadialGradient", "measureText", "clip",
      "setLineDash", "createPattern"]) wrap(n, null);
  }

  if (P.countGl) {
    for (const proto of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext]) {
      if (!proto) continue;
      const p = proto.prototype;
      const wrapGl = (name, fn) => {
        const raw = p[name];
        if (typeof raw !== "function") return;
        p[name] = function (...args) { fn(args); return raw.apply(this, args); };
      };
      wrapGl("drawArrays", (a) => { counters.draw++; counters.tris += (a[2] | 0) / 3; });
      wrapGl("drawElements", (a) => { counters.draw++; counters.tris += (a[1] | 0) / 3; });
      wrapGl("drawElementsInstanced", (a) => { counters.draw++; counters.tris += ((a[1] | 0) / 3) * (a[4] | 0); });
      wrapGl("drawArraysInstanced", (a) => { counters.draw++; counters.tris += ((a[2] | 0) / 3) * (a[3] | 0); });
      wrapGl("drawRangeElements", () => { counters.draw++; });
      wrapGl("useProgram", () => counters.useProgram++);
      wrapGl("bindTexture", () => counters.bindTexture++);
      wrapGl("bufferData", () => counters.bufferData++);
      wrapGl("bufferSubData", () => counters.bufferData++);
      wrapGl("texImage2D", () => counters.texImage++);
      wrapGl("texSubImage2D", () => counters.texImage++);
      wrapGl("bindFramebuffer", () => counters.bindFB++);
      wrapGl("clear", () => counters.clear++);
      wrapGl("vertexAttribPointer", () => counters.vap++);
      wrapGl("readPixels", () => { counters.readPixels++; counters.readback++; });
      wrapGl("finish", () => { counters.finish++; counters.readback++; });
      wrapGl("flush", () => counters.flush++);
      wrapGl("getError", () => { counters.getError++; counters.readback++; });
      wrapGl("getParameter", () => counters.getParameter++);
      wrapGl("getBufferSubData", () => { counters.readback++; });
      for (const name of Object.getOwnPropertyNames(p)) {
        if (!/^uniform/.test(name)) continue;
        wrapGl(name, () => counters.uniform++);
      }
    }
  }

  // --- WASM bridge phase probe ----------------------------------------------
  // Every mode reaches its kernel through getAssemblyExports("GunsOnly.Web"); wrapping the
  // exported static methods there instruments all three loops without touching the bundle.
  const acc = globalThis.__perfBridgeAcc = {
    Advance: 0, AdvanceN: 0, GetState: 0, GetStateN: 0, parse: 0, parseN: 0,
    hot: 0, hotN: 0, other: 0, otherN: 0, wrapped: [],
  };
  const CLASS = {
    Advance: "Advance", RefreshHotFrame: "Advance", StepFixed: "Advance",
    GetState: "GetState", GetCircuit: "GetState",
    GetHotFrame: "hot", GetHotPose: "hot",
  };
  function wrapExports(exports) {
    const visit = (node, path, depth) => {
      if (!node || depth > 4) return;
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (typeof value === "function") {
          const bucket = CLASS[key];
          if (!bucket) continue;
          node[key] = function (...args) {
            const t0 = performance.now();
            try { return value.apply(this, args); }
            finally {
              const dt = performance.now() - t0;
              acc[bucket] += dt; acc[bucket + "N"] += 1;
            }
          };
          acc.wrapped.push(path + "." + key);
        } else if (value && typeof value === "object") {
          visit(value, path + "." + key, depth + 1);
        }
      }
    };
    try { visit(exports, "", 0); } catch (e) { P.notes.push("wrapExports: " + e.message); }
    return exports;
  }

  // JSON.parse cost of the state string, measured separately from the bridge call.
  const rawParse = JSON.parse;
  JSON.parse = function (text, ...rest) {
    if (typeof text === "string" && text.length > 2000) {
      const t0 = performance.now();
      try { return rawParse.call(this, text, ...rest); }
      finally { acc.parse += performance.now() - t0; acc.parseN += 1; }
    }
    return rawParse.call(this, text, ...rest);
  };

  // The runtime accessor is (re)assigned on globalThis several times during Blazor start-up, so
  // capture-once wrapping binds a stale stub. Intercept the property instead and always delegate
  // to the newest value, forwarding the call receiver verbatim.
  let latestAccessor = globalThis.getDotnetRuntime;
  const accessorWrapper = function (...args) {
    const result = latestAccessor.apply(this, args);
    return Promise.resolve(result).then((runtime) => {
      if (runtime && !runtime.__perfWrapped
        && typeof runtime.getAssemblyExports === "function") {
        runtime.__perfWrapped = true;
        const rawGet = runtime.getAssemblyExports.bind(runtime);
        runtime.getAssemblyExports = async (name) => wrapExports(await rawGet(name));
        P.notes.push("runtime hooked");
      }
      return runtime;
    });
  };
  try {
    Object.defineProperty(globalThis, "getDotnetRuntime", {
      configurable: true,
      get() { return latestAccessor ? accessorWrapper : undefined; },
      set(value) { latestAccessor = value; },
    });
  } catch (e) { P.notes.push("accessor hook failed: " + e.message); }

  P.start = () => {
    P.frames.length = 0; P.gpuSamples.length = 0; P.capturing = true;
  };
  P.stop = () => { P.capturing = false; return P.summary(); };
  P.summary = () => {
    const rows = P.frames.slice();
    const deltas = [];
    for (let i = 1; i < rows.length; i++) deltas.push(rows[i].ts - rows[i - 1].ts);
    const cb = rows.map((r) => r.cb);
    const gpu = rows.map((r) => r.gpu).filter((v) => typeof v === "number");
    return {
      frames: rows.length,
      renderer: P.renderer ?? null,
      timerExt: !!P.ext,
      notes: P.notes.slice(),
      delta: stats(deltas),
      callback: stats(cb),
      gpu: gpu.length ? stats(gpu) : null,
      gpuSampleCount: gpu.length,
      canvases2d: P.hud2d.length,
      glPerFrame: rows.length && rows.at(-1).gl ? rows.at(-1).gl : null,
      glMedian: medianCounters(rows),
      rows: rows.slice(0, 4000),
    };
  };
  function medianCounters(rows) {
    const withGl = rows.map((r) => r.gl).filter(Boolean);
    if (!withGl.length) return null;
    const out = {};
    for (const key of Object.keys(withGl[0])) {
      const values = withGl.map((g) => g[key]).sort((a, b) => a - b);
      out[key] = values[Math.floor(values.length / 2)];
    }
    return out;
  }
  function stats(values) {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const pick = (f) => s[Math.max(0, Math.ceil(s.length * f) - 1)];
    return {
      n: s.length,
      mean: s.reduce((a, b) => a + b, 0) / s.length,
      p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: s.at(-1), min: s[0],
    };
  }
})();`;
}

// ---------------------------------------------------------------------------
// Bridge-phase probe: wraps the WASM bridge exports after boot, per mode.
// ---------------------------------------------------------------------------
const BRIDGE_PROBE = `globalThis.__perfBridgeAcc?.wrapped ?? null;`;

// ---------------------------------------------------------------------------
async function launch({ deviceScaleFactor, viewport, countGl }) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--use-angle=metal",
      "--enable-webgl-draft-extensions",
      ...(process.env.UNCAPPED ? ["--disable-frame-rate-limit"] : []),
    ],
  });
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  await context.addInitScript(probeSource(countGl));
  const page = await context.newPage();
  return { browser, context, page };
}

async function capture(page, ms) {
  await page.evaluate(() => globalThis.__perf.start());
  await page.waitForTimeout(ms);
  return page.evaluate(() => globalThis.__perf.stop());
}

export { serveOnFixedPort, launch, capture, probeSource, BRIDGE_PROBE, PORT, WWWROOT, OUT };
