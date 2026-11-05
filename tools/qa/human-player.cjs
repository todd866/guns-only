#!/usr/bin/env node
/**
 * Human-paced player acceptance: click the start control the moment it looks ready,
 * without Playwright actionability waits, and measure freezes, input delay, feedback, and time-to-play.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
// PLAYWRIGHT_MODULE lets a worktree without web/smoke/node_modules borrow the main checkout's copy.
const PLAYWRIGHT_ROOT = process.env.PLAYWRIGHT_MODULE
  || path.resolve(__dirname, "../../web/smoke/node_modules/playwright");

/** @type {import('playwright').chromium} */
let chromium;
function loadPlaywright() {
  if (!chromium) {
    ({ chromium } = require(PLAYWRIGHT_ROOT));
  }
  return chromium;
}

/** @typedef {{ clickFeedbackMs: number, inputDelayMs: number, freezeMs: number, timeToPlayMs: number }} Thresholds */

const DEFAULT_THRESHOLDS = Object.freeze({
  clickFeedbackMs: 300,
  inputDelayMs: 250,
  freezeMs: 1000,
  timeToPlayMs: 15_000,
});

const POLL_MS = 100;
const FEEDBACK_POLL_MS = 50;
const RAF_GAP_RECORD_MS = 250;

/**
 * Injected before navigation. Records rAF gaps and capture-phase input delay.
 * @returns {string}
 */
function buildMonitorInitScript() {
  const gapMs = RAF_GAP_RECORD_MS;
  return `(() => {
    const gapThreshold = ${gapMs};
    const monitor = {
      freezes: [],
      inputDelays: [],
      startedAt: performance.now(),
    };
    let lastFrame = performance.now();
    function onFrame(now) {
      const gap = now - lastFrame;
      if (gap > gapThreshold) {
        monitor.freezes.push({
          startMs: lastFrame,
          endMs: now,
          durationMs: gap,
        });
      }
      lastFrame = now;
      requestAnimationFrame(onFrame);
    }
    requestAnimationFrame(onFrame);
    for (const type of ["pointerdown", "click"]) {
      window.addEventListener(type, (event) => {
        const delayMs = performance.now() - event.timeStamp;
        if (Number.isFinite(delayMs) && delayMs >= 0 && delayMs < 120_000) {
          monitor.inputDelays.push({
            type,
            delayMs,
            atMs: performance.now(),
          });
        }
      }, true);
    }
    window.__humanPlayerMonitor = monitor;
  })();`;
}

/**
 * String form of the impatient clickability probe (for documentation / embed).
 * @param {string} selector
 * @returns {string}
 */
function buildClickableProbeScript(selector) {
  const sel = JSON.stringify(selector);
  return `(() => {
    const el = document.querySelector(${sel});
    if (!el || el.disabled) return null;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
      return null;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return null;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !(el === hit || el.contains(hit))) return null;
    return { cx, cy, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  })()`;
}

/**
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
async function readClickableTarget(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.disabled) return null;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
      return null;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return null;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !(el === hit || el.contains(hit))) return null;
    return {
      cx,
      cy,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }, selector);
}

/** Built-in journeys (path + search relative to --base). */
const JOURNEY_DEFS = Object.freeze({
  f22: Object.freeze({
    id: "f22",
    pathname: "/",
    search: "?program=first-merge&audioQa=silent",
    startSelector: "#ready-start",
    screenSelector: "#ready-screen",
    inGameExpression: `(() => {
      const start = document.querySelector("#ready-start");
      const screen = start?.closest("#ready-screen") ?? document.querySelector("#ready-screen");
      const hidden = !screen
        || screen.hidden === true
        || !screen.classList.contains("visible")
        || getComputedStyle(screen).visibility === "hidden"
        || getComputedStyle(screen).display === "none";
      const center = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return hidden && center?.tagName === "CANVAS";
    })()`,
  }),
  cobra: Object.freeze({
    id: "cobra",
    pathname: "/cobra-lab/",
    search: "?audioQa=silent",
    // Cobra Ready brief (see web/wwwroot/cobra-lab/index.html), not the F-22 #ready-start shell.
    startSelector: "#mission-brief-start",
    screenSelector: "#mission-brief",
    inGameExpression: `(() => {
      const brief = document.querySelector("#mission-brief");
      const hidden = !brief
        || brief.hidden === true
        || getComputedStyle(brief).display === "none"
        || getComputedStyle(brief).visibility === "hidden";
      const center = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return hidden && center?.tagName === "CANVAS";
    })()`,
  }),
  rc: Object.freeze({
    id: "rc",
    pathname: "/rc/",
    search: "?audioQa=silent&telemetry=off",
    startSelector: "#start",
    screenSelector: "#brief",
    inGameExpression: `(() => !!(window.__gunsOnlyRC?.snapshot && !window.__gunsOnlyRC.snapshot().paused))()`,
    skipClickIfStartHidden: true,
  }),
});

