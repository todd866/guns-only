import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../../app.js", import.meta.url), "utf8");
const panelSource = await readFile(
  new URL("../anca_panel.js", import.meta.url), "utf8");

test("production app wires the ANCA panel", () => {
  assert.match(source,
    /import \{ createAncaPanelPresentation \} from "\.\/render\/anca\/anca_panel\.js"/);
  assert.match(source,
    /this\.ancaPanel = createAncaPanelPresentation\(document\)/);
  assert.match(source, /this\.ancaPanel\?\.update\(state\)/);
});

test("the panel yields to the dedicated casevac presentation", () => {
  assert.match(source, /this\.ancaPanel\?\.update\(null\)/);
});

test("ANCA is a closed-by-default auxiliary drawer", () => {
  assert.match(panelSource, /data-anca-toggle/);
  assert.match(panelSource, /data-anca-drawer[^>]*hidden/);
  assert.match(panelSource, /data-anca-empty/);
  assert.match(panelSource, /aria-expanded="false"/);
  assert.match(panelSource, /root\.hidden = true/);
  assert.match(panelSource, /\[data-anca-panel\]\[hidden\] \{ display: none; \}/);
  assert.match(panelSource, /toggle\.addEventListener\("click", \(\) => setOpen\(!open\)\)/);
  assert.match(panelSource,
    /root\.hidden = !currentView\?\.visible\s+\|\| \(touchMode && currentView\.tone === "quiet" && !open\)/,
    "the quiet auxiliary chip must not compete with the tactical HUD on touch screens");
  assert.match(panelSource, /if \(!view\.visible\) \{\s+setOpen\(false\);\s+return;\s+\}/);
  assert.match(panelSource, /empty\.hidden = view\.shownRows\.length > 0/);
  assert.match(panelSource, /node\.hidden = !rowView\.shown/);
  assert.match(panelSource, /NOW · NEXT · WHO · VERIFY/);
  assert.match(panelSource, /ANCA four-layer priority cross-check/);
  assert.doesNotMatch(panelSource, /html:not\(\.touch-mode\).*anca-line.*display: block/s);
});
