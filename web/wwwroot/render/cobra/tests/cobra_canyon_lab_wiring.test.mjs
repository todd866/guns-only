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
  assert.match(main, /CobraWebBridge/);
  assert.match(main, /bridge\.SetControls/);
  assert.match(main, /bridge\.SetGunnerTarget/);
  assert.match(main, /createCobraGroundWarPresentation/);
  assert.match(main, /ground_war/);
  assert.match(main, /recordTelemetry/);
  assert.match(main, /requestAnimationFrame/);
  assert.match(main, /PLAY_MODE/);
  assert.match(main, /showMissionDebrief/);
  // The mission is decided by tickets and points held, not by the old hold-progress meter,
  // so the shell must read those out of the snapshot.
  assert.match(main, /tickets/);
  assert.match(main, /outcome_reason/);
  assert.match(main, /HOLD THE BRIDGE/);
});

test("visual-review park owns the camera over the vehicle eye", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /__gunsOnlyCobraLabCamera/);
  assert.match(main, /if \(parkedCamera\)/);
  assert.match(main, /do not overwrite the eye/);
  assert.match(main, /!parkedCamera/);
  assert.match(main, /onboarding\?\.dismiss/);
});

test("Cobra Canyon loads Blazor from the site-root framework path", async () => {
  const [html, main] = await Promise.all([
    source("cobra-lab/index.html"),
    source("cobra-lab/main.js"),
  ]);
  assert.match(html, /<base href="\/">/);
  assert.match(html, /script\.src = "\/_framework\/blazor\.webassembly\.js\?v=\d+"/);
  assert.doesNotMatch(html, /script\.src = "\.\.\/_framework\/blazor\.webassembly\.js/);
  assert.match(html, /import\("\/cobra-lab\/main\.js\?v=\d+"\)/);
  assert.match(main, /loadBootResource/);
  assert.match(main, /return `\/_framework\/\$\{name\}`/);
});

test("Hold the Bridge play shell is default; lab chrome is opt-in", async () => {
  const html = await source("cobra-lab/index.html");
  assert.match(html, /Hold the Bridge/);
  assert.match(html, /data-shell="play"/);
  assert.match(html, /id="objective-hud"/);
  assert.match(html, /id="objective-line"/);
  assert.match(html, /id="hold-fill"/);
  assert.match(html, /id="debrief"/);
  assert.match(html, /id="lab-panel"/);
  assert.match(html, /params\.get\("lab"\) === "1"/);
  assert.match(html, /Manual start height/);
  assert.match(html, /id="control"/);
  assert.match(html, /id="ammo"/);
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
