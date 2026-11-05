// Painted front-door sky for the picker and loading handover. Soft cumulus in the F-22 / Korea
// cool-sky palette (scene_builders decisionSupportSky at uSoftWorld 0), with golden-departure
// ground from engine-targets.json. Animated drift pauses when the tab is hidden or the menu is
// not on screen.

const SKY = Object.freeze({
  dark: Object.freeze({
    zenith: "#3d5564",
    mid: "#6f8492",
    haze: "#94a3a4",
    warm: "#c4c7b6",
    break: "#f3d08c",
    cloudLight: "#f4e7c9",
    cloudMid: "#e6dcc4",
    cloudShade: "rgba(120, 132, 138, 0.38)",
    ridge: ["#8f9b95", "#71827c", "#55665d", "#394a3a"],
    field: ["#a89858", "#6d6538"],
    hazeWash: "rgba(244, 231, 201, 0.42)",
  }),
  light: Object.freeze({
    zenith: "#5c7484",
    mid: "#7a919c",
    haze: "#b0bab0",
    warm: "#d8d4c4",
    break: "#f3d08c",
    cloudLight: "#fff6e8",
    cloudMid: "#f0e6d0",
    cloudShade: "rgba(143, 155, 149, 0.32)",
    ridge: ["#9aa8a2", "#7d8f88", "#62756c", "#465648"],
    field: ["#b8a866", "#7a7040"],
    hazeWash: "rgba(244, 231, 201, 0.36)",
  }),
});

const DRIFT_PX_PER_S = 4.5;
const VIEW_W = 1600;
const VIEW_H = 1067;

/** Puffs in viewBox space: cx, cy, rx, ry, alpha — matched to menu-hangar.svg cumulus. */
/** @type {ReadonlyArray<{ depth: number, puffs: ReadonlyArray<readonly [number, number, number, number, number]> }>} */
const CLOUDS = Object.freeze([
  {
    depth: 0.22,
    puffs: Object.freeze([
      [280 / VIEW_W, 248 / VIEW_H, 210 / VIEW_W, 72 / VIEW_H, 0.72],
      [340 / VIEW_W, 232 / VIEW_H, 150 / VIEW_W, 58 / VIEW_H, 0.65],
      [180 / VIEW_W, 262 / VIEW_H, 120 / VIEW_W, 52 / VIEW_H, 0.55],
    ]),
  },
  {
    depth: 0.28,
    puffs: Object.freeze([
      [1180 / VIEW_W, 188 / VIEW_H, 190 / VIEW_W, 68 / VIEW_H, 0.62],
      [1240 / VIEW_W, 172 / VIEW_H, 140 / VIEW_W, 54 / VIEW_H, 0.58],
      [1080 / VIEW_W, 202 / VIEW_H, 110 / VIEW_W, 48 / VIEW_H, 0.48],
    ]),
  },
  {
    depth: 0.35,
    puffs: Object.freeze([
      [560 / VIEW_W, 412 / VIEW_H, 160 / VIEW_W, 56 / VIEW_H, 0.46],
    ]),
  },
  {
    depth: 0.18,
    puffs: Object.freeze([
      [1320 / VIEW_W, 392 / VIEW_H, 130 / VIEW_W, 50 / VIEW_H, 0.38],
    ]),
  },
]);

const HILL_BANDS = Object.freeze([
  {
    fill: 0,
    d: "M0 716 L96 700 L188 682 L262 706 L364 690 L436 712 L548 678 L642 704 L730 694 L828 674 L928 706 L1042 688 L1146 710 L1268 680 L1364 704 L1462 690 L1600 708 V764 H0 Z",
  },
  {
    fill: 1,
    d: "M0 768 L128 736 L206 762 L332 722 L440 754 L516 738 L636 712 L744 752 L868 726 L946 756 L1078 720 L1188 754 L1300 732 L1420 762 L1520 734 L1600 754 V806 H0 Z",
  },
  {
    fill: 2,
    d: "M0 800 L106 782 L224 754 L340 800 L442 776 L568 748 L672 794 L796 762 L900 800 L1030 766 L1140 802 L1268 764 L1388 800 L1502 772 L1600 794 V846 H0 Z",
  },
  {
    fill: 3,
    d: "M0 862 L142 812 L246 848 L392 796 L500 840 L624 800 L768 846 L884 806 L1016 848 L1160 802 L1288 844 L1412 804 L1536 846 L1600 826 V896 H0 Z",
  },
]);

function themePalette(root) {
  return root?.getAttribute("data-theme") === "light" ? SKY.light : SKY.dark;
}

function shouldPaint({ boot, ready, hidden }) {
  if (hidden) return false;
  if (boot && !boot.classList.contains("ready")) return true;
  if (!ready?.classList.contains("visible")) return false;
  const mode = ready.getAttribute("data-mode");
  return mode === "program" || mode === "intro";
}

