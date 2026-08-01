import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../../../app.js", import.meta.url);
const sceneBuildersUrl = new URL("../../scene/scene_builders.js", import.meta.url);
const hudUrl = new URL("../../../hud.js", import.meta.url);
const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const projectionUrl = new URL("../../../../SnapshotProjection.cs", import.meta.url);
const webProjectUrl = new URL("../../../../GunsOnly.Web.csproj", import.meta.url);
const environmentLabUrl = new URL("../../../environment-lab/main.js", import.meta.url);
const environmentLabIndexUrl = new URL("../../../environment-lab/index.html", import.meta.url);
const environmentLabStylesUrl = new URL("../../../environment-lab/styles.css", import.meta.url);
const environmentLabGateUrl = new URL(
  "../../../../../tools/perf/ukraine_hero_gate.mjs",
  import.meta.url,
);
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
  assert.match(source, /uSoftWorld/,
    "decision-support sky must expose the Ukraine soft-world atmosphere switch");
  const skySource = await readFile(sceneBuildersUrl, "utf8");
  assert.match(skySource,
    /vec3 belowWarm = mix\(uFogColor, uAtmosphereHazeColor, uAtmosphereHazeMix\)/,
    "the sky's below-horizon wash must resolve the terrain's haze mix, never its own literal");
  assert.doesNotMatch(skySource, /vec3 belowWarm = vec3\(/,
    "a hardcoded below-horizon colour forks the horizon from the terrain again");
  assert.match(skySource, /UKRAINE_SOFT_WORLD_FOG_HEX/,
    "sky ground-haze defaults must come from the single soft-world atmosphere source");
  assert.match(source, /this\.sky\.uniforms\.uSoftWorld\.value = ukraineTheatre \? 1 : 0/,
    "Ukraine theatre must warm the production sky without enabling the Korea pack environment");
  assert.match(source, /this\.sky\.uniforms\.uSunDirection\.value\.copy\(SUN_DIRECTION\)/,
    "soft-world sky sun bloom must follow the scene sun direction");
  // 2026-07-30: at 72,000 ft the 64 km streamed disc edge sits ~19 deg below the horizontal, so
  // the sky's below-horizon hemisphere and the terrain's world-edge bury are adjacent on screen.
  // They were separate literals, and the mismatch printed the chunk-height silhouette as a hard
  // two-tone staircase. Sharing the uniform objects is what keeps them equal as fog moves.
  assert.match(source,
    /attachSoftWorldGroundHaze\(\s*this\.sky\?\.uniforms, terrain\.material\?\.uniforms\)/,
    "the sky must paint its below-horizon wash with the terrain's own haze uniforms");
  assert.match(source, /this\.ambient\.color\.set\(0xe8d8b8\)/,
    "Ukraine soft-world fill light must lean warm painterly");
  assert.match(source, /this\.fogLow\.set\(0xa8814b\)/,
    "Ukraine soft-world fog must lean warm dusty rather than cool Korea blue");
  assert.match(source, /createDecisionSupportSea\(\)/);
  assert.match(source,
    /const environmentFactory = PRODUCTION_PACK_ENVIRONMENT_ENABLED && isKoreaPack/);
  assert.match(source, /createKoreaEffectsFactory\(THREE,[\s\S]*effectsFactory,/);
  assert.match(source, /manageFog: Boolean\(environmentFactory\)/);
  assert.match(source, /postStackFactory: createDecisionSupportPostStack/);
  assert.match(source,
    /shadowModes: detectedVisualTier === "mobile"\s*\?\s*\["carrier"\]\s*:\s*\["carrier", "replay"\]/,
    "combat must not pay for a shadow pass without a visible ownship or shadow-receiving terrain");
  assert.doesNotMatch(source, /shadowModes:[^\n]*"combat"/);
  assert.match(source, /fogDensityForVisibility\(reportedVisibilityM\)/,
    "production visibility must come from the scenario weather projection");
  assert.match(source, /this\.tacticalClouds\.configureFromState\(state\)/,
    "production clouds must be reconstructed from the authoritative weather descriptors");
  assert.match(source, /createWinterPrecipitation\(THREE, \{/,
    "production winter precipitation must use the bounded GPU batch");
  assert.match(source,
    /this\.winterPrecipitation\.configureFromSnapshot\(state\)/,
    "falling hydrometeors must come from the authoritative typed snapshot rates");
  assert.match(source,
    /simulationTimeSeconds: Number\(state\.t\) \|\| 0/,
    "winter precipitation motion must use deterministic simulation time");
  assert.match(source,
    /snowCover01: terrainSnowCover01,[\s\S]*snowWetness01: terrainSnowWetness01,[\s\S]*glazeIce01: terrainGlazeIce01/,
    "terrain winter shading must consume projected surface-condition truth");
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
  assert.match(source,
    /\["presentation\.vehicle\.one-way-attack-drone\.prototype\.v1", createOneWayAttackDrone\]/,
    "the 5.5 m raid truth must use its own reviewed silhouette instead of the fighter fallback");
  assert.match(source,
    /\["presentation\.vehicle\.rapier-gun-drone\.prototype\.v1", createRapierGunDrone\]/,
    "Rapier's reusable glide gun-drone must use its own 5.5 m silhouette");
  assert.match(source,
    /\["presentation\.vehicle\.rapier\.public-data-surrogate\.v1", createRapier\]/,
    "Rapier must resolve to its unique 13 m interceptor silhouette instead of the fighter fallback");
  assert.match(source,
    /\["presentation\.platform\.rapier-dispersed-strip\.v1", createRapierDispersedStrip\]/,
    "the land-based Rapier recovery contract must resolve to the fixed dispersed strip");
  assert.match(source,
    /this\.carrierSlot\.root\.visible = state\.recovery_platform === true/,
    "fixed strips and ships must enter platform resolution through the shared recovery contract");
  assert.match(source,
    /const recoveryPlatform = state\.recovery_platform === true \|\| state\.carrier === true;[\s\S]*?runtime\.water\.group\.visible = maritime/,
    "fixed strips must enter recovery presentation without inheriting maritime water");
  assert.match(source,
    /const fixedStrip = state\.platform_kind === "FIXED_ARRESTING_STRIP";[\s\S]*?fixedStripRecoveryPresentation[\s\S]*?runtime\.recovery\.group\.visible = false;[\s\S]*?updateRecoveryWireHighlight\(fixedStripRecovery, state\)/,
    "the procedural strip must highlight its embedded physical wires and suppress the duplicate carrier overlay");
  assert.match(source,
    /if \(slot\.object\.userData\?\.fixedStripRecoveryPresentation\) \{[\s\S]*?slot\.root\.userData\.fixedStripRecoveryPresentation =[\s\S]*?slot\.object\.userData\.fixedStripRecoveryPresentation/,
    "the stable platform slot must retain the resolved strip's embedded recovery hook");
  assert.match(source,
    /if \(fixedStrip\)[\s\S]*?updateCarrierRecoveryOverlay\(runtime\.recovery, state, true, true\);/,
    "a fixed-strip asset without exposed wires must retain exactly one longitudinally unscaled recovery fallback");
  assert.match(source,
    /const scaleX = deckScale\.scaleX;[\s\S]*?const scaleZ = fixedLongitudinalSpacing \? 1 : deckScale\.scaleZ;/,
    "the fixed-strip fallback may match runway width but must preserve 5.2 m longitudinal wire spacing");
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
  assert.ok(webProject.includes(
    `Condition="'$(EmbedUkraineTerrainTruth)' != 'false'"`,
  ), "production must embed the selected Ukraine truth unless a constrained build opts out");
  assert.match(source,
    /this\.terrainPresentationPromise = null;[\s\S]*ensureTerrainPresentation\(state = null\)/,
    "constructing FlightView must not start terrain network work");
  assert.match(source,
    /if \(state\?\.ready !== true && state\?\.terrain_present === true\) \{[\s\S]*?this\.ensureTerrainPresentation\(state\)/,
    "a non-Ready frame with terrain present should start the retained terrain single flight");
  assert.match(source,
    /if \(this\.terrainPresentation\) \{[\s\S]*return this\.terrainSceneryEraPromise\?\.then[\s\S]*if \(this\.terrainPresentationPromise\) \{[\s\S]*terrainPresentationRequestedKey === terrainKey/,
    "repeated gameplay frames must reuse one terrain load");
  assert.match(source,
    /const UKRAINE_2030S_TERRAIN_ID = "terrain\.ukraine\.rapier-range\.atlas\.v1"/,
    "all 2030s Ukraine missions must select one stable theatre substrate");
  assert.match(source,
    /const ukraineTheatre = state\?\.terrain_profile_id === UKRAINE_2030S_TERRAIN_ID/);
  assert.match(source,
    /const sceneryEra = ukraineTheatre[\s\S]*?state\?\.terrain_scenery_profile \|\| "ukraine-modern"/,
    "the shared theatre must retain its regional stylized scenery profile");
  assert.match(source,
    /const UKRAINE_TRAINING_TERRAIN_MANIFEST_URL = new URL\([\s\S]*?rapier-range\.atlas\.manifest\.json/);
  assert.match(source,
    /const UKRAINE_SONIACHNE_MISSION_FEATURE_PACK_ID =[\s\S]*?mission-feature-pack\.ukraine-modern\.soniachne-clinic-a\.v1/);
  assert.match(source,
    /const UKRAINE_RAPIER_STRIP_MISSION_FEATURE_PACK_ID =[\s\S]*?mission-feature-pack\.ukraine-modern\.rapier-eastern-strip\.v1/,
    "Rapier corridor must publish a strip ambient-exclusion feature pack");
  assert.match(source,
    /const UKRAINE_SONIACHNE_MISSION_FEATURE_PACK_URL = new URL\([\s\S]*?hero-cells\/[\s\S]*?soniachne-clinic-a\.feature-pack\.json/);
  assert.match(source,
    /const terrainKey = ukraineTheatre[\s\S]*?UKRAINE_2030S_TERRAIN_ID/,
    "all Ukraine fidelity bands must retain the same theatre terrain identity");
  assert.match(source,
    /function missionFeaturePackCacheIdentity\(state = null\)[\s\S]*?mission_feature_pack_id[\s\S]*?mission_feature_pack_sha256[\s\S]*?encodeURIComponent/,
    "terrain reuse must be scoped to the snapshot's selected feature-pack ID and hash");
  assert.match(source,
    /const terrainKey = ukraineTheatre[\s\S]*?missionFeaturePackCacheIdentity\(state\)/,
    "switching mission feature packs must rebuild rather than reuse stale terrain");
  assert.match(source,
    /loadMissionFeaturePack\(featurePackRequest, fetchWithAbort\)[\s\S]*?loadKoreaTerrain\(THREE,[\s\S]*?missionFeaturePack,[\s\S]*?missionFeaturePackSha256: featurePackRequest\.sha256/,
    "the verified raw pack and its snapshot hash must reach the terrain presentation");
  assert.match(source,
    /response\.arrayBuffer\(\)[\s\S]*?sha256Hex\(bytes\)[\s\S]*?actualSha256 !== request\.sha256[\s\S]*?JSON\.parse/,
    "production must verify the response bytes before parsing the selected mission pack");
  assert.match(source,
    /if \(request\.required\) throw error;[\s\S]*?Optional mission feature pack unavailable/,
    "only explicitly optional feature-pack failures may fall back");
  assert.match(source,
    /presentation\.setSceneryEra\(sceneryEra\)/,
    "restaging across eras must replace scenery without rebuilding the retained terrain atlas");
  assert.match(source,
    /const lowLevelSceneryRequired = view\.terrainMicroRequired === true;[\s\S]*if \(!lowLevelSceneryRequired\) \{[\s\S]*disableAmbientScenery\?\.\(\)/,
    "the frame governor may shed ambient instances at altitude but must retain required micro scenery");
  assert.match(source,
    /Shadows off · low-level scenery retained · holding 60/,
    "the performance status must disclose that essential scenery remains active");
  assert.match(source,
    /Far field over Ukraine[\s\S]*this\.sea\.mesh\.visible = !terrainId/,
    "Ukraine / land theatres hide the decision-support sea when terrain is present; sea remains the no-terrain fallback");
  assert.match(source,
    /terrainPresentationFailureKey === terrainKey[\s\S]*terrainPresentationRetryAtMs[\s\S]*return Promise\.resolve\(null\)/,
    "a failed terrain product must back off instead of refetching on every animation frame");
  assert.match(source,
    /terrainPresentationRetryAtMs = performance\.now\(\) \+ 15_000/,
    "terrain failures should remain retryable after a bounded delay");
  assert.match(source,
    /function prepareMissionTerrain\(index, stagedState\)[\s\S]*setPauseReason\("terrain", true\)[\s\S]*warmTerrainAroundReadyAircraft[\s\S]*setPauseReason\("terrain", requiredFeaturePack && !warmupReady\)/,
    "the low-level sortie must warm nearby terrain before releasing the flight clock");
  assert.match(source,
    /terrainLaunchWarmupFailedKey === warmupKey[\s\S]*requiredFeaturePack[\s\S]*setPauseReason\("terrain", true\)[\s\S]*sortie remains interlocked/,
    "a required mission pack failure must keep the Ready interlock closed");
  assert.match(source,
    /await terrain\.ready[\s\S]*requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)[\s\S]*await terrain\.whenIdle\?\.\(\)[\s\S]*view\.renderer\.compileAsync\(view\.scene, view\.camera\)/,
    "terrain warmup must include near-LOD, instanced-scenery, and shader work requested by the paused camera");
  assert.match(source,
    /function terrainDiagnosticsCoverStagedAircraft[\s\S]*?localResidentChunks[\s\S]*?residentChunks <= 0\) return false;[\s\S]*?localSceneryChunks[\s\S]*?sceneryChunks > 0/,
    "coarse terrain alone must not release a low-level sortie before scenery is resident");
  assert.match(source,
    /if \(state\?\.terrain_micro_required !== true\) return true;[\s\S]*terrain\?\.sceneryEra === state\?\.terrain_scenery_profile/,
    "macro-only sorties must warm terrain without making low-level instances a launch dependency");
  assert.match(source,
    /function terrainWarmupKey\(state\)[\s\S]*?terrain_placement_east_m[\s\S]*?terrain_placement_north_m[\s\S]*?terrain_micro_required[\s\S]*?mission_feature_pack_id[\s\S]*?mission_feature_pack_sha256/,
    "warmup failures and readiness must include placement, fidelity band, and mission-pack revision");
  assert.match(source,
    /mission_feature_pack_required === true[\s\S]*?terrain\?\.missionFeaturePackId !== featurePackRequest\.featurePackId[\s\S]*?missionFeaturePackSha256/,
    "required scenery cannot release the sortie until terrain diagnostics confirm its ID and hash");
  assert.match(source,
    /lazyChunks: true,[\s\S]*?chunkLoadRadiusM: TERRAIN_INITIAL_WARMUP_RADIUS_M/,
    "the unified theatre must warm only the local neighborhood before expanding in flight");
  assert.match(source,
    /applyTerrainFlightPolicy\(\)[\s\S]*?terrainNominalStreamingRadiusM/,
    "mission-authored flight radius must expand after local warmup");
  assert.match(source,
    /deadlineTimer = window\.setTimeout\(\(\) => \{[\s\S]*cancelTerrainPresentationRequest\(terrainKey\)[\s\S]*15_000/,
    "a bounded warmup must actively cancel a hung terrain request rather than only racing it");
  assert.match(source,
    /cancelTerrainPresentationRequest\(terrainKey\)[\s\S]*terrainPresentationRequestEpoch \+= 1[\s\S]*terrainPresentationAbortController\?\.abort\(\)[\s\S]*terrainPresentationPromise = null/,
    "cancelling terrain must invalidate stale completion and leave a later retry possible");
  assert.match(source,
    /function cancelTerrainLaunchWarmup\(\)[\s\S]*terrainLaunchWarmupOwner = null;[\s\S]*owner\.cancel\?\.\(\);[\s\S]*cancelTerrainPresentationRequest\?\.\([\s\S]*owner\.terrainKey,[\s\S]*\{ markFailed: false \}/,
    "restaging a mission must cancel only its owned warmup without poisoning the next terrain request");
  assert.match(source,
    /cancelTerrainPresentationRequest\([\s\S]*\{ markFailed = true \} = \{\}[\s\S]*if \(markFailed\)[\s\S]*terrainPresentationRetryAtMs = performance\.now\(\) \+ 15_000[\s\S]*else \{[\s\S]*terrainPresentationRetryAtMs = 0/,
    "timeout cancellation must retain backoff while deliberate mission-switch cancellation remains immediately retryable");
  assert.match(source,
    /cancelTerrainPresentationRequest\(terrainKey\)[\s\S]*const hasInFlightRequest = this\.terrainPresentationPromise !== null;[\s\S]*if \(\(!hasInFlightRequest && !ownsPresentation\)/,
    "a requested theatre must be able to cancel the previous theatre load blocking its warmup");
  assert.match(source,
    /const fetchWithAbort = \(input, init = \{\}\) => fetch\(input, \{[\s\S]*signal: abortController\.signal[\s\S]*fetch: fetchWithAbort/,
    "the manifest and bundle fetches must share the warmup abort signal");
  assert.match(source,
    /!replayActive && pauseReasons\.size === 0 && state\.session_phase === "ACTIVE"[\s\S]*?frameGovernor\.observe/,
    "Ready, warmup, pause, and replay frames must not spend the sortie frame budget");
  assert.match(source,
    /FRAME_GOVERNOR_LATE_FRAME_MS = FOREGROUND_FRAME_CONTRACT\.budgetFrameMs[\s\S]*?FRAME_GOVERNOR_SEVERE_FRAME_COUNT = 3/,
    "the governor must react before sustained delivery has fallen to 45 fps");
  assert.match(source,
    /Math\.min\(currentRadiusM, requestedRadiusM\)/,
    "a fallback radius must never increase load above the current warmup/governor radius");
  assert.match(source,
    /setAmbientSceneryBudgetLevel\?\.\(ambientLevel\)[\s\S]*?mission landmarks retained/,
    "low-level fallback must retain authored landmarks while shedding secondary ambient detail");
  assert.match(source,
    /frameGovernor\.reset\(activeView\)[\s\S]*?bridge\.Begin\(\);[\s\S]*?frameGovernor\.reset\(activeView\)/,
    "restaging and launch must restore mission radius, shadows, and scenery policy");
  assert.match(source,
    /const sceneryWasSuppressed = view\.terrainGovernorSuppressesAmbientScenery === true;[\s\S]*?if \(sceneryWasSuppressed \|\| view\.terrainMicroRequired === true\) \{[\s\S]*?enableAmbientScenery/,
    "a new sortie must restore scenery shed by the governor even when micro scenery is optional");
  assert.match(source,
    /const frameGovernorPolicy = new FrameGovernorPolicy[\s\S]*?recover\(view, transition\)[\s\S]*?enableAmbientScenery/,
    "governor quality must recover one policy-approved rung after sustained clean windows");
  assert.match(source,
    /terrainGovernorSuppressesAmbientScenery = true[\s\S]*?disableAmbientScenery[\s\S]*?terrainGovernorSuppressesAmbientScenery !== true[\s\S]*?enableAmbientScenery/,
    "terminal governor shedding must stay latched until the next sortie reset");
  assert.match(source, /const radarAltitudeFt = Number\(state\?\.radar_alt_ft\)/,
    "high-altitude ambient shedding must consume the actual hot-snapshot radar-altitude field");
  assert.match(source,
    /cameraAglM: Number\(state\.radar_alt_ft\) \* 0\.3048/,
    "camera-local grass must receive authoritative AGL instead of mistaking world Y for height");
  assert.match(source, /const DEVELOPMENT_KOREA_ATLAS_MANIFEST_URL = null;/,
    "an unqualified peninsula atlas must remain unreachable from the production browser");
  assert.doesNotMatch(source, /peninsula-r2|pub-[a-z0-9]+\.r2\.dev/,
    "production source must not expose the temporary atlas host or a query-string bypass");
  assert.match(source,
    /const manifestUrl = ukraineTheatre[\s\S]*?UKRAINE_TRAINING_TERRAIN_MANIFEST_URL[\s\S]*?DEVELOPMENT_KOREA_ATLAS_MANIFEST_URL/);
  assert.match(source, /cameraPosition: this\.camera\.position,[\s\S]*deltaSeconds: dt/,
    "terrain streaming must receive frame time for bounded velocity-ahead prefetch");
  assert.match(source,
    /import \{[\s\S]*createDecisionSupportSea[\s\S]*\} from "\.\/render\/scene\/scene_builders\.js\?v=237"/,
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
    /TerrainPlacementEastM\(int index\)[\s\S]*?environment\.MultiplayerTerrainShared[\s\S]*?-_worldOriginEastM[\s\S]*?-environment\.TerrainSourceAnchorEastM/,
    "shared sorties must use the inverse room origin while local fidelity cells use source anchors");
  assert.match(bridgeSource,
    /FixedStripPresentationId[\s\S]*presentation\.platform\.rapier-dispersed-strip\.v1[\s\S]*Session\.Carrier\?\.IsMaritime == true[\s\S]*CarrierPresentationId : FixedStripPresentationId/,
    "non-maritime recovery must project the fixed-strip presentation rather than a carrier");
  for (const field of [
    "theatre_id",
    "location_id",
    "world_frame_id",
    "terrain_profile_id",
    "terrain_macro_scenery_profile",
    "terrain_scenery_profile",
    "terrain_macro_required",
    "terrain_micro_required",
    "mission_feature_pack_id",
    "mission_feature_pack_sha256",
    "mission_feature_pack_required",
    "terrain_placement_east_m",
    "terrain_placement_north_m",
    "multiplayer_terrain_shared",
  ]) {
    assert.ok(bridgeSource.includes(field),
      `the authoritative bridge frame contract must publish ${field}`);
  }
});

test("environment lab exercises the production terrain manifest and exposes the look gate", async () => {
  const [source, index, styles, gateSource] = await Promise.all([
    readFile(environmentLabUrl, "utf8"),
    readFile(environmentLabIndexUrl, "utf8"),
    readFile(environmentLabStylesUrl, "utf8"),
    readFile(environmentLabGateUrl, "utf8"),
  ]);
  assert.match(source,
    /import \{ loadKoreaTerrain \} from "\.\.\/render\/environment\/korea_terrain\.js"/);
  const loadCall = source.match(/terrain = await loadKoreaTerrain\(THREE, \{([\s\S]*?)\n  \}\);/);
  assert.ok(loadCall, "environment lab must construct the real terrain presentation");
  assert.match(loadCall[1], /manifestUrl: siteConfig\.manifestUrl/,
    "the lab must exercise both the production-default Korea pack and selectable Ukraine pack");
  assert.match(source, /SITE_CONFIGURATIONS[\s\S]*?sceneryEra: "ukraine-modern"/);
  assert.match(source,
    /missionFeaturePackUrl: new URL\([\s\S]*?hero-cells\/[\s\S]*?soniachne-clinic-a\.feature-pack\.json/);
  assert.match(source,
    /loadMissionFeaturePack\(siteConfig\.missionFeaturePackUrl\)[\s\S]*?missionFeaturePack: missionFeaturePack\.pack[\s\S]*?missionFeaturePackSha256: missionFeaturePack\.sha256/,
    "the Ukraine lab must load the real hero-cell pack and pass its byte hash to terrain");
  assert.match(source,
    /response\.arrayBuffer\(\)[\s\S]*?sha256Hex\(bytes\)[\s\S]*?JSON\.parse/,
    "the lab must retain a stable content hash for the exact JSON bytes it reviewed");
  assert.match(source,
    /terrainState\.missionFeaturePackId[\s\S]*?terrainState\.missionFeaturePackSha256/,
    "the lab must fail visibly if terrain drops or substitutes the selected mission pack");
  assert.match(source, /await terrain\.ready/);
  assert.match(source, /window\.__terrainLookReady = terrain\.diagnostics\(\)/);
  assert.match(source, /terrainState\.errors > 0 \|\| terrainState\.residentChunks === 0/,
    "the lab must fail visibly instead of retaining an ocean-only scene");
  assert.match(source, /logarithmicDepthBuffer: true/,
    "the look gate must exercise production horizon depth precision");
  // One engine. PRODUCTION_PACK_ENVIRONMENT_ENABLED is false, so the pack atmosphere's own sky
  // dome ships nowhere — yet the look gate rendered it, which is how a two-tone 72,000 ft horizon
  // passed a green gate for months. The gate now judges FlightView's sky or it judges nothing.
  assert.match(source, /createDecisionSupportSky/,
    "the look gate must render the production sky, not the pack atmosphere's own dome");
  assert.match(source, /environment\.sky\.visible = false/,
    "the pack atmosphere dome must be hidden so two skies cannot composite");
  assert.match(source,
    /attachSoftWorldGroundHaze\(productionSky\.uniforms, terrain\.material\?\.uniforms\)/,
    "the gate must exercise the same sky/terrain haze join production uses");
  assert.match(source, /productionSky\.mesh\.position\.copy\(camera\.position\)/,
    "the 4 km sky sphere must ride the camera as app.js does, or Rapier altitudes leave it behind");
  assert.match(source, /productionSky\.uniforms\.uAltitude\.value = Math\.max\(0, camera\.position\.y\)/,
    "the sky's altitude-keyed palette must see the captured camera's real height");
  assert.match(source, /new THREE\.HemisphereLight\(0xb5cad0, 0x102229, 0\.78\)/);
  assert.match(source, /new THREE\.DirectionalLight\(0xffe2b4, 2\.65\)/);
  assert.match(source, /loadVisualProfile\(\)/);
  assert.match(source, /terrainFogDensity = 1 \/ Math\.max\(1, Number\(fog\.farMetres\)/,
    "terrain look fog must derive from the active production pack profile");
  assert.match(index, /id="altitude"[^>]*max="22000"/,
    "the look gate must reach Rapier's 21.5 km cruise altitude");
  assert.match(source,
    /QUALITY_TIERS\.includes\(parameters\.get\("quality"\)\)[\s\S]*?parameters\.has\("altitude"\)[\s\S]*?parameters\.has\("clouds"\)/,
    "the performance rail must accept exact quality/altitude inputs and an optional cloud switch");
  assert.match(source,
    /new AdaptiveResolutionController\(\{[\s\S]*?normalizedVisualProfile\.adaptiveResolution[\s\S]*?pixelRatioCap: normalizedVisualProfile\.renderer\.pixelRatioCap/,
    "the lab's quality tiers must exercise production resolution ceilings, not one fixed DPR");
  assert.match(source,
    /function configureProductionShadows\(\)[\s\S]*?quality\.value === "desktop"[\s\S]*?renderer\.shadowMap\.enabled = desktopShadowPass[\s\S]*?renderer\.shadowMap\.type = THREE\.PCFSoftShadowMap[\s\S]*?sun\.castShadow = desktopShadowPass/,
    "desktop hero-cell measurements must include the production soft-shadow pass while constrained tiers keep it disabled");
  assert.match(source,
    /normalizedVisualProfile\?\.tier\?\.settings\?\.shadowMapSize[\s\S]*?sun\.shadow\.mapSize\.set\(shadowMapSize, shadowMapSize\)[\s\S]*?sun\.shadow\.map\?\.dispose\(\)/,
    "the lab shadow target must use and reallocate for the selected production tier's map size");
  assert.match(source,
    /sun\.shadow\.camera\.left = -44[\s\S]*?right = 44[\s\S]*?top = 44[\s\S]*?bottom = -44[\s\S]*?near = 10[\s\S]*?far = 3600[\s\S]*?updateProjectionMatrix\(\)[\s\S]*?bias = -0\.00018[\s\S]*?normalBias = 0\.16/,
    "the enabled pass must use the production land-combat shadow volume, depth range, and bias");
  assert.match(source,
    /applyProductionProfile\(visualProfile\);[\s\S]*?configureProductionResolution\(visualProfile\);[\s\S]*?configureProductionShadows\(\);[\s\S]*?warmPresentationBeforePerformanceRail\(\)/,
    "shadow policy must be active before the warmup and measured frame rail");
  assert.match(source,
    /warmPresentationBeforePerformanceRail\(\)[\s\S]*?renderer\.compileAsync\(scene, camera\)[\s\S]*?renderer\.render\(scene, camera\)[\s\S]*?adaptiveResolution\?\.reset\(adaptiveResolution\.maxScale, "scene-ready"\)[\s\S]*?resetPerformanceRail\(\)/,
    "the measured rail must begin after shader and render-target warmup, at the tier ceiling");
  assert.match(source,
    /lowLevelCameraGroundM: 184\.8[\s\S]*?siteConfig\.lowLevelCameraGroundM \+ heightAglM/,
    "the representative hero-cell camera must interpret its slider against sampled LOD0 ground");
  assert.match(source,
    /const FRAME_STATS_SAMPLE_LIMIT = FOREGROUND_FRAME_CONTRACT\.labSampleCount[\s\S]*?new Float32Array\(FRAME_STATS_SAMPLE_LIMIT\)/,
    "rolling RAF evidence must stay bounded rather than growing for the life of the tab");
  assert.match(source,
    /document\.visibilityState !== "visible"[\s\S]*?frameMs > FRAME_STATS_BACKGROUND_STALL_MS/,
    "background and long resume stalls must not contaminate foreground frame percentiles");
  assert.match(source,
    /fps:[\s\S]*?p95Ms:[\s\S]*?p99Ms:[\s\S]*?overBudgetFraction:/,
    "the rail must publish rate, tail latency, and the production-governor late fraction");
  assert.match(source,
    /FRAME_STATS_LATE_FRAME_MS = FOREGROUND_FRAME_CONTRACT\.budgetFrameMs[\s\S]*?evaluateForegroundFrameContract\(\{[\s\S]*?budgetMissFraction: frameStats\.overBudgetFraction/,
    "the lab must enforce the production 60 fps/tail-latency contract");
  assert.match(source,
    /function evaluatePerformanceGate\(frameStats\)[\s\S]*?frameStats\.sampleCount >= FRAME_STATS_SAMPLE_LIMIT[\s\S]*?state: sampled \? \(pass \? "pass" : "fail"\) : "warming"/,
    "the 600-frame rail must resolve to an automation-readable pass or fail");
  assert.match(source,
    /const environmentLabDiagnostics = Object\.freeze\(\{[\s\S]*?snapshot\(\)[\s\S]*?quality: quality\.value[\s\S]*?altitudeM:[\s\S]*?renderer:[\s\S]*?calls:[\s\S]*?triangles:[\s\S]*?shadows:[\s\S]*?rendererEnabled:[\s\S]*?pcfSoft:[\s\S]*?sunCastShadow:[\s\S]*?mapSize:[\s\S]*?terrain:[\s\S]*?frameStats:/,
    "automation needs one read-only snapshot of the selected rail and current renderer, shadow, and terrain evidence");
  assert.match(source,
    /Object\.defineProperty\(window, "__environmentLabDiagnostics"[\s\S]*?writable: false,[\s\S]*?configurable: false,/,
    "the diagnostic handle itself must not be replaceable by the scene under test");
  assert.match(gateSource,
    /const expectedShadowPass = tier === "desktop"[\s\S]*?expectedAuthoredShadowDraws = expectedShadowPass \? 4 : 0[\s\S]*?rendererEnabled !== expectedShadowPass[\s\S]*?sunCastShadow !== expectedShadowPass[\s\S]*?pcfSoft !== true[\s\S]*?expectedShadowMapSize\[tier\][\s\S]*?camera\?\.far !== 3600[\s\S]*?missionFeatures\?\.shadowDrawCalls[\s\S]*?expectedAuthoredShadowDraws/,
    "the hardware gate must reject desktop runs that skip shadows and constrained runs that add them");
  assert.match(gateSource,
    /headless: process\.env\.GUNS_HERO_GATE_HEADLESS === "1"/,
    "the device gate must default to headed hardware acceleration rather than SwiftShader");
  for (const id of [
    "render-pixels", "resident-chunks", "visible-scenery",
    "fps", "frame-p95", "frame-p99", "late-fraction", "frame-gate",
  ]) {
    assert.match(index, new RegExp(`id="${id}"`),
      `the compact performance readout must expose ${id}`);
  }
  assert.match(styles, /\.readout \{[\s\S]*?flex-wrap: wrap/,
    "the expanded evidence rail must remain compact at narrow viewport widths");
});

test("decision-support ocean and warnings carry truth without presentation flicker", async () => {
  const [appSource, hudSource] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(hudUrl, "utf8"),
  ]);
  assert.match(appSource, /new THREE\.WebGLRenderer\(\{[\s\S]*?logarithmicDepthBuffer:\s*true/,
    "production clip range needs log depth so the Ukraine apron cannot z-fight at Rapier slant");
  assert.match(appSource, /uWindSpeed/);
  assert.match(appSource,
    /Number\(\s*casevac \? state\.casevac_wind_x_mps : state\.wind_x_mps,\s*\)/,
    "terrain wind must select CASEVAC's projected east component without dropping legacy weather");
  assert.match(appSource,
    /Number\(\s*casevac \? state\.casevac_wind_z_mps : state\.wind_z_mps,\s*\)/,
    "terrain wind must select CASEVAC's projected north component without dropping legacy weather");
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
  assert.match(hudSource,
    /if \(!frame\.padlock\) \{[\s\S]*?this\.drawPitchLadder[\s\S]*?this\.drawAirframeSymbols/,
    "the 2D horizon and flight-path vector must remain independent of scenery quality");
  assert.doesNotMatch(hudSource, /frameGovernor.*drawPitchLadder|governor_level.*drawPitchLadder/,
    "maximum scenery shedding must never suppress the attitude reference");
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
    "built-in sorties must stage deterministic mission weather alongside terrain");
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

test("packless modern flight owns adaptive 3D resolution and raw foreground frame timing", async () => {
  const [source, sceneBuilders] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(sceneBuildersUrl, "utf8"),
  ]);
  assert.match(source,
    /const touchBalancedVisualDevice = detectedDeviceMemoryGiB !== null[\s\S]*?detectedDeviceMemoryGiB >= 8[\s\S]*?detectedLogicalCores !== null[\s\S]*?detectedLogicalCores >= 8[\s\S]*?const detectedVisualTier = mobileControls[\s\S]*?touchBalancedVisualDevice \? "balanced" : "mobile"/,
    "touch may enter the heavier tier only when both explicit hardware signals show headroom");
  assert.doesNotMatch(source,
    /Number\(navigator\.deviceMemory\) \|\| 8|Number\(navigator\.hardwareConcurrency\) \|\| 8/,
    "missing Safari hardware signals must not be mistaken for a high-end phone");
  assert.doesNotMatch(source, /oceanRadialSegments: mobileControls|oceanAngularSegments: mobileControls|carrierSprayCount: mobileControls/,
    "touch input must not independently demote effects after hardware selected the visual tier");
  assert.match(source,
    /oceanRadialSegments: detectedVisualTier[\s\S]*?oceanAngularSegments: detectedVisualTier[\s\S]*?carrierSprayCount: detectedVisualTier/,
    "geometry and event-bearing effect budgets must follow the hardware visual tier");
  assert.match(sceneBuilders,
    /createOceanGeometry\(\s*650000,\s*VISUAL_QUALITY\.oceanRadialSegments,\s*VISUAL_QUALITY\.oceanAngularSegments,/,
    "the production sea geometry must consume the selected hardware tier, not dead config");
  assert.doesNotMatch(sceneBuilders,
    /createOceanGeometry\(\s*650000,\s*mobileControls\s*\?/,
    "touch modality must not bypass the selected sea quality tier");
  assert.match(source,
    /DIRECT_ADAPTIVE_RESOLUTION_CONFIG = normalizeVisualProfile\([\s\S]*?pixelRatioCap: VISUAL_QUALITY\.pixelRatioCap[\s\S]*?\)\.adaptiveResolution/,
    "packless missions must use the same tier-normalized pixel budgets as pack flight");
  assert.match(source,
    /this\.directAdaptiveResolution = new AdaptiveResolutionController\([\s\S]*?minimumPixelRatio: mobileControls \? 1 : 0\.5[\s\S]*?applyDirectRenderPixelRatio/,
    "FlightView must own a direct-path adaptive controller with a phone readability floor");
  assert.match(source,
    /createVisualRuntime\(\{[\s\S]*?minimumPixelRatio: mobileControls \? 1 : 0\.5/,
    "pack flight must receive the same phone readability floor as direct rendering");
  assert.match(source,
    /if \(this\.visualRuntime\?\.initialized\)[\s\S]*?this\.visualRuntime\.resize[\s\S]*?else \{[\s\S]*?this\.directAdaptiveResolution\.setViewport/,
    "pack and direct resolution controllers must never own the renderer simultaneously");
  assert.match(source,
    /view\.update\([\s\S]*?now \/ 1000,[\s\S]*?renderDeltaMs/,
    "FlightView must receive raw RAF time rather than only the simulation catch-up clamp");
  assert.match(source,
    /frameTimeMs: measuredFrameMs,[\s\S]*?activeForeground,[\s\S]*?this\.directAdaptiveResolution\.sample\(measuredFrameMs, \{ activeForeground: true \}\)/,
    "both renderer paths must respond to measured foreground stalls");
  assert.match(source,
    /directResolution: this\.visualRuntime\?\.initialized[\s\S]*?this\.directAdaptiveResolution\.status\(\)/,
    "packless adaptive state must remain inspectable");
  assert.match(source,
    /const recoveryShadowRelevant = isRecoveryPlatform[\s\S]*?2_500 \*\* 2[\s\S]*?shadowMode = replayExternal \? "replay"/,
    "the fixed strip must stop submitting its shadow pass after departure");
  assert.match(source, /this\.sun\.castShadow = mode === "carrier" \|\| mode === "replay"/);
});

test("production keeps the rejected authored cockpit out of the pilot's SA view", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /const PRODUCTION_AUTHORED_COCKPIT_ENABLED = false/);
  assert.match(source,
    /this\.cockpitSlot\.root\.visible = PRODUCTION_AUTHORED_COCKPIT_ENABLED/);
  assert.match(source, /const gunsightAnchor = cockpitRoot\.visible/,
    "a hidden authoring cockpit must not retain ownership of the live gunsight");
});

test("F-22 canopy glass is aircraft-fixed and never admitted for Rapier or external replay", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /createF22CanopyGlass\(THREE\)/);
  assert.match(source, /this\.scene\.add\(this\.f22CanopyGlass\.group\)/);
  assert.match(source,
    /isF22CanopyGlassAirframe\(state\)\s*&&\s*state\.replay_external !== true\s*&&\s*String\(state\.replay_camera \|\| "COCKPIT"\) !== "CHASE"/,
    "live frames default to the cockpit view; defaulting to CHASE made the gate constant-false",
  );
  assert.match(source,
    /updateF22CanopyGlass\(this\.f22CanopyGlass,\s*\{[\s\S]*?position: this\.camera\.position,[\s\S]*?quaternion: this\.playerQuaternion,[\s\S]*?lookQuaternion: this\.camera\.quaternion/,
    "canopy must follow the aircraft eye/body pose rather than become camera-parented",
  );
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
  assert.match(source, /this\.winterPrecipitation\.dispose\(\)/);
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

// Owner directive 2026-07-24: "ditch the 3rd person view". The Auto-GCAS save camera pulled the
// player out to a distant side/chase shot mid-fly-up, which read as confusing rather than
// dramatic. It is deleted, not disabled — historical replay stays the only authority that may
// take the camera out of the cockpit.
test("an Auto-GCAS fly-up never leaves the cockpit view", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.doesNotMatch(source, /gcas_save_camera|GcasSaveCamera|gcasSaveCam/,
    "the third-person Auto-GCAS save camera is deleted, not merely disabled");
  assert.doesNotMatch(source, /GCAS save cam/i,
    "the save camera must not survive as a concept in prose either");
  assert.match(source,
    /this\.externalCameraActive = replayExternal && replayCamera !== "COCKPIT";/,
    "historical replay is the only authority that may take the camera out of the cockpit");
  assert.match(source,
    /this\.playerExteriorSlot\.root\.visible = replayExternal\s*\n\s*&& String\(state\.replay_camera \|\| "CHASE"\) !== "COCKPIT";/,
    "the ownship exterior model is replay-only; a fly-up must never reveal it");
});
