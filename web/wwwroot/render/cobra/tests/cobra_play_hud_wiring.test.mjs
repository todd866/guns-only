import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Hold the Bridge mounts Cobra flight/crew truth on the production combiner", async () => {
  const [html, main, css] = await Promise.all([
    source("cobra-lab/index.html"),
    source("cobra-lab/main.js"),
    source("cobra-lab/styles.css"),
  ]);
  // The shared combiner remains the base. AH-1G-specific NR/TQ/RALT/gunner truth is drawn onto
  // that same canvas, without restoring the old HTML systems chrome.
  assert.match(html, /id="hud-canvas"/);
  assert.doesNotMatch(html, /id="hud-gunner"/);
  assert.match(main, /createHud\(/);
  assert.match(main, /updateFlightAudio/);
  assert.match(main, /hud\.setAudioEnabled\(playerSettings\.audio\)/,
    "Cobra must honor the persisted audio setting before gesture arming");
  assert.match(main, /armAudioFromGesture/);
  assert.match(main, /drawCobraRotorcraftHud/);
  assert.match(css, /body\[data-shell="play"\] \.play-chrome \{[\s\S]*?display: none/);
  assert.match(css, /body\[data-shell="play"\] \.objective-hud \{[\s\S]*?display: none/);
  assert.match(css, /body\[data-shell="play"\] \.legend \{[\s\S]*?display: none/);
});

test("Cobra damage stays in the production warning lane without mounting systems chrome", async () => {
  const [adapter, readouts, hud] = await Promise.all([
    source("render/cobra/cobra_hud_adapter.js"),
    source("render/hud/hud_readouts.js"),
    source("hud.js"),
  ]);
  assert.match(adapter, /out\.suppress_systems_panel = true/,
    "the Cobra adapter must declare warning-only systems presentation");
  assert.match(readouts, /panelSuppressed: state\.suppress_systems_panel === true/,
    "the shared readout must preserve panel suppression alongside its warnings");
  const drawSystemsPanel = hud.match(
    /drawSystemsPanel\(systems, state = null\) \{[\s\S]*?\n  \}/,
  )?.[0] ?? "";
  assert.match(drawSystemsPanel, /systems\.panelSuppressed/,
    "production hud.js must skip the generic panel while drawWarnings still consumes warnings");
  assert.match(hud,
    /this\.drawWarnings\(frame, systems\);[\s\S]*?this\.drawSystemsPanel\(systems, frame\.state\)/,
    "panel suppression must not bypass the production warning-lane draw");
});

test("the airframe silhouette follows the camera mode from a single call site", async () => {
  const main = await source("cobra-lab/main.js");
  // Build 264 defect: the mode was set from inside the manual and tour branches, and a
  // terminal mission freezes the tour branch — so a crash in first person left the shell
  // hidden and the exterior camera framed empty sky. The camera mode is the only input
  // that decides this, so exactly one unconditional call site may own it.
  assert.equal((main.match(/setFirstPerson\(/g) ?? []).length, 1);
  // Parked scenery stills hide the airframe (first-person polarity) so the near-field
  // emptiness gate scores the gorge, not the AH-1G hull filling the frame.
  assert.match(main, /setFirstPerson\(!tourInput\.checked \|\| !!parkedCamera\)/);
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
  assert.match(main, /applyGunnerTarget/);
  assert.match(main, /groundWarPresentation\?\.sync\(/);
  assert.match(main, /targetId \|\| null/);
});

test("combat stays unobstructed while lift teaching and the controls reference remain", async () => {
  const main = await source("cobra-lab/main.js");
  const onboarding = main.match(
    /onboarding = createControlsOnboarding\(\{[\s\S]*?\n      \}\);/,
  )?.[0] ?? "";
  assert.match(onboarding, /id: "lift"[\s\S]*?HOLD W — COLLECTIVE UP/);
  assert.doesNotMatch(onboarding, /id: "engage"|TAB TO TARGET|HOLD F TO ENGAGE/,
    "combat guidance must not cover the pilot's sight picture");
  assert.match(main, /\["controls-onboarding-reopen", "controls-onboarding-nudge"\]/,
    "the persistent H-opened controls reference must remain mounted");
});

test("V and Tab share the F-22 padlock / gun-target split", async () => {
  const [main, bridge] = await Promise.all([
    source("cobra-lab/main.js"),
    readFile(new URL("../../../../CobraWebBridge.cs", import.meta.url), "utf8"),
  ]);
  assert.match(main, /function togglePadlock\(/);
  assert.match(main, /function cycleHostileTarget\(/);
  assert.match(main, /event\.code === "KeyV"/);
  assert.match(main, /padlockActive/);
  assert.match(main, /resolveAuthorityLookAtPoint/);
  assert.match(main, /bridge\?\.TrySetVisualLockTarget\(targetId\) === true/,
    "V must acquire through authority rather than a renderer raycast");
  assert.match(main, /advancePadlockLosGrace/,
    "a sustained masked target must release the visual lock after grace");
  assert.match(bridge, /CanAcquireVisualLockTarget\(targetId\)/);
  assert.match(bridge, /_selectedTargetId = targetId/,
    "the acquired visual-lock entity must be the AI gunner's selected entity");
  assert.match(
    bridge,
    /_gunnerSightHasLineOfSight\s*=\s*CobraGunTargeting\.EvaluateLineOfSight\([\s\S]{0,320}?CobraGunTargeting\.AimPoint\(unit\.PositionWorldM\)\)/,
    "the production 10 Hz sight cache must use the same published aim point as acquisition and servo",
  );
  assert.match(bridge, /aim_y_m\s*=\s*targetAimPoint\.Y/,
    "the authority aim height must reach padlock and HUD presentation without JS duplication");
});

test("forward authority camera is body-aligned with no hidden sight bias", async () => {
  const main = await source("cobra-lab/main.js");
  const sync = main.match(/function syncAuthorityCamera\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(sync, /lookOffsetFromAngles\(bodyYaw, bodyPitch, lookDistanceM\)/);
  assert.doesNotMatch(sync, /bodyPitch\s*\+\s*0\.08/);
  assert.doesNotMatch(sync, /lookPitch\s*=\s*bodyPitch\s*\+/);
});

test("target list rebuilds only when the living set changes and never invents a departure target", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /aliveKey/);
  assert.doesNotMatch(main, /gunnery-seam\.000/);
  assert.match(main, /hostileTargetIds = cobraPrioritizedHostileTargetIds\(/,
    "the live Tab list must use objective-lock priority, not raw range sorting");
  assert.match(main, /targetSelect\.value = hostileTargetIds\[0\];[\s\S]*?bridge\?\.SetGunnerTarget\(targetSelect\.value\)/,
    "post-kill continuity selection must reach the AI gunner immediately");
});

test("bingo ammo stays on the combiner without replacing the combat order", async () => {
  const [main, objective, rotorcraftHud] = await Promise.all([
    source("cobra-lab/main.js"),
    source("render/cobra/cobra_objective_copy.js"),
    source("render/cobra/cobra_rotorcraft_hud.js"),
  ]);
  // The objective ladder retains its fallback rearm order, while the always-painted crew line
  // keeps BINGO visible during a live point fight without displacing that fight's order.
  assert.match(objective, /BINGO AMMO/);
  assert.match(main, /ammo_bingo/);
  assert.match(main, /cobraObjectiveCopy/);
  assert.match(rotorcraftHud, /AMMO BINGO/);
  assert.match(rotorcraftHud, /ammoBingo/);
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
  const [main, html] = await Promise.all([
    source("cobra-lab/main.js"), source("cobra-lab/index.html"),
  ]);
  assert.match(html, /id="debrief-restart"[^>]*aria-keyshortcuts="R"[^>]*>Retry</u);
  assert.doesNotMatch(html, /debrief-hint/u);
  assert.match(main, /KeyR[\s\S]{0,200}?missionTerminal[\s\S]{0,120}?restartRoute\(\)/);
});

test("Cobra result follows the shared evidence, correction, and action hierarchy", async () => {
  const [main, html] = await Promise.all([
    source("cobra-lab/main.js"), source("cobra-lab/index.html"),
  ]);
  assert.match(html, /debrief-kicker[\s\S]*debrief-title[\s\S]*debrief-body[\s\S]*debrief-facts[\s\S]*debrief-correction[\s\S]*debrief-restart[\s\S]*debrief-exit/u);
  assert.match(html, />Rounds<[\s\S]*id="debrief-rounds"/u);
  assert.match(html, />Friendly kills<[\s\S]*id="debrief-friendly-kills"/u);
  assert.match(html, />Battle time<[\s\S]*id="debrief-battle-time"/u);
  assert.doesNotMatch(html, />Airborne time</iu);
  assert.match(main, /cobraDebriefPresentation/u);
  assert.match(main, /cobraNextSortieCorrection/u);
  const debriefFn = main.match(/function showMissionDebrief\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(debriefFn, /setOptionalDebriefFact\(\s*debriefKills/u);
  assert.match(debriefFn, /setOptionalDebriefFact\(\s*debriefRounds/u);
  assert.match(debriefFn, /setOptionalDebriefFact\(\s*debriefBattleTime/u);
  const groundFireFn = main.match(
    /function groundFireDebriefDetail\(battleDamage\) \{[\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.doesNotMatch(groundFireFn, /observer_id|active_observer_id/u);
});

test("route restart clears the terminal banner back to the online status", async () => {
  const main = await source("cobra-lab/main.js");
  const restart = main.match(/function restartRoute\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(restart, /setStatus\(/);
  assert.match(restart, /HOLD THE BRIDGE · AH-1G ONLINE/);
});
