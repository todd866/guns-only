import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("Weekend attribution crosses Ready and proves live movement before sampling", () => {
  const source = readFileSync(resolve("tools/perf/run_attribution.mjs"), "utf8");

  assert.match(source, /#ride-brief-start/);
  assert.match(source, /__gunsOnlyWeekendAuthority\?\.phase === "paused"/);
  assert.match(source, /__gunsOnlyWeekendAuthority\?\.phase === "active"/);
  assert.match(source, /#controls-onboarding-dismiss/);
  assert.match(source, /speedMps > 0\.5/);
  assert.match(source, /travelM > 0\.5/);
  assert.match(source, /movementProved: true/);
});

test("Weekend tick-cost probe rejects paused or stationary authority", () => {
  const source = readFileSync(resolve("tools/perf/tick_cost.mjs"), "utf8");

  assert.match(source, /#ride-brief-start/);
  assert.match(source, /before\.phase !== "active"/);
  assert.match(source, /finalTick > initialTick/);
  assert.match(source, /travelM > 0\.05/);
  assert.match(source, /authority tick did not advance/);
  assert.match(source, /authority did not move the bike/);
});
