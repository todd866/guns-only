import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MAIN_MENU_HREF, resolveEscapeAction } from "../cobra_mission_exit.js";

const root = new URL("../../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Escape toggles a resumable pause instead of leaving the sortie", () => {
  assert.equal(resolveEscapeAction(), "pause");
  assert.equal(resolveEscapeAction({ paused: true }), "resume");
  assert.equal(MAIN_MENU_HREF, "/");
});

test("Escape peels onboarding and the tactical map before pause", () => {
  assert.equal(resolveEscapeAction({ onboardingOpen: true, tacticalMapOpen: true }),
    "dismiss-onboarding");
  assert.equal(resolveEscapeAction({ tacticalMapOpen: true }), "close-map");
});

test("a terminal debrief remains the top layer instead of opening a fake live pause", () => {
  assert.equal(resolveEscapeAction({ terminal: true }), "noop");
});

test("the Cobra shell owns a real pause dialog and freezes authority advance", async () => {
  const [main, html, styles] = await Promise.all([
    source("cobra-lab/main.js"),
    source("cobra-lab/index.html"),
    source("cobra-lab/styles.css"),
  ]);
  assert.match(html, /id="pause-menu"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/u);
  for (const id of ["pause-resume", "pause-restart", "pause-exit"])
    assert.match(html, new RegExp(`id="${id}"`));
  assert.match(styles, /\.pause-menu\[hidden\]/u);
  assert.match(main, /if \(missionPaused\) return;/u,
    "the manual frame must return before bridge.Advance and control writes");
  assert.match(main, /muted: missionPaused \|\| missionTerminal/u);
  assert.match(main, /bridge\?\.SetEngagementConsent\(false\)/u);
  assert.match(main, /pilotControls = releaseCobraPilotControls\(pilotControls\)[\s\S]*?bridge\?\.SetControls\(pilotControls\.collective, 0, 0, 0\)/u,
    "pause must release spring-centred controls before the next resumed frame");
  assert.match(main, /pauseResume\?\.focus/u);
  assert.match(main, /pauseMenu\?\.addEventListener\("keydown"/u);
});

test("Exit Mission remains explicit and performs the existing complete teardown", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /pauseExit\?\.addEventListener\("click", leaveMissionForMenu\)/u);
  assert.match(main, /function teardownMission\(/u);
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

test("the controls card teaches pause", async () => {
  const content = await source("render/onboarding/controls_content.js");
  assert.match(content, /"Esc", "Pause · resume from the mission menu"/u);
});
