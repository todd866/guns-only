import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { TEST_FLIGHT_ACTIONS } from "../../systems/test_flight_console.js";
import { CONTROL_BINDINGS } from "../../settings/player_settings.js";
import { CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN } from "../../nav/carrier_sortie_route_presentation.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");

const [appSource, hudSource, indexSource, keyGrammarSource, detentSource,
  sessionSource, webBridgeSource, progressionSource, projectionSource,
  playerGunTargetSource, missionAuthoritySource] = await Promise.all([
  "web/wwwroot/app.js",
  "web/wwwroot/hud.js",
  "web/wwwroot/index.html",
  "sim/KeyGrammar.cs",
  "sim/DetentLayer.cs",
  "sim/SimulationSession.cs",
  "web/WebBridge.cs",
  "web/wwwroot/render/progression/campaign_progression.js",
  "web/SnapshotProjection.cs",
  "web/wwwroot/render/input/player_gun_target.js",
  "web/wwwroot/render/top-gun/mission_authority.js",
].map((relativePath) => readFile(path.join(ROOT, relativePath), "utf8")));

// The flat-snapshot projection moved from the browser-only WebBridge into the plain, linkable
// SnapshotProjection; action observables are scanned across both so a field is found wherever it lives.
const bridgeSource = `${webBridgeSource}\n${projectionSource}`;

