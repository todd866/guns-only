import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  okanaganDebriefModel,
  okanaganMissionTerminal,
} from "../okanagan_debrief.js";
import {
  okanaganDialogFocusables,
  okanaganDialogTabTarget,
} from "../okanagan_dialog_focus.js";

const wwwroot = new URL("../../../", import.meta.url);

function terminalState(overrides = {}) {
  return {
    sortie: "fire-attack",
    phase: "complete",
    flyable: true,
    score: 742,
    completed_cycles: 2,
    effective_drops: 3,
    effective_water_kg: 1_850.4,
    fire_intensity: 12.36,
    burned_area_ha: 4.237,
    population_exposed: 18,
    fuel_kg: 337.8,
    fuel_plan: {
      minimum_rtb_kg: 310,
      above_minimum_kg: 27.8,
    },
    ...overrides,
  };
}

function fact(model, id) {
  return model.facts.find((candidate) => candidate.id === id);
}

function wordCount(copy) {
  return String(copy).trim().split(/\s+/u).filter(Boolean).length;
}

test("only authoritative complete and failed phases are terminal", () => {
  assert.equal(okanaganMissionTerminal({ phase: "complete" }), true);
  assert.equal(okanaganMissionTerminal({ phase: "failed" }), true);
  assert.equal(okanaganMissionTerminal({ phase: "paused" }), false);
  assert.equal(okanaganDebriefModel({ phase: "rtb" }), null);
});

test("completed fire attack debrief carries score, drop, incident, and reserve evidence", () => {
  const model = okanaganDebriefModel(terminalState());

  assert.equal(model.outcome, "complete");
  assert.equal(model.kicker, "INITIAL ATTACK");
  assert.equal(model.title, "Complete");
  assert.equal(model.summary, "3 drops · 1,850 KG water");
  assert.equal(model.correction, "");
  assert.equal(fact(model, "aircraft"), undefined,
    "a healthy aircraft does not need a fact tile");
  assert.equal(fact(model, "score").value, "742");
  assert.equal(fact(model, "cycles"), undefined);
  assert.equal(fact(model, "drops"), undefined,
    "the summary already owns the credited drop count");
  assert.equal(fact(model, "effective-water"), undefined,
    "the summary already owns effective water");
  assert.equal(fact(model, "fire-intensity").value, "12.4");
  assert.equal(fact(model, "burned-area").value, "4.24 HA");
  assert.equal(fact(model, "population").value, "18");
  assert.equal(fact(model, "fuel-reserve").value, "338 / 310 KG");
});

test("water circuits get a sortie-specific recovery summary without inventing a fire outcome", () => {
  const model = okanaganDebriefModel(terminalState({
    sortie: "water-circuits",
    completed_cycles: 3,
    effective_drops: 0,
    effective_water_kg: 0,
  }));

  assert.equal(model.kicker, "WATER CIRCUITS");
  assert.equal(model.title, "Complete");
  assert.equal(model.summary, "3 circuits");
  assert.doesNotMatch(model.summary, /fire|population|contained/i);
  assert.equal(model.correction, "");
  assert.equal(fact(model, "cycles"), undefined,
    "the summary already owns the circuit count");
  for (const id of ["drops", "effective-water", "fire-intensity", "burned-area", "population"])
    assert.equal(fact(model, id), undefined, `${id} is irrelevant to the training debrief`);
});

test("failed sortie names only the published failure and warns on a reserve shortfall", () => {
  const model = okanaganDebriefModel(terminalState({
    phase: "failed",
    flyable: false,
    fuel_kg: 245,
    fuel_plan: { minimum_rtb_kg: 310, above_minimum_kg: -65 },
  }));

  assert.equal(model.outcome, "failed");
  assert.equal(model.kicker, "INITIAL ATTACK");
  assert.equal(model.title, "Failed");
  assert.equal(model.summary, "");
  assert.equal(fact(model, "aircraft").value, "NOT FLYABLE");
  assert.equal(fact(model, "aircraft").tone, "caution");
  assert.equal(fact(model, "fuel-reserve").tone, "caution");
  assert.equal(model.correction, "Leave the line earlier.");
  assert.doesNotMatch(`${model.summary} ${model.correction}`, /stall|impact|pilot|crash/i,
    "the snapshot does not publish a causal failure diagnosis");
});

