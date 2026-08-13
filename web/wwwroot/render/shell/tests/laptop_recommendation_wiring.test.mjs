import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [appSource, indexSource] = await Promise.all([
  readFile(new URL("../../../app.js", import.meta.url), "utf8"),
  readFile(new URL("../../../index.html", import.meta.url), "utf8"),
]);

// The front door is laptop-first by doctrine: phones are a separate game we are not building.
// Below phone width, the shell must offer a dismissible recommendation card explaining why --
// never a gate. These checks follow the same reveal/dismiss idiom already proven by
// #ready-install-hint (html.<flag>-dismissed + a single localStorage key), so a phone visitor
// keeps exactly one persistence mechanism to reason about.

test("the laptop recommendation card exists with truthful copy", () => {
  assert.match(indexSource, /id="ready-laptop-hint"/, "missing #ready-laptop-hint");
  assert.match(indexSource,
    /id="ready-laptop-hint"[\s\S]{0,400}(laptop|desktop)[\s\S]{0,400}(keyboard)/i,
    "the card must explain the laptop/desktop recommendation and mention the keyboard");
  assert.match(indexSource,
    /id="ready-laptop-hint"[\s\S]{0,400}(flight controls|tactical map|instrument)/i,
    "the copy must cite the concrete reasons: flight controls, tactical map, instruments");
});

test("the card is phone-width only and never shows at desktop widths", () => {
  assert.match(indexSource,
    /@media \(max-width: 760px\) \{[\s\S]{0,400}#ready-laptop-hint[\s\S]{0,200}display: block/,
    "the reveal rule must live inside a phone-width media query, matching the shell's existing phone breakpoint");
  // Outside that media query, the resting state must be display:none so desktop never renders it.
  const restingRule = indexSource.match(/#ready-laptop-hint\s*\{[^}]*\}/);
  assert.ok(restingRule, "missing base #ready-laptop-hint rule");
  assert.match(restingRule[0], /display:\s*none/, "base rule must default to hidden (desktop stays hidden)");
});

test("dismissal persists via the shell's existing localStorage idiom", () => {
  assert.match(indexSource,
    /html\.laptop-hint-dismissed #ready-laptop-hint \{ display: none !important; \}/,
    "dismissed state must permanently hide the card, same pattern as install-hint-dismissed");
  assert.match(appSource,
    /localStorage\.getItem\("guns-laptop-hint-dismissed"\) === "1"/,
    "boot must check the same durable key the dismiss handler writes");
  assert.match(appSource,
    /document\.documentElement\.classList\.add\("laptop-hint-dismissed"\)/,
    "dismissal must set the html flag the CSS reveal rule checks");
  assert.match(appSource,
    /localStorage\.setItem\("guns-laptop-hint-dismissed", "1"\)/,
    "dismissal must persist under a single, real localStorage key");
});

test("the card never gates or blocks launch", () => {
  assert.doesNotMatch(indexSource,
    /id="ready-start"[^>]*disabled/,
    "Fly First Merge must never ship pre-disabled by the recommendation card");
  assert.doesNotMatch(appSource,
    /laptopHint[\s\S]{0,300}readyStart\.disabled\s*=\s*true/,
    "the laptop hint wiring must not disable the launch control");
  // The card is a plain button, not a modal/dialog that could trap focus over the launch path.
  assert.doesNotMatch(indexSource,
    /id="ready-laptop-hint"[^>]*role="dialog"/,
    "the card must not be a blocking dialog");
});