function normalizedCopy(source, { markup = false } = {}) {
  const visible = markup
    ? source.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")
    : source;
  return visible
    .replace(/&minus;/gi, "-")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function attributes(source) {
  return Object.fromEntries([...source.matchAll(
    /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )].map((match) => [match[1], match[2] ?? match[3] ?? match[4] ?? ""]));
}

function htmlButtons(source) {
  return [...source.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].map((match) => ({
    attributes: attributes(match[1]),
    text: normalizedCopy(match[2], { markup: true }),
    source: match[0],
  }));
}

function baseKeyMap(source) {
  assert.match(source, /keyboardMapForSettings\(playerSettings\)/,
    "app.js must derive one auditable host-code to GKey map from player settings");
  const result = new Map(CONTROL_BINDINGS.map(({ defaultCode, gkey }) => [defaultCode, gkey]));
  assert.match(source, /keyMap\.set\("KeyR", 11\)/);
  result.set("KeyR", 11);
  return result;
}

function gkeyOrdinals(source) {
  const body = source.match(/public enum GKey\s*{([\s\S]*?)}/)?.[1];
  assert.ok(body, "GKey enum is the authority for bridge ordinals");
  return new Map(body
    .replace(/\/\/.*$/gm, "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((name, ordinal) => [name, ordinal]));
}

const copy = `${normalizedCopy(hudSource)} ${normalizedCopy(indexSource, { markup: true })}`;
const mappedCodes = baseKeyMap(appSource);
for (const action of Object.values(TEST_FLIGHT_ACTIONS)) {
  mappedCodes.set(action.code, action.gkey);
}
const gkeys = gkeyOrdinals(keyGrammarSource);

// This is deliberately an explicit product contract, rather than a loose snapshot of whatever
// happens to be in app.js today. Adding a key, button, or help promise requires choosing its input
// lifecycle and its pilot-observable consequence here. That makes dead controls and UI/runtime
// drift fail review before they reach a sortie.
const BRIDGE_ACTIONS = Object.freeze([
  { id: "pull", bindingAction: "pull", code: "ArrowDown", gkey: "PullUp", behavior: "hold", help: "PULL / PUSH", consumer: /GKey\.PullUp/, observable: /requested_g_cmd/ },
  { id: "push", bindingAction: "push", code: "ArrowUp", gkey: "PushDown", behavior: "hold", help: "PULL / PUSH", consumer: /GKey\.PushDown/, observable: /requested_g_cmd/ },
  { id: "roll-left", bindingAction: "rollLeft", code: "ArrowLeft", gkey: "RollLeft", behavior: "hold", help: "ROLL", consumer: /GKey\.RollLeft/, observable: /requested_roll_control/ },
  { id: "roll-right", bindingAction: "rollRight", code: "ArrowRight", gkey: "RollRight", behavior: "hold", help: "ROLL", consumer: /GKey\.RollRight/, observable: /requested_roll_control/ },
  { id: "rudder-left", bindingAction: "rudderLeft", code: "KeyA", gkey: "RudderLeft", behavior: "hold", help: "RUDDER", consumer: /GKey\.RudderLeft/, observable: /requested_rudder/ },
  { id: "rudder-right", bindingAction: "rudderRight", code: "KeyD", gkey: "RudderRight", behavior: "hold", help: "RUDDER", consumer: /GKey\.RudderRight/, observable: /requested_rudder/ },
  { id: "power-up", bindingAction: "powerUp", code: "KeyW", gkey: "ThrottleUp", behavior: "hold", help: "THROTTLE", consumer: /GKey\.ThrottleUp/, observable: /requested_throttle/ },
  { id: "power-down", bindingAction: "powerDown", code: "KeyS", gkey: "ThrottleDown", behavior: "hold", help: "THROTTLE", consumer: /GKey\.ThrottleDown/, observable: /requested_throttle/ },
  { id: "guns", bindingAction: "fire", code: "KeyF", gkey: "Trigger", behavior: "hold", help: "GUNS", consumer: /GKey\.Trigger/, observable: /gun_firing/ },
  // Padlock selection and camera motion remain presentation actions. Once bandit tracking is
  // established, app.js sends a separate semantic transition to the fixed-tick roll augmentation;
  // it never turns camera pixels or RAF timing into aircraft input.
  { id: "padlock", bindingAction: "padlock", code: "KeyV", gkey: "Padlock", behavior: "momentary", help: "PADLOCK ON / OFF", uiConsumer: /contextualPadlockTarget\(latestState\)/, uiObservable: /hudFrame\.padlockTarget = padlockTarget/ },
  { id: "knock-it-off", code: "KeyO", gkey: "KnockItOff", behavior: "momentary", help: "CALL IT A DAY · RTB", consumer: /key == GKey\.KnockItOff/, observable: /rtb_reason/ },
  { id: "restart", code: "KeyR", gkey: "Restart", behavior: "momentary", help: "R RESTART", consumer: /key == GKey\.Restart/, uiConsumer: /restartMission\(\)/ },
  { id: "limit-override", bindingAction: "limitOverride", code: "Space", gkey: "Override", behavior: "hold", help: "LIMIT OVERRIDE", consumer: /GKey\.Override/, observable: /requested_g_cmd/ },
  { id: "auto-gcas-paddle", bindingAction: "gcasOverride", code: "KeyK", gkey: "AutoGcasOverride", behavior: "hold", help: "AGCAS PADDLE", consumer: /GKey\.AutoGcasOverride/, observable: /auto_gcas_override_held/ },
  { id: "gear-toggle", bindingAction: "gearToggle", code: "KeyG", gkey: "GearToggle", behavior: "momentary", help: "GEAR", testAction: "gearToggle", consumer: /key == GKey\.GearToggle/, observable: /gear_handle/ },
  { id: "flaps-up", bindingAction: "flapUp", code: "BracketLeft", gkey: "FlapUp", behavior: "hold", help: "FLAPS UP / DOWN", testAction: "flapUp", consumer: /GKey\.FlapUp/, observable: /flap_lever/ },
  { id: "flaps-down", bindingAction: "flapDown", code: "BracketRight", gkey: "FlapDown", behavior: "hold", help: "FLAPS UP / DOWN", testAction: "flapDown", consumer: /GKey\.FlapDown/, observable: /flap_lever/ },
  { id: "wing-sweep-forward", bindingAction: "wingSweepForward", code: "Comma", gkey: "WingSweepForward", behavior: "hold", help: "WING SWEEP FORWARD / AFT", consumer: /GKey\.WingSweepForward/, observable: /wing_sweep_command_deg/ },
  { id: "wing-sweep-aft", bindingAction: "wingSweepAft", code: "Period", gkey: "WingSweepAft", behavior: "hold", help: "WING SWEEP FORWARD / AFT", consumer: /GKey\.WingSweepAft/, observable: /wing_sweep_command_deg/ },
  { id: "wing-sweep-auto", bindingAction: "wingSweepAuto", code: "Slash", gkey: "WingSweepAuto", behavior: "momentary", help: "WING SWEEP AUTO", consumer: /GKey\.WingSweepAuto/, observable: /wing_sweep_mode_code/ },
  { id: "emergency-gear", code: "KeyE", gkey: "EmergencyGearRelease", behavior: "hold", help: "HOLD E", testAction: "emergencyGearRelease", consumer: /key == GKey\.EmergencyGearRelease/, observable: /gear_nose/ },
  { id: "horn-cutout", code: "TestFlightGearHornCutout", gkey: "GearHornCutout", behavior: "momentary", help: "GEAR HORN CUTOUT", testAction: "gearHornCutout", consumer: /GKey\.GearHornCutout/, observable: /gear_warning_horn/ },
  { id: "confirm-extension-failure", code: "KeyN", gkey: "ConfirmGearExtensionFailure", behavior: "momentary", help: "N · CONFIRM FAILED EXTENSION", testAction: "confirmGearFailure", consumer: /GKey\.ConfirmGearExtensionFailure/, observable: /MaintenanceScenarioJson\(\)/ },
  { id: "inspect-downlocks", code: "KeyI", gkey: "InspectGearDownlocks", behavior: "momentary", help: "I · INSPECT THREE DOWNLOCKS", testAction: "inspectGearDownlocks", consumer: /GKey\.InspectGearDownlocks/, observable: /MaintenanceScenarioJson\(\)/ },
]);

test("player action contract preserves the C# GKey ABI and classifies every live host binding", () => {
  for (const action of BRIDGE_ACTIONS) {
    assert.equal(mappedCodes.get(action.code), gkeys.get(action.gkey),
      `${action.id}: ${action.code} must dispatch the ${action.gkey} bridge ordinal`);
  }

  const declared = new Set(BRIDGE_ACTIONS.map((action) => action.code));
  const unclassified = [...mappedCodes.keys()].filter((code) => !declared.has(code));
  assert.deepEqual(unclassified, []);
});

test("selected-target padlock roll hold stays a fixed-tick, safety-preemptible augmentation", () => {
  assert.match(webBridgeSource,
    /SetPlayerGunTargetPadlockRollAssist\(bool selected\)[\s\S]*?Session\.SetPlayerGunTargetPadlockRollAssist\(selected\)/,
    "the browser may send only the discrete selected/tracked state");
  assert.match(sessionSource,
    /RapierAutomationOr\(_detents\.Command\)[\s\S]*?ApplyGunneryPitchAssist\(directedCommand\)[\s\S]*?ApplyPilotPhysiology\(assistedCommand\)[\s\S]*?ApplyPlayerGunTargetPadlockRollAssist\([\s\S]*?ApplyAutoGcas\(padlockAssistedCommand\)/,
    "padlock SAS must follow the effective human or Rapier-directed path and remain below Auto-GCAS priority");
  assert.match(sessionSource,
    /_playerGunTargetPadlockRollAssistTargetId == _selectedPlayerGunTargetId/,
    "assist geometry must remain bound to the same authoritative gun-target identity");
  assert.match(sessionSource,
    /AircraftState selectedTarget = SelectedOpponentState[\s\S]*?selectedTarget\.Position/,
    "both primary and formation-wingman geometry must come from the selected target");
  assert.match(projectionSource,
    /padlock_roll_assist_active[\s\S]*?padlock_roll_error_deg[\s\S]*?padlock_roll_assist_aileron/,
    "the applied augmentation needs distinct observable telemetry");
});

test("padlock target selection crosses the bridge as a discrete gun-target slot", () => {
  assert.match(webBridgeSource,
    /SetPlayerGunTargetSlot\(int slot\)[\s\S]*?Session\.SetPlayerGunTargetSlot\(slot\)/,
    "the browser target choice must cross a thin bridge into simulation authority");
  assert.match(appSource,
    /function syncPlayerGunTarget\(\)[\s\S]*?syncPlayerGunTargetSelection\(/,
    "the presentation must delegate target reconciliation to the bounded slot helper");
  assert.match(playerGunTargetSource,
    /function syncPlayerGunTargetSelection\([\s\S]*?SetPlayerGunTargetSlot\(desiredSlot\)/,
    "the presentation must publish the selected combat slot without sending aim geometry");
});

test("every advertised bridge action has help copy, a runtime consumer, and observable truth", () => {
  const simConsumers = `${detentSource}\n${sessionSource}`;
  for (const action of BRIDGE_ACTIONS) {
    assert.ok(copy.includes(action.help), `${action.id}: missing player-facing help '${action.help}'`);
    if (action.bindingAction) {
      assert.ok(hudSource.includes(`binding("${action.bindingAction}", "${action.code}")`),
        `${action.id}: quicklook must render the current binding with its default fallback`);
    }
    if (action.consumer) {
      assert.match(simConsumers, action.consumer, `${action.id}: GKey has no simulation consumer`);
    }
    if (action.uiConsumer) {
      assert.match(appSource, action.uiConsumer, `${action.id}: action has no UI consumer`);
    }
    if (action.observable) {
      assert.match(bridgeSource, action.observable,
        `${action.id}: the result is not observable in authoritative browser state`);
    }
    if (action.uiObservable) {
      assert.match(appSource, action.uiObservable,
        `${action.id}: the presentation result is not observable by the HUD`);
    }
  }
});

test("keyboard dispatch keeps continuous axes live without repeating semantic actions", () => {
  const reassertableActions = appSource
    .match(/const REASSERTABLE_KEYBOARD_AXIS_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)?.[1]
    ?.match(/"([^"]+)"/g)
    ?.map((token) => token.slice(1, -1));
  assert.deepEqual(reassertableActions,
    ["pull", "push", "rollLeft", "rollRight", "rudderLeft", "rudderRight"],
    "only continuous flight-surface actions may use the liveness path");
  assert.match(appSource,
    /if \(event\.repeat\) \{[\s\S]*?reassertMappedKeyboardAxis\(event\.code\)[\s\S]*?return;/,
    "OS repeat must refresh a flight-axis hold instead of being discarded");
  assert.match(appSource,
    /function reassertMappedKeyboardAxis\(code\)[\s\S]*?reassertableKeyboardAxisGkeys\.has\(gkey\)[\s\S]*?keyOwners\.get\(code\)\?\.has\("keyboard"\)[\s\S]*?bridge\.FeedKey\(gkey, true\)/,
    "an owned axis repeat must idempotently refresh simulation authority");
  assert.match(appSource,
    /function observePilotControlInterlock\(state\)[\s\S]*?pilot_control_interlocked !== true[\s\S]*?keyboardAxesAwaitingFreshPress\.add\(code\)/,
    "G-LOC must suppress liveness refresh until a fresh physical press");
  assert.match(appSource,
    /if \(flightAxisOwnsKey && latestState\?\.pilot_control_interlocked === true\) \{[\s\S]*?keyboardAxesAwaitingFreshPress\.add\(event\.code\)[\s\S]*?return;[\s\S]*?keyboardAxesAwaitingFreshPress\.delete\(event\.code\)/,
    "new axis presses during G-LOC stay rejected and only a post-recovery edge re-arms them");
  assert.match(appSource,
    /function reassertHeldKeyboardAxes\(nowMs\)[\s\S]*?KEYBOARD_AXIS_HEARTBEAT_MS[\s\S]*?owners\.has\("keyboard"\)[\s\S]*?reassertMappedKeyboardAxis\(code\)/,
    "held axes need a bounded heartbeat even when another chord key owns OS repeat");
  assert.match(appSource,
    /reassertHeldKeyboardAxes\(now\)[\s\S]*?bridge\.Advance\(/,
    "the hold heartbeat must run before the next authoritative ticks");
  assert.match(appSource,
    /function activeFlightAxisOwnsKey\(event\)[\s\S]*?pauseReasons\.size > 0[\s\S]*?input, select, textarea[\s\S]*?reassertableKeyboardAxisGkeys\.has\(keyMap\.get\(event\.code\)\)/,
    "live axes must outrank stale flight-button focus but never an overlay or text field");
  assert.match(appSource,
    /const flightAxisOwnsKey = activeFlightAxisOwnsKey\(event\)[\s\S]*?nativeInteractiveOwnsKey\(event\) && !flightAxisOwnsKey[\s\S]*?pressMappedKey\(event\.code, "keyboard", gkey\)[\s\S]*?sceneCanvas\.focus/,
    "a recovered live-axis press must reclaim the flight focus owner");
  assert.match(appSource, /pressMappedKey\(event\.code, "keyboard", gkey\)/);
  assert.match(appSource,
    /window\.addEventListener\("keyup"[\s\S]*?keyOwners\.get\(event\.code\)\?\.has\("keyboard"\)[\s\S]*?releaseMappedKey\(event\.code, "keyboard"\)/,
    "key-up must release the original owner even if DOM focus changed");
  assert.match(appSource, /bridge\.FeedKey\(gkey, true\)/);
  assert.match(appSource, /bridge\.FeedKey\(gkey, false\)/);
  assert.match(appSource, /releaseAllMappedKeys\("visibility-hidden"\)/,
    "backgrounding must neutralise every held flight control");

  for (const action of BRIDGE_ACTIONS.filter(({ testAction }) => testAction)) {
    assert.equal(TEST_FLIGHT_ACTIONS[action.testAction]?.behavior, action.behavior,
      `${action.id}: panel lifecycle must match the physical control`);
  }
});

test("the live frame initialises replay state before any early-frame consumer", () => {
  const tick = appSource.match(/function tick\(now\)\s*\{([\s\S]*?)\n\s*requestAnimationFrame\(tick\)/)?.[1]
    ?? "";
  assert.ok(tick, "the render loop must remain inspectable");
  const initialiser = tick.indexOf("let replayActive = incidentReplay?.active === true");
  const projectionRefresh = tick.indexOf("replayActive = replayPresentation.active");
  assert.ok(initialiser >= 0 && projectionRefresh > initialiser,
    "replay activity needs a safe early-frame value and a fresh post-snapshot refresh");
  assert.equal(tick.slice(0, initialiser).includes("replayActive"), false,
    "an early replay consumer would recreate the first-frame TDZ that froze every flight control");
});

test("every visible HTML button is wired through one auditable action surface", () => {
  const explicitButtons = new Map([
    ["pause-button", /pauseButton\?\.addEventListener\("click", toggleSessionPause\)/],
    ["incident-replay-play", /incidentReplayPlay\?\.addEventListener\("click"/],
    ["incident-replay-event-jump", /incidentReplayEventJump\?\.addEventListener\("click"/],
    ["incident-replay-skip", /incidentReplaySkip\?\.addEventListener\("click", skipIncidentReplay\)/],
    ["ready-start", /readyStart\.addEventListener\("click"/],
    ["ready-replay", /readyReplay\?\.addEventListener\("click"/],
    ["ready-handoff", /readyHandoff\?\.addEventListener\("click", requestCombatHandoffFromPause\)/],
    ["ready-settings", /readySettings\?\.addEventListener\("click", openSettings\)/],
    ["ready-restart", /readyRestart\?\.addEventListener\("click", restartMissionNow\)/],
    ["ready-return", /readyReturn\?\.addEventListener\("click", returnToCatalogue\)/],
    ["ready-build-reload", /readyBuildReload\?\.addEventListener\("click", reloadCurrentBuild\)/],
    // iOS-Safari-only Add-to-Home-Screen hint; dismissed for good on tap.
    ["ready-install-hint", /installHint\.addEventListener\("click"/],
    // Phone-width "this wants a laptop" recommendation; dismissed for good on tap. It is a
    // recommendation and never a gate, so it carries no action beyond its own dismissal.
    ["ready-laptop-hint", /getElementById\("ready-laptop-hint"\)\?\.addEventListener\("click"/],
    ["settings-close", /\[settingsClose, settingsCloseBottom\][\s\S]*?addEventListener\("click", closeSettings\)/],
    ["settings-close-bottom", /\[settingsClose, settingsCloseBottom\][\s\S]*?addEventListener\("click", closeSettings\)/],
    ["settings-reset-bindings", /settingsResetBindings\?\.addEventListener\("click"/],
    ["nav-nd-follow", /navUi\.follow\?\.addEventListener\("click"/],
    ["nav-nd-free", /navUi\.free\?\.addEventListener\("click"/],
    ["nav-nd-tour-add", /navUi\.tourAdd\?\.addEventListener\("click"/],
    ["nav-nd-clear", /navUi\.clearDest\?\.addEventListener\("click"/],
    ["nav-nd-proc-none", /procButtons[\s\S]*?procNone[\s\S]*?addEventListener\("click"/],
    ["nav-nd-proc-overhead", /procButtons[\s\S]*?procOverhead[\s\S]*?addEventListener\("click"/],
    ["nav-nd-proc-downwind", /procButtons[\s\S]*?procDownwind[\s\S]*?addEventListener\("click"/],
    ["nav-nd-proc-straight", /procButtons[\s\S]*?procStraight[\s\S]*?addEventListener\("click"/],
  ]);

  // Wired by the classic inline bootstrap in index.html rather than by app.js, and deliberately:
  // the boot-fallback card is shown in the cases where the module graph is what failed, so its
  // one control cannot depend on app.js having loaded.
  const inlineButtons = new Map([
    ["shell-fallback-copy", /#shell-fallback-copy[\s\S]*?clipboard\?\.writeText/],
  ]);

  for (const button of htmlButtons(indexSource)) {
    const attrs = button.attributes;
    if (attrs.id && inlineButtons.has(attrs.id)) {
      assert.match(indexSource, inlineButtons.get(attrs.id),
        `${attrs.id}: missing inline click handler`);
      continue;
    }
    const hooks = [
      "data-test-action", "data-hold-key", "data-pulse-key", "data-mobile-action",
      "data-program-node", "data-deck-configuration", "data-top-gun-seat",
      // Build 75 portrait-assist speed nudges; wired in app.js via [data-assist-nudge].
      "data-assist-nudge",
      // Circuits OFT harness actions; wired in app.js via [data-circuits-action].
      "data-circuits-action",
    ]
      .filter((name) => attrs[name] !== undefined);
    if (attrs.id && explicitButtons.has(attrs.id)) {
      assert.match(appSource, explicitButtons.get(attrs.id), `${attrs.id}: missing click handler`);
      continue;
    }
    assert.equal(hooks.length, 1,
      `button '${button.text}' needs exactly one recognised action hook`);

    if (attrs["data-test-action"] !== undefined) {
      assert.ok(TEST_FLIGHT_ACTIONS[attrs["data-test-action"]],
        `${button.text}: unknown test-flight action`);
    }
    if (attrs["data-hold-key"] !== undefined || attrs["data-pulse-key"] !== undefined) {
      const code = attrs["data-hold-key"] ?? attrs["data-pulse-key"];
      assert.ok(mappedCodes.has(code), `${button.text}: ${code} is not bridge-mapped`);
    }
    if (attrs["data-mobile-action"] !== undefined) {
      assert.ok(appSource.includes(`[data-mobile-action="${attrs["data-mobile-action"]}"]`),
        `${button.text}: mobile action has no app handler`);
    }
    if (attrs["data-sortie-activity"] !== undefined) {
      assert.match(appSource,
        /readyActivityNav\?\.addEventListener\("click"[\s\S]*?selectActivity\(button\.dataset\.sortieActivity\)/,
        `${button.text}: activity tab has no delegated selection handler`);
    }
    if (attrs["data-mission-select"] !== undefined) {
      assert.match(appSource,
        /readySelector\?\.addEventListener\("click"[\s\S]*?selectMission\(Number\(select\.dataset\.missionSelect\)\)/,
        `${button.text}: mission card has no delegated selection handler`);
    }
    if (attrs["data-deck-configuration"] !== undefined) {
      assert.match(appSource,
        /readyDeckConfig\?\.addEventListener\("click"[\s\S]*?selectDeckConfiguration\(Number\(button\.dataset\.deckConfiguration\)\)/,
        `${button.text}: deck configuration has no delegated selection handler`);
    }
    if (attrs["data-top-gun-seat"] !== undefined) {
      assert.match(appSource,
        /readyTopGunSeat\?\.addEventListener\("click"[\s\S]*?selectTopGunSeat\(Number\(button\.dataset\.topGunSeat\)\)/,
        `${button.text}: Top Gun seat has no delegated selection handler`);
    }
  }
});

test("pause-menu call-it-a-day is authoritative, deliberate, and shares the remappable GKey path", () => {
  assert.match(appSource,
    /const handoffActionAvailable = sessionPaused[\s\S]*?pauseReasons\.size === 1[\s\S]*?handoff\.available/,
    "the pause action must remain hidden unless the current authoritative phase is AVAILABLE");
  assert.match(appSource,
    /readyHandoff\.hidden = !handoffActionAvailable[\s\S]*?readyHandoff\.disabled = !handoffActionAvailable/,
    "visibility and enabled state must share the same authority gate");
  assert.match(appSource,
    /function requestCombatHandoffFromPause\(\)[\s\S]*?setPauseReason\("session", false\)[\s\S]*?pressMappedKey\(code, "pause-handoff", knockItOffControl\.gkey\)[\s\S]*?releaseMappedKey\(code, "pause-handoff"\)/,
    "a deliberate pause-menu request must resume authority, issue one down/up pulse, and use GKey 10");
  assert.match(indexSource,
    /<button id="ready-handoff"[^>]*hidden[^>]*disabled[^>]*>CALL IT A DAY · RTB<\/button>/,
    "the mobile-safe pause action must start unavailable before authoritative state arrives");
});

test("touch pilots retain system commands but the live surface makes them contextual", () => {
  const buttons = htmlButtons(indexSource);
  const find = (attribute, value) => buttons.find((button) => button.attributes[attribute] === value);

  assert.equal(find("data-pulse-key", "KeyG")?.attributes.hidden, "",
    "gear must start absent until the aircraft and configuration make it relevant");
  assert.equal(find("data-hold-key", "BracketLeft")?.attributes.hidden, "",
    "flaps-up must start absent until the aircraft and configuration make it relevant");
  assert.equal(find("data-hold-key", "BracketRight")?.attributes.hidden, "",
    "flaps-down must start absent until the aircraft and configuration make it relevant");
  assert.ok(find("data-pulse-key", "KeyV"), "mobile surface needs the same contextual padlock action as V");
  const carrierRtb = find("data-carrier-route-action", CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN);
  assert.ok(carrierRtb, "the carrier route needs a stable touch RTB action token");
  assert.equal(carrierRtb.attributes["data-pulse-key"], "KeyO",
    "carrier touch RTB must reuse the ordinary KnockItOff/RTB GKey path");
  assert.equal(carrierRtb.attributes.hidden, "",
    "carrier touch RTB must start absent until authoritative route presentation requests it");
  assert.equal(carrierRtb.attributes.disabled, "",
    "carrier touch RTB must start inert until authoritative route presentation requests it");
  const gcasPaddle = find("data-hold-key", "KeyK");
  assert.ok(gcasPaddle, "touch pilots need the same held Auto-GCAS paddle as keyboard pilots");
  assert.equal(gcasPaddle.attributes.hidden, "",
    "the paddle must be absent until an active recoverable fly-up makes it relevant");
  assert.match(appSource,
    /const profile = mobileControlProfile\(state\)[\s\S]*?touchGcasPaddle\.hidden = !profile\.gcasOverride/,
    "one state-driven profile must own contextual phone-control visibility");
  assert.equal(buttons.some((button) => button.attributes["data-mobile-action"] === "restart"), false,
    "restart belongs to pause/debrief and the frozen whole-screen target, not the live HUD");
  assert.ok(find("data-hold-key", "Comma"), "touch F-14 needs a held wing-forward control");
  assert.ok(find("data-hold-key", "Period"), "touch F-14 needs a held wing-aft control");
  assert.ok(find("data-pulse-key", "Slash"), "touch F-14 needs a return-to-auto control");
  assert.match(appSource,
    /const f14WingSweep = !casevac && state\?\.top_gun_seat === "F-14A";[\s\S]*?touchWingSweepForward\.hidden = !f14WingSweep[\s\S]*?touchWingSweepAft\.hidden = !f14WingSweep[\s\S]*?touchWingSweepAuto\.hidden = !f14WingSweep/,
    "wing-sweep touch controls must appear only for the authoritative F-14 seat");

  assert.match(appSource,
    /querySelectorAll\("\[data-hold-key\]"\)[\s\S]*?addEventListener\("pointerdown"[\s\S]*?pressMappedKey\(code, source, gkey\)[\s\S]*?addEventListener\("pointerup", endControl\)[\s\S]*?addEventListener\("pointercancel", endControl\)[\s\S]*?addEventListener\("lostpointercapture", endControl\)/,
    "held touch controls need down, up, cancellation, and lost-pointer release paths");
  assert.match(appSource,
    /releaseHiddenMobileControls = \(\) => \{[\s\S]*?closest\?\.\("\[hidden\]"\)[\s\S]*?releaseMappedKey\(control\.code, control\.source\)/,
    "a contextual control hidden mid-hold must release explicitly on Safari");
  assert.match(appSource,
    /querySelectorAll\("\[data-pulse-key\]"\)[\s\S]*?if \(!pressMappedKey\(code, source, gkey\)\) return;[\s\S]*?releaseMappedKey\(code, source\)/,
    "a pulse control must always emit exactly one accepted down/up pair");
  assert.match(appSource,
    /querySelectorAll\("\[data-pulse-key\]"\)[\s\S]*?if \(!pressMappedKey\(code, source, gkey\)\) return;[\s\S]*?physicalCode === "KeyV"[\s\S]*?togglePadlock\(\)/,
    "the V pulse must drive contextual presentation only after the bridge accepts the action");
  assert.match(appSource,
    /const gkey = event\.code === "KeyN" && isCasevacState\(\)[\s\S]*?: keyMap\.get\(event\.code\);[\s\S]*?if \(!pressMappedKey\(event\.code, "keyboard", gkey\)\) return;[\s\S]*?gkey === 9[\s\S]*?togglePadlock\(\)/,
    "a paused or rejected keyboard V press must not change presentation state");
});

test("Ready mission centering cannot horizontally strand Safari diagnostics controls", () => {
  const centreFunction = appSource.match(
    /function centerReadyMissionChoice\(selectedMission\) \{([\s\S]*?)\n\}/,
  )?.[1] ?? "";
  assert.ok(centreFunction, "Ready selection needs one auditable rail-centering function");
  assert.doesNotMatch(centreFunction, /\.scrollIntoView\s*\(/,
    "WebKit scrollIntoView must not walk and offset the outer Ready dialog");
  assert.match(centreFunction,
    /const rail = option\?\.closest\("\.ready-mission-groups"\)[\s\S]*?rail\.scrollLeft = Math\.max\(0, Math\.min\(maximum, centred\)\)[\s\S]*?card\.scrollLeft = 0/,
    "only the mission rail may centre; the Ready card must remain at horizontal origin");
  assert.match(indexSource,
    /\.sortie-choice\[data-aircraft\]\s*\{[\s\S]*?position:\s*relative[\s\S]*?\.sortie-choice\[data-aircraft\] > \*\s*\{[\s\S]*?position:\s*absolute[\s\S]*?width:\s*1px[\s\S]*?height:\s*1px/,
    "screen-reader-only poster labels must be contained by their positioned button");
});

test("rotorcraft padlock can suppress jet steering without suppressing its target locator", () => {
  assert.match(hudSource,
    /const steeringSuppressed = state\.suppress_padlock_steering === true;[\s\S]*?const steeringAvailable = !steeringSuppressed[\s\S]*?const steering = steeringAvailable/,
    "the rotorcraft adapter flag must stop the fixed-wing steering calculation");
  assert.match(hudSource,
    /if \(!steering\?\.valid && steeringAvailable[\s\S]*?STEERING UNAVAILABLE/,
    "STEERING UNAVAILABLE must remain behind the same suppression gate");
  assert.match(hudSource,
    /this\.drawPadlockLocatorInset\(frame, \{[\s\S]*?targetPosition: padlockTargetPosition/,
    "suppression must retain the target locator/attitude presentation");
});

test("phone settings remain scrollable, zoomable, and collapse desktop-only binding density", () => {
  assert.match(indexSource,
    /\.settings-card\s*\{[\s\S]*?overflow:\s*auto[\s\S]*?touch-action:\s*pan-y pinch-zoom/);
  assert.doesNotMatch(indexSource, /user-scalable=no|maximum-scale=1/,
    "mobile pilots must be able to zoom dense briefing and settings text");
  assert.match(hudSource,
    /const largeText = document\.documentElement\.classList\.contains\("large-interface-text"\)[\s\S]*?const fontSize = largeText \? 11 : 10/,
    "the larger-interface setting must scale the canvas tactical rail, not only DOM menus");
  assert.match(indexSource,
    /<details id="settings-keyboard-bindings" class="settings-disclosure" open>/);
  assert.match(appSource, /settingsKeyboardBindings\?\.removeAttribute\("open"\)/,
    "touch mode should collapse the eighteen keyboard binding buttons");
  assert.match(appSource,
    /#ready-screen, #settings-screen, #incident-replay-overlay, #test-flight-console/,
    "touchmove protection must exempt every scrollable modal surface");
});

test("touch flight separates throttle/yaw, pitch/roll, target selection, and fire", () => {
  const buttons = htmlButtons(indexSource);
  const stick = buttons.filter((button) =>
    button.attributes["data-mobile-action"] === "virtual-stick");
  const targetStick = buttons.filter((button) =>
    button.attributes["data-mobile-action"] === "target-stick");
  const targetCycle = buttons.filter((button) =>
    button.attributes["data-mobile-action"] === "target-cycle");
  const fire = buttons.filter((button) => button.attributes.id === "touch-fire");
  // The ban protects against the old four-button directional pad returning as the PRIMARY
  // flight control. Portrait assisted flight (Build 75) deliberately carries exactly two
  // marked pitch-bias chips (PULL/EASE) on top of tilt; lateral buttons stay banned outright.
  const lateralButtons = buttons.filter((button) =>
    ["ArrowLeft", "ArrowRight"].includes(button.attributes["data-hold-key"]));
  const pitchButtons = buttons.filter((button) =>
    ["ArrowUp", "ArrowDown"].includes(button.attributes["data-hold-key"]));

  assert.equal(stick.length, 1, "fallback mode needs one visible thumb target");
  assert.equal(stick[0].attributes.id, "fallback-stick");
  assert.equal(stick[0].attributes["aria-label"], "Left stick: throttle and yaw");
  assert.equal(targetStick.length, 1, "touch mode needs one separate pitch/roll target");
  assert.equal(targetStick[0].attributes.id, "target-stick");
  assert.equal(targetStick[0].attributes["aria-label"],
    "Right stick: pitch and roll");
  assert.match(indexSource,
    /Right thumb: drag left or right to roll, down to pull, or up to push\.[^<]*Use the separate Fire button to fire guns\./,
    "the accessible help must describe the actual flight axes and dedicated trigger");
  assert.match(indexSource,
    /Left thumb: drag up to increase power or down to decrease it; release holds the selected power\.[^<]*yaw, which centres when released\./,
    "the left-stick help must distinguish latched throttle from spring-loaded yaw");
  assert.equal(lateralButtons.length, 0,
    "lateral directional buttons must not return");
  assert.equal(pitchButtons.length, 2, "exactly the two assisted pitch-bias chips");
  for (const chip of pitchButtons) {
    assert.ok(chip.attributes["data-assist-chip"],
      "pitch hold buttons exist only as marked assisted-flight bias chips");
  }
  assert.match(appSource, /data-assist-nudge/,
    "assisted speed nudges must be wired in app.js");
  // Phone wobble must not add a second pitch command on top of the right stick.
  assert.match(appSource,
    /updateTiltAxis\("pitch", 0, "ArrowUp", "ArrowDown"\)/,
    "touch flight must gate the tilt pitch axis to roll-only");
  assert.doesNotMatch(indexSource, /#touch-fire[^{]*\{[^}]*display:\s*none/,
    "the FIRE button must stay visible in every touch layout");
  assert.match(indexSource, /id="fallback-stick-knob"/);
  assert.match(indexSource,
    /#fallback-stick,\s*#target-stick\s*\{[\s\S]*?width:\s*112px[\s\S]*?height:\s*112px[\s\S]*?touch-action:\s*none/);
  assert.match(indexSource, /The two sticks always fly/,
    "touch prompt must teach that both primary sticks remain available");
  assert.match(appSource,
    /\.touch-mode #test-flight-console,[\s\S]*?\.touch-mode #nav-console,[\s\S]*?\.touch-mode #multiplayer-status[\s\S]*?display: none !important/,
    "phone flight must remove diagnostic and network panels from the two-thumb view");
  assert.doesNotMatch(appSource,
    /\.touch-mode\.touch-primary #touch-fire[\s\S]*?display: none !important/,
    "the right stick owns flight, so the dedicated phone FIRE button must remain available");
  assert.match(appSource,
    /tiltStatus\.hidden = \/\^TILT TRIM OFF\$\/i\.test\(full\)/,
    "an ordinary disabled tilt trim must not occupy permanent flight chrome");
  assert.match(indexSource, /#tilt-status\[hidden\]\s*\{\s*display:\s*none/,
    "hidden tilt status must leave no invisible tap target over the HUD");
  const targetStickStart = appSource.match(
    /function beginTargetStick\(event\)\s*\{([\s\S]*?)\n\s*function moveTargetStick/,
  )?.[1] ?? "";
  assert.doesNotMatch(targetStickStart, /pressMappedKey/,
    "touching the flight stick must not spend ammunition");
  assert.doesNotMatch(appSource,
    /TARGET_STICK_FIRE|targetStickFire|armTargetStickFire|Touch:TargetStickFire/,
    "removed centre-hold firing must not survive as unreachable code or stale state");
  assert.match(targetStickStart,
    /axes: isCasevacState\(latestState\) \? "yaw" : "pitch-roll"[\s\S]*?fire: isCasevacState\(latestState\) \? "unavailable" : "dedicated-button"/,
    "diagnostics must describe the control scheme the pilot is actually using");
  assert.match(appSource,
    /throttleRate = Math\.abs\(state\.y\)[\s\S]*?\? 0 : -clamp\(state\.y, -1, 1\)/,
    "pushing the left stick up must increase power and pulling it down must decrease power");
  const leftStickRelease = appSource.match(
    /function releaseVirtualStick\([^)]*\)\s*\{([\s\S]*?)\n\s*function updateVirtualStickPointer/,
  )?.[1] ?? "";
  assert.doesNotMatch(leftStickRelease,
    /primaryRollCommand|primaryPitchCommand|releaseDirectFlightAxes/,
    "releasing throttle/yaw must not neutralise pitch/roll still held by the other thumb");
  assert.match(appSource,
    /role: gesture\.casevac \? "horizontal-movement" : "throttle-yaw"[\s\S]*?max_yaw: gesture\.casevac \? null : Number\(gesture\.maxYaw[\s\S]*?max_throttle_rate: gesture\.casevac[\s\S]*?Number\(gesture\.maxThrottleRate/,
    "left-stick diagnostics must not mislabel throttle/yaw as pitch/roll");
  assert.match(appSource,
    /function releaseVirtualStick\(\)[\s\S]*?throttleLever = null;[\s\S]*?resetMobileInput = \(\) => \{[\s\S]*?releaseVirtualStick\(\)/,
    "a pause or mission reset must reacquire the authored throttle before the next rate input");
  assert.match(leftStickRelease, /throttleLever = null/,
    "ordinary release must discard the local throttle seed after another input source can change power");
  assert.match(appSource,
    /function syncVirtualStickKeyboard\(\)[\s\S]*?throttleRate = -y;[\s\S]*?else if \(virtualStickPointerId === null\) \{[\s\S]*?stopThrottleIntegrator\(\);[\s\S]*?throttleLever = null;/,
    "releasing keyboard throttle must also discard the seed while a yaw arrow can remain held");

  assert.match(appSource,
    /fallbackStick\?\.addEventListener\("pointerdown", beginVirtualStick[\s\S]*?pointermove", moveVirtualStick[\s\S]*?pointerup", endVirtualStick[\s\S]*?pointercancel", endVirtualStick[\s\S]*?lostpointercapture", endVirtualStick/,
    "the stick must own every pointer termination path");
  assert.match(appSource,
    /function beginVirtualStick[\s\S]*?virtualStickPointerId !== null[\s\S]*?setPointerCapture/,
    "a second finger must not steal the active stick pointer");
  assert.match(appSource,
    /function releaseTargetStick[\s\S]*?targetStickPointerId = null[\s\S]*?primaryRollCommand = 0[\s\S]*?primaryPitchCommand = 0[\s\S]*?releaseDirectFlightAxes\("touch"\)[\s\S]*?renderTargetStick\(\)/,
    "the right-stick release path must neutralise pitch, roll, and its visual knob");
  assert.match(appSource,
    /source\.startsWith\("gamepad"\)[\s\S]*?directFlightOwner !== source[\s\S]*?return false/,
    "a connected controller must not steal the flight axes while a thumb owns the phone stick");
  assert.match(appSource,
    /resetMobileInput = \(\) => \{[\s\S]*?releaseVirtualStick\(\)[\s\S]*?releaseTiltAxes\(\)/,
    "pause, freeze, visibility, and mission resets must centre the virtual stick");
});

test("phone throttle is one spring-loaded rocker on the existing W/S grammar", () => {
  const buttons = htmlButtons(indexSource);
  const rockers = buttons.filter((button) =>
    button.attributes["data-mobile-action"] === "throttle-rocker");
  const directPowerButtons = buttons.filter((button) =>
    ["KeyW", "KeyS"].includes(button.attributes["data-hold-key"])
      && button.attributes.id !== "touch-wave-off");
  const waveOff = buttons.find((button) => button.attributes.id === "touch-wave-off");

  assert.equal(rockers.length, 1, "power adjustment needs one visible thumb target");
  assert.equal(rockers[0].attributes.id, "touch-throttle-rocker");
  assert.equal(rockers[0].attributes["aria-label"], "Throttle rocker");
  assert.equal(rockers[0].attributes["aria-describedby"], "touch-throttle-help");
  assert.equal(rockers[0].attributes["aria-keyshortcuts"], "ArrowUp ArrowDown");
  assert.equal(directPowerButtons.length, 0,
    "separate POWER plus/minus buttons must not return");
  assert.equal(waveOff?.attributes["data-hold-key"], "KeyW",
    "the contextual wave-off action still needs a held firewall command");
  assert.equal(waveOff?.attributes.hidden, "");
  assert.match(indexSource, /id="touch-throttle-rocker-knob"/);
  assert.match(indexSource, /id="touch-throttle-help"[^>]*>[^<]*selected power remains set/);
  assert.match(indexSource,
    /#touch-throttle-rocker\s*\{[\s\S]*?width:\s*52px[\s\S]*?height:\s*112px[\s\S]*?touch-action:\s*none/);
  assert.match(indexSource,
    /@media \(max-width:\s*700px\)[\s\S]*?#touch-throttle-rocker\s*\{[\s\S]*?width:\s*48px[\s\S]*?height:\s*104px/);

  assert.match(appSource,
    /touchThrottleRocker\?\.addEventListener\("pointerdown", beginThrottleRocker[\s\S]*?pointermove", moveThrottleRocker[\s\S]*?pointerup", endThrottleRocker[\s\S]*?pointercancel", endThrottleRocker[\s\S]*?lostpointercapture", endThrottleRocker/,
    "the rocker must own every pointer termination path");
  assert.match(appSource,
    /function beginThrottleRocker[\s\S]*?throttleRockerPointerId !== null[\s\S]*?setPointerCapture/,
    "a second finger must not steal the active throttle pointer");
  assert.match(appSource,
    /function setThrottleRockerCode[\s\S]*?`Touch:\$\{physicalCode\}`[\s\S]*?touchGkeyByDefaultCode\.get\(physicalCode\)/,
    "the rocker and WAVE OFF must share Touch:KeyW ownership");
  assert.match(appSource,
    /function releaseThrottleRocker[\s\S]*?throttleRockerPointerId = null[\s\S]*?releaseThrottleRockerCommand\(active\)[\s\S]*?renderThrottleRocker\(\)/,
    "one idempotent release path must stop W/S and centre the visual puck");
  assert.match(appSource,
    /function releaseThrottleRockerCommand[\s\S]*?releaseMappedKey\(control\.code, control\.source\)[\s\S]*?bridge\?\.SuppressPendingThrottleTap[\s\S]*?bridge\.SuppressPendingThrottleTap\(control\.physicalCode === "KeyW"\)/,
    "a rocker release must suppress its deferred keyboard tap only after the final shared key-up");
  assert.match(webBridgeSource,
    /SuppressPendingThrottleTap\(bool increase\)[\s\S]*?Session\.SuppressPendingThrottleTap\(increase\)/);
  assert.match(sessionSource,
    /SuppressPendingThrottleTap\(bool increase\)[\s\S]*?_keys\.SuppressPendingTap\(increase \? GKey\.ThrottleUp : GKey\.ThrottleDown\)/);
  assert.match(keyGrammarSource,
    /SuppressPendingTap\(GKey key\)[\s\S]*?s\.PendingTap = null[\s\S]*?s\.ConsumedArm = null/,
    "ordinary keyboard taps stay deferred unless a direct-manipulation release opts out");
  assert.match(appSource,
    /releaseHiddenMobileControls = \(\) => \{[\s\S]*?touchThrottleRocker\?\.closest\?\.\("\[hidden\]"\)[\s\S]*?releaseThrottleRocker\(\)/,
    "hiding engine controls mid-hold must release the rocker explicitly");
  assert.match(appSource,
    /touchThrottleRocker\?\.addEventListener\("keydown"[\s\S]*?throttleRockerKeyboardEvent\(event, true\)[\s\S]*?"keyup"[\s\S]*?throttleRockerKeyboardEvent\(event, false\)[\s\S]*?"blur"/,
    "focused arrow-key operation needs down, up, and focus-loss release paths");
  assert.match(appSource,
    /resetMobileInput = \(\) => \{[\s\S]*?releaseThrottleRocker\(\)[\s\S]*?releaseVirtualStick\(\)/,
    "pause, freeze, visibility, and mission resets must spring the rocker neutral");
});

test("screen chrome never covers a flight instrument or another tap target", () => {
  // The top-RIGHT column belongs to the HUD. The canvas draws GUN TEMP at safe-top + 8..25 px, and
  // it was invisible behind a pause button parked at safe-top + 12 — a primary gunnery instrument
  // hidden by chrome. Anything anchored top-right must start below that band.
  const GUN_TEMP_BOTTOM_PX = 25;
  const pauseBlock = indexSource.match(/#pause-button\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(pauseBlock, /left:\s*calc\(var\(--safe-left\)/,
    "the pause button belongs on the left; the right column is instrument space");
  assert.doesNotMatch(pauseBlock, /right:\s*calc\(/,
    "a right-anchored pause button sits on top of the GUN TEMP bar");

  const pauseTop = Number(pauseBlock.match(/top:\s*calc\(var\(--safe-top\) \+ (\d+)px\)/)?.[1]);
  const multiplayerTop = Number(indexSource.match(
    /#multiplayer-status\s*\{[\s\S]*?top:\s*calc\(var\(--safe-top\) \+ (\d+)px\)/,
  )?.[1]);
  const tiltTop = Number(indexSource.match(
    /#tilt-status\s*\{[\s\S]*?top:\s*calc\(env\(safe-area-inset-top, 0px\) \+ (\d+)px\)/,
  )?.[1]);
  const consoleTop = Number(indexSource.match(
    /\.touch-mode #test-flight-console\s*\{[\s\S]*?top:\s*calc\(var\(--safe-top\) \+ (\d+)px\)/,
  )?.[1]);
  const desktopConsoleTop = Number(indexSource.match(
    /#test-flight-console\s*\{[\s\S]*?top:\s*calc\(var\(--safe-top\) \+ (\d+)px\)/,
  )?.[1]);

  assert.ok([pauseTop, multiplayerTop, tiltTop, consoleTop, desktopConsoleTop]
    .every(Number.isFinite));
  assert.ok(pauseTop >= multiplayerTop + 18,
    "the pause target must clear the multiplayer badge it now shares a column with");
  assert.ok(tiltTop >= GUN_TEMP_BOTTOM_PX,
    "the tilt recenter target must clear the GUN TEMP instrument");
  assert.ok(consoleTop >= tiltTop + 44,
    "the action console must sit below the 44px tilt target");
  assert.ok(desktopConsoleTop >= GUN_TEMP_BOTTOM_PX,
    "the always-available systems console must clear the GUN TEMP instrument");
});

test("every platform sees the aircraft picker and Fly remains a real gesture", () => {
  assert.match(appSource,
    /initialProgramSelection = resolveInitialProgramSelection\([\s\S]*?initialProgramNode = initialProgramSelection\.selectedProgramNode/);
  assert.match(missionAuthoritySource,
    /allowedRequest = requestedProgramNode[\s\S]*?selectedProgramNode: allowedRequest \? requestedProgramNode : defaultProgramNode/,
    "blocked programme links must keep the production programme selected behind Ready");
  assert.match(appSource,
    /let selectedBeat = Number\.isInteger\(initialProgramNode\.mission\)[\s\S]*?defaultProgramNode\.mission/,
    "shell missions stage their beat; standalone cards keep the default shell beat until Fly navigates");
  assert.match(bridgeSource, /static readonly SimulationSession Session = new\(7,/,
    "the bridge fallback and browser must agree on the F-22 first experience");
  assert.match(appSource, /let autoLaunchPending = false/,
    "desktop, touch, and deep links must all stop at the same deliberate aircraft picker");
  assert.match(appSource,
    /function tryAutoLaunch\([\s\S]*?pauseReasons\.has\("ready"\)[\s\S]*?return launchMission\(selectedBeat\)/);
  assert.match(appSource,
    /readyStart\.addEventListener\("click"[\s\S]*?requestMobileFullscreenFromGesture\(\)[\s\S]*?activateReadyAction\(\)/,
    "fullscreen must be requested synchronously from the Fly gesture before terrain warmup");

  const buttons = htmlButtons(indexSource);
  const nodeIds = buttons.filter((button) => button.attributes["data-program-node"] !== undefined)
    .map((button) => button.attributes["data-program-node"]);
  // The catalogue grows. Protect that every card is a real program node and that the production
  // aircraft remain present, rather than freezing the whole list and breaking on every new beat.
  assert.ok(nodeIds.includes("first-merge"),
    "the F-22 guns-only merge must always be selectable");
  assert.ok(nodeIds.includes("rapier-intercept"),
    "the Rapier full mission must always be selectable");
  assert.ok(nodeIds.includes("cobra-lab"),
    "Cobra Canyon must be selectable from the Ready aircraft picker");
  assert.ok(nodeIds.includes("weekend-ride"),
    "Weekend Ride must be selectable from the Ready aircraft picker");
  assert.match(appSource,
    /function shellProgramEntry[\s\S]*?if \(experience\s*&&\s*experience\.mission == null/,
    "a missing program query must not treat null experience as a standalone card");
  assert.match(appSource,
    /"weekend-ride": Object\.freeze\([\s\S]*?Fly opens the dedicated Weekend Ride surface/,
    "Weekend Ride briefing must send Fly to the owned surface");
  assert.equal(new Set(nodeIds).size, nodeIds.length, "no duplicate program nodes");
  assert.equal(buttons.filter((button) => button.attributes.id === "ready-start").length, 1);
  assert.match(indexSource, /role="dialog"[^>]*aria-modal="true"/);
  assert.match(indexSource, /\.ready-selector,[\s\S]*?touch-action:\s*pan-y pinch-zoom/);
  assert.match(appSource,
    /if \(mobileControls && readyTitle && readyStart\) readyTitle\.after\(readyStart\)/,
    "touch DOM order must put Fly where the phone layout shows it");
  assert.match(appSource,
    /function centerReadyMissionChoice\(selectedMission\)[\s\S]*?option\.getBoundingClientRect\(\)[\s\S]*?rail\.getBoundingClientRect\(\)[\s\S]*?rail\.scrollLeft = Math\.max\(0, Math\.min\(maximum, centred\)\)[\s\S]*?card\.scrollLeft = 0[\s\S]*?function focusReadyScreen\(\)[\s\S]*?centerReadyMissionChoice\(selectedMission\)[\s\S]*?const target = !readyStart\.disabled[\s\S]*?readyRouteNotice\?\.querySelector\("a\[href\]"\) \?\? selectedMission/,
    "deep-linked missions must centre only their rail while focus lands on Fly or a usable recovery action");
  assert.doesNotMatch(appSource,
    /selectedMission\?\.closest\("\.sortie-option"\)\?\.scrollIntoView/,
    "WebKit scrollIntoView must not shift the overflow-hidden outer Ready card sideways");
  assert.match(appSource, /mobileControls \? "Tap Fly to launch" : "Press Enter to fly"/,
    "the touch briefing must name its real launch gesture");
  assert.match(indexSource, /\.sortie-choice\s*\{[\s\S]*?min-height:\s*78px/);
  assert.match(indexSource,
    /@media \(max-width: 760px\)[\s\S]*?\.ready-mission-groups\s*\{[\s\S]*?grid-auto-flow:\s*column[\s\S]*?overflow-x:\s*auto/,
    "portrait mission cards must become one compact horizontal chooser");
  assert.match(indexSource,
    /#ready-screen\[data-mode="program"\] \.sortie-choice\[data-aircraft\]\s*\{[\s\S]*?position:\s*relative[\s\S]*?\.sortie-choice\[data-aircraft\] > \*\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0 auto auto 0/,
    "screen-reader-only poster labels must be contained by their card instead of widening the outer dialog");
  assert.match(indexSource,
    /@media \(max-height: 500px\) and \(orientation: landscape\)[\s\S]*?#ready-screen\[data-mode="program"\] \.ready-layout\s*\{[\s\S]*?grid-template-columns:/,
    "short landscape screens need independent mission and briefing columns");
});

test("release state gates routes while the production aircraft remain qualification-free", () => {
  assert.match(progressionSource,
    /id: "first-merge"[\s\S]*?mission: 7[\s\S]*?id: "low-level-drone"[\s\S]*?mission: 8[\s\S]*?id: "rapier-intercept"[\s\S]*?mission: 12/);
  assert.match(progressionSource,
    /function campaignNodeUnlocked[\s\S]*?return experienceLaunchable\(nodeId\)/,
    "availability must depend on reviewed release state, not profile progress or mere existence");
  assert.doesNotMatch(indexSource, /data-program-state="locked"/,
    "release quarantine is not a gamified qualification lock");
  assert.match(appSource,
    /function selectCampaignNode[\s\S]*?!experienceAccess\(node\.id, window\.location\)\.allowed[\s\S]*?selectedBeat = node\.mission/);
  assert.match(appSource,
    /standalone\?\.mission == null[\s\S]*?window\.location\.assign\(standalone\.route\)/,
    "production standalone cards (Cobra) must navigate to their owned surface on Fly");
  assert.match(appSource,
    /requestedExperience = requestedProgramNode[\s\S]*?experienceById\(requestedProgramNode\.id\)[\s\S]*?requestedExperienceAccess[\s\S]*?experienceAccess\(requestedExperience\.id, window\.location\)[\s\S]*?blockedProgramExperience = initialProgramSelection\.blockedExperience/,
    "a recognised non-production deep link must retain its honest unavailable notice");
  assert.match(missionAuthoritySource,
    /blockedExperience: requestedExperience && requestedAccess\?\.allowed === false[\s\S]*?requestedExperience[\s\S]*?: null/,
    "the unavailable notice must not also make the preview mission authoritative");
  assert.match(appSource,
    /function launchMission[\s\S]*?blockedProgramExperience[\s\S]*?!experienceAccess\(selectedProgramNodeId, window\.location\)\.allowed[\s\S]*?return false/,
    "a quarantined route must not stage or begin through the shared launch path");
  assert.match(appSource,
    /requestedAccess: requestedExperienceAccess[\s\S]*?initialProgramNode = initialProgramSelection\.selectedProgramNode/,
    "the explicit preview acknowledgement must retain the experimental node without promoting it");
  assert.match(indexSource, /id="ready-route-notice"[^>]*role="status"[^>]*hidden/,
    "blocked deep links need a visible, accessible reason and a path back to production aircraft");
  assert.match(appSource,
    /previewUrl\.searchParams\.set\("preview", "1"\)[\s\S]*?Open experimental preview/,
    "the unavailable selection must expose a deliberate preview acknowledgement rather than a hidden bypass");
  assert.match(appSource,
    /readyRouteNotice\.dataset\.noticeKey !== noticeKey[\s\S]*?readyRouteNotice\.replaceChildren\(\)/,
    "frame-by-frame Ready rendering must preserve the live-region link and its keyboard focus");
  assert.match(appSource,
    /readyRouteNotice\?\.querySelector\("a\[href\]"\) \?\? selectedMission/,
    "keyboard focus must land on a usable recovery action when the selected route is disabled");
});

test("program modal behavior cannot leak into flight shortcuts", () => {
  assert.match(appSource,
    /function nativeInteractiveOwnsKey\(event\)[\s\S]*?"Enter", "NumpadEnter", "Space"[\s\S]*?"ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"/);
  const nativeGuard = appSource.match(
    /function nativeInteractiveOwnsKey\(event\)\s*\{([\s\S]*?)\n}/,
  )?.[1] ?? "";
  assert.doesNotMatch(nativeGuard, /Digit|KeyC|KeyH|KeyM|KeyR/);
  assert.doesNotMatch(appSource, /\^Digit\[1-8\]\$/,
    "raw beat-number shortcuts must not bypass progression");

  assert.match(appSource,
    /centerReadyMissionChoice\(selectedMission\)[\s\S]*?const target = !readyStart\.disabled[\s\S]*?readyRouteNotice\?\.querySelector\("a\[href\]"\) \?\? selectedMission/,
    "focus must expose a deep-linked mission and land on either Fly or a usable recovery action");
  assert.match(appSource,
    /sceneCanvas\.inert = showScreen[\s\S]*?readyScreen\.contains\(document\.activeElement\)[\s\S]*?focusOwner\?\.focus[\s\S]*?readyScreen\.setAttribute\(\s*"aria-hidden"/,
    "focus must leave the dialog before it becomes aria-hidden");
  assert.match(appSource,
    /readyScreen\.addEventListener\("keydown"[\s\S]*?event\.code !== "Tab"[\s\S]*?last\.focus[\s\S]*?first\.focus/,
    "the modal must keep Tab focus inside its active controls");
});

test("the engine-less balloon mission briefing teaches the actual diving energy problem", () => {
  const mission = appSource.match(/4:\s*\{[\s\S]*?title: "Balloon Strike"([\s\S]*?)\n\s*\},/)?.[1];
  assert.ok(mission, "Mission 4 needs an explicit briefing");
  assert.match(mission, /configuration: "Engine-less glider · 50 rounds · one pass"/,
    "the selected-sortie facts must not claim the glider is a powered air start");
  assert.match(mission, /brief: "[^"]*no engine/i);
  assert.match(mission, /controlled dive/i);
  assert.doesNotMatch(mission, /climb/i);
  assert.match(appSource, /brief\.configuration \|\| "Guns hot · air start"/,
    "mission-specific configuration truth must reach the visible briefing");
});

test("drone-raid coaching is mission-gated and carries live efficiency truth into debrief", () => {
  const mission = appSource.match(/8:\s*\{[\s\S]*?title: "Low-Level Drone Intercept"([\s\S]*?)\n\s*\},/)?.[1];
  assert.ok(mission, "Mission 8 needs an explicit briefing");
  assert.match(mission,
    /four sequential airborne raiders[^\"]*one target is authoritative at a time[^\"]*next enters only after the current raider is killed or leaks/i,
    "the menu must disclose the sequential one-opponent kernel instead of implying four simultaneous targets");
  assert.match(indexSource, /data-program-node="low-level-drone"[\s\S]*NO GROUND TARGETS YET/,
    "the first scenery slice must not imply that ambient buildings are authoritative targets");
  assert.match(hudSource,
    /const raid = state\.drone_raid_evaluation === true;[\s\S]*?drone_raid_active_target[\s\S]*?drone_raid_time_to_leak_s[\s\S]*?drone_raid_rounds_per_kill[\s\S]*?drone_raid_cue/,
    "the raid HUD must derive its teaching cue and efficiency data from authoritative mission state");
  assert.match(hudSource,
    /if \(raid && state\.finished !== true && state\.drone_raid_finished !== true\)/,
    "raid-specific symbology must stay hidden after either lifecycle reports the raid complete");
  assert.match(hudSource, /else if \(!raid && kills > 0\)/,
    "a completed raid must not fall through to the generic persistent kill panel");
  assert.match(hudSource,
    /headerParts = \[`RAIDER \$\{activeTarget\}\/\$\{total\} ACTIVE`[\s\S]*?if \(leakers > 0\) headerParts\.push/,
    "the live header must identify the active staged raider and omit a zero-leaker label");
  assert.match(hudSource,
    /rawTimeToLeak = state\.drone_raid_time_to_leak_s;[\s\S]*?typeof rawTimeToLeak === "number"[\s\S]*?timeToLeak === null \? "—"/,
    "JSON null must remain unknown time-to-leak rather than being coerced to zero seconds");
  assert.match(hudSource,
    /metricParts = \[`TLEAK \$\{timeText\}`\];[\s\S]*?if \(raidKills > 0 && Number\.isFinite\(roundsPerKill\)\)[\s\S]*?metricParts\.push\(`RPK/,
    "rounds per kill must not appear until at least one physical kill exists");
  assert.match(hudSource,
    /narrowRaidLayout[\s\S]*?rightClearance = narrowRaidLayout \? 82 : 18[\s\S]*?width = Math\.max/,
    "the narrow raid panel must reserve the upper-right ammunition readout");
  assert.match(hudSource,
    /raidActive[\s\S]*?raiderEast - playerEast[\s\S]*?raiderNorth - playerNorth[\s\S]*?Math\.atan2\(east, north\)[\s\S]*?`R\$\{target\}`/,
    "the raid steering caret must derive only from authoritative ownship and active-raider positions");
  assert.match(hudSource,
    /draw\(frame\)[\s\S]*?this\.drawSortieStatus\(frame\)/,
    "the mission-gated raid panel must be called by the live HUD render path");
  assert.match(appSource,
    /function droneRaidDebriefFacts\(state\)[\s\S]*?drone_raid_leakers[\s\S]*?if \(leakers > 0\)[\s\S]*?if \(kills > 0 && Number\.isFinite\(roundsPerKill\)\)[\s\S]*?rounds\/kill[\s\S]*?state\?\.drone_raid_evaluation === true[\s\S]*?droneRaidDebriefFacts\(state\)/,
    "the debrief must explain the score in operational terms");
});

test("non-bridge player actions advertised by the quicklook have observable UI handlers", () => {
  const directActions = [
    ["H HIDE", /event\.code === "KeyH"[\s\S]*?view\.hud\.toggleLegend\(\)/],
    ["M SOUND", /event\.code === "KeyM"[\s\S]*?commitPlayerSettings\(\{ \.\.\.playerSettings, audio: !playerSettings\.audio \}\)/],
    ["R RESTART", /event\.code === "KeyR"[\s\S]*?restartMissionNow\(\)/],
    ["DRAG LOOK", /sceneCanvas\.addEventListener\("pointermove"/],
  ];
  for (const [help, handler] of directActions) {
    assert.ok(copy.includes(help), `missing help for ${help}`);
    assert.match(appSource, handler, `${help} has no UI effect`);
  }
  assert.ok(copy.includes("PRESS ENTER TO FLY"));
  assert.match(appSource, /event\.code === "Enter"[\s\S]*?activateReadyAction\(\)/);
});

test("touch throttle seeds from aircraft-relative thrust and retired qualification stays inert", () => {
  assert.match(appSource,
    /throttleLever = normalisePublishedThrottleLever\(\s*latestState\?\.throttle,\s*latestState\?\.max_thrust_fraction,\s*\)/,
    "the first touch nudge must preserve the published physical thrust across aircraft");
  assert.doesNotMatch(appSource,
    /recordCampaignQualification|qualification_earned|qualifyCampaignNode|campaignNodeQualified/,
    "release-state availability must not retain a hidden per-frame qualification side effect");
});