test("phase outcome and aircraft flyability remain separate published facts", () => {
  const failedButFlyable = okanaganDebriefModel(terminalState({
    phase: "failed",
    flyable: true,
  }));
  const completeButNotFlyable = okanaganDebriefModel(terminalState({
    phase: "complete",
    flyable: false,
  }));

  assert.equal(failedButFlyable.outcome, "failed");
  assert.equal(fact(failedButFlyable, "aircraft"), undefined);
  assert.doesNotMatch(failedButFlyable.summary, /not flyable/i);
  assert.equal(completeButNotFlyable.outcome, "complete");
  assert.equal(fact(completeButNotFlyable, "aircraft").value, "NOT FLYABLE");
  assert.equal(completeButNotFlyable.correction, "Use a serviceable aircraft.");
});

test("reserve evidence falls back to fuel minus minimum when the projection omits a margin", () => {
  const model = okanaganDebriefModel(terminalState({
    fuel_kg: 340,
    fuel_plan: { minimum_rtb_kg: 310 },
  }));

  assert.equal(model.reserve.marginKg, 30);
  assert.equal(fact(model, "fuel-reserve").value, "340 / 310 KG");
});

test("debrief density grows only with relevant non-zero evidence", () => {
  const sparse = okanaganDebriefModel(terminalState({
    sortie: "water-circuits",
    score: 0,
    completed_cycles: 1,
    effective_drops: 0,
    effective_water_kg: 0,
    fire_intensity: 0,
    burned_area_ha: 0,
    population_exposed: 0,
  }));
  const partialFailure = okanaganDebriefModel(terminalState({
    phase: "failed",
    score: 0,
    completed_cycles: 2,
    effective_drops: 1,
    effective_water_kg: 640,
    burned_area_ha: 0,
    population_exposed: 0,
  }));
  const zeroFailure = okanaganDebriefModel(terminalState({
    phase: "failed",
    score: 0,
    completed_cycles: 0,
    effective_drops: 0,
    effective_water_kg: 0,
    fire_intensity: 0,
    burned_area_ha: 0,
    population_exposed: 0,
  }));
  const richFailure = okanaganDebriefModel(terminalState({
    phase: "failed",
    flyable: false,
  }));

  assert.deepEqual(sparse.facts.map((item) => item.id), ["fuel-reserve"]);
  assert.deepEqual(partialFailure.facts.map((item) => item.id), [
    "drops", "effective-water", "fire-intensity", "fuel-reserve",
  ]);
  assert.deepEqual(zeroFailure.facts.map((item) => item.id), [
    "fire-intensity", "fuel-reserve",
  ]);
  assert.equal(richFailure.facts.length, 7,
    "even the richest failure must fit the compact grid");
  assert.ok(partialFailure.facts.length > sparse.facts.length,
    "more published work may add facts; empty categories may not reserve tiles");

  for (const model of [sparse, partialFailure, zeroFailure, richFailure]) {
    assert.ok(wordCount(model.summary) <= 6, `summary is too dense: ${model.summary}`);
    assert.ok(wordCount(model.correction) <= 5, `correction is too dense: ${model.correction}`);
    assert.ok(model.facts.length <= 7, `fact grid is too dense: ${model.facts.length}`);
    assert.doesNotMatch(
      `${model.kicker} ${model.title} ${model.summary} ${model.correction}`,
      /\brecorded\b|\bmission authority\b|\bfinal state\b|\brelaunch\b/i,
    );
  }
});

