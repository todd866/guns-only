import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { TEST_FLIGHT_ACTIONS } from "../../systems/test_flight_console.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");

const [appSource, hudSource, indexSource, keyGrammarSource, detentSource,
  sessionSource, bridgeSource] = await Promise.all([
  "web/wwwroot/app.js",
  "web/wwwroot/hud.js",
  "web/wwwroot/index.html",
  "sim/KeyGrammar.cs",
  "sim/DetentLayer.cs",
  "sim/SimulationSession.cs",
  "web/WebBridge.cs",
].map((relativePath) => readFile(path.join(ROOT, relativePath), "utf8")));

function normalizedCopy(source, { markup = false } = {}) {
  const visible = markup
    ? source.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")
    : source;
  return visible
    .replace(/&minus;/gi, "-")
    .replace(/&nbsp;/gi, " ")
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
  const body = source.match(/const keyMap = new Map\(\[([\s\S]*?)\]\);/)?.[1];
  assert.ok(body, "app.js must keep one auditable host-code to GKey map");
  return new Map([...body.matchAll(/\["([^"]+)",\s*(\d+)\]/g)]
    .map((match) => [match[1], Number(match[2])]));
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
  { id: "pull", code: "ArrowDown", gkey: "PullUp", behavior: "hold", help: "DOWN / UP PULL / PUSH", consumer: /GKey\.PullUp/, observable: /requested_g_cmd/ },
  { id: "push", code: "ArrowUp", gkey: "PushDown", behavior: "hold", help: "DOWN / UP PULL / PUSH", consumer: /GKey\.PushDown/, observable: /requested_g_cmd/ },
  { id: "roll-left", code: "ArrowLeft", gkey: "RollLeft", behavior: "hold", help: "LEFT / RIGHT ROLL", consumer: /GKey\.RollLeft/, observable: /requested_roll_control/ },
  { id: "roll-right", code: "ArrowRight", gkey: "RollRight", behavior: "hold", help: "LEFT / RIGHT ROLL", consumer: /GKey\.RollRight/, observable: /requested_roll_control/ },
  { id: "rudder-left", code: "KeyA", gkey: "RudderLeft", behavior: "hold", help: "A / D RUDDER", consumer: /GKey\.RudderLeft/, observable: /requested_rudder/ },
  { id: "rudder-right", code: "KeyD", gkey: "RudderRight", behavior: "hold", help: "A / D RUDDER", consumer: /GKey\.RudderRight/, observable: /requested_rudder/ },
  { id: "power-up", code: "KeyW", gkey: "ThrottleUp", behavior: "hold", help: "W / S THROTTLE", consumer: /GKey\.ThrottleUp/, observable: /requested_throttle/ },
  { id: "power-down", code: "KeyS", gkey: "ThrottleDown", behavior: "hold", help: "W / S THROTTLE", consumer: /GKey\.ThrottleDown/, observable: /requested_throttle/ },
  { id: "guns", code: "KeyF", gkey: "Trigger", behavior: "hold", help: "F GUNS", consumer: /GKey\.Trigger/, observable: /gun_firing/ },
  // Padlock is a presentation action as well as a bridge key. Its observable evidence therefore
  // lives in app.js/HUD state, not in aircraft dynamics.
  { id: "padlock", code: "KeyV", gkey: "Padlock", behavior: "momentary", help: "V TARGET / BOAT PADLOCK", uiConsumer: /contextualPadlockTarget\(latestState\)/, uiObservable: /hudFrame\.padlockTarget = padlockTarget/ },
  { id: "restart", code: "KeyR", gkey: "Restart", behavior: "momentary", help: "R RESTART", consumer: /key == GKey\.Restart/, uiConsumer: /restartMission\(\)/ },
  { id: "max-g-override", code: "Space", gkey: "Override", behavior: "hold", help: "SPACE OVERRIDE", consumer: /GKey\.Override/, observable: /requested_g_cmd/ },
  { id: "gear-toggle", code: "KeyG", gkey: "GearToggle", behavior: "momentary", help: "G GEAR", testAction: "gearToggle", consumer: /key == GKey\.GearToggle/, observable: /gear_handle/ },
  { id: "flaps-up", code: "BracketLeft", gkey: "FlapUp", behavior: "hold", help: "[ / ] FLAPS UP / DOWN", testAction: "flapUp", consumer: /GKey\.FlapUp/, observable: /flap_lever/ },
  { id: "flaps-down", code: "BracketRight", gkey: "FlapDown", behavior: "hold", help: "[ / ] FLAPS UP / DOWN", testAction: "flapDown", consumer: /GKey\.FlapDown/, observable: /flap_lever/ },
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
  // KeyK is a historical no-op left in the ABI-era map. It is not advertised. Keeping this one
  // exception explicit prevents another dead key from slipping in; removing KeyK is also valid.
  assert.deepEqual(unclassified.filter((code) => code !== "KeyK"), []);
  assert.doesNotMatch(copy, /(?:^|\s)K\s+(?:KNOCK|KIO|ABORT)(?:\s|$)/,
    "the historical KeyK no-op must never be promised to a player");
});

