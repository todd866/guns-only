import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sortieResultCopy } from "../sortie_result.js";

test("carrier water loss teaches from the recorded physical cause", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    carrier: true,
    player_impact_surface: "WATER",
    recent_events: [],
  });

  assert.equal(result.title, "Aircraft Lost");
  assert.match(result.brief, /approach ended in the water/i);
  assert.match(result.brief, /marked decision/i);
  assert.doesNotMatch(result.brief, /opponent/i);
});

test("deck and carrier-structure losses remain physically distinct", () => {
  const deck = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    carrier: true,
    player_impact_surface: "FLIGHT_DECK",
  });
  const structure = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    carrier: true,
    player_impact_surface: "CARRIER_STRUCTURE",
  });

  assert.match(deck.brief, /flight deck/i);
  assert.match(deck.brief, /touchdown assessment/i);
  assert.match(structure.brief, /carrier structure/i);
  assert.match(structure.brief, /approach geometry/i);
});

test("an explicit opponent destruction event retains the combat-loss diagnosis", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    carrier: true,
    player_impact_surface: "WATER",
    recent_events: [{ type: "DESTROYED", source: "OPPONENT", target: "PLAYER" }],
  });

  assert.match(result.brief, /opponent's gun solution was decisive/i);
  assert.match(result.brief, /physical impact and wreck settling/i);
});

test("a numerical terminal guard is not mislabeled as physical settlement", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    player_impact_surface: "SIMULATION_BOUNDARY",
  });

  assert.match(result.brief, /numerical guard/i);
  assert.match(result.brief, /unresolved/i);
  assert.doesNotMatch(result.brief, /settled|settling/i);
});

test("unknown defeat cause fails honest instead of inventing combat", () => {
  const result = sortieResultCopy({ sortie_outcome: "DEFEAT" });

  assert.match(result.brief, /recorded causal chain/i);
  assert.doesNotMatch(result.brief, /opponent/i);
});

test("maintenance score copy preserves recovered and incomplete outcomes", () => {
  const recovered = sortieResultCopy({
    maintenance_scenario: true,
    maintenance_score: 82.4,
    maintenance_max_score: 100,
    maintenance_recovered: true,
    maintenance_procedure_complete: false,
  });
  const lost = sortieResultCopy({
    maintenance_scenario: true,
    maintenance_score: 40,
    maintenance_max_score: 100,
    maintenance_recovered: false,
  });

  assert.equal(recovered.title, "Procedure Incomplete");
  assert.match(recovered.brief, /82\/100/);
  assert.equal(lost.title, "Aircraft Lost");
  assert.match(lost.brief, /40\/100/);
});

test("app consumes the pure evidence-based debrief module", async () => {
  const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");

  assert.match(app, /import \{ sortieResultCopy \} from "\.\/render\/debrief\/sortie_result\.js";/);
  assert.doesNotMatch(app, /function sortieResultCopy\(/);
  assert.doesNotMatch(app, /The opponent's gun solution was decisive\. The loss was/);
});