const ALL_JOURNEY_IDS = Object.freeze(Object.keys(JOURNEY_DEFS));

/**
 * @param {string} baseOrigin
 * @param {{ pathname: string, search: string }} journey
 */
function journeyHref(baseOrigin, journey) {
  const base = baseOrigin.endsWith("/") ? baseOrigin : `${baseOrigin}/`;
  const url = new URL(journey.pathname.replace(/^\//, ""), base);
  url.search = journey.search.startsWith("?") ? journey.search.slice(1) : journey.search;
  return url.href;
}

/**
 * @param {string[]} argv
 */
function parseCli(argv) {
  const opts = {
    base: "https://guns-only.com",
    journeys: [...ALL_JOURNEY_IDS],
    outDir: path.resolve(process.cwd(), "human-player-out"),
    thresholds: { ...DEFAULT_THRESHOLDS },
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base" && argv[i + 1]) {
      opts.base = argv[++i];
    } else if (arg === "--journey" && argv[i + 1]) {
      const raw = argv[++i];
      opts.journeys = raw === "all"
        ? [...ALL_JOURNEY_IDS]
        : raw.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--out" && argv[i + 1]) {
      opts.outDir = path.resolve(argv[++i]);
    } else if (arg === "--click-feedback-ms" && argv[i + 1]) {
      opts.thresholds.clickFeedbackMs = Number(argv[++i]);
    } else if (arg === "--input-delay-ms" && argv[i + 1]) {
      opts.thresholds.inputDelayMs = Number(argv[++i]);
    } else if (arg === "--freeze-ms" && argv[i + 1]) {
      opts.thresholds.freezeMs = Number(argv[++i]);
    } else if (arg === "--time-to-play-ms" && argv[i + 1]) {
      opts.thresholds.timeToPlayMs = Number(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    }
  }
  return opts;
}

/**
 * @param {string} url
 */
function isIgnoredRequestFailure(url) {
  if (!url) return true;
  if (/\/telemetry/i.test(url)) return true;
  return false;
}

/**
 * Keep freezes that start on/after controlVisiblePerfMs; summarise worst duration.
 * @param {Array<{ startMs: number, durationMs: number }>} freezes
 * @param {number|null} controlVisiblePerfMs performance.now() when control became clickable; null skips filter
 * @param {number} minDurationMs
 */
function summarizeFreezes(freezes, controlVisiblePerfMs, minDurationMs) {
  const list = Array.isArray(freezes) ? freezes : [];
  const afterVisible = controlVisiblePerfMs == null
    ? list
    : list.filter((f) => f.startMs >= controlVisiblePerfMs);
  const over = afterVisible.filter((f) => f.durationMs > minDurationMs);
  const worst = over.reduce(
    (best, f) => (best == null || f.durationMs > best.durationMs ? f : best),
    null,
  );
  return {
    count: afterVisible.length,
    overThreshold: over.length,
    worst,
    afterVisible,
  };
}

/**
 * @param {number|null|undefined} valueMs
 * @param {number} limitMs
 */
function thresholdBreached(valueMs, limitMs) {
  if (valueMs == null || !Number.isFinite(valueMs)) return true;
  return valueMs > limitMs;
}

/**
 * @param {object} metrics
 * @param {Thresholds} thresholds
 * @param {number|null} controlVisiblePerfMs
 */
function evaluateThresholds(metrics, thresholds, controlVisiblePerfMs) {
  const freezeSummary = summarizeFreezes(
    metrics.freezes,
    controlVisiblePerfMs,
    thresholds.freezeMs,
  );
  const worstInput = (metrics.inputDelays || []).reduce(
    (best, row) => (row.delayMs > (best?.delayMs ?? -1) ? row : best),
    null,
  );
  const failures = [];

  // A self-starting journey has no click to answer, but its freezes and wait still count.
  if (!metrics.skipped && thresholdBreached(metrics.clickFeedbackMs, thresholds.clickFeedbackMs)) {
    failures.push({
      kind: "clickFeedback",
      valueMs: metrics.clickFeedbackMs,
      limitMs: thresholds.clickFeedbackMs,
    });
  }
  if (worstInput && worstInput.delayMs > thresholds.inputDelayMs) {
    failures.push({
      kind: "inputDelay",
      valueMs: worstInput.delayMs,
      limitMs: thresholds.inputDelayMs,
    });
  }
  if (freezeSummary.worst) {
    failures.push({
      kind: "freeze",
      valueMs: freezeSummary.worst.durationMs,
      limitMs: thresholds.freezeMs,
      atMs: freezeSummary.worst.startMs,
    });
  }
  if (thresholdBreached(metrics.timeToPlayMs, thresholds.timeToPlayMs)) {
    failures.push({
      kind: "timeToPlay",
      valueMs: metrics.timeToPlayMs,
      limitMs: thresholds.timeToPlayMs,
    });
  }
  if (metrics.pageErrors?.length) {
    failures.push({ kind: "pageError", count: metrics.pageErrors.length });
  }

  return {
    pass: failures.length === 0,
    failures,
    freezeSummary,
    worstInput,
    skipped: false,
  };
}

/**
 * One compact stdout line per journey.
 * @param {string} journeyId
 * @param {object} result
 */
function formatJourneyLine(journeyId, result) {
  if (result.skippedReason) {
    return `${journeyId} SKIPPED: ${result.skippedReason}`;
  }
  const status = result.pass ? "PASS" : "FAIL";
  const parts = [
    journeyId,
    status,
    `feedback=${fmtMs(result.clickFeedbackMs)}`,
    `play=${fmtMs(result.timeToPlayMs)}`,
  ];
  if (result.worstInputDelayMs != null) {
    parts.push(`input=${fmtMs(result.worstInputDelayMs)}`);
  }
  if (result.worstFreezeMs != null) {
    parts.push(`freeze=${fmtMs(result.worstFreezeMs)}`);
  }
  if (result.controlVisibleMs != null) {
    parts.push(`ready=${fmtMs(result.controlVisibleMs)}`);
  }
  if (!result.pass && result.offenders?.length) {
    parts.push(`offenders=${result.offenders.join(";")}`);
  }
  return parts.join(" ");
}

function fmtMs(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}ms`;
}

/**
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
async function readControlFingerprint(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const loading = document.querySelector(
      '[aria-busy="true"], [data-loading="true"], .loading, #boot:not(.ready)',
    );
    return {
      text: el?.textContent?.trim() ?? "",
      disabled: !!el?.disabled,
      ariaBusy: el?.getAttribute("aria-busy"),
      className: el?.className ?? "",
      docClass: document.documentElement.className,
      loadingVisible: !!loading,
      htmlLen: document.documentElement.innerHTML.length,
    };
  }, selector);
}

/**
 * @param {import('playwright').Page} page
 * @param {{ x: number, y: number, width: number, height: number }|null} clipRect
 * @param {string} filePath
 */
async function screenshotClip(page, clipRect, filePath) {
  const clip = clipRect
    ? {
      x: Math.max(0, clipRect.x - 8),
      y: Math.max(0, clipRect.y - 8),
      width: Math.min(clipRect.width + 16, 400),
      height: Math.min(clipRect.height + 16, 400),
    }
    : undefined;
  await page.screenshot({ path: filePath, clip });
}

/**
 * @param {import('playwright').Page} page
 * @param {string} baseOrigin
 * @param {typeof JOURNEY_DEFS.f22} def
 * @param {string} outDir
 * @param {Thresholds} thresholds
 */
async function runJourney(page, baseOrigin, def, outDir, thresholds) {
  const journeyDir = path.join(outDir, def.id);
  fs.mkdirSync(journeyDir, { recursive: true });

  const href = journeyHref(baseOrigin, def);

  const pageErrors = [];
  const failedRequests = [];
  page.on("pageerror", (err) => pageErrors.push(err.message ?? String(err)));
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (isIgnoredRequestFailure(url)) return;
    failedRequests.push({ url, failure: req.failure()?.errorText ?? "failed" });
  });

  const navStart = Date.now();
  await page.goto(href, { waitUntil: "domcontentloaded" });

  let controlVisibleWallMs = null;
  let controlVisiblePerfMs = null;
  let clickTarget = null;
  let skippedClick = false;

  const deadline = Date.now() + Math.max(thresholds.timeToPlayMs * 3, 120_000);

  while (Date.now() < deadline) {
    if (def.skipClickIfStartHidden) {
      const rcState = await page.evaluate(() => {
        const start = document.querySelector("#start");
        // checkVisibility() also sees a hidden ancestor (RC hides #start inside a hidden #brief).
        const startVisible = !!start && start.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        return { startVisible, inGame: !!(window.__gunsOnlyRC?.snapshot && !window.__gunsOnlyRC.snapshot().paused) };
      });
      if (!rcState.startVisible && rcState.inGame) {
        skippedClick = true;
        controlVisibleWallMs = Date.now() - navStart;
        controlVisiblePerfMs = await page.evaluate(() => performance.now());
        break;
      }
    }

    // eslint-disable-next-line no-await-in-loop
    clickTarget = await readClickableTarget(page, def.startSelector);
    if (clickTarget) {
      controlVisibleWallMs = Date.now() - navStart;
      controlVisiblePerfMs = await page.evaluate(() => performance.now());
      await screenshotClip(
        page,
        clickTarget.rect,
        path.join(journeyDir, "control-visible.png"),
      );
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(POLL_MS);
  }

  if (!skippedClick && !clickTarget) {
    return {
      journeyId: def.id,
      url: href,
      pass: false,
      skipped: false,
      clickFeedbackMs: null,
      timeToPlayMs: null,
      controlVisibleMs: controlVisibleWallMs,
      worstInputDelayMs: null,
      worstFreezeMs: null,
      pageErrors,
      failedRequests,
      freezes: [],
      inputDelays: [],
      offenders: ["start-never-clickable"],
    };
  }

  let clickWallMs = null;
  let baseline = null;
  if (!skippedClick && clickTarget) {
    baseline = await readControlFingerprint(page, def.startSelector);
    clickWallMs = Date.now();
    await page.mouse.click(clickTarget.cx, clickTarget.cy);
    await page.waitForTimeout(1000);
    await screenshotClip(
      page,
      clickTarget.rect,
      path.join(journeyDir, "click-plus-1s.png"),
    );
  }

  const clickFeedbackDeadline = Date.now() + thresholds.timeToPlayMs + 5000;
  let clickFeedbackMs = skippedClick ? 0 : null;

  if (!skippedClick && baseline) {
    while (Date.now() < clickFeedbackDeadline) {
      // eslint-disable-next-line no-await-in-loop
      const current = await readControlFingerprint(page, def.startSelector);
      const changed = JSON.stringify(current) !== JSON.stringify(baseline);
      // eslint-disable-next-line no-await-in-loop
      const inGame = await page.evaluate(def.inGameExpression);
      if (changed || inGame) {
        clickFeedbackMs = Date.now() - clickWallMs;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(FEEDBACK_POLL_MS);
    }
  }

  const playDeadline = Date.now() + thresholds.timeToPlayMs;
  // A journey that starts itself (RC) has no click: time to play runs from navigation.
  let timeToPlayMs = skippedClick ? controlVisibleWallMs : null;
  while (Date.now() <= playDeadline) {
    // eslint-disable-next-line no-await-in-loop
    const inGame = await page.evaluate(def.inGameExpression);
    if (inGame) {
      timeToPlayMs = skippedClick ? controlVisibleWallMs : Date.now() - clickWallMs;
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(FEEDBACK_POLL_MS);
  }

  await page.screenshot({ path: path.join(journeyDir, "end.png") });

  const monitor = await page.evaluate(() => window.__humanPlayerMonitor ?? { freezes: [], inputDelays: [] });

  const evaluation = evaluateThresholds(
    {
      clickFeedbackMs,
      timeToPlayMs,
      freezes: monitor.freezes,
      inputDelays: monitor.inputDelays,
      pageErrors,
      skipped: skippedClick,
    },
    thresholds,
    // Self-starting journeys: every freeze from navigation on is something the player sat through.
    skippedClick ? 0 : controlVisiblePerfMs,
  );

  const offenders = evaluation.failures.map((f) => {
    if (f.kind === "pageError") return `errors=${f.count}`;
    if (f.kind === "freeze") return `freeze@${Math.round(f.atMs)}=${Math.round(f.valueMs)}ms`;
    return `${f.kind}=${Math.round(f.valueMs)}ms`;
  });
  if (failedRequests.length) {
    offenders.push(`reqFail=${failedRequests.length}`);
  }

  return {
    journeyId: def.id,
    url: href,
    pass: evaluation.pass && failedRequests.length === 0,
    skipped: skippedClick,
    clickFeedbackMs,
    timeToPlayMs,
    controlVisibleMs: controlVisibleWallMs,
    worstInputDelayMs: evaluation.worstInput?.delayMs ?? null,
    worstFreezeMs: evaluation.freezeSummary.worst?.durationMs ?? null,
    pageErrors,
    failedRequests,
    freezes: monitor.freezes,
    inputDelays: monitor.inputDelays,
    failures: evaluation.failures,
    offenders,
    controlVisiblePerfMs,
    thresholds,
  };
}

// focus-guard (owner's Macs) runs agent-spawned processes at background QoS while the owner is
// using the machine. Freeze and timing numbers taken then are inflated, so say so on every run.
function backgroundQosWarning() {
  try {
    require("node:child_process").execFileSync("focus-guard", ["active"], { stdio: "ignore" });
    return "WARNING: focus-guard is active (owner at the keyboard): this run is at background priority, so freezes and times read high. Rerun when the Mac is idle for acceptance numbers.";
  } catch {
    return null; // not active, or not installed
  }
}

async function main() {
  const qosWarning = backgroundQosWarning();
  if (qosWarning) process.stderr.write(qosWarning + "\n");
  const opts = parseCli(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`Usage: node tools/qa/human-player.cjs [--base URL] [--journey f22,cobra,rc|all] [--out DIR]\n`
      + `  [--click-feedback-ms N] [--input-delay-ms N] [--freeze-ms N] [--time-to-play-ms N]\n`);
    process.exit(0);
  }

  fs.mkdirSync(opts.outDir, { recursive: true });

  const chromiumLauncher = loadPlaywright();
  /** @type {import('playwright').Browser|null} */
  let browser = null;
  const results = [];
  let exitCode = 0;

  try {
    browser = await chromiumLauncher.launch({
      headless: true,
      channel: "chromium",
      args: ["--mute-audio"],
    });

    for (const journeyId of opts.journeys) {
      const def = JOURNEY_DEFS[journeyId];
      if (!def) {
        const skipped = {
          journeyId,
          pass: false,
          skippedReason: `unknown journey ${journeyId}`,
        };
        results.push(skipped);
        process.stdout.write(`${formatJourneyLine(journeyId, skipped)}\n`);
        exitCode = 1;
        continue;
      }

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      await context.addInitScript(buildMonitorInitScript());
      const page = await context.newPage();

      let result;
      try {
        result = await runJourney(page, opts.base, def, opts.outDir, opts.thresholds);
      } catch (err) {
        result = {
          journeyId: def.id,
          pass: false,
          error: err.message ?? String(err),
          offenders: ["exception"],
        };
      } finally {
        await context.close();
      }

      results.push(result);
      process.stdout.write(`${formatJourneyLine(def.id, result)}\n`);
      if (!result.pass) exitCode = 1;
    }

    const reportPath = path.join(opts.outDir, "human-player-results.json");
    fs.writeFileSync(reportPath, `${JSON.stringify({
      at: new Date().toISOString(),
      base: opts.base,
      thresholds: opts.thresholds,
      results,
    }, null, 2)}\n`);
  } finally {
    if (browser) await browser.close();
  }

  process.exit(exitCode);
}

module.exports = {
  DEFAULT_THRESHOLDS,
  JOURNEY_DEFS,
  ALL_JOURNEY_IDS,
  buildMonitorInitScript,
  buildClickableProbeScript,
  readClickableTarget,
  journeyHref,
  parseCli,
  isIgnoredRequestFailure,
  summarizeFreezes,
  evaluateThresholds,
  thresholdBreached,
  formatJourneyLine,
  fmtMs,
  runJourney,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err}\n`);
    process.exit(1);
  });
}
