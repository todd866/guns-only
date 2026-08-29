import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  explicitSilentAudioQa,
  standaloneNavigationHref,
  syncStandaloneReturnLinks,
} from "../standalone_navigation.js";

const root = new URL("../../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("standalone navigation carries only an explicit silent-audio QA clamp", () => {
  assert.equal(
    standaloneNavigationHref("/cobra-lab/", {
      href: "https://guns-only.com/?program=cobra-lab&menu=1&server=off&audioQa=silent",
    }),
    "https://guns-only.com/cobra-lab/?audioQa=silent",
  );
  assert.equal(
    standaloneNavigationHref("/?program=cobra-lab&menu=1", {
      href: "https://guns-only.com/cobra-lab/?battleQa=1&audioQa=silent",
    }),
    "https://guns-only.com/?program=cobra-lab&menu=1&audioQa=silent",
  );
});

test("audible, empty, and unrelated source queries never become navigation state", () => {
  for (const href of [
    "https://guns-only.com/?audioQa=audible&server=off",
    "https://guns-only.com/?audioQa=&input=touch",
    "https://guns-only.com/?program=okanagan-fireboss",
  ]) {
    assert.equal(
      standaloneNavigationHref("/okanagan/", { href }),
      "https://guns-only.com/okanagan/",
    );
  }
  assert.equal(explicitSilentAudioQa({ href: "not a url" }), false);
});

test("an authored destination keeps its own route parameters but cannot force an audible QA mode", () => {
  assert.equal(
    standaloneNavigationHref("/weekend-ride/?session=fresh&audioQa=audible#grid", {
      href: "https://guns-only.com/?program=weekend-ride&audioQa=silent&server=off",
    }),
    "https://guns-only.com/weekend-ride/?session=fresh&audioQa=silent#grid",
  );
});

test("standalone return-link syncing clamps every same-origin catalogue exit", () => {
  const anchors = [
    { raw: "/?program=okanagan-fireboss&menu=1" },
    { raw: "../" },
    { raw: "#scene" },
    { raw: "https://example.test/" },
  ].map((entry) => ({
    ...entry,
    href: entry.raw,
    getAttribute(name) { return name === "href" ? this.raw : null; },
  }));
  const count = syncStandaloneReturnLinks({
    querySelectorAll: () => anchors,
  }, {
    href: "https://guns-only.com/okanagan/?sortie=fire-attack&audioQa=silent",
  });
  assert.equal(count, 2);
  assert.equal(anchors[0].href,
    "https://guns-only.com/?program=okanagan-fireboss&menu=1&audioQa=silent");
  assert.equal(anchors[1].href, "https://guns-only.com/?audioQa=silent");
  assert.equal(anchors[2].href, "#scene");
  assert.equal(anchors[3].href, "https://example.test/");
});

test("the shell and each production standalone use the shared boundary helper", async () => {
  const [app, cobra, weekend, okanagan] = await Promise.all([
    source("app.js"),
    source("cobra-lab/main.js"),
    source("weekend-ride/main.js"),
    source("okanagan/main.js"),
  ]);
  assert.match(app,
    /window\.location\.assign\(standaloneNavigationHref\(standalone\.route, window\.location\)\)/u);
  assert.match(cobra,
    /standaloneNavigationHref\(MAIN_MENU_HREF, window\.location\)/u);
  assert.match(weekend,
    /standaloneNavigationHref\(\s*[^,]+\.getAttribute\("href"\),\s*window\.location/u);
  assert.match(okanagan,
    /standaloneNavigationHref\(\s*[^,]+\.getAttribute\("href"\),\s*window\.location/u);
});
