import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerUrl = new URL("../terrain_mesh_worker.js", import.meta.url);
const plannerUrl = new URL("../korea_scenery_planner.js", import.meta.url);
const presentationUrl = new URL("../korea_scenery.js", import.meta.url);

function staticImportSpecifiers(source) {
  return [...source.matchAll(
    /(?:^|\n)\s*(?:import|export)\s+(?:[^;]*?\sfrom\s*)?["']([^"']+)["']/g,
  )].map((match) => match[1]);
}

async function readRelativeImportGraph(entryUrl) {
  const sources = new Map();
  async function visit(moduleUrl) {
    if (sources.has(moduleUrl.href)) return;
    const source = await readFile(moduleUrl, "utf8");
    sources.set(moduleUrl.href, source);
    for (const specifier of staticImportSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      await visit(new URL(specifier, moduleUrl));
    }
  }
  await visit(entryUrl);
  return sources;
}

test("terrain mesh worker import graph stays renderer-free", async () => {
  const graph = await readRelativeImportGraph(workerUrl);
  const workerSource = graph.get(workerUrl.href);
  const plannerSource = graph.get(plannerUrl.href);

  assert.match(workerSource, /from "\.\/korea_scenery_planner\.js"/);
  assert.doesNotMatch(workerSource, /from "\.\/korea_scenery\.js"/);
  assert.ok(plannerSource, "the worker graph must include the pure scenery planner");
  assert.equal(graph.has(presentationUrl.href), false,
    "the worker must not pull in the THREE-backed scenery presentation");

  const forbiddenImports = [];
  for (const [moduleHref, source] of graph) {
    for (const specifier of staticImportSpecifiers(source)) {
      if (/three(?:\.module)?\.js|BufferGeometryUtils\.js/i.test(specifier)) {
        forbiddenImports.push({ moduleHref, specifier });
      }
    }
  }
  assert.deepEqual(forbiddenImports, [],
    "the worker import graph must not reach THREE or BufferGeometryUtils");
  assert.doesNotMatch(plannerSource,
    /mergeGeometries|new THREE|BufferGeometryUtils|vendor\/three/,
    "the planner leaf must remain renderer-free");
});
