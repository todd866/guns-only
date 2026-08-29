import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cobraKeyboardControlIntent } from "../cobra_control_profile.js";
import {
  advanceCobraPilotControls,
  createCobraGroundedPilotControlState,
  createCobraPilotControlState,
} from "../cobra_pilot_input.js";
import {
  createCobraSortieReadyInterlock,
  hasDeliberateCobraCockpitInput,
} from "../cobra_sortie_ready.js";

const root = new URL("../../../", import.meta.url);

test("idle Ready time cannot advance the mission clock or reach a terminal", () => {
  const readiness = createCobraSortieReadyInterlock();
  let missionSeconds = 0;
  let terminal = false;
  const advanceAuthority = (deltaSeconds) => {
    missionSeconds += deltaSeconds;
    if (missionSeconds >= 22) terminal = true;
  };

  // Build 325 reached HARD IMPACT at 22 seconds while this first-run card was still open.
  // Thirty seconds of wall time in Ready must therefore remain zero mission seconds.
  for (let frame = 0; frame < 300; frame += 1) {
    assert.equal(readiness.advance(0.1, advanceAuthority), false);
  }

  assert.equal(missionSeconds, 0);
  assert.equal(terminal, false);
  assert.equal(readiness.ready, false);
});

test("the first W event both starts the sortie and reaches the collective on that frame", () => {
  const readiness = createCobraSortieReadyInterlock();
  const heldKeys = new Set();
  let pilotControls = createCobraGroundedPilotControlState();
  let missionSeconds = 0;

  // This is the browser event order: preserve the key, recognise its cockpit intent, then let
  // the normal frame path integrate and send it. Starting may not consume or defer that input.
  heldKeys.add("KeyW");
  const keyboardIntent = cobraKeyboardControlIntent(heldKeys);
  assert.equal(hasDeliberateCobraCockpitInput({ keyboardIntent }), true);
  assert.equal(readiness.observeInput(true), true);
  const advanced = readiness.advance(0.25, (deltaSeconds) => {
    pilotControls = advanceCobraPilotControls(pilotControls, {
      keyboardIntent,
      deltaSeconds,
    });
    missionSeconds += deltaSeconds;
  });

  assert.equal(advanced, true);
  assert.equal(missionSeconds, 0.25);
  assert.ok(pilotControls.collective > 0,
    `the arming W was swallowed: collective=${pilotControls.collective}`);
});

test("tactical and analog inputs are deliberate, but a neutral controller is not", () => {
  assert.equal(hasDeliberateCobraCockpitInput({
    keyboardIntent: cobraKeyboardControlIntent(new Set(["KeyF"])),
  }), true);
  assert.equal(hasDeliberateCobraCockpitInput({
    analogAxes: { collectiveRate: 0.3, forwardCyclic: 0, rightCyclic: 0, yaw: 0 },
  }), true);
  assert.equal(hasDeliberateCobraCockpitInput({
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    analogAxes: { collectiveRate: 0, forwardCyclic: 0, rightCyclic: 0, yaw: 0 },
  }), false);
  assert.equal(hasDeliberateCobraCockpitInput({ turnaroundAction: true }), true,
    "the contextual engine action must be able to advance an authority-owned turnaround");
});

test("restart returns an armed sortie to Ready and blocks authority again", () => {
  const readiness = createCobraSortieReadyInterlock();
  let advances = 0;
  readiness.start();
  assert.equal(readiness.advance(0.1, () => { advances += 1; }), true);
  readiness.reset();
  assert.equal(readiness.ready, false);
  assert.equal(readiness.advance(30, () => { advances += 1; }), false);
  assert.equal(advances, 1);
});

test("restart ignores held keyboard or gamepad input until neutral then preserves the next edge", () => {
  const readiness = createCobraSortieReadyInterlock();
  let advances = 0;
  readiness.start();
  readiness.reset(false, { requireNeutral: true });

  assert.equal(readiness.awaitingNeutral, true);
  // A held W key or non-neutral gamepad axis keeps presenting deliberate input every frame. It
  // must not turn a restart into an immediate launch.
  assert.equal(readiness.observeInput(true), false);
  assert.equal(readiness.observeInput(true), false);
  assert.equal(readiness.advance(0.1, () => { advances += 1; }), false);
  assert.equal(readiness.ready, false);

  // One complete neutral observation arms the edge detector without starting authority.
  assert.equal(readiness.observeInput(false), false);
  assert.equal(readiness.awaitingNeutral, false);
  assert.equal(readiness.ready, false);

  // The next deliberate edge starts immediately; the normal frame path can apply it unchanged.
  assert.equal(readiness.observeInput(true), true);
  assert.equal(readiness.advance(0.1, () => { advances += 1; }), true);
  assert.equal(advances, 1);
});

