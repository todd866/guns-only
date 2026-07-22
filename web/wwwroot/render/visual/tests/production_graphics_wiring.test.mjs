import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../../../app.js", import.meta.url);
const sceneBuildersUrl = new URL("../../scene/scene_builders.js", import.meta.url);
const hudUrl = new URL("../../../hud.js", import.meta.url);
const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const projectionUrl = new URL("../../../../SnapshotProjection.cs", import.meta.url);
const webProjectUrl = new URL("../../../../GunsOnly.Web.csproj", import.meta.url);
// The flat-snapshot projection moved from the browser-only WebBridge into the plain, linkable
// SnapshotProjection; the contract scan reads both so a field is found wherever it now lives.
const readBridgeContract = () =>
  Promise.all([readFile(bridgeUrl, "utf8"), readFile(projectionUrl, "utf8")])
    .then((parts) => parts.join("\n"));

test("production admits only state-bearing environment visuals and event-bearing effects", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /const PRODUCTION_PACK_ENVIRONMENT_ENABLED = false/);
  assert.match(source, /const PRODUCTION_SIMULATED_CLOUDS_ENABLED = true/);
  assert.match(source, /const PRODUCTION_ESCORT_PRESENTATION_ENABLED = false/);
  assert.match(source, /const PRODUCTION_NONCOMBAT_WORLD_BOGEYS_VISIBLE = false/);
  assert.match(source, /createDecisionSupportSky\(\)/);
  assert.match(source, /createDecisionSupportSea\(\)/);
  assert.match(source,
    /const environmentFactory = PRODUCTION_PACK_ENVIRONMENT_ENABLED && isKoreaPack/);
  assert.match(source, /createKoreaEffectsFactory\(THREE,[\s\S]*effectsFactory,/);
  assert.match(source, /manageFog: Boolean\(environmentFactory\)/);
  assert.match(source, /postStackFactory: createDecisionSupportPostStack/);
  assert.match(source,
    /shadowModes: mobileControls \? \["carrier"\] : \["carrier", "replay"\]/,
    "combat must not pay for a shadow pass without a visible ownship or shadow-receiving terrain");
  assert.doesNotMatch(source, /shadowModes:[^\n]*"combat"/);
  assert.match(source, /fogDensityForVisibility\(reportedVisibilityM\)/,
    "production visibility must come from the scenario weather projection");
  assert.match(source, /this\.tacticalClouds\.configureFromState\(state\)/,
    "production clouds must be reconstructed from the authoritative weather descriptors");
  assert.match(source,
    /createTacticalCloudField\(THREE, \{[\s\S]*?volumetric: false,[\s\S]*?\}\)/,
    "production must use the bounded cloud impostor path until a frame-time governor exists");
  assert.match(source, /Number\(state\.t\) \|\| 0/,
    "cloud advection must use deterministic simulation time rather than wall time");
  assert.doesNotMatch(source, /baseFogDensity \+ cloudExtinction/,
    "presentation must not add invented extinction over the WASM visibility sample");
  assert.match(source,
    /escortRoot\.visible = isCarrier && PRODUCTION_ESCORT_PRESENTATION_ENABLED/);
  assert.match(source,
    /this\.escortSlot\.root\.visible = PRODUCTION_ESCORT_PRESENTATION_ENABLED\s*&& state\.carrier === true;[\s\S]*this\.resolveVisibleSlots\(\)/,
    "disabled presentation slots must be gated before registry resolution and network loading");
  assert.match(source,
    /PRODUCTION_NONCOMBAT_WORLD_BOGEYS_VISIBLE \? snapshot\?\.bogeys \?\? \[\] : \[\]/,
    "server traffic must not masquerade as targetable combat contacts");
  assert.match(source, /emitPackEffect\("event\.weapon\.gun-fire\.v1"/);
  assert.match(source, /emitPackEffect\("event\.weapon\.gun-impact\.v1"/);
  assert.match(source, /emitPackEffect\("event\.vehicle\.destroyed\.v1"/);
});

test("terrain ships by default, stays lazy through Ready, and shares the ocean curvature contract", async () => {
  const [source, sceneBuilders, bridgeSource, webProject] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(sceneBuildersUrl, "utf8"),
    readBridgeContract(),
    readFile(webProjectUrl, "utf8"),
  ]);
  assert.ok(webProject.includes(
    `Condition="'$(EmbedKoreaTerrainTruth)' != 'false'"`,
  ), "production must embed terrain truth unless a constrained build explicitly opts out");
  assert.match(source,
    /this\.terrainPresentationPromise = null;[\s\S]*ensureTerrainPresentation\(\)/,
    "constructing FlightView must not start terrain network work");
  assert.match(source,
    /if \(state\?\.ready !== true && state\?\.terrain_present === true\) void this\.ensureTerrainPresentation\(\)/,
    "a non-Ready frame with terrain present should start the retained terrain single flight");
  assert.match(source,
    /if \(this\.terrainPresentation\) \{[\s\S]*return this\.terrainSceneryEraPromise\?\.then[\s\S]*if \(this\.terrainPresentationPromise\) return this\.terrainPresentationPromise/,
    "repeated gameplay frames must reuse one terrain load");
  assert.match(source,
    /const sceneryEra = terrainPackId\.includes\("modern"\) \|\| selectedBeat === 7 \|\| selectedBeat === 8[\s\S]*\? "modern" : "1950s"/,
    "the F-22 and drone missions must select the 2030s profile without duplicating terrain bytes");
  assert.match(source,
    /presentation\.setSceneryEra\(sceneryEra\)/,
    "restaging across eras must replace scenery without rebuilding the retained terrain atlas");
  assert.match(source, /const DEVELOPMENT_KOREA_ATLAS_MANIFEST_URL = null;/,
    "an unqualified peninsula atlas must remain unreachable from the production browser");
  assert.doesNotMatch(source, /peninsula-r2|pub-[a-z0-9]+\.r2\.dev/,
    "production source must not expose the temporary atlas host or a query-string bypass");
  assert.match(source, /manifestUrl: DEVELOPMENT_KOREA_ATLAS_MANIFEST_URL/);
  assert.match(source, /cameraPosition: this\.camera\.position,[\s\S]*deltaSeconds: dt/,
    "terrain streaming must receive frame time for bounded velocity-ahead prefetch");
  assert.match(source,
    /import \{[\s\S]*createDecisionSupportSea[\s\S]*\} from "\.\/render\/scene\/scene_builders\.js"/,
    "the active ocean builder must be sourced from the scene builder module");
  assert.match(source, /createDecisionSupportSea\(\)/,
    "production must instantiate the decision-support sea");
  assert.match(sceneBuilders,
    /import \{[\s\S]*TERRAIN_CURVATURE_START_M,[\s\S]*TERRAIN_EARTH_RADIUS_M,[\s\S]*\} from "\.\.\/environment\/korea_terrain\.js"/,
    "the ocean builder must read the terrain curvature constants from the terrain contract");
  assert.match(sceneBuilders,
    /function createDecisionSupportSea\(\)[\s\S]*TERRAIN_CURVATURE_START_M\.toFixed\(1\)[\s\S]*2 \* TERRAIN_EARTH_RADIUS_M/,
    "active ocean and terrain must use one curvature start/radius contract");
  assert.match(source,
    /bridge\.SetWorldOrigin\(status\.spawnOrigin\[0\], status\.spawnOrigin\[2\]\)/,
    "the room welcome must anchor simulation terrain to the browser's assigned world origin");
  assert.match(source,
    /placementEastM: Number\.isFinite\(terrainPlacementEastM\)[\s\S]*placementNorthM: Number\.isFinite\(terrainPlacementNorthM\)/,
    "presentation must consume the bridge's terrain transform rather than inventing its own");
  assert.doesNotMatch(source,
    /placementEastM: state\.carrier === true \? 100_000 : 0/,
    "the old mission-local placement would disagree with shared-world coordinates");
  assert.match(bridgeSource,
    /TerrainPlacementEastM\(int index\)[\s\S]*\? -_worldOriginEastM/,
    "simulation terrain must use the inverse room-origin transform");
  for (const field of [
    "terrain_placement_east_m",
    "terrain_placement_north_m",
    "multiplayer_terrain_shared",
  ]) {
    assert.ok(bridgeSource.includes(field),
      `the authoritative bridge frame contract must publish ${field}`);
  }
});

test("decision-support ocean and warnings carry truth without presentation flicker", async () => {
  const [appSource, hudSource] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(hudUrl, "utf8"),
  ]);
  assert.match(appSource, /uWindSpeed/);
  assert.match(appSource, /Number\(state\.wind_x_mps\)/);
  assert.match(appSource, /const windBlend = expStep/,
    "surface-wind direction should not rotate with single-frame turbulence");
  assert.doesNotMatch(hudSource, /Math\.sin\(now \* Math\.PI/,
    "warnings must remain legible instead of blinking on and off");
  assert.doesNotMatch(hudSource, /desynchronized\s*:\s*true/,
    "HUD and WebGL scene must remain in the same compositor path");
  assert.match(hudSource, /this\._hudSurface = document\.createElement\("canvas"\)/,
    "the visible HUD should only receive complete frames");
  assert.match(hudSource, /globalCompositeOperation = "copy"/,
    "a complete buffered frame must replace the prior HUD atomically");
  assert.match(hudSource, /if \(!backingStoreChanged\) return/,
    "redundant viewport events must not clear and reallocate the HUD canvas");
  assert.match(appSource, /if \(!surfaceChanged\) return/,
    "redundant visual-viewport scroll events must not reset the WebGL surface");
  assert.match(hudSource, /new VisibilityEnvelope/);
  assert.match(hudSource, /const edgeAlpha = clamp/,
    "moving ladder rungs should fade at the aperture instead of popping");
  assert.match(hudSource, /frame\.padlockTarget === "carrier"/);
  assert.match(hudSource, /this\._carrierPatternCue\.update\(state, frame\.dt\)/);
  assert.match(hudSource, /this\._aoaIndexerCue\.update/);
  assert.match(hudSource, /this\._lsoDisplayCue\.update/);
});