test("Okanagan terminal wiring opens a dedicated result and never routes it through pause", async () => {
  const [main, index] = await Promise.all([
    readFile(new URL("okanagan/main.js", wwwroot), "utf8"),
    readFile(new URL("okanagan/index.html", wwwroot), "utf8"),
  ]);
  const showResult = main.match(/function showMissionResult\(current\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  const resultMarkup = index.match(/<section id="mission-result"[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.match(main,
    /if \(okanaganMissionTerminal\(state\)\) showMissionResult\(state\);/,
    "Complete/Failed must open the result surface");
  assert.doesNotMatch(main,
    /\["complete", "failed"\][\s\S]{0,80}setPaused/,
    "terminal phases must not be converted into Paused");
  assert.doesNotMatch(showResult, /SetPaused/,
    "showing a result must preserve the terminal authority phase");
  assert.match(main, /function setPaused\(value\) \{\s*if \(missionTerminal\) return false;/,
    "pause must refuse to mutate an authoritative terminal result");
  assert.match(resultMarkup, /mission-result__facts/);
  assert.match(resultMarkup, /mission-result__correction[\s\S]*NEXT SORTIE/);
  assert.match(resultMarkup, />Retry</);
  assert.match(resultMarkup, />Sorties</);
  assert.match(resultMarkup, />Aircraft</);
  assert.match(resultMarkup, /href="\/\?program=okanagan-fireboss&amp;menu=1"/,
    "Return to aircraft must reopen the shell on Fire Boss");
  assert.doesNotMatch(resultMarkup, /id="(?:mission-result-)?resume"|>Resume</i);
  assert.doesNotMatch(resultMarkup, /RECORDED SORTIE|Fly again|Return to aircraft/i);
  assert.equal([...index.matchAll(/href="\/\?program=okanagan-fireboss&amp;menu=1"/g)].length, 3,
    "dispatch, pause, and result exits must preserve Fire Boss context");
  assert.match(index, /class="preflight-controls"[\s\S]*E scoop[\s\S]*SPACE drop/,
    "dispatch must expose the mission-specific controls before launch");
  assert.match(main, /function setMissionSurfaceInert\(inert\)[\s\S]*missionSurface\.inert = inert === true/u);
  assert.match(main, /showMissionResult\([\s\S]*setMissionSurfaceInert\(true\)/u,
    "the terminal dialog must own accessibility and pointer focus");
  assert.match(main, /function startSortie\([\s\S]*setMissionSurfaceInert\(false\)/u,
    "launch must restore the flight surface before focusing it");
  assert.match(main, /if \(pauseVisible\) queueMicrotask\(\(\) => pauseResume\?\.focus/u,
    "pause must move focus into the dialog it just opened");
  assert.match(main, /else if \(!paused && running\) \{[\s\S]*canvas\.focus\(\{ preventScroll: true \}\)/u,
    "resume must return focus to the flight surface");
  assert.match(main,
    /selectSortie\(SORTIES\[requested\] \? requested : currentSortie\);\s*queueMicrotask\(\(\) => document\.querySelector\(`/u,
    "the initial dispatch must focus its selected sortie once boot is ready");
  assert.match(main,
    /missionResultSummary\.hidden = !model\.summary[\s\S]*missionResultCorrectionRow\.hidden = !model\.correction/u,
    "empty narration and advice must not reserve visual space");
  assert.match(main, /missionResult\.setAttribute\("aria-describedby", \[/u,
    "accessible description must follow the evidence that remains visible");
});

test("dialog keyboard routing preserves native Tab navigation and terminal Escape", async () => {
  const main = await readFile(new URL("okanagan/main.js", wwwroot), "utf8");
  const dialogTrap = main.indexOf('if (event.code === "Tab" && trapDialogTab(event)) return;');
  const flightGuard = main.indexOf("if (missionTerminal || !running || paused) return;");
  const flightKeySuppression = main.indexOf(
    '["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(event.code)',
  );

  assert.ok(dialogTrap >= 0, "visible dialogs must route Tab through the focus trap");
  assert.ok(flightGuard > dialogTrap, "dialog Tab routing must run before the flight-state guard");
  assert.ok(flightKeySuppression > flightGuard,
    "Tab and flight-key suppression must only run after active-flight state is established");
  assert.match(main,
    /function activeMissionDialog\(\)[\s\S]*missionResult[\s\S]*pauseMenu[\s\S]*menu/,
    "result, pause, and dispatch dialogs must all participate in focus containment");
  assert.match(main,
    /function trapDialogTab\(event\)[\s\S]*okanaganDialogFocusables\(dialog\.querySelectorAll[\s\S]*okanaganDialogTabTarget\(focusable/u,
    "the live dialog trap must use effective-tabindex filtering and wrap routing");
  assert.match(main,
    /if \(event\.code === "Escape"\) \{\s*if \(missionTerminal\) return;/,
    "Escape must not dismiss, pause, or resume an authoritative terminal result");
});

test("second and third roving-radio selections remain the dialog boundary in both directions", () => {
  const action = (id) => ({ id, tabIndex: 0, disabled: false });
  const radio = (id, selected) => ({ id, tabIndex: selected ? 0 : -1, disabled: false });

  for (const selectedId of ["fire-attack", "large-force-employment"]) {
    const nodes = [
      radio("water-circuits", selectedId === "water-circuits"),
      radio("fire-attack", selectedId === "fire-attack"),
      radio("large-force-employment", selectedId === "large-force-employment"),
      action("return"),
      action("start"),
    ];
    const focusable = okanaganDialogFocusables(nodes);

    assert.deepEqual(focusable.map((node) => node.id), [selectedId, "return", "start"]);
    assert.equal(okanaganDialogTabTarget(nodes, focusable[0], true)?.id, "start",
      `Shift+Tab from ${selectedId} must wrap to the final action`);
    assert.equal(okanaganDialogTabTarget(nodes, focusable.at(-1), false)?.id, selectedId,
      `Tab from the final action must wrap to ${selectedId}`);
  }
});

test("dispatch selection publishes one objective and supports radio-group navigation", async () => {
  const [main, index, bridge] = await Promise.all([
    readFile(new URL("okanagan/main.js", wwwroot), "utf8"),
    readFile(new URL("okanagan/index.html", wwwroot), "utf8"),
    readFile(new URL("../../../../OkanaganWebBridge.cs", import.meta.url), "utf8"),
  ]);

  assert.match(index,
    /class="dispatch-directive"[\s\S]*id="dispatch-objective"[\s\S]*id="dispatch-execution"/u);
  assert.match(index, /data-sortie="water-circuits"[^>]*role="radio"[^>]*tabindex="0"/u);
  assert.equal([...index.matchAll(/role="radio"/g)].length, 3);
  assert.match(main,
    /dispatchObjective\.textContent = SORTIES\[id\]\.objective[\s\S]*dispatchExecution\.textContent = SORTIES\[id\]\.execution/u);
  assert.match(main,
    /startButton\.textContent = "Start";[\s\S]*startButton\.setAttribute\("aria-label", `Start \$\{SORTIES\[id\]\.title\}`\)/u,
    "the visible action stays short while its accessible name remains sortie-specific");
  assert.doesNotMatch(main, /textContent = `Fly \$\{SORTIES\[id\]\.title\}`/u);
  assert.match(index, /id="start"[^>]*aria-label="Start Water Circuits"[^>]*>Start</u);
  assert.match(main, /button\.tabIndex = selected \? 0 : -1/u);
  assert.match(main,
    /function moveSortieSelection\(event\)[\s\S]*"ArrowLeft"[\s\S]*"ArrowDown"[\s\S]*"Home"[\s\S]*"End"/u);
  assert.match(main, /menu\.addEventListener\("keydown", moveSortieSelection\)/u);
  assert.match(bridge,
    /\[JSExport\]\s*public static string PreviewPlan\(int sortie\)[\s\S]*OkanaganFireMission\.Create\(ResolveSortie\(sortie\)\)/u,
    "dispatch fuel must come from a read-only mission-authority preview");
  assert.match(main,
    /function publishSortiePlanPreview\(id\)[\s\S]*bridge\.PreviewPlan\(SORTIES\[id\]\.index\)[\s\S]*fuel_plan\?\.minimum_rtb_kg/u);
  assert.doesNotMatch(main, /minimumRtbKg\s*=\s*\d/u,
    "presentation must not invent a static RTB minimum");
});

test("touch preview activates real dual sticks and short landscape keeps dispatch and pause actions reachable", async () => {
  const [main, index, styles] = await Promise.all([
    readFile(new URL("okanagan/main.js", wwwroot), "utf8"),
    readFile(new URL("okanagan/index.html", wwwroot), "utf8"),
    readFile(new URL("okanagan/styles.css", wwwroot), "utf8"),
  ]);

  assert.match(main, /const touchInput = coarse \|\| touchPreview/u);
  assert.match(main, /flightHud\.setTouchMode\(touchInput\)/u);
  assert.match(index, /id="touch-flight-controls"[\s\S]*id="left-stick"[\s\S]*id="right-stick"/u);
  assert.match(styles, /body\[data-input="touch"\] #touch-flight-controls \{ display:block; \}/u);
  assert.match(styles,
    /@media \(max-height:520px\) and \(min-width:600px\)[\s\S]*\.menu-card \{ max-height:calc\(100dvh - 16px\)/u);
  assert.match(styles, /\.menu-actions \{ position:sticky;[\s\S]*bottom:-1px/u);
  assert.match(index,
    /class="preflight-controls"><strong>CONTROL CHECK<\/strong>\s*<span>[\s\S]*E scoop[\s\S]*hold SPACE drop/u,
    "short-landscape controls must remain an honest, mission-specific preflight cue");
  assert.match(styles,
    /\.preflight-controls \{\s*display:flex;[\s\S]*white-space:nowrap;/u,
    "short landscape must compact the preflight cue onto one visible line");
  assert.doesNotMatch(styles, /\.preflight-controls \{\s*display:none;/u);
  assert.match(styles,
    /\.pause-card \{\s*display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u,
    "short landscape must arrange pause actions in two compact columns");
  assert.match(styles,
    /\.pause-card > small,[\s\S]*\.pause-card > a \{ grid-column:1 \/ -1; \}/u,
    "pause context and the terminal return action must retain full-width reading order");
});
