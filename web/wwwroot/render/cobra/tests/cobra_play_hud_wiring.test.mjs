import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Hold the Bridge play HUD surfaces gunner status through the canvas HUD", async () => {
  const [html, main, rotorcraftHud] = await Promise.all([
    source("cobra-lab/index.html"),
    source("cobra-lab/main.js"),
    source("render/cobra/cobra_rotorcraft_hud.js"),
  ]);
  // Build 264: the DOM text strip is replaced by the production hud.js canvas plus
  // the rotorcraft extras painter; the gunner truth flows through the extras model.
  assert.match(html, /id="hud-canvas"/);
  assert.doesNotMatch(html, /id="hud-gunner"/);
  assert.match(main, /cobraRotorcraftHudModel/);
  assert.match(main, /drawCobraRotorcraftHud/);
  assert.match(rotorcraftHud, /gunnerStatusText/);
  // The designation bracket must project through the render camera the scene was drawn
  // with, or the mark and the world disagree by exactly the camera's crew bias.
  assert.match(main, /projectWorldPoint: projectSimPointToScreen/);
  assert.match(main, /projectionScratch\.project\(camera\)/);
});

test("the airframe silhouette follows the camera mode from a single call site", async () => {
  const main = await source("cobra-lab/main.js");
  // Build 264 defect: the mode was set from inside the manual and tour branches, and a
  // terminal mission freezes the tour branch — so a crash in first person left the shell
  // hidden and the exterior camera framed empty sky. The camera mode is the only input
  // that decides this, so exactly one unconditional call site may own it.
  assert.equal((main.match(/setFirstPerson\(/g) ?? []).length, 1);
  // Parked visual-review stills also force exterior (no cockpit over scenery shots).
  assert.match(main, /setFirstPerson\(!tourInput\.checked && !parkedCamera\)/);
  const sync = main.match(/function syncAuthorityCamera\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(sync, /setFirstPerson/);
});

test("the combiner stands down once the mission is terminal", async () => {
  const main = await source("cobra-lab/main.js");
  // A terminal card ends the sortie. Painting NR 100% and a live gun line behind an
  // AIRFRAME LOST card states rotor truth for a rotor that is gone.
  const drawHud = main.match(/function drawHud\([\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.match(drawHud, /!missionTerminal/);
});

test("the combiner paints above the scene vignette instead of under it", async () => {
  const css = await source("cobra-lab/styles.css");
  // .viewport::after is a generated last child, so an auto-z HUD canvas is painted
  // under the vignette and the tapes lose ~35% of their luminance at the frame edges,
  // which is exactly where the speed and altitude tapes live.
  const rule = css.match(/#hud-canvas \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(rule, /z-index: 1/);
});

test("ground war presentation receives the selected target for the in-world highlight", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /sync\(\s*authorityState(\?\.)?\.ground_war[\s\S]{0,120}?targetSelect\.value/);
});

test("target list rebuilds only when the living set changes and prefers the gunnery seam", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /aliveKey/);
  assert.match(main, /gunnery-seam\.000/);
  assert.match(main, /distanceToPlayer\(a\) - distanceToPlayer\(b\)/);
});

test("bingo ammo raises a rearm cue before the magazine is dry", async () => {
  const [main, objective] = await Promise.all([
    source("cobra-lab/main.js"),
    source("render/cobra/cobra_objective_copy.js"),
  ]);
  // Ember Run owns bingo copy in the objective strip helper; main still reads ammo_bingo.
  assert.match(objective, /BINGO AMMO/);
  assert.match(main, /ammo_bingo/);
  assert.match(main, /cobraObjectiveCopy/);
});

test("vestigial freelook cannot fight the authority camera once the bridge owns it", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /if \(!bridge\) \{\s*\n\s*\/\/ Vestigial freelook/);
});

test("play loop exposes the authoritative snapshot as a headless-QA steering seam", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /window\.__gunsOnlyCobraAuthority = authorityState/);
  // The zero-cockpit ruling is a rendering claim, and the exterior silhouette on a tour
  // rail is a few pixels wide. Both directions get a measurable seam rather than a squint.
  assert.match(main, /window\.__gunsOnlyCobraAirframeVisible = \(\) => ah1gPresence\?\.group\?\.visible === true/);
});

test("strike terminal states present a cause card, not the generic sortie-ended line", async () => {
  const main = await source("cobra-lab/main.js");
  const debriefFn = main.match(/function showMissionDebrief\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(debriefFn, /obstacle-collision/);
  assert.match(debriefFn, /vehicle-authority-lost/);
  assert.match(debriefFn, /terrain-unavailable/);
  assert.match(debriefFn, /collision_obstacle_id/);
});

test("every terminal card announces and wires the R restart affordance", async () => {
  const main = await source("cobra-lab/main.js");
  const debriefFn = main.match(/function showMissionDebrief\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(debriefFn, /R restarts/);
  assert.match(main, /KeyR[\s\S]{0,200}?missionTerminal[\s\S]{0,120}?restartRoute\(\)/);
});

test("route restart clears the terminal banner back to the online status", async () => {
  const main = await source("cobra-lab/main.js");
  const restart = main.match(/function restartRoute\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(restart, /setStatus\(/);
  assert.match(restart, /HOLD THE BRIDGE · AH-1G ONLINE/);
});