test("airframe swap grounds the spare and held collective cannot preload it before neutral", () => {
  const readiness = createCobraSortieReadyInterlock({ ready: true });
  let pilotControls = createCobraPilotControlState(0.78);
  const heldCollective = { collectiveRate: 1, forwardCyclic: 0, rightCyclic: 0, yaw: 0 };

  // Authority has swapped birds. Browser acknowledgement must make this another cold ramp and
  // arm the same neutral-edge doctrine as a restart.
  readiness.reset(false, { requireNeutral: true });
  pilotControls = createCobraGroundedPilotControlState();

  for (let frame = 0; frame < 4; frame += 1) {
    assert.equal(readiness.observeInput(true), false);
    if (readiness.ready) {
      pilotControls = advanceCobraPilotControls(pilotControls, {
        analogAxes: heldCollective,
        deltaSeconds: 0.25,
      });
    }
  }
  assert.equal(readiness.ready, false);
  assert.equal(pilotControls.collective, 0);

  assert.equal(readiness.observeInput(false), false);
  assert.equal(readiness.observeInput(true), true);
  pilotControls = advanceCobraPilotControls(pilotControls, {
    analogAxes: heldCollective,
    deltaSeconds: 0.25,
  });
  assert.ok(pilotControls.collective > 0,
    "the first deliberate post-neutral pull must still reach the new bird");
});

test("lab mode starts and resets armed while play mode starts and resets at Ready", () => {
  const labReadiness = createCobraSortieReadyInterlock({ ready: true });
  let labAdvances = 0;
  assert.equal(labReadiness.ready, true);
  assert.equal(labReadiness.advance(0.1, () => { labAdvances += 1; }), true);
  labReadiness.reset(true);
  assert.equal(labReadiness.ready, true);
  assert.equal(labReadiness.advance(0.1, () => { labAdvances += 1; }), true);
  assert.equal(labAdvances, 2);

  const playReadiness = createCobraSortieReadyInterlock({ ready: false });
  playReadiness.reset(false);
  assert.equal(playReadiness.ready, false);
  assert.equal(playReadiness.advance(0.1, () => {}), false);
});

test("play stages zero while the continuously-running lab retains provider hover trim", () => {
  const providerHoverCollective = 0.5944;
  const playControls = createCobraGroundedPilotControlState();
  const labControls = createCobraPilotControlState(providerHoverCollective);
  const playReadiness = createCobraSortieReadyInterlock({ ready: false });
  const labReadiness = createCobraSortieReadyInterlock({ ready: true });

  assert.equal(playControls.collective, 0);
  assert.equal(playReadiness.advance(0.1, () => {
    throw new Error("play must remain staged");
  }), false);
  assert.equal(labControls.collective, providerHoverCollective);
  assert.equal(labReadiness.advance(0.1, () => {}), true);
});

