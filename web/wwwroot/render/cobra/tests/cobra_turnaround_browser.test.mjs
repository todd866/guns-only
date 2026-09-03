import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COBRA_TURNAROUND_ACTION_CODE,
  COBRA_TURNAROUND_GAMEPAD_BUTTON,
  cobraTurnaroundActionHeld,
  cobraTurnaroundIsActive,
  cobraTurnaroundLocksFlightControls,
} from "../cobra_turnaround.js";

const root = new URL("../../../", import.meta.url);

test("one contextual E / gamepad Y action is projected without presentation timers", () => {
  assert.equal(COBRA_TURNAROUND_ACTION_CODE, "KeyE");
  assert.equal(COBRA_TURNAROUND_GAMEPAD_BUTTON, 3);
  assert.equal(cobraTurnaroundActionHeld({ activeCodes: new Set(["KeyE"]) }), true);
  assert.equal(cobraTurnaroundActionHeld({ activeCodes: new Set() }), false);
  assert.equal(cobraTurnaroundActionHeld({
    gamepad: { connected: true, buttons: [{}, {}, {}, { pressed: true, value: 1 }] },
  }), true);
  assert.equal(cobraTurnaroundActionHeld({
    gamepad: { connected: false, buttons: [{}, {}, {}, { pressed: true, value: 1 }] },
  }), false);
});

test("authority phase truth decides whether flight controls are locked", () => {
  assert.equal(cobraTurnaroundIsActive(null), false);
  assert.equal(cobraTurnaroundIsActive({ phase: "operational" }), false);
  assert.equal(cobraTurnaroundIsActive({ phase: "shutdown-required" }), true);
  assert.equal(cobraTurnaroundIsActive({ phase: "rotor-coast" }), true);
  assert.equal(cobraTurnaroundIsActive({ phase: "starting" }), true);

  assert.equal(cobraTurnaroundLocksFlightControls({
    phase: "shutdown-required",
    flight_controls_enabled: false,
  }), true);
  assert.equal(cobraTurnaroundLocksFlightControls({
    phase: "operational",
    flight_controls_enabled: true,
  }), false);
  assert.equal(cobraTurnaroundLocksFlightControls({
    phase: "starting",
    flight_controls_enabled: true,
  }), false,
  "an explicit authority capability wins over phase-name guesses");
});

test("production page transports action, locks controls and safes weapons during servicing", async () => {
  const main = await readFile(new URL("cobra-lab/main.js", root), "utf8");
  assert.match(main, /render\/cobra\/cobra_turnaround\.js\?v=\d+/);
  assert.match(main,
    /const turnaroundActionHeld = windowFocused\s*&& cobraTurnaroundActionHeld\(/,
    "an out-of-focus gamepad hold must not advance a cockpit procedure");
  assert.match(main, /bridge\.SetTurnaroundAction\(turnaroundActionHeld\)/,
    "E/Y must reach authority every manual frame");
  assert.match(main, /const turnaroundLocksControls = cobraTurnaroundLocksFlightControls\(/);
  assert.match(main, /if \(sortieReadiness\.ready && !turnaroundLocksControls\)/,
    "browser levers may not integrate while authority says the aircraft is being serviced");
  assert.match(main,
    /bridge\.SetEngagementConsent\(!turnaroundLocksControls[\s\S]{0,200}?\(keys\.has\(cobraControlProfile\.fire\.code\) \|\| combatState\.fire\)\)/,
    "the gunner must fail safe throughout shutdown, transfer and startup");
  assert.match(main, /bridge\?\.SetTurnaroundAction\(false\)/,
    "restart/focus-loss paths must release a stuck procedure action");
  const tourChange = main.match(
    /tourInput\?\.addEventListener\("change", \(\) => \{[\s\S]*?\n\}\);/,
  )?.[0] ?? "";
  assert.match(tourChange, /if \(tourInput\.checked\) \{/);
  assert.match(tourChange, /bridge\?\.SetTurnaroundAction\(false\)/,
    "guided preview must not inherit a previously held manual turnaround action");
  assert.doesNotMatch(main,
    /if \(tourInput\.checked && bridge && !missionTerminal\)[\s\S]{0,500}?bridge\.Advance\(/,
    "guided scenery review has no pilot and must freeze flight authority");
});

test("cold-spare transfer keeps authority running, then startup completion requires neutral", async () => {
  const main = await readFile(new URL("cobra-lab/main.js", root), "utf8");
  const swapSync = main.match(/function syncParkedAirframes\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(swapSync, /cobraTurnaroundIsActive\(authorityState\?\.turnaround\)/);
  assert.match(swapSync,
    /if \(PLAY_MODE && !BATTLE_REVIEW_MODE && !turnaroundActive\)[\s\S]{0,420}?sortieReadiness\.reset\(false, \{ requireNeutral: true \}\)/,
    "an ordinary hot swap stays fail-safe, but a cold spare must keep advancing toward start");
  assert.match(swapSync, /bridge\.AcknowledgeAirframeSwap\(swaps\)/);

  const lifecycle = main.match(/function syncTurnaroundLifecycle\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(lifecycle,
    /previousTurnaroundActive && !turnaroundActive[\s\S]{0,500}?sortieReadiness\.reset\(false, \{ requireNeutral: true \}\)/,
    "a fully started spare must return to Ready and reject collective held through spool-up");
  assert.match(lifecycle, /createCobraGroundedPilotControlState\(\)/);
});

test("turnaround truth reaches objective copy and the shared flight-audio snapshot", async () => {
  const [main, adapter] = await Promise.all([
    readFile(new URL("cobra-lab/main.js", root), "utf8"),
    readFile(new URL("render/cobra/cobra_hud_adapter.js", root), "utf8"),
  ]);
  assert.ok((main.match(/turnaround:\s*authorityState\?\.turnaround/g) ?? []).length >= 2,
    "both the live chart caption and the lab objective strip need servicing orders");
  assert.match(adapter, /audio_profile_id\s*=\s*"audio\.ah1g\.t53-b540\.v1"/);
  for (const field of [
    "cobra_main_rotor_rpm",
    "cobra_tail_rotor_rpm",
    "cobra_engine_operating",
    "cobra_engine_power_fraction",
    "cobra_turnaround_phase",
    "cobra_turnaround_sequence",
  ]) {
    assert.match(adapter, new RegExp(`out\\.${field}\\s*=`), `${field} is missing`);
  }
});