function paintSky(ctx, w, h, palette) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, palette.zenith);
  g.addColorStop(0.22, palette.mid);
  g.addColorStop(0.48, palette.haze);
  g.addColorStop(0.66, palette.warm);
  g.addColorStop(0.78, palette.cloudLight);
  g.addColorStop(0.86, palette.break);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const breakG = ctx.createRadialGradient(w * 0.705, h * 0.72, 0, w * 0.705, h * 0.72, w * 0.38);
  breakG.addColorStop(0, "rgba(255, 238, 192, 0.88)");
  breakG.addColorStop(0.55, "rgba(243, 208, 140, 0.38)");
  breakG.addColorStop(1, "rgba(243, 208, 140, 0)");
  ctx.fillStyle = breakG;
  ctx.fillRect(0, 0, w, h);
}

function paintPuff(ctx, cx, cy, rx, ry, coreHex, rimHex, alpha) {
  const scale = Math.max(rx, ry);
  const g = ctx.createRadialGradient(cx, cy, scale * 0.04, cx, cy, scale * 1.08);
  g.addColorStop(0, rgbaFromHex(coreHex, alpha));
  g.addColorStop(0.42, rgbaFromHex(rimHex, alpha * 0.88));
  g.addColorStop(0.78, rgbaFromHex(rimHex, alpha * 0.28));
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function rgbaFromHex(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function paintCloudPuffs(ctx, w, h, palette, driftPx) {
  ctx.save();
  ctx.filter = `blur(${Math.max(5, Math.min(w, h) * 0.009)}px)`;
  ctx.globalCompositeOperation = "source-over";
  for (const cloud of CLOUDS) {
    const layerDrift = driftPx * cloud.depth;
    for (const [cxN, cyN, rxN, ryN, alpha] of cloud.puffs) {
      paintPuff(
        ctx,
        cxN * w + layerDrift,
        cyN * h,
        rxN * w,
        ryN * h,
        palette.cloudLight,
        palette.cloudMid,
        alpha,
      );
    }
  }
  ctx.filter = "none";
  ctx.restore();
}

// Blurring every puff on every frame cost a software-rendered 1280x720 menu its whole frame
// budget (14 fps on an M5 with the GPU off; CI's runner lost the WASM boot behind it). Paint
// the blurred cloud layer ONCE per size/palette into an offscreen canvas and slide that: the
// per-frame work is then two drawImage calls.
const cloudLayer = { canvas: null, key: "", w: 0, h: 0 };

function cloudLayerFor(doc, w, h, palette) {
  const key = `${w}x${h}:${palette.cloudLight}:${palette.cloudMid}`;
  if (cloudLayer.canvas && cloudLayer.key === key) return cloudLayer.canvas;
  if (typeof doc.createElement !== "function") return null;
  const layer = doc.createElement("canvas");
  if (!layer || typeof layer.getContext !== "function") return null;
  layer.width = Math.max(1, Math.round(w));
  layer.height = Math.max(1, Math.round(h));
  const lctx = layer.getContext("2d");
  if (!lctx) return null;
  lctx.clearRect(0, 0, layer.width, layer.height);
  paintCloudPuffs(lctx, w, h, palette, 0);
  cloudLayer.canvas = layer;
  cloudLayer.key = key;
  cloudLayer.w = w;
  cloudLayer.h = h;
  return layer;
}

function paintClouds(ctx, w, h, palette, driftPx, doc) {
  const layer = doc && typeof ctx.drawImage === "function"
    ? cloudLayerFor(doc, w, h, palette)
    : null;
  if (!layer) {
    paintCloudPuffs(ctx, w, h, palette, driftPx);
    return;
  }
  // One shared drift for the cached layer (depth parallax lives in the cache's layout), wrapped
  // so the slide is seamless.
  const offset = ((driftPx % w) + w) % w;
  ctx.drawImage(layer, offset - w, 0, w, h);
  ctx.drawImage(layer, offset, 0, w, h);
}

function paintHills(ctx, w, h, palette) {
  const sx = w / VIEW_W;
  const sy = h / VIEW_H;
  ctx.save();
  ctx.scale(sx, sy);
  for (const band of HILL_BANDS) {
    const base = palette.ridge[band.fill];
    const path = new Path2D(band.d);
    const g = ctx.createLinearGradient(0, 680, 0, 900);
    g.addColorStop(0, base);
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffffff";
    ctx.fill(path);
    ctx.globalAlpha = 1;
  }
  const haze = ctx.createLinearGradient(0, 660, 0, 890);
  haze.addColorStop(0, "rgba(244, 231, 201, 0)");
  haze.addColorStop(1, palette.hazeWash);
  ctx.fillStyle = haze;
  ctx.fillRect(0, 660, VIEW_W, 230);

  const field = ctx.createLinearGradient(0, 866, 0, 1067);
  field.addColorStop(0, palette.field[0]);
  field.addColorStop(1, palette.field[1]);
  ctx.fillStyle = field;
  ctx.fillRect(0, 866, VIEW_W, 201);
  ctx.restore();
}

function paintFrame(ctx, w, h, palette, driftPx, doc) {
  paintSky(ctx, w, h, palette);
  paintClouds(ctx, w, h, palette, driftPx, doc);
  paintHills(ctx, w, h, palette);
}

/** Drift repaints at most this often; the menu does not need 60 Hz clouds. */
const DRIFT_FRAME_MS = 66;
/** Largest bitmap the backdrop paints; CSS stretches it to the viewport. */
const PAINT_MAX_W = 1600;
const PAINT_MAX_H = 1000;

/**
 * @param {{ document?: Document, window?: Window, canvas?: HTMLCanvasElement | null }} [options]
 */
export function mountReadyMenuBackdrop(options = {}) {
  const doc = options.document ?? globalThis.document;
  const win = options.window ?? globalThis.window;
  const canvas = options.canvas ?? doc?.querySelector("#ready-menu-backdrop");
  if (!canvas || !doc || !win) return () => {};

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return () => {};

  const boot = doc.querySelector("#boot");
  const ready = doc.querySelector("#ready-screen");
  const root = doc.documentElement;
  let raf = 0;
  let driftPx = 0;
  let lastTs = 0;
  let visible = false;

  // The painted size is capped: a full-page screenshot (Playwright, the Medevac QA capture)
  // stretches the viewport to the document height, and a fixed-inset canvas would then paint a
  // blurred cloud layer thousands of pixels tall on a software rasteriser (Build 437 CI hung the
  // capture for 30 s). The bitmap is at most PAINT_MAX_W x PAINT_MAX_H and CSS stretches it; a
  // blurred sky does not need more.
  let paintW = 1;
  let paintH = 1;
  const resize = () => {
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth));
    const h = Math.max(1, Math.floor(canvas.clientHeight));
    const scale = Math.min(1, PAINT_MAX_W / w, PAINT_MAX_H / h);
    paintW = Math.max(1, Math.floor(w * scale));
    paintH = Math.max(1, Math.floor(h * scale));
    canvas.width = Math.floor(paintW * dpr);
    canvas.height = Math.floor(paintH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintFrame(ctx, paintW, paintH, themePalette(root), driftPx, doc);
  };

  const syncVisibility = () => {
    const want = shouldPaint({
      boot,
      ready,
      hidden: doc.visibilityState === "hidden",
    });
    canvas.hidden = !want;
    if (!want) {
      if (raf) {
        win.cancelAnimationFrame(raf);
        raf = 0;
      }
      visible = false;
      return;
    }
    if (!visible) {
      visible = true;
      lastTs = 0;
      if (!raf) raf = win.requestAnimationFrame(tick);
    }
  };

  const tick = (ts) => {
    raf = 0;
    if (!shouldPaint({ boot, ready, hidden: doc.visibilityState === "hidden" })) {
      syncVisibility();
      return;
    }
    const w = paintW;
    const h = paintH;
    // While the runtime is still booting the sky is a still picture: one frame, no loop, so the
    // main thread belongs to the WASM boot. The boot class observer restarts the drift after.
    if (boot && !boot.classList.contains("ready")) {
      paintFrame(ctx, w, h, themePalette(root), driftPx, doc);
      visible = false;
      return;
    }
    if (lastTs > 0 && ts - lastTs < DRIFT_FRAME_MS) {
      raf = win.requestAnimationFrame(tick);
      return;
    }
    if (lastTs > 0) {
      const dt = Math.min(200, ts - lastTs);
      driftPx += (DRIFT_PX_PER_S * dt) / 1000;
      if (driftPx > win.innerWidth * 2) driftPx -= win.innerWidth * 2;
    }
    lastTs = ts;
    paintFrame(ctx, w, h, themePalette(root), driftPx, doc);
    raf = win.requestAnimationFrame(tick);
  };

  const observer = new win.ResizeObserver(resize);
  observer.observe(canvas);

  const mo = new win.MutationObserver(syncVisibility);
  if (boot) mo.observe(boot, { attributes: true, attributeFilter: ["class"] });
  if (ready) {
    mo.observe(ready, { attributes: true, attributeFilter: ["class", "data-mode"] });
  }
  mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  doc.addEventListener("visibilitychange", syncVisibility);
  resize();
  syncVisibility();

  return () => {
    doc.removeEventListener("visibilitychange", syncVisibility);
    mo.disconnect();
    observer.disconnect();
    if (raf) win.cancelAnimationFrame(raf);
  };
}
