import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MAIN_MENU_HREF, resolveEscapeAction } from "../cobra_mission_exit.js";

const root = new URL("../../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Escape leaves the sortie for the main menu", () => {
  assert.equal(resolveEscapeAction({ onboardingOpen: false }), "leave-mission");
  assert.equal(MAIN_MENU_HREF, "/");
});

test("Escape dismisses the first-run controls card before it exits", () => {
  // The onboarding overlay dismisses on ANY key, so without this ordering the very first Esc
  // of a player's first sortie would both close the card and quit the mission.
  assert.equal(resolveEscapeAction({ onboardingOpen: true }), "dismiss-onboarding");
});

test("a terminal sortie still escapes to the menu", () => {
  // A debrief card is not a reason to trap the player on the page.
  assert.equal(
    resolveEscapeAction({ onboardingOpen: false, missionTerminal: true }),
    "leave-mission",
  );
});

test("the Cobra shell wires Escape to a teardown, not a bare navigation", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /resolveEscapeAction/, "Escape must route through the shared decision");
  assert.match(main, /event\.code !== "Escape"/);
  // Leaving must stop the frame loop, flush telemetry and release GPU/keyboard state, or the
  // mission leaks a running rAF, an unsent telemetry tail and a live WebGL context.
  assert.match(main, /function teardownMission\(/);
  for (const teardown of [
    /cancelAnimationFrame\(animationFrame\)/,
    /telemetryChannel\.flush\(/,
    /presentation\?\.dispose\(\)/,
    /groundWarPresentation\?\.dispose\(\)/,
    /renderer\.dispose\(\)/,
    /keys\.clear\(\)/,
    /onboarding\?\.dispose\(\)/,
  ]) assert.match(main, teardown, `teardown must run ${teardown}`);
});

test("the controls card teaches the exit", async () => {
  // An exit nobody can discover is not an exit. The card is the only place this page states
  // its keys, and Escape now does something, so it belongs in the SYSTEM group.
  const content = await source("render/onboarding/controls_content.js");
  assert.match(content, /"Esc", "Leave the sortie · back to the menu"/);
});

test("Escape is handled before anything can swallow it", async () => {
  const main = await source("cobra-lab/main.js");
  const escapeIndex = main.indexOf('event.code !== "Escape"');
  assert.ok(escapeIndex >= 0, "the shell must handle Escape at all");
  assert.ok(
    escapeIndex < main.indexOf("if (!isManualControl(event.code)"),
    "Escape must be handled before the manual-control allowlist returns early",
  );
  // The onboarding overlay dismisses from a capture-phase listener on document, so the mission's
  // Escape handler has to be capture-phase on window to see the key first. A bubble-phase
  // listener always loses this race and quits the mission on the first-ever keypress.
  const listener = main.slice(escapeIndex, main.indexOf("}, true);", escapeIndex));
  assert.ok(listener.length > 0, "Escape must be registered with capture: true");
  assert.match(listener, /onboarding\?\.isOpen\(\) === true/);
});
