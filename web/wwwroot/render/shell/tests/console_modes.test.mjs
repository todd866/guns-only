import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { combatHandoffPresentation } from "../../debrief/sortie_result.js";

const html = await readFile(new URL("../../../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
const actions = [...html.matchAll(/<button id="(ready-[^"]+)"([^>]*)>([\s\S]*?)<\/button>/g)]
  .filter(([, , attrs]) => attrs.includes("data-console-modes="))
  .map(([, id, attrs, body]) => ({ id, attrs,
    modes: attrs.match(/data-console-modes="([^"]+)"/)[1].split(" "),
    label: body.match(/class="shell-action-label">([^<]+)</)[1] }));

// Execute the real per-sortie visibility/label code, preserving the same controls across
// transitions. Mode membership comes from the authored DOM, which CSS projects directly.
const authority = app.slice(app.indexOf("  const handoff = combatHandoffPresentation(state);"),
  app.indexOf("  observeCasevacQuietCompletion(state);"));
assert.ok(authority.length > 0);
const updates = app.slice(app.indexOf("  if (readySettings) readySettings.hidden = !showScreen;"),
  app.indexOf("  if ((practiceReady || finished) && selectedPracticeExercise)"));
assert.ok(updates.length > 0);
const request = app.slice(app.indexOf("function requestCombatHandoffFromPause() {"),
  app.indexOf("function selectDeckConfiguration(value) {"));
assert.ok(request.length > 0);

function requestHarness({ state = {}, reasons = ["session"], accepted = true,
  hasEndBridge = true } = {}) {
  const pauseReasons = new Set(reasons);
  const calls = [];
  const bridgeRequest = name => () => {
    assert.equal(pauseReasons.has("session"), false, "resume before requesting a phase change");
    calls.push(name);
    return accepted;
  };
  const context = {
    latestState: state, pauseReasons, combatHandoffPresentation,
    bridge: { EndSortie: hasEndBridge ? bridgeRequest("EndSortie") : undefined,
      RequestReturnToBase: bridgeRequest("RequestReturnToBase") },
    knockItOffControl: { defaultCode: "KeyO" }, playerSettings: { bindings: {} },
    setPauseReason(reason, paused) {
      calls.push(paused ? "pause" : "resume");
      if (paused) pauseReasons.add(reason); else pauseReasons.delete(reason);
    },
    recorder: { event(type, action) { calls.push(`${type}:${action}`); } },
    sceneCanvas: { focus() { calls.push("focus"); } }, viewStatus: { textContent: "" },
  };
  return { calls, pauseReasons,
    request: () => vm.runInNewContext(`${request}\nrequestCombatHandoffFromPause()`, context) };
}

function harness() {
  const buttons = new Map(actions.map(action => [action.id, {
    hidden: /\bhidden\b/.test(action.attrs), disabled: /\bdisabled\b/.test(action.attrs),
    dataset: {}, label: { textContent: action.label },
    querySelector() { return this.label; },
  }]));
  const context = { readyScreen: { dataset: {} }, showScreen: true,
    combatHandoffPresentation, sortieResultCopy: () => null };
  for (const [id, button] of buttons)
    context[id.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = button;
  function paint(mode, overrides = {}) {
    Object.assign(context, { ready: mode === "program" || mode === "intro",
      finished: mode === "debrief", firstRunReady: false, selectedPracticeExercise: "",
      selectedProgramNodeId: "first-merge", state: {},
      pauseReasons: new Set([mode === "pause" ? "session" : mode]) }, overrides);
    context.sessionPaused = context.pauseReasons.has("session");
    context.readyScreen.dataset.mode = mode;
    vm.runInNewContext(`{\n${authority}\n${updates}\n}`, context);
    return visible(mode);
  }
  function visible(mode) {
    return visibleIds(mode).map(id => buttons.get(id).label.textContent);
  }
  function visibleIds(mode) {
    return actions.filter(action => action.modes.includes(mode) && !buttons.get(action.id).hidden)
      .map(action => action.id);
  }
  return { paint, visibleIds, buttons };
}

test("program → pause → debrief → program has exactly each mode's own actions", () => {
  const h = harness();
  const picker = ["Practice", "Logbook", "Replay valley intro", "Settings", "Report"];
  const pause = ["Practice", "Logbook", "Aircraft", "Restart", "Settings", "Report", "RTB"];
  assert.deepEqual(h.paint("program"), picker);
  // The regression: changing data-mode alone used to retain the picker's row.
  assert.deepEqual(h.visibleIds("pause"), ["ready-practice", "ready-logbook", "ready-return",
    "ready-restart", "ready-settings", "ready-report", "ready-handoff"]);
  assert.deepEqual(h.paint("pause", { state: { rtb_available: true } }), pause);
  assert.equal(h.buttons.get("ready-handoff").disabled, false);
  assert.deepEqual(h.paint("debrief"),
    ["Practice", "Logbook", "Aircraft", "Repeat sortie", "Settings", "Report"]);
  assert.deepEqual(h.paint("program"), picker);
  assert.equal(h.buttons.get("ready-handoff").disabled, true);
});

test("pause keeps RTB visible but disabled without authority", () => {
  const h = harness();
  assert.ok(h.paint("pause").includes("RTB"));
  assert.equal(h.buttons.get("ready-handoff").disabled, true);
});

test("completed combat replaces only the pause RTB slot with End and resets across modes", () => {
  const h = harness();
  const pauseActions = ["Practice", "Logbook", "Aircraft", "Restart", "Settings", "Report"];
  assert.deepEqual(h.paint("pause", { state: { rtb_available: true } }), [...pauseActions, "RTB"]);
  const pauseIds = h.visibleIds("pause");
  // RTB is already underway: End has its own authority and must not need another RTB request.
  const completed = { can_end_sortie: true, player_rtb_active: true, rtb_available: false };
  assert.deepEqual(h.paint("pause", { state: completed }), [...pauseActions, "End"]);
  assert.deepEqual(h.visibleIds("pause"), pauseIds);
  assert.equal(h.buttons.get("ready-handoff").disabled, false);
  assert.equal(h.buttons.get("ready-handoff").title, "End sortie without landing");
  assert.deepEqual(h.paint("debrief"),
    ["Practice", "Logbook", "Aircraft", "Repeat sortie", "Settings", "Report"]);
  assert.deepEqual(h.paint("program"),
    ["Practice", "Logbook", "Replay valley intro", "Settings", "Report"]);
  assert.deepEqual(h.paint("pause"), [...pauseActions, "RTB"]);
  assert.equal(h.buttons.get("ready-handoff").disabled, true);
  assert.equal(h.buttons.get("ready-handoff").title, "Call it a day and return to base");
});

test("RTB and End authority require an exclusive session pause and explicit snapshot evidence", () => {
  const h = harness();
  for (const state of [{ rtb_available: true }, { can_end_sortie: true }]) {
    for (const reasons of [["session", "settings"], ["background"], []]) {
      assert.ok(h.paint("pause", { state, pauseReasons: new Set(reasons) }).includes("RTB"));
      assert.equal(h.buttons.get("ready-handoff").label.textContent, "RTB");
      assert.equal(h.buttons.get("ready-handoff").disabled, true);
    }
    for (const mode of ["program", "debrief", "intro"]) {
      h.paint(mode, { state });
      assert.ok(!h.visibleIds(mode).includes("ready-handoff"));
      assert.equal(h.buttons.get("ready-handoff").disabled, true);
    }
  }
  for (const state of [{}, { can_end_sortie: false }, { can_end_sortie: "true" },
    { rtb_available: true, player_rtb_active: true }]) {
    assert.ok(h.paint("pause", { state }).includes("RTB"));
    assert.equal(h.buttons.get("ready-handoff").disabled, true);
  }
});

test("pause dispatches RTB or End to its own bridge and restores pause on rejection", () => {
  for (const [state, method, event] of [
    [{ rtb_available: true }, "RequestReturnToBase", "combat-handoff"],
    [{ can_end_sortie: true, player_rtb_active: true }, "EndSortie", "sortie-end"],
    // End wins if both authorities arrive in the same snapshot.
    [{ can_end_sortie: true, rtb_available: true }, "EndSortie", "sortie-end"],
  ]) {
    for (const accepted of [true, false]) {
      const h = requestHarness({ state, accepted });
      assert.equal(h.request(), accepted);
      assert.equal(h.pauseReasons.has("session"), !accepted);
      assert.deepEqual(h.calls, accepted
        ? ["resume", method, `${event}:${event === "sortie-end" ? "accepted" : "requested"}`, "focus"]
        : ["resume", method, "pause", `${event}:rejected`]);
    }
  }
});

test("End cannot fall back to RTB when an older bridge lacks EndSortie", () => {
  const h = requestHarness({ state: { can_end_sortie: true, rtb_available: true },
    hasEndBridge: false });
  assert.equal(h.request(), false);
  assert.equal(h.pauseReasons.has("session"), true);
  assert.deepEqual(h.calls, ["resume", "pause", "sortie-end:rejected"]);
});

test("pause dispatch rejects absent authority and competing pause reasons without side effects", () => {
  for (const state of [{}, { rtb_available: true }, { can_end_sortie: true }]) {
    for (const reasons of [[], ["background"], ["session", "settings"],
      ...(Object.keys(state).length ? [] : [["session"]])]) {
      const h = requestHarness({ state, reasons });
      assert.equal(h.request(), false);
      assert.deepEqual([...h.pauseReasons], reasons);
      assert.deepEqual(h.calls, []);
    }
  }
});

test("intro and practice retain their contextual exceptions", () => {
  const h = harness();
  assert.deepEqual(h.paint("intro", { firstRunReady: true }),
    ["Practice", "Logbook", "Choose another mission", "Settings", "Report"]);
  assert.deepEqual(h.paint("intro", { selectedPracticeExercise: "gunnery" }),
    ["Practice", "Logbook", "Aircraft", "Settings", "Report"]);
  assert.deepEqual(h.paint("debrief", { selectedPracticeExercise: "gunnery" }),
    ["Practice", "Logbook", "Aircraft", "Settings", "Report"]);
  assert.deepEqual(h.paint("program", { selectedProgramNodeId: "rapier-intercept" }),
    ["Practice", "Logbook", "Settings", "Report"]);
});

test("CSS projects authored mode membership and reserves hidden for contextual exceptions", () => {
  assert.ok(html.includes('.console-actions button[data-console-modes] { display: none; }'));
  for (const mode of ["program", "pause", "debrief", "intro"])
    assert.ok(html.includes(`#ready-screen[data-mode="${mode}"] .console-actions button[data-console-modes~="${mode}"]:not([hidden])`));
  assert.match(html, /data-console-modes~="intro"\]:not\(\[hidden\]\) \{ display: flex; \}/);
  assert.match(html, /#ready-screen\[data-f22-result\] :is\(#ready-start, \.ready-secondary-actions\),[\s\S]*?display: none/,
    "F-22 results retain their own Again/Recover/Logbook/Aircraft/Settings row");
});

test("session metrics are prepared before pause and shown only in pause", () => {
  const call = app.match(/paintMissionStrip\(readyMissionStrip, state, \{([\s\S]*?)\n  \}\);/)[1];
  assert.doesNotMatch(call, /visible:/, "picker rendering must not leave the strip unpainted");
  assert.match(call, /mode:.*brief\.title/);
  assert.match(call, /startSeconds: attemptStartSimSeconds/);
  assert.ok(html.includes('#ready-screen:not([data-mode="pause"]) #ready-mission-strip { display: none; }'));
});

test("Resume, Fly and Again share the gold primary fill, including picker focus", () => {
  const primary = html.slice(html.indexOf(':root #ready-screen #ready-start.console-primary,'))
    .split('}')[0];
  for (const selector of [
    '#ready-start.console-primary',
    '[data-mode="program"] #ready-start.console-primary:is(:hover, :focus-visible)',
    '[data-f22-result] .f22-actions .console-primary',
  ]) assert.ok(primary.includes(selector));
  assert.match(primary, /background: linear-gradient\(180deg, var\(--flow-action-top\), var\(--flow-action-bottom\)\)/);
  assert.match(primary, /color: #241b0b/);
  assert.doesNotMatch(html, /\.f22-actions \.console-primary \{[^}]*color:/,
    "Again must not override the common dark ink with gold text");
});