test("bridge publishes authoritative local weather instead of renderer-owned decoration", async () => {
  const source = await readBridgeContract();
  assert.match(source,
    /\(Session\.Weather\?\.Clouds \?\? ClearCloudField\.Instance\)[\s\S]*\.Sample\(playerPosition,/);
  for (const field of [
    "visibility_m",
    "cloud_fraction_01",
    "cloud_extinction_per_m",
    "precipitation_mm_hr",
    "icing_hazard_01",
    "lightning_hazard_01",
    "weather_profile_id",
    "weather_seed_hex",
    "weather_layers",
    "weather_cells",
  ]) {
    assert.match(source, new RegExp(`\\\\\"${field}\\\\\"`));
  }
  assert.match(source,
    /StartBeatWithEnvironment\([\s\S]*KoreaWeatherPresets\.ForBeat\(index\)/,
    "built-in sorties must stage deterministic Korea weather alongside terrain");
});

test("hidden replay exterior is preloaded and obsolete pack runtimes are disposed", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source,
    /resolveSlot\(this\.playerExteriorSlot, \{ preload: true \}\)/,
    "the first replay must not start on the compatibility exterior");
  assert.match(source,
    /if \(!pack\?\.profile \|\| !key\) \{[\s\S]*const epoch = \+\+this\.visualRuntimeEpoch;[\s\S]*queueVisualRuntimeTransition/,
    "an unstaged or invalidated pack must retire its old visual runtime");
  assert.match(source, /previous\?\.dispose\(\)/);
});

test("production keeps the rejected authored cockpit out of the pilot's SA view", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /const PRODUCTION_AUTHORED_COCKPIT_ENABLED = false/);
  assert.match(source,
    /this\.cockpitSlot\.root\.visible = PRODUCTION_AUTHORED_COCKPIT_ENABLED/);
  assert.match(source, /const gunsightAnchor = cockpitRoot\.visible/,
    "a hidden authoring cockpit must not retain ownership of the live gunsight");
});

