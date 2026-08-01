import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Cobra Canyon lab consumes the authored planner and bounded presentation", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /loadCobraCanyonWorld/);
  assert.match(main, /planCobraCanyonWorld/);
  assert.match(main, /sampleCobraCanyonTerrain/);
  assert.match(main, /createCobraCanyonPresentation/);
  assert.match(main, /sampleCobraCanyonTour/);
  assert.match(main, /COBRA_CANYON_TOUR_BASE_AGL_M/);
  assert.match(main, /createCobraCanyonRouteSampler/);
  assert.match(main, /ROUTE COMPLETE/);
  assert.match(main, /ROUTE_CAMERA_LOOKAHEAD_M = 180/);
  assert.match(main, /horizontalLookaheadM \* 0\.06/);
  assert.doesNotMatch(main, /routeDistanceM\s*%/);
  assert.match(main, /setPieceCells/);
  assert.match(main, /distanceAlongRouteM/);
  assert.match(main, /route\.cobra-canyon\.river-gorge\.v1/);
  assert.match(main, /requestAnimationFrame/);
});

test("Cobra Canyon lab labels its camera-flight boundary honestly", async () => {
  const html = await source("cobra-lab/index.html");
  assert.match(html, /world prototype/i);
  assert.match(html, /id="route-feature"/);
  assert.match(html, /Set pieces/);
  assert.match(html, /Manual start height/);
  assert.match(html, /not the AH‑1G flight authority/i);
  assert.doesNotMatch(html, /combat ready|production fidelity|certified/i);
});

test("Cobra Canyon lab is silent and keeps hazards visible", async () => {
  const [html, main] = await Promise.all([
    source("cobra-lab/index.html"),
    source("cobra-lab/main.js"),
  ]);
  assert.doesNotMatch(html, /<audio|autoplay/i);
  assert.doesNotMatch(main, /AudioContext|HTMLAudioElement|\.visible\s*=\s*false.*hazard/is);
});