test("every advertised bridge action has help copy, a runtime consumer, and observable truth", () => {
  const simConsumers = `${detentSource}\n${sessionSource}`;
  for (const action of BRIDGE_ACTIONS) {
    assert.ok(copy.includes(action.help), `${action.id}: missing player-facing help '${action.help}'`);
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

test("keyboard dispatch is edge-safe and every held action has a release path", () => {
  assert.match(appSource, /if \(event\.repeat \|\| !bridge\) return;/,
    "OS key repeat must not create extra momentary actions");
  assert.match(appSource, /pressMappedKey\(event\.code, "keyboard"\)/);
  assert.match(appSource, /window\.addEventListener\("keyup"[\s\S]*?releaseMappedKey\(event\.code, "keyboard"\)/);
  assert.match(appSource, /bridge\.FeedKey\(gkey, true\)/);
  assert.match(appSource, /bridge\.FeedKey\(gkey, false\)/);
  assert.match(appSource, /releaseAllMappedKeys\("visibility-hidden"\)/,
    "backgrounding must neutralise every held flight control");

  for (const action of BRIDGE_ACTIONS.filter(({ testAction }) => testAction)) {
    assert.equal(TEST_FLIGHT_ACTIONS[action.testAction]?.behavior, action.behavior,
      `${action.id}: panel lifecycle must match the physical control`);
  }
});

test("every visible HTML button is wired through one auditable action surface", () => {
  const explicitButtons = new Map([
    ["incident-replay-skip", /incidentReplaySkip\?\.addEventListener\("click", skipIncidentReplay\)/],
    ["ready-start", /readyStart\.addEventListener\("click"/],
    ["ready-replay", /readyReplay\?\.addEventListener\("click"/],
    ["ready-build-reload", /readyBuildReload\?\.addEventListener\("click", reloadCurrentBuild\)/],
    ["ready-mission-prev", /readyMissionPrev\?\.addEventListener\("click", \(\) => stepMission\(-1\)\)/],
    ["ready-mission-next", /readyMissionNext\?\.addEventListener\("click", \(\) => stepMission\(1\)\)/],
  ]);

  for (const button of htmlButtons(indexSource)) {
    const attrs = button.attributes;
    const hooks = ["data-test-action", "data-hold-key", "data-pulse-key", "data-mobile-action"]
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
  }
});

test("touch pilots can explicitly command gear, both flap directions, and contextual padlock", () => {
  const buttons = htmlButtons(indexSource);
  const find = (attribute, value) => buttons.find((button) => button.attributes[attribute] === value);

  assert.ok(find("data-pulse-key", "KeyG"), "mobile surface needs a gear-toggle button");
  assert.ok(find("data-hold-key", "BracketLeft"), "mobile surface needs a spring-loaded flap-up button");
  assert.ok(find("data-hold-key", "BracketRight"), "mobile surface needs a spring-loaded flap-down button");
  assert.ok(find("data-pulse-key", "KeyV"), "mobile surface needs the same contextual padlock action as V");

  assert.match(appSource,
    /querySelectorAll\("\[data-hold-key\]"\)[\s\S]*?addEventListener\("pointerdown"[\s\S]*?pressMappedKey\(code, source\)[\s\S]*?addEventListener\("pointerup", endControl\)[\s\S]*?addEventListener\("pointercancel", endControl\)[\s\S]*?addEventListener\("lostpointercapture", endControl\)/,
    "held touch controls need down, up, cancellation, and lost-pointer release paths");
  assert.match(appSource,
    /querySelectorAll\("\[data-pulse-key\]"\)[\s\S]*?if \(!pressMappedKey\(code, source\)\) return;[\s\S]*?releaseMappedKey\(code, source\)/,
    "a pulse control must always emit exactly one accepted down/up pair");
  assert.match(appSource,
    /querySelectorAll\("\[data-pulse-key\]"\)[\s\S]*?if \(!pressMappedKey\(code, source\)\) return;[\s\S]*?code === "KeyV"[\s\S]*?togglePadlock\(\)/,
    "the V pulse must drive contextual presentation only after the bridge accepts the action");
  assert.match(appSource,
    /if \(!pressMappedKey\(event\.code, "keyboard"\)\) return;[\s\S]*?event\.code === "KeyV"[\s\S]*?togglePadlock\(\)/,
    "a paused or rejected keyboard V press must not change presentation state");
});

test("fresh and touch-only players can reach every mission without a hidden keyboard dependency", () => {
  assert.match(appSource, /let selectedBeat = [\s\S]*?\? requestedInitialBeat : 1;/,
    "a fresh visitor should begin at the first guns-only BFM drill");
  assert.match(bridgeSource, /static readonly SimulationSession Session = new\(1,/,
    "the bridge and browser must agree on the initial mission");
  assert.match(appSource, /function stepMission\(direction\)[\s\S]*?selectMission\(/);
  assert.match(appSource, /requestedInitialBeat <= 7 \? requestedInitialBeat : 1/,
    "a mission query may deep-link only to a real briefing");
  assert.ok(htmlButtons(indexSource).some((button) => button.attributes.id === "ready-mission-prev"));
  assert.ok(htmlButtons(indexSource).some((button) => button.attributes.id === "ready-mission-next"));
  assert.match(indexSource,
    /\.ready-mission-nav\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(0, 1\.15fr\)\s+minmax\(0, 1fr\)/,
    "mission navigation must shrink inside a narrow phone briefing card");
});

test("the engine-less balloon mission briefing teaches the actual diving energy problem", () => {
  const mission = appSource.match(/4:\s*\{[\s\S]*?title: "Balloon Strike"[\s\S]*?brief: "([^"]+)"/)?.[1];
  assert.ok(mission, "Mission 4 needs an explicit briefing");
  assert.match(mission, /no engine/i);
  assert.match(mission, /controlled dive/i);
  assert.doesNotMatch(mission, /climb/i);
});

test("non-bridge player actions advertised by the quicklook have observable UI handlers", () => {
  const directActions = [
    ["H HIDE", /event\.code === "KeyH"[\s\S]*?view\.hud\.toggleLegend\(\)/],
    ["M SOUND", /event\.code === "KeyM"[\s\S]*?view\.hud\.toggleAudio\(\)/],
    ["1–7 MISSION", /\^Digit\[1-7\]\$[\s\S]*?selectMission\(/],
    ["DRAG LOOK", /sceneCanvas\.addEventListener\("pointermove"/],
  ];
  for (const [help, handler] of directActions) {
    assert.ok(copy.includes(help), `missing help for ${help}`);
    assert.match(appSource, handler, `${help} has no UI effect`);
  }
  assert.ok(copy.includes("PRESS ENTER TO FLY"));
  assert.match(appSource, /event\.code === "Enter"[\s\S]*?activateReadyAction\(\)/);
});