test("modern surrogate mission stays an explicit abstract visual contact without Korea asset fetches", async () => {
  const [appSource, bridgeSource] = await Promise.all([
    readFile(appUrl, "utf8"),
    readBridgeContract(),
  ]);
  for (const presentationId of [
    "presentation.vehicle.f22a.public-data-surrogate.v1",
    "presentation.vehicle.su27s.public-data-surrogate.v1",
  ]) {
    assert.match(appSource, new RegExp(`\\["${presentationId.replaceAll(".", "\\.")}", createDrone\\]`),
      `${presentationId} needs an immediately visible compatibility contact`);
    assert.ok(appSource.includes(`"${presentationId}",`),
      `${presentationId} must be excluded from pack registry resolution`);
  }
  assert.match(appSource,
    /if \(ABSTRACT_ONLY_PRESENTATION_IDS\.has\(slot\.presentationId\)\) return;/,
    "an abstract-only contact must not generate missing Korea descriptor/network noise");
  assert.match(bridgeSource,
    /modernSurrogate \|\| balloonPrototype\s*\? "null" : .*KoreaAssetManifestId/,
    "the modern surrogate mission must not claim a Korea asset manifest");
  assert.doesNotMatch(bridgeSource, /missionDefinitionId\s*=\s*Session\.BeatIndex\s*switch/,
    "mission identity belongs to content rather than an index-to-label bridge switch");
});

