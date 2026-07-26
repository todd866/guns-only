import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MeasuredTimeCompressionBudget,
  TIME_COMPRESSION_MAX_FACTOR,
} from "../time_compression.js";

const appUrl = new URL("../../../app.js", import.meta.url);

test("measured sim cost raises the existing catch-up cap only as far as the frame can pay", () => {
  const budget = new MeasuredTimeCompressionBudget({
    tickHz: 120,
    budgetMs: 8,
    maximumFactor: 16,
    initialTickCostMs: 1,
  });

  const expensive = budget.plan(1000 / 60, 10 / 120);
  assert.equal(expensive.baseTicks, 2);
  assert.equal(expensive.maximumFactor, 4);
  assert.equal(expensive.scheduledTicks, 8);
  assert.equal(expensive.requestedTicks, 32);
  assert.equal(expensive.droppedTicks, 24);
  assert.equal(expensive.catchupCapSeconds, 10 / 120,
    "the ordinary ten-tick recovery cap already covers an eight-tick cost budget");

  for (let frame = 0; frame < 12; frame += 1)
    budget.observeSimPhase(1.6, 8); // repeated measured 0.2 ms/tick
  const cheap = budget.plan(1000 / 60, 10 / 120);
  assert.ok(cheap.maximumFactor > expensive.maximumFactor);
  assert.ok(cheap.maximumFactor <= TIME_COMPRESSION_MAX_FACTOR);
  assert.equal(cheap.catchupCapSeconds, cheap.scheduledTicks / 120);

  budget.observeSimPhase(24, 8); // 3 ms/tick takes effect immediately
  const overloaded = budget.plan(1000 / 60, 10 / 120);
  assert.equal(overloaded.maximumFactor, 1);
  assert.equal(overloaded.scheduledTicks, overloaded.baseTicks);
});

test("the render loop offers measured capacity to the kernel and logs cost-dropped ticks", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /timeCompressionBudget\.plan\(\s*renderDeltaMs,\s*SIM_CATCHUP_CAP_SECONDS/);
  assert.match(app,
    /bridge\.Advance\(\s*dt,\s*compressionPlan\.maximumFactor/);
  assert.match(app,
    /timeCompressionBudget\.observeSimPhase\(simPhaseMilliseconds, executedTicks\)/);
  assert.match(app,
    /recorder\.observeTimeCompression\(\{[\s\S]*?costDroppedTicks:[\s\S]*?compressionPlan\.droppedTicks/);
});
