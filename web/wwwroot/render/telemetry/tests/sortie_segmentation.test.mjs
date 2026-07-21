import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");

test("each launch creates a stable sortie id carried by input and state rows", () => {
  assert.match(app,
    /startSortie\(\{ mission, deckConfiguration \} = \{\}\)[\s\S]*?sortie-\$\{TELEMETRY_SESSION_STARTED_AT\}-\$\{this\._sortieSequence\}/);
  assert.match(app, /sortie: this\._sortie\?\.id \?\? null,[\s\S]*?type,[\s\S]*?code,/);
  assert.match(app,
    /const telemetryState = this\._sortie[\s\S]*?telemetry_sortie_id: this\._sortie\.id[\s\S]*?state: telemetryState/);
  assert.match(app,
    /recorder\.startSortie\(\{[\s\S]*?mission: selectedBeat,[\s\S]*?deckConfiguration:/);
});

test("the finished edge forces a final keyframe, lifecycle event, and upload", () => {
  assert.match(app,
    /const finishedEdge = state\?\.finished === true[\s\S]*?if \(lifecycleChanged\) this\._stateEncoder\.forceKeyframe\(\)/);
  assert.match(app,
    /if \(finishedEdge\) \{[\s\S]*?"sortie_finished"[\s\S]*?touchdown_primary_correction[\s\S]*?this\.endSortie\("finished", state\)[\s\S]*?this\.flush\(\{ force: true \}\)/);
});

test("program choices are observable without pretending they launched a sortie", () => {
  assert.match(app, /recorder\.event\("ui", "program_node_previewed"/);
  assert.match(app, /recorder\.event\("ui", "deck_configuration_previewed"/);
  assert.match(app, /recorder\.event\("lifecycle", "sortie_staged"/);
});