test("multiplayer consumes pack slots at physical scale with a separate distant contact", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /createDynamicSlot\([\s\S]*projection\.presentationId/);
  assert.match(source, /createDistantAircraftImpostor\(THREE,/);
  assert.match(source, /entry\.slot\.root\.scale\.setScalar\(1\)/);
  assert.match(source,
    /entry\.slot\.root\.visible = !entry\.alive \|\| contactPresentation\.modelVisible/,
    "terminal bodies remain physical while only live distant aircraft use the impostor");
  assert.doesNotMatch(source, /assistScale|entry\.visual\.scale\.setScalar/,
    "remote aircraft must never be range-enlarged");
  assert.match(source, /projectedPixelHeight \* \(2 \*\* -bias\)/,
    "quality-tier LOD bias must affect registry selection without changing physical scale");
  assert.match(source, /texture\.anisotropy = anisotropy/,
    "quality-tier anisotropy must reach authored model textures");
});

test("FlightView teardown releases pack tasks, inline resources, PMREM, and renderer", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /await this\.visualRuntimeTransitions\.idle\(\)/);
  assert.match(source, /this\.visualRuntimeTransitions\.enqueue\(operation\)/);
  assert.match(source, /disposeSceneResources\(this\.sky\.mesh\)/);
  assert.match(source, /this\.environmentTarget\.dispose\(\)/);
  assert.match(source, /this\.renderer\.dispose\(\)/);
});

test("replay stream changes clear transients and baseline cumulative weapon counters", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /if \(consumption\.streamChanged\) \{[\s\S]*packEffectsAdapter\?\.clear/);
  assert.match(source, /if \(consumption\.streamChanged\) \{[\s\S]*playerDamageSmoke\.clear\(\)[\s\S]*banditDamageSmoke\.clear\(\)/);
  assert.match(source, /lastRoundsFired = Number\(state\.rounds_fired\) \|\| 0/);
  assert.match(source,
    /lastOpponentRoundsFired = Number\(state\.opponent_rounds_fired\) \|\| 0/);
  assert.match(source, /lastHitCount = Number\(state\.hits\) \|\| 0/);
});
