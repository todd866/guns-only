import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MAIN_MENU_HREF, resolveEscapeAction } from "../cobra_mission_exit.js";

const root = new URL("../../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Escape toggles a resumable pause instead of leaving the sortie", () => {
  assert.equal(resolveEscapeAction(), "pause");
  assert.equal(resolveEscapeAction({ paused: true }), "resume");
  assert.equal(MAIN_MENU_HREF, "/?program=cobra-lab&menu=1");
});

test("Escape peels onboarding and the tactical map before pause", () => {
  assert.equal(resolveEscapeAction({ onboardingOpen: true, tacticalMapOpen: true }),
    "dismiss-onboarding");
  assert.equal(resolveEscapeAction({ tacticalMapOpen: true }), "close-map");
});

test("a terminal debrief remains the top layer instead of opening a fake live pause", () => {
  assert.equal(resolveEscapeAction({ terminal: true }), "noop");
});

test("play opens on a deliberate mission brief before authority time can move", async () => {
  const [main, html, styles] = await Promise.all([
    source("cobra-lab/main.js"),
    source("cobra-lab/index.html"),
    source("cobra-lab/styles.css"),
  ]);

  assert.match(html, /id="mission-brief"[^>]*class="mission-overlay mission-brief"[^>]*role="dialog"/u);
  assert.match(html,
    /mission-kicker[\s\S]*mission-brief-title[\s\S]*mission-brief-summary[\s\S]*mission-brief-facts[\s\S]*FIRST MOVE[\s\S]*mission-brief-start[\s\S]*mission-brief-exit/u);
  assert.match(html, /At 10:00, points decide; tickets break ties\. A tie loses\./u,
    "the brief must disclose the authority clock and tie-break without a rules essay");
  assert.match(html, /<dt>Score<\/dt><dd>10:00 · points, then tickets<\/dd>/u);
  assert.match(html,
    /mission-brief-controls mission-brief-controls--desktop[\s\S]*W \/ S collective · arrows cyclic · A \/ D pedals[\s\S]*Tab selects · hold F engages[\s\S]*M map · H full controls · Esc pause/u,
    "the flight brief must teach enough keyboard controls to launch without a second modal");
  assert.match(html,
    /mission-brief-controls mission-brief-controls--touch[\s\S]*Required for combat · no touch controls[\s\S]*Flight controls only[\s\S]*H full controls · Esc pause/u,
    "touch presentation must remain honest about the required physical controls");
  assert.doesNotMatch(html, /trigger consents/iu,
    "the brief must not claim gamepad combat controls that do not exist");
  assert.match(main, /function showMissionBrief\(\)[\s\S]*missionBriefOpen = true[\s\S]*setCobraMissionBackgroundInert\(true\)/u);
  const startFromBrief = main.match(/function startMissionFromBrief\(\) \{[\s\S]*?\n\}/u)?.[0] ?? "";
  assert.match(startFromBrief,
    /markFirstRunSeen\(safeLocalStorage\(\), COBRA_ONBOARDING_CONTENT\.modeId\)[\s\S]*sortieReadiness\.start\(\)[\s\S]*canvas\?\.focus/u,
    "Start must acknowledge the taught lesson and move directly into the focused cockpit");
  assert.doesNotMatch(startFromBrief, /maybeShowFirstRun/u,
    "Start must not create a false second launch through the full controls modal");
  assert.match(main, /if \(missionBriefOpen \|\| missionPaused \|\| onboarding\?\.isOpen\(\) === true\) return;/u,
    "brief and teaching layers must hold authority outside the pause lifecycle");
  assert.match(main,
    /createControlsOnboarding\(\{[\s\S]*storage: safeLocalStorage\(\)[\s\S]*touch: TOUCH_PRESENTATION[\s\S]*focusTarget: canvas[\s\S]*canOpen: \(\) => !missionBriefOpen && !missionPaused && !missionTerminal/u,
    "the H-opened reference must share the brief's input variant and safe storage contract");
  assert.match(main,
    /\["controls-onboarding-reopen", "controls-onboarding-nudge"\][\s\S]*missionBackground\.push\(node\)[\s\S]*showMissionBrief\(\)/u,
    "dynamic controls chrome must join the background before the brief makes it inert");
  assert.match(styles, /\.mission-brief\[hidden\] \{ display: none; \}/u);
  assert.match(styles,
    /body\[data-brief="true"\] #controls-onboarding-reopen[\s\S]*display: none !important/u,
    "controls chrome must not render above the route brief");
  assert.match(styles,
    /\.mission-brief-controls--touch \{ display: none; \}[\s\S]*body\[data-input="touch"\] \.mission-brief-controls--desktop \{ display: none; \}[\s\S]*body\[data-input="touch"\] \.mission-brief-controls--touch \{ display: grid; \}/u);
});

test("the terminal debrief retains explicit restart and exit actions", async () => {
  const [main, html, styles] = await Promise.all([
    source("cobra-lab/main.js"),
    source("cobra-lab/index.html"),
    source("cobra-lab/styles.css"),
  ]);
  assert.match(html, /id="debrief"[\s\S]*id="debrief-restart"[\s\S]*id="debrief-exit"/u);
  assert.match(html, /id="debrief"[^>]*role="dialog"[^>]*aria-modal="true"/u);
  assert.match(html, /id="debrief-exit"[^>]*>Aircraft</u);
  assert.match(main, /debriefExit\?\.addEventListener\("click", leaveMissionForMenu\)/u);
  assert.match(main, /debrief\.hidden = false;[\s\S]*?debriefRestart\?\.focus/u);
  assert.match(main, /debrief\?\.addEventListener\("keydown"[\s\S]*?containDialogFocus/u);
  assert.match(main, /if \(missionTerminal\) return;\s*if \(event\.code === "Tab"\)/u,
    "terminal Tab must stay inside the debrief instead of cycling a combat target");
  assert.match(html, /<canvas id="scene" tabindex="-1"><\/canvas>/u,
    "the flight surface must accept programmatic focus after a modal closes");
  const restart = main.match(/function restartRoute\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(restart, /canvas\?\.focus\?\.\(\{ preventScroll: true \}\)/u,
    "Fly again must return focus to the live flight surface");
  assert.match(main,
    /missionTerminal = true;\s*document\.body\.dataset\.terminal = "true"/u);
  assert.match(restart,
    /missionTerminal = false;\s*document\.body\.dataset\.terminal = "false"/u);
  assert.match(styles,
    /body\[data-terminal="true"\] \.device-advisory--play \{ display: none; \}/u,
    "the input advisory must not cover a terminal result");
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
  assert.match(main, /muted: missionBriefOpen \|\| missionPaused \|\| missionTerminal/u);
  assert.match(main, /bridge\?\.SetEngagementConsent\(false\)/u);
  assert.match(main, /pilotControls = releaseCobraPilotControls\(pilotControls\)[\s\S]*?bridge\?\.SetControls\(pilotControls\.collective, 0, 0, 0\)/u,
    "pause must release spring-centred controls before the next resumed frame");
  assert.match(main, /pauseResume\?\.focus/u);
  assert.match(main, /pauseMenu\?\.addEventListener\("keydown"/u);
  assert.match(main, /focusOutside = !focusable\.includes\(document\.activeElement\)/u,
    "focus recovery from outside a dialog must land on a valid action");
  assert.match(main, /event\.stopPropagation\(\)/u,
    "dialog Tab must not become a gunner target command");
  assert.match(main,
    /const missionBackground = \[[\s\S]*\.skip-link[\s\S]*\.device-advisory--play[\s\S]*#play-chrome[\s\S]*\]\.filter\(Boolean\)/u,
    "route-owned dialogs must make every non-modal focus/status surface inert");
  assert.match(main,
    /missionBackgroundInertState\.set\(node, node\.inert === true\)[\s\S]*node\.inert = true[\s\S]*for \(const \[node, wasInert\] of missionBackgroundInertState\) node\.inert = wasInert/u,
    "closing a route dialog must restore each surface's prior inert state");
});

test("Return to aircraft remains explicit and performs the existing complete teardown", async () => {
  const [main, html] = await Promise.all([
    source("cobra-lab/main.js"),
    source("cobra-lab/index.html"),
  ]);
  assert.match(html, /id="pause-exit"[^>]*>Aircraft</u);
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

test("compact touch presentation is explicit about its input and orientation limits", async () => {
  const [main, html, styles] = await Promise.all([
    source("cobra-lab/main.js"),
    source("cobra-lab/index.html"),
    source("cobra-lab/styles.css"),
  ]);

  assert.match(main, /const TOUCH_PRESENTATION = detectTouchEnvironment\(window\)/u);
  assert.match(html, /device-advisory--brief[^>]*>Keyboard required for combat\./u);
  assert.match(html, /device-advisory--play[^>]*>Keyboard for combat · landscape/u);
  assert.match(styles,
    /@media \(max-width: 620px\) and \(orientation: portrait\)[\s\S]*body\[data-input="touch"\] #minimap \{ display: none; \}/u);
  assert.match(styles, /@media \(max-height: 520px\)[\s\S]*max-height: calc\(100dvh - 20px\)/u);
});

test("the shared controls lesson freezes simulation, formation, and propulsion audio", async () => {
  const main = await source("cobra-lab/main.js");

  assert.match(main,
    /if \(missionBriefOpen \|\| missionPaused \|\| onboarding\?\.isOpen\(\) === true\) return;/u);
  assert.match(main,
    /formationLead\?\.update\([\s\S]*missionBriefOpen \|\| missionPaused \|\| missionTerminal \|\| onboarding\?\.isOpen\(\) === true/u);
  assert.match(main,
    /muted: missionBriefOpen \|\| missionPaused \|\| missionTerminal[\s\S]*onboarding\?\.isOpen\(\) === true/u);
});
