import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  WEEKEND_VISUAL_QA_QUERY,
  createWeekendVisualQa,
  weekendVisualQaRequested,
} from "../weekend_visual_qa.js";

test("Weekend visual seam is inert unless the explicit QA query is present", () => {
  assert.equal(WEEKEND_VISUAL_QA_QUERY, "world");
  assert.equal(weekendVisualQaRequested("?audioQa=silent"), false);
  assert.equal(weekendVisualQaRequested("?visualQa=1"), false);
  assert.equal(weekendVisualQaRequested("?visualQa=world&audioQa=silent"), true);
  delete globalThis.__gunsOnlyWeekendVisualQa;
  assert.equal(createWeekendVisualQa({ search: "?audioQa=silent" }), null);
  assert.equal(globalThis.__gunsOnlyWeekendVisualQa, undefined);
});

test("Weekend page gives fixed-camera QA exclusive frame ownership without changing boot authority", async () => {
  const source = await readFile(
    new URL("../../../weekend-ride/main.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /createWeekendVisualQa\(\{/);
  assert.match(source, /if \(weekendVisualQa\?\.active\) \{\s*weekendVisualQa\.render\(\);\s*return;/s);
  assert.match(source, /buildTrackDayPresentation\(JSON\.parse\(bridge\.GetCircuit\(\)\)\);/);
  assert.match(source, /buildOpenRoadPresentation\(JSON\.parse\(bridge\.GetRoadNetwork\(\)\)\);/);
  assert.match(source, /golden_path_token/);
});

test("QA seam pins clean-world contract resources and removes only the R1 world presence", async () => {
  const source = await readFile(new URL("../weekend_visual_qa.js", import.meta.url), "utf8");
  assert.match(source, /weekend-visual-acceptance\.v1\.json/);
  assert.match(source, /weekend-track-day-presentation\.v1\.json/);
  assert.match(source, /weekend-hinterland-road-network\.v1\.json/);
  assert.match(source, /r1Object\.visible = false/);
  assert.doesNotMatch(source, /querySelector|innerHTML|textContent|classList/);
});
