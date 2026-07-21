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
  { id: "limit-override", code: "Space", gkey: "Override", behavior: "hold", help: "SPACE LIMIT OVERRIDE", consumer: /GKey\.Override/, observable: /requested_g_cmd/ },
  { id: "auto-gcas-paddle", code: "KeyK", gkey: "AutoGcasOverride", behavior: "hold", help: "K AGCAS PADDLE", consumer: /GKey\.AutoGcasOverride/, observable: /auto_gcas_override_held/ },
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
  assert.deepEqual(unclassified, []);
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
  ]);

  for (const button of htmlButtons(indexSource)) {
    const attrs = button.attributes;
    const hooks = [
      "data-test-action", "data-hold-key", "data-pulse-key", "data-mobile-action",
      "data-sortie-activity", "data-mission-select", "data-mission-launch",
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
    if (attrs["data-mission-launch"] !== undefined) {
      assert.match(appSource,
        /readySelector\?\.addEventListener\("click"[\s\S]*?launchMission\(Number\(launch\.dataset\.missionLaunch\)\)/,
        `${button.text}: mission card has no direct launch handler`);
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
  const gcasPaddle = find("data-hold-key", "KeyK");
  assert.ok(gcasPaddle, "touch pilots need the same held Auto-GCAS paddle as keyboard pilots");
  assert.equal(gcasPaddle.attributes.hidden, "",
    "the paddle must be absent until an active recoverable fly-up makes it relevant");
  assert.match(appSource,
    /touchGcasPaddle\.hidden = !\(state\?\.auto_gcas_active === true[\s\S]*?pilot_control_authority_01\) >= 0\.55/,
    "the touch paddle must appear only when Auto-GCAS is active and the pilot can operate it");

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
  assert.match(appSource, /requestedInitialBeat <= 8 \? requestedInitialBeat : 1/,
    "a mission query may deep-link only to a real briefing");

  const buttons = htmlButtons(indexSource);
  const selectIds = buttons.filter((button) => button.attributes["data-mission-select"] !== undefined)
    .map((button) => Number(button.attributes["data-mission-select"]));
  const launchIds = buttons.filter((button) => button.attributes["data-mission-launch"] !== undefined)
    .map((button) => Number(button.attributes["data-mission-launch"]));
  assert.deepEqual(selectIds, [1, 2, 7, 5, 6, 3, 4, 8],
    "the activity-first display order is a deliberate product contract");
  assert.deepEqual([...selectIds].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...launchIds].sort(), [1, 2, 3, 4, 5, 6, 7, 8],
    "every selectable sortie also needs a one-click launch target");

  assert.match(indexSource, /role="dialog"[^>]*aria-modal="true"/,
    "the full-screen sortie picker must isolate background controls as a modal dialog");
  assert.match(indexSource, /\.ready-selector,[\s\S]*?touch-action:\s*pan-y/,
    "the picker must remain vertically scrollable inside a page that disables body touch gestures");
  assert.match(indexSource, /\.ready-activity-nav button\s*\{[\s\S]*?min-height:\s*50px/,
    "activity targets must remain touch-sized");
  assert.match(indexSource, /\.sortie-choice\s*\{[\s\S]*?min-height:\s*78px/,
    "sortie cards must remain touch-sized");
});

test("the sortie catalogue is activity-first, complete, and synchronized with briefing truth", () => {
  const expectedGroups = new Map([
    ["dogfight", [1, 2, 7]],
    ["carrier", [5, 6]],
    ["gunnery", [3, 4]],
    ["defence", [8]],
  ]);
  const groupMatches = [...indexSource.matchAll(
    /<section\s+id="ready-group-[^"]+"[\s\S]*?data-sortie-group="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g,
  )];
  assert.deepEqual(groupMatches.map((match) => match[1]), [...expectedGroups.keys()]);
  for (const [, activity, body] of groupMatches) {
    const missions = [...body.matchAll(/data-mission-select="(\d+)"/g)]
      .map((match) => Number(match[1]));
    assert.deepEqual(missions, expectedGroups.get(activity), `${activity}: wrong mission membership`);
  }
  assert.match(appSource,
    /dogfight:\s*Object\.freeze\(\{ label: "Dogfight", missions: Object\.freeze\(\[1, 2, 7\]\)/);
  assert.match(appSource,
    /carrier:\s*Object\.freeze\(\{ label: "Carrier", missions: Object\.freeze\(\[5, 6\]\)/);
  assert.match(appSource,
    /gunnery:\s*Object\.freeze\(\{ label: "Gunnery", missions: Object\.freeze\(\[3, 4\]\)/);
  assert.match(appSource,
    /defence:\s*Object\.freeze\(\{ label: "Defence", missions: Object\.freeze\(\[8\]\)/);

  const buttons = htmlButtons(indexSource);
  for (let mission = 1; mission <= 8; mission += 1) {
    const select = buttons.find((button) => button.attributes["data-mission-select"] === String(mission));
    const launch = buttons.find((button) => button.attributes["data-mission-launch"] === String(mission));
    assert.ok(select, `mission ${mission}: missing select card`);
    assert.ok(launch?.attributes["aria-label"], `mission ${mission}: direct launch needs an accessible name`);

    const block = appSource.match(new RegExp(`\\n\\s*${mission}: \\{([\\s\\S]*?)\\n\\s*\\},`))?.[1];
    assert.ok(block, `mission ${mission}: missing briefing model`);
    const title = block.match(/title: "([^"]+)"/)?.[1];
    const card = block.match(/card: "([^"]+)"/)?.[1];
    assert.ok(title && card, `mission ${mission}: briefing needs title and card copy`);
    assert.ok(select.text.includes(normalizedCopy(title)), `mission ${mission}: card title drifted from briefing`);
    assert.ok(select.text.includes(normalizedCopy(card)), `mission ${mission}: card summary drifted from briefing`);
  }

  assert.match(appSource,
    /selectedActivity = MISSION_BRIEFS\[selectedBeat\]\?\.activity/,
    "deep-linked missions must open their own activity group");
  assert.match(appSource,
    /function selectMission\([\s\S]*?selectedActivity = MISSION_BRIEFS\[selectedBeat\]\?\.activity[\s\S]*?activityMissionSelection\.set\(selectedActivity, selectedBeat\)/,
    "card, digit, and deep-link selection must not diverge from the visible activity");
  assert.match(appSource,
    /const missionUrl = new URL\(window\.location\.href\)[\s\S]*?searchParams\.delete\("mission"\)[\s\S]*?searchParams\.set\("mission", String\(selectedBeat\)\)[\s\S]*?history\.replaceState\(window\.history\.state, "", missionUrl\)/,
    "mission selection must preserve unrelated URL parameters and the hash while default mission 1 stays canonical");
});

test("sortie-picker keyboard and modal behavior cannot leak into flight shortcuts", () => {
  assert.match(appSource,
    /function nativeInteractiveOwnsKey\(event\)[\s\S]*?"Enter", "NumpadEnter", "Space"[\s\S]*?"ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"/);
  const nativeGuard = appSource.match(
    /function nativeInteractiveOwnsKey\(event\)\s*\{([\s\S]*?)\n}/,
  )?.[1] ?? "";
  assert.doesNotMatch(nativeGuard, /Digit|KeyC|KeyH|KeyM|KeyR/,
    "number and briefing shortcuts must still work while a menu button owns focus");
  assert.match(appSource,
    /window\.addEventListener\("keydown"[\s\S]*?if \(nativeInteractiveOwnsKey\(event\)\) return;[\s\S]*?\^Digit\[1-8\]\$/,
    "native button activation must be separated from, not replace, mission shortcuts");

  assert.match(appSource,
    /button\.tabIndex = selected \? 0 : -1/,
    "activity tabs need a single roving tab stop");
  assert.match(appSource,
    /readyActivityNav\?\.addEventListener\("keydown"[\s\S]*?\["ArrowLeft", "ArrowRight", "Home", "End"\][\s\S]*?focus\(\{ preventScroll: true }\)[\s\S]*?selectActivity/,
    "activity tabs need standard arrow, Home, and End navigation");
  assert.match(appSource,
    /function selectActivity\([\s\S]*?selectMission\(mission, \{ focus: false }\)/,
    "changing tabs must not steal focus back to a mission card");
  assert.match(appSource,
    /const target = !readyStart\.disabled \? readyStart : selectedMission/,
    "initial modal focus must keep the advertised Enter-to-fly action honest");
  assert.match(appSource,
    /sceneCanvas\.inert = showScreen[\s\S]*?readyScreen\.contains\(document\.activeElement\)[\s\S]*?focusOwner\?\.focus[\s\S]*?readyScreen\.setAttribute\("aria-hidden"/,
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
  const mission = appSource.match(/8:\s*\{[\s\S]*?title: "Drone Raid Defence"([\s\S]*?)\n\s*\},/)?.[1];
  assert.ok(mission, "Mission 8 needs an explicit briefing");
  assert.match(mission,
    /four-raider sequential stream:[^\"]*one target is authoritative at a time[^\"]*next enters only after the current raider is killed or leaks/i,
    "the menu must disclose the sequential one-opponent kernel instead of implying four simultaneous targets");
  assert.match(indexSource,
    /four sequentially staged one-way raiders—one authoritative target at a time—before they cross the defended ring/i,
    "the sortie card must make the staged-stream limitation visible before launch");
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
    ["M SOUND", /event\.code === "KeyM"[\s\S]*?view\.hud\.toggleAudio\(\)/],
    ["1–8 MISSION", /\^Digit\[1-8\]\$[\s\S]*?selectMission\(/],
    ["DRAG LOOK", /sceneCanvas\.addEventListener\("pointermove"/],
  ];
  for (const [help, handler] of directActions) {
    assert.ok(copy.includes(help), `missing help for ${help}`);
    assert.match(appSource, handler, `${help} has no UI effect`);
  }
  assert.ok(copy.includes("PRESS ENTER TO FLY"));
  assert.match(appSource, /event\.code === "Enter"[\s\S]*?activateReadyAction\(\)/);
});