test("Hold the Bridge wires Ready before every authority advance without swallowing keys", async () => {
  const main = await readFile(new URL("cobra-lab/main.js", root), "utf8");
  assert.match(main, /render\/cobra\/cobra_sortie_ready\.js\?v=\d+/);
  assert.match(main, /createCobraSortieReadyInterlock/);
  assert.match(main,
    /createCobraSortieReadyInterlock\(\{[\s\S]{0,80}?ready: !PLAY_MODE \|\| BATTLE_REVIEW_MODE,[\s\S]{0,30}?\}\)/,
    "lab and battle proof run continuously while ordinary play waits for deliberate input");
  assert.match(main, /hasDeliberateCobraCockpitInput/);
  assert.match(main,
    /let pilotControls = PLAY_MODE[\s\S]{0,120}?createCobraGroundedPilotControlState\(\)/,
    "play must stage the persistent lever at the physical full-down stop");

  const restart = main.match(/function restartRoute\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(restart, /const requireNeutralEdge = PLAY_MODE && authorityState !== null/,
    "the cold boot may preserve its first input, while an established sortie requires neutral");
  assert.match(restart,
    /sortieReadiness\.reset\(!PLAY_MODE \|\| BATTLE_REVIEW_MODE, \{[\s\S]{0,100}?requireNeutral: BATTLE_REVIEW_MODE \? false : requireNeutralEdge,[\s\S]{0,30}?\}\)/,
    "ordinary play restart must reject held controls while unattended battle proof stays armed");
  assert.match(restart,
    /pilotControls = PLAY_MODE[\s\S]{0,160}?createCobraGroundedPilotControlState\(\)/,
    "play restart must not mirror authority hover trim into the pilot lever");
  assert.match(restart, /bridge\?\.SetControls\([\s\S]{0,220}?pilotControls\.collective/,
    "restart must push full-down controls to authority before any Advance");
  assert.match(restart,
    /parkedPresences\.clear\(\);[\s\S]{0,160}?lastAirframeSwaps = 0;[\s\S]{0,260}?syncParkedAirframes\(\);/,
    "Ready must render the fresh ramp pool from StartRoute's direct snapshot before first input");

  const swapSync = main.match(/function syncParkedAirframes\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(swapSync,
    /swaps > lastAirframeSwaps[\s\S]{0,500}?createCobraGroundedPilotControlState\(\)/,
    "a spare must not inherit the previous airframe's collective lever");
  assert.match(swapSync,
    /sortieReadiness\.reset\(false, \{ requireNeutral: true \}\)/,
    "a play-mode swap must require neutral before accepting the held controls again");
  assert.match(swapSync, /if \(!bridge\.AcknowledgeAirframeSwap\(swaps\)\) return;/,
    "browser must retry instead of consuming a generation authority did not acknowledge");
  assert.match(swapSync, /bridge\.SetControls\(pilotControls\.collective, 0, 0, 0\)/);

  const sampleAuthority = main.match(
    /function sampleAuthorityState\(nowMs, \{ force = false \} = \{\}\) \{[\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.match(sampleAuthority,
    /authorityState = JSON\.parse\(bridge\.GetState\(\)\);[\s\S]{0,500}?syncParkedAirframes\(\);/,
    "the common DTO sampling seam must acknowledge swaps for manual, parked, and tour paths");
  assert.equal((main.match(/syncParkedAirframes\(\);/g) ?? []).length, 3,
    "sync belongs only at common sampling plus the restart/boot snapshots needed before Ready advances");

  assert.match(restart,
    /: createCobraPilotControlState\(bridge\?\.GetHoverCollective\(\) \?\? 0\.5\)/,
    "lab restart keeps its provider-calculated continuously-running hover trim");
  const boot = main.match(/async function boot\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(boot,
    /: createCobraPilotControlState\(bridge\.GetHoverCollective\(\)\)/,
    "lab boot keeps its provider-calculated continuously-running hover trim");
  assert.match(boot,
    /authorityState = JSON\.parse\(bridge\.GetState\(\)\);[\s\S]{0,160}?syncParkedAirframes\(\);/,
    "boot's direct snapshot must populate parked spares even while play remains at Ready");

  const manual = main.match(/function updateManual\(deltaSeconds\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(manual, /hasDeliberateCobraCockpitInput/);
  assert.match(manual, /sortieReadiness\.observeInput\(deliberateInput\)/);
  assert.match(manual,
    /if \(sortieReadiness\.ready && !turnaroundLocksControls\) \{[\s\S]{0,420}?pilotControls = advanceCobraPilotControls/,
    "rejected held input must not preload pilot controls while authority waits for neutral");
  assert.match(manual, /sortieReadiness\.advance\(deltaSeconds/);
  assert.doesNotMatch(manual, /(?<!sortieReadiness\.)bridge\.Advance\(deltaSeconds\)/,
    "manual play may not bypass the Ready interlock");

  for (const [code, action] of [
    ["Tab", "cycleHostileTarget"],
    ["KeyM", "setTacticalMapOpen"],
    ["KeyV", "togglePadlock"],
  ]) {
    const branch = main.match(
      new RegExp(`event\\.code === "${code}"[\\s\\S]{0,360}?${action}\\(`),
    )?.[0] ?? "";
    assert.match(branch, /sortieReadiness\.observeInput\(true\)/,
      `${code} must cross the neutral-edge gate before retaining ${action}`);
  }

  assert.match(main, /keys\.add\(event\.code\)[\s\S]{0,320}?sortieReadiness\.observeInput\(true\)/,
    "the first cockpit key must remain held before it starts the sortie");
});
