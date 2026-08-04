import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Hold the Bridge play HUD surfaces gunner status, not just lab chrome", async () => {
  const [html, main] = await Promise.all([
    source("cobra-lab/index.html"),
    source("cobra-lab/main.js"),
  ]);
  assert.match(html, /id="hud-gunner"/);
  assert.match(main, /gunnerStatusText/);
  assert.match(main, /hud-gunner/);
});

test("ground war presentation receives the selected target for the in-world highlight", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /sync\(\s*authorityState(\?\.)?\.ground_war[\s\S]{0,120}?targetSelect\.value/);
});

test("target list rebuilds only when the living set changes and stays distance-ordered", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /aliveKey/);
  assert.match(main, /sort\(\(a, b\) => distanceToPlayer\(a\) - distanceToPlayer\(b\)\)/);
});

test("bingo ammo raises a rearm cue before the magazine is dry", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /BINGO AMMO/);
  assert.match(main, /ammo_bingo/);
});

test("vestigial freelook cannot fight the authority camera once the bridge owns it", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /if \(!bridge\) \{\s*\n\s*\/\/ Vestigial freelook/);
});

test("play loop exposes the authoritative snapshot as a headless-QA steering seam", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /window\.__gunsOnlyCobraAuthority = authorityState/);
});

test("route restart clears the terminal banner back to the online status", async () => {
  const main = await source("cobra-lab/main.js");
  const restart = main.match(/function restartRoute\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(restart, /setStatus\(/);
  assert.match(restart, /HOLD THE BRIDGE · AH-1G ONLINE/);
});
