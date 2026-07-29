import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../../app.js", import.meta.url), "utf8");

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
