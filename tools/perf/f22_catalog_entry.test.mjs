import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shouldAutoStartFirstRunValley } from "../../web/wwwroot/render/onboarding/first_run_valley.js";

test("F-22 profilers explicitly stage the catalog programme on a fresh browser", async () => {
  for (const file of ["tick_cost.mjs", "fill_sweep.mjs", "flight_frame_harness.mjs", "run_attribution.mjs"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    const queries = [...source.matchAll(/\?program=first-merge[^`]*`/g)]
      .map(([query]) => query.slice(0, -1)).filter((query) => !query.includes("\n"));
    assert.ok(queries.length, `${file} needs an explicit F-22 entry`);
    for (const query of queries) {
      const params = new URLSearchParams(query);
      assert.equal(shouldAutoStartFirstRunValley({ firstRunPending: true,
        programQuery: params.get("program"), menuQuery: params.get("menu") }), false, file);
      assert.equal(params.get("audioQa"), "silent", file);
      assert.equal(params.get("server"), "off", file);
    }
  }
});
