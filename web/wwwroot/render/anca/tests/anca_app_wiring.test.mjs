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
  assert.match(panelSource, /aria-expanded="false"/);
  assert.match(panelSource, /root\.hidden = true/);
  assert.match(panelSource, /\[data-anca-panel\]\[hidden\] \{ display: none; \}/);
  assert.match(panelSource, /toggle\.addEventListener\("click", \(\) => setOpen\(!open\)\)/);
  assert.match(panelSource, /if \(root\.hidden\) \{\s+setOpen\(false\);\s+return;\s+\}/);
  assert.doesNotMatch(panelSource, /html:not\(\.touch-mode\).*anca-line.*display: block/s);
});
