import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  okanaganDebriefModel,
  okanaganMissionTerminal,
} from "../okanagan_debrief.js";

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

function sentenceCount(copy) {
  return [...copy.matchAll(/[.!?](?:\s|$)/g)].length;
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
  assert.equal(model.title, "Initial Attack Complete");
  assert.equal(sentenceCount(model.summary), 1);
  assert.match(model.summary, /3 effective drops.*1,850 KG effective water/i);
  assert.match(model.summary, /28 KG above RTB minimum/i);
  assert.equal(model.correction,
    "Repeat the credited drop profile while protecting the RTB reserve.");
  assert.deepEqual(fact(model, "aircraft"), {
    id: "aircraft", label: "AIRCRAFT", value: "FLYABLE", tone: "normal",
  });
  assert.equal(fact(model, "score").value, "742");
  assert.equal(fact(model, "cycles").value, "2");
  assert.equal(fact(model, "drops").value, "3");
  assert.equal(fact(model, "effective-water").value, "1,850 KG");
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

  assert.equal(model.title, "Water Circuits Complete");
  assert.equal(sentenceCount(model.summary), 1);
  assert.match(model.summary, /3 water circuits recorded/i);
  assert.doesNotMatch(model.summary, /fire|population|contained/i);
  assert.equal(model.correction,
    "Repeat the circuit and protect the recorded RTB reserve through landing.");
});

test("failed sortie names only the published failure and warns on a reserve shortfall", () => {
  const model = okanaganDebriefModel(terminalState({
    phase: "failed",
    flyable: false,
    fuel_kg: 245,
    fuel_plan: { minimum_rtb_kg: 310, above_minimum_kg: -65 },
  }));

  assert.equal(model.outcome, "failed");
  assert.equal(model.title, "Sortie Failed");
  assert.equal(sentenceCount(model.summary), 1);
  assert.match(model.summary, /authority recorded the sortie as failed/i);
  assert.match(model.summary, /65 KG below RTB minimum/i);
  assert.equal(fact(model, "aircraft").value, "NOT FLYABLE");
  assert.equal(fact(model, "aircraft").tone, "caution");
  assert.equal(fact(model, "fuel-reserve").tone, "caution");
  assert.equal(model.correction,
    "Leave the working leg earlier and recover before fuel falls below the RTB minimum.");
  assert.doesNotMatch(model.summary, /stall|impact|pilot|crash/i,
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
  assert.equal(fact(failedButFlyable, "aircraft").value, "FLYABLE");
  assert.doesNotMatch(failedButFlyable.summary, /not flyable/i);
  assert.equal(completeButNotFlyable.outcome, "complete");
  assert.equal(fact(completeButNotFlyable, "aircraft").value, "NOT FLYABLE");
  assert.equal(completeButNotFlyable.correction,
    "Review the final recorded aircraft state before relaunch.");
});

test("reserve evidence falls back to fuel minus minimum when the projection omits a margin", () => {
  const model = okanaganDebriefModel(terminalState({
    fuel_kg: 340,
    fuel_plan: { minimum_rtb_kg: 310 },
  }));

  assert.equal(model.reserve.marginKg, 30);
  assert.match(model.summary, /30 KG above RTB minimum/i);
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
  assert.match(resultMarkup, />Fly again</);
  assert.match(resultMarkup, />Choose sortie</);
  assert.match(resultMarkup, />Return to aircraft</);
  assert.match(resultMarkup, /href="\/\?program=okanagan-fireboss&amp;menu=1"/,
    "Return to aircraft must reopen the shell on Fire Boss");
  assert.doesNotMatch(resultMarkup, /id="(?:mission-result-)?resume"|>Resume</i);
  assert.equal([...index.matchAll(/href="\/\?program=okanagan-fireboss&amp;menu=1"/g)].length, 3,
    "dispatch, pause, and result exits must preserve Fire Boss context");
  assert.match(index, /class="preflight-controls"[\s\S]*E scoops[\s\S]*SPACE drop/,
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
  assert.match(main, /if \(SORTIES\[requested\]\) selectSortie\(requested\);\s*queueMicrotask\(\(\) => document\.querySelector\(`/u,
    "the initial dispatch must focus its selected sortie once boot is ready");
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
    /if \(event\.code === "Escape"\) \{\s*if \(missionTerminal\) return;/,
    "Escape must not dismiss, pause, or resume an authoritative terminal result");
});
