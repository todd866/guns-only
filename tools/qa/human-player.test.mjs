import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_THRESHOLDS,
  evaluateThresholds,
  formatJourneyLine,
  journeyHref,
  parseCli,
  summarizeFreezes,
  thresholdBreached,
  JOURNEY_DEFS,
} from "./human-player.cjs";

test("journeyHref builds production URLs", () => {
  assert.equal(
    journeyHref("https://guns-only.com", JOURNEY_DEFS.f22),
    "https://guns-only.com/?program=first-merge&audioQa=silent",
  );
  assert.equal(
    journeyHref("https://guns-only.com", JOURNEY_DEFS.cobra),
    "https://guns-only.com/cobra-lab/?audioQa=silent",
  );
  assert.equal(
    journeyHref("http://127.0.0.1:8787", JOURNEY_DEFS.rc),
    "http://127.0.0.1:8787/rc/?audioQa=silent&telemetry=off",
  );
});

test("parseCli defaults and overrides", () => {
  const defaults = parseCli([]);
  assert.equal(defaults.base, "https://guns-only.com");
  assert.deepEqual(defaults.journeys, ["f22", "cobra", "rc"]);
  assert.equal(defaults.thresholds.clickFeedbackMs, DEFAULT_THRESHOLDS.clickFeedbackMs);

  const custom = parseCli([
    "--base", "http://localhost:3000",
    "--journey", "f22,rc",
    "--click-feedback-ms", "500",
    "--freeze-ms", "2000",
  ]);
  assert.equal(custom.base, "http://localhost:3000");
  assert.deepEqual(custom.journeys, ["f22", "rc"]);
  assert.equal(custom.thresholds.clickFeedbackMs, 500);
  assert.equal(custom.thresholds.freezeMs, 2000);
});

test("thresholdBreached treats missing values as failure", () => {
  assert.equal(thresholdBreached(null, 300), true);
  assert.equal(thresholdBreached(301, 300), true);
  assert.equal(thresholdBreached(300, 300), false);
});

test("summarizeFreezes keeps only post-visible gaps above the limit", () => {
  const freezes = [
    { startMs: 100, durationMs: 400 },
    { startMs: 500, durationMs: 1200 },
    { startMs: 2000, durationMs: 900 },
  ];
  const summary = summarizeFreezes(freezes, 450, 1000);
  assert.equal(summary.overThreshold, 1);
  assert.equal(summary.worst.durationMs, 1200);
  assert.equal(summary.afterVisible.length, 2);
});

test("evaluateThresholds fails the Nov-4 class of stall", () => {
  const thresholds = { ...DEFAULT_THRESHOLDS };
  const bad = evaluateThresholds(
    {
      clickFeedbackMs: 9800,
      timeToPlayMs: 20_000,
      freezes: [{ startMs: 3000, durationMs: 9800 }],
      inputDelays: [{ delayMs: 400, type: "click" }],
      pageErrors: [],
    },
    thresholds,
    2700,
  );
  assert.equal(bad.pass, false);
  assert.ok(bad.failures.some((f) => f.kind === "clickFeedback"));
  assert.ok(bad.failures.some((f) => f.kind === "timeToPlay"));
  assert.ok(bad.failures.some((f) => f.kind === "freeze"));
  assert.ok(bad.failures.some((f) => f.kind === "inputDelay"));
});

test("evaluateThresholds passes a crisp run", () => {
  const thresholds = { ...DEFAULT_THRESHOLDS };
  const good = evaluateThresholds(
    {
      clickFeedbackMs: 120,
      timeToPlayMs: 4000,
      freezes: [{ startMs: 1000, durationMs: 300 }],
      inputDelays: [{ delayMs: 40, type: "pointerdown" }],
      pageErrors: [],
    },
    thresholds,
    800,
  );
  assert.equal(good.pass, true);
  assert.equal(good.failures.length, 0);
});

test("formatJourneyLine stays compact", () => {
  const line = formatJourneyLine("f22", {
    pass: false,
    clickFeedbackMs: 9800,
    timeToPlayMs: 18000,
    worstInputDelayMs: 400,
    worstFreezeMs: 9800,
    controlVisibleMs: 2700,
    offenders: ["clickFeedback=9800ms", "freeze@3000=9800ms"],
  });
  assert.match(line, /^f22 FAIL /);
  assert.match(line, /feedback=9800ms/);
  assert.match(line, /offenders=/);
  assert.ok(!line.includes("\n"));
});

test("a self-starting journey still fails on a long freeze and a slow start", () => {
  const result = evaluateThresholds(
    {
      clickFeedbackMs: null,
      timeToPlayMs: 26_000,
      freezes: [{ startMs: 9_000, durationMs: 7_700 }],
      inputDelays: [],
      pageErrors: [],
      skipped: true,
    },
    DEFAULT_THRESHOLDS,
    0,
  );
  assert.equal(result.pass, false);
  const kinds = result.failures.map((f) => f.kind).sort();
  assert.deepEqual(kinds, ["freeze", "timeToPlay"]);
});
