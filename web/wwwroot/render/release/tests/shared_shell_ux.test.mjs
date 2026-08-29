import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");

const [indexSource, hudSource] = await Promise.all([
  readFile(path.join(ROOT, "web/wwwroot/index.html"), "utf8"),
  readFile(path.join(ROOT, "web/wwwroot/hud.js"), "utf8"),
]);

test("unselected aircraft posters retain aircraft and sortie identity", () => {
  assert.match(indexSource,
    /\.sortie-choice\[data-aircraft\] > \.sortie-number,\s*#ready-screen\[data-mode="program"\] \.sortie-choice\[data-aircraft\] > strong\s*\{[\s\S]*?width:\s*auto;[\s\S]*?clip:\s*auto;/u,
    "aircraft and sortie labels must remain visible without hover, focus, or selection");
  assert.match(indexSource,
    /\.sortie-choice\[data-aircraft\]::before\s*\{[\s\S]*?opacity:\s*\.72;/u,
    "persistent identity needs a legible lower-card scrim");
  assert.match(indexSource,
    /\.sortie-choice\[data-aircraft\] > \.sortie-contract\s*\{[\s\S]*?display:\s*block;/u,
    "the longer sortie contract must remain available to the interaction reveal");
});

test("desktop flight chrome advertises Escape pause and the H quicklook repeats it", () => {
  assert.match(indexSource,
    /class="pause-desktop"[^>]*>ESC · PAUSE<\/span>/u);
  assert.match(indexSource,
    /class="pause-mobile"[^>]*>Ⅱ<\/span>/u,
    "touch keeps a compact 44px pause target without advertising an unavailable key");
  assert.equal((hudSource.match(/ESC  PAUSE \/ MENU/g) ?? []).length, 2,
    "wide and compact H quicklooks must both expose the pause/menu lifecycle key");
});

test("systems and navigation disclosure selectors target both summaries and both cues", () => {
  assert.match(indexSource,
    /#test-flight-console > summary:focus-visible,\s*#nav-console > summary:focus-visible\s*\{/u);
  assert.match(indexSource,
    /#test-flight-console\[open\] \.tf-collapse-cue::before,\s*#nav-console\[open\] \.tf-collapse-cue::before\s*\{ content: "CLOSE ▲"; \}/u);
  assert.match(indexSource,
    /#test-flight-console:not\(\[open\]\) \.tf-collapse-cue::before,\s*#nav-console:not\(\[open\]\) \.tf-collapse-cue::before\s*\{ content: "OPEN ▼"; \}/u);
  assert.match(indexSource,
    /@media \(max-width: 620px\)[\s\S]*?#test-flight-console > summary,\s*#nav-console > summary\s*\{ min-height: 36px; padding-block: 7px; \}/u,
    "mobile sizing must style both summaries rather than the entire systems details element");

  for (const malformedSelector of [
    "#test-flight-console, #nav-console > summary:focus-visible",
    "#test-flight-console, #nav-console[open] .tf-collapse-cue::before",
    "#test-flight-console, #nav-console:not([open]) .tf-collapse-cue::before",
    "#test-flight-console, #nav-console > summary { min-height: 36px",
  ]) {
    assert.equal(indexSource.includes(malformedSelector), false,
      `malformed selector must not return: ${malformedSelector}`);
  }
});

test("every standalone shell shares one canonical Three.js module identity", async () => {
  const paths = [
    "web/wwwroot/cobra-lab/main.js",
    "web/wwwroot/weekend-ride/main.js",
    "web/wwwroot/okanagan/main.js",
    "web/wwwroot/render/okanagan/fireboss_cockpit.js",
    "web/wwwroot/render/okanagan/okanagan_highway.js",
    "web/wwwroot/render/okanagan/okanagan_world.js",
    "web/wwwroot/render/okanagan/okanagan_fire_effects.js",
  ];
  for (const sourcePath of paths) {
    const source = await readFile(path.join(ROOT, sourcePath), "utf8");
    assert.match(source, /vendor\/three\.module\.js"/u,
      `${sourcePath} must import the canonical unsuffixed vendor module`);
    assert.doesNotMatch(source, /vendor\/three\.module\.js\?v=/u,
      `${sourcePath} must not create a second Three.js module identity`);
  }
});
