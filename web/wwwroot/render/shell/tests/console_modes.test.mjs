import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../../../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
const actions = [...html.matchAll(/<button id="(ready-[^"]+)"([^>]*)>([\s\S]*?)<\/button>/g)]
  .filter(([, , attrs]) => attrs.includes("data-console-modes="))
  .map(([, id, attrs, body]) => ({ id, attrs,
    modes: attrs.match(/data-console-modes="([^"]+)"/)[1].split(" "),
    label: body.match(/class="shell-action-label">([^<]+)</)[1] }));

// Execute the real per-sortie visibility/label code, preserving the same controls across
// transitions. Mode membership comes from the authored DOM, which CSS projects directly.
const updates = app.slice(app.indexOf("  if (readySettings) readySettings.hidden = !showScreen;"),
  app.indexOf("  if ((practiceReady || finished) && selectedPracticeExercise)"));
assert.ok(updates.length > 0);
function harness() {
  const buttons = new Map(actions.map(action => [action.id, {
    hidden: /\bhidden\b/.test(action.attrs), disabled: /\bdisabled\b/.test(action.attrs),
    dataset: {}, label: { textContent: action.label },
    querySelector() { return this.label; },
  }]));
  const context = { readyScreen: { dataset: {} }, showScreen: true,
    state: {}, sortieResultCopy: () => null };
  for (const [id, button] of buttons)
    context[id.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = button;
  function paint(mode, overrides = {}) {
    Object.assign(context, { ready: mode === "program" || mode === "intro",
      finished: mode === "debrief", firstRunReady: false, selectedPracticeExercise: "",
      selectedProgramNodeId: "first-merge", handoffActionAvailable: false }, overrides);
    context.readyScreen.dataset.mode = mode;
    vm.runInNewContext(updates, context);
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
  assert.deepEqual(h.paint("pause", { handoffActionAvailable: true }), pause);
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
