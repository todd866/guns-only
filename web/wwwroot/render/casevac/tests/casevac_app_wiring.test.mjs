import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../../../app.js", import.meta.url);
const source = await readFile(appUrl, "utf8");
const indexSource = await readFile(
  new URL("../../../index.html", import.meta.url),
  "utf8",
);
const flightFactsStart = source.indexOf(
  "function createCasevacFlightFactsPresentation",
);
const flightFactsEnd = source.indexOf(
  "\nfunction aircraftAlive",
  flightFactsStart,
);
const flightFactsSource = source.slice(flightFactsStart, flightFactsEnd);

test("production app owns a bounded CASEVAC presentation lifecycle", () => {
  assert.match(source,
    /import \{ createCasevacCourseScenery \} from "\.\/render\/casevac\/casevac_course_scenery\.js"/);
  assert.match(source,
    /import \{ createCasevacCollisionScenery \} from "\.\/render\/casevac\/casevac_collision_scenery\.js"/);
  assert.match(source,
    /import \{ createCasevacRouteBriefing \} from "\.\/render\/casevac\/casevac_route_briefing\.js"/);
  assert.match(source,
    /import \{ createCasevacRouteLandmarks \} from "\.\/render\/casevac\/casevac_route_landmarks\.js"/);
  assert.match(source,
    /casevacDebriefModel,[\s\S]*createCasevacMissionPresentation,[\s\S]*casevac_mission_presentation\.js/);
  assert.match(source,
    /function casevacResolvedAnchors\(state\)[\s\S]*casevac_pickup_x[\s\S]*casevac_receiver_x[\s\S]*z: -pickup\.z[\s\S]*z: -receiver\.z/);
  assert.match(source,
    /createCasevacCourseScenery\(THREE, \{[\s\S]*anchors,[\s\S]*capsuleCustody: casevacCapsuleVisualState\(state\)/);
  assert.match(source,
    /createCasevacCollisionScenery\([\s\S]*state\.casevac_collision_obstacles/);
  assert.match(source,
    /createCasevacRouteLandmarks\(\s*THREE,\s*state\.casevac_routes,\s*\)/);
  assert.match(source,
    /resetCasevacPresentation\(\) \{[\s\S]*casevacScenery\?\.dispose\(\)[\s\S]*casevacCollisionScenery\?\.dispose\(\)[\s\S]*casevacRouteLandmarks\?\.dispose\(\)[\s\S]*casevacMissionUi\?\.dispose\(\)[\s\S]*casevacFlightFacts\?\.dispose\(\)/);
  assert.match(source,
    /presentationKey !== this\.casevacPresentationKey[\s\S]*this\.resetCasevacPresentation\(\)/);
});

test("flight-first UI exposes steering, route, power and authored contact limits", () => {
  for (const field of [
    "casevac_target_relative_bearing_deg",
    "casevac_masking_state",
    "casevac_within_safe_masking_band",
    "casevac_agl_m",
    "casevac_safe_band_min_agl_m",
    "casevac_safe_band_max_agl_m",
    "casevac_power_margin_01",
    "casevac_energy_remaining_kwh",
    "casevac_energy_remaining_fraction",
    "casevac_energy_planning_endurance_min",
    "casevac_destination_reserve_kwh",
    "casevac_destination_reserve_min",
    "casevac_energy_planning_power_kw",
    "casevac_energy_planning_ground_speed_mps",
    "casevac_energy_planning_arrival_allowance_s",
    "casevac_lz_enter_radius_m",
    "casevac_lz_max_lateral_speed_mps",
    "casevac_lz_max_abs_vertical_speed_mps",
    "casevac_lz_max_abs_pitch_deg",
    "casevac_lz_max_abs_bank_deg",
  ]) {
    assert.match(source, new RegExp(field), `${field} must be consumed`);
  }
  assert.match(source, /TARGET AHEAD/);
  assert.match(source, /TARGET LEFT/);
  assert.match(source, /TARGET RIGHT/);
  assert.match(source, />GROUND SPEED</);
  assert.match(source, />WIND VECTOR</);
  assert.match(source, />ENERGY</);
  assert.match(source, />DEST RESERVE</);
  assert.match(source, /data-cvf="groundspeed"/);
  assert.match(source, /data-cvf="wind"/);
  assert.match(source, /the assessed safe masking band is 12–42 m AGL/);
  assert.match(source,
    /enter within 6 m at no more than 0\.45 m\/s lateral speed and 0\.25 m\/s vertical speed/);
  assert.match(source, /absolute pitch and bank at or below 5°/);
  assert.match(source, /remain stable for 2 seconds/);
  assert.match(source,
    /event\.code === "KeyN" && isCasevacState\(\)[\s\S]*\? 10[\s\S]*pressMappedKey\(event\.code, "keyboard", gkey\)/);
  assert.doesNotMatch(source,
    /function rebuildKeyboardMap\(\)[\s\S]*keyMap\.set\("KeyN", 10\)[\s\S]*rebuildKeyboardMap\(\)/);
  assert.match(source, /touchGkeyByDefaultCode\.set\("KeyN", 10\)/);
  assert.match(source,
    /Arrows command horizontal motion · W\/S vertical · A\/D yaw[\s\S]*N requests a controlled abort before loading/);
  assert.match(source,
    /touchThrottleRockerLabel\.textContent = casevac \? "VERT" : "PWR"/);
  assert.match(source,
    /touchWaveOffButton\.dataset\.holdKey = casevac \? "KeyN" : "KeyW"/);
  assert.match(source, /touchWaveOffButton\.innerHTML = casevac \? "ABORT<br>N"/);
  assert.match(source,
    /Drag up to move forward, down to reverse, or left and right to translate/);
  assert.match(source,
    /readyCasevacRouteBriefing\.update\(\{[\s\S]*visible: ready && selectedBeat === 13,[\s\S]*routes: state\?\.casevac_routes/);
});

test("scenery receives only projected CASEVAC environment and custody facts", () => {
  assert.match(source,
    /windX: projectedFinite\(state, "casevac_wind_x_mps"\) \?\? 0/);
  assert.match(source,
    /windZ: -\(projectedFinite\(state, "casevac_wind_z_mps"\) \?\? 0\)/);
  assert.match(source,
    /const projectedVisibilityM = casevac[\s\S]*state\.casevac_visibility_m/);
  assert.match(source,
    /casevac \? state\.casevac_wind_x_mps : state\.wind_x_mps/);
  assert.match(source,
    /casevac \? state\.casevac_wind_z_mps : state\.wind_z_mps/);
  assert.match(source, /casevac_precipitation_01/);
  assert.match(source, /casevac_rotor_wash_intensity_01/);
  assert.match(source, /casevac_rotor_wash_radius_m/);
  assert.match(source, /casevac_surface_contact/);
  assert.match(
    source,
    /const showEscapeCue = state\?\.casevac_show_escape_cue === true;[\s\S]*const activeCourseCueSite = showEscapeCue[\s\S]*CASEVAC_PICKUP_SITE_ID[\s\S]*activeSiteId: activeCourseCueSite,[\s\S]*showEscapeCue,/,
  );
  assert.match(
    source,
    /presentationDiagnostics\(\)[\s\S]*pickupEscapeCueVisible[\s\S]*visibleEscapeCueCount/,
  );
  assert.match(source,
    /capsuleCustody: casevacCapsuleVisualState\(state\)/);
  assert.doesNotMatch(source,
    /syncCasevacPresentation\(state\)[\s\S]*windX: projectedFinite\(state, "wind_x_mps"\)/);
});

test("ordered observer-safe events feed the CASEVAC stream without payload copy", () => {
  assert.match(source,
    /function casevacObserverEvents\(state\)[\s\S]*casevac_recent_events[\s\S]*schemaVersion[\s\S]*sequence[\s\S]*kind/);
  assert.match(source,
    /Deliberately drop all payload\/free-form copy/);
  assert.match(source,
    /this\.casevacMissionUi\?\.update\(\{[\s\S]*streamId: casevacEventStreamId\(state\),[\s\S]*events: casevacObserverEvents\(state\),[\s\S]*quiet:[\s\S]*debrief,/);
});

test("nullable CASEVAC projections stay absent and retain complete correction evidence", () => {
  assert.match(source,
    /function optionalFinite\(value\)[\s\S]*value === null[\s\S]*value === undefined/);
  assert.match(source,
    /function projectedFinite\(state, \.\.\.fields\)[\s\S]*optionalFinite\(state\?\.\[field\]\)/);
  assert.match(source,
    /function selectedCasevacAxis\(source, fields\)[\s\S]*optionalFinite\(source\?\.\[field\]\)/);
  assert.match(source,
    /correction: \{[\s\S]*count: optionalFinite\(correction\.count\)[\s\S]*marginPercent: optionalFinite\(correction\.marginPercent\)[\s\S]*site: casevacToken\(correction\.site\)/);
});

test("quiet aftermath is skippable only after one completed viewing", () => {
  assert.match(source,
    /CASEVAC_QUIET_SEEN_STORAGE = "guns-only\.casevac-quiet-seen\.v1"/);
  assert.match(source,
    /function observeCasevacQuietCompletion\(state\)[\s\S]*casevacQuietSeen = true[\s\S]*localStorage\?\.setItem\(CASEVAC_QUIET_SEEN_STORAGE, "1"\)/);
  assert.match(source,
    /if \(casevacQuietSeen\) bridge\?\.RequestCasevacQuietSkip\?\.\(\)/);
  assert.match(source, /skippable: casevacQuietSeen/);
});

test("narrow QUIET gives the handoff card sole ownership of the lower safe area", () => {
  assert.match(
    flightFactsSource,
    /@media \(max-width: 760px\)[\s\S]*bottom: max\(86px,/,
  );
  assert.match(
    flightFactsSource,
    /const quiet = state\?\.casevac_quiet === true[\s\S]*casevac_quiet_active === true[\s\S]*casevacToken\(state\?\.casevac_phase\) === "QUIET"/,
  );
  assert.match(
    flightFactsSource,
    /root\.hidden = state\?\.ready === true \|\| state\?\.finished === true \|\| quiet/,
  );
});

test("portrait touch Medevac keeps combat chips closed and clears the movement stick", () => {
  assert.match(source, /if \(portraitChips\) portraitChips\.hidden = casevac/);
  assert.match(
    indexSource,
    /#portrait-chips\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/,
  );
  assert.match(
    flightFactsSource,
    /@media \(max-width: 760px\) and \(orientation: portrait\)[\s\S]*\.touch-mode\.tilt-fallback \[data-casevac-flight-facts\][\s\S]*bottom: max\(136px, calc\(env\(safe-area-inset-bottom\) \+ 136px\)\)/,
  );
});

test("keyboard launch primes Medevac audio from the Enter gesture", () => {
  assert.match(
    source,
    /function primeSelectedMissionAudio\(\)[\s\S]*activeView\?\.hud\.armAudio\(\);[\s\S]*selectedBeat === 13[\s\S]*primeCasevacAudio\(\)/,
  );
  assert.match(
    source,
    /event\.code === "Enter" \|\| event\.code === "NumpadEnter"[\s\S]*primeSelectedMissionAudio\(\);[\s\S]*activateReadyAction\(\);/,
  );
});

test("catalogue selection stages fresh Medevac authority without auto-departure", () => {
  assert.match(
    source,
    /function refreshStagedMissionSnapshot\(\)[\s\S]*bridge\.RefreshHotFrame\(\);[\s\S]*latestState = snapshotSource\.frame\(performance\.now\(\)\)/,
  );
  assert.match(
    source,
    /function enterReady\([\s\S]*bridge\.StartBeat\(selectedBeat\);[\s\S]*refreshStagedMissionSnapshot\(\);[\s\S]*return latestState;/,
  );
  assert.match(
    source,
    /function selectCampaignNode\([\s\S]*autoLaunchPending = false;[\s\S]*pauseReasons\.has\("ready"\)[\s\S]*enterReady\(\{ resetBridge: true, focus: false \}\)/,
  );
  assert.match(
    source,
    /function launchMission\([\s\S]*stagedState = refreshStagedMissionSnapshot\(\);[\s\S]*prepareMissionTerrain\(index, stagedState\)/,
  );
  assert.match(source, /function prepareMissionTerrain\(index, stagedState\)/);
  assert.doesNotMatch(
    source,
    /function prepareMissionTerrain\(index, stagedState\)[\s\S]*snapshotSource\?\.frame/,
  );
  assert.match(
    source,
    /function resetMissionPresentation\(\) \{[\s\S]*cancelTerrainLaunchWarmup\(\)/,
  );
  assert.match(
    source,
    /function cancelTerrainLaunchWarmup\(\)[\s\S]*terrainLaunchWarmupOwner = null;[\s\S]*owner\.cancel\?\.\(\);[\s\S]*cancelTerrainPresentationRequest[\s\S]*markFailed: false/,
  );
  assert.match(
    source,
    /cancelTerrainPresentationRequest\([\s\S]*markFailed = true[\s\S]*if \(markFailed\)[\s\S]*Terrain warmup timed out[\s\S]*terrainPresentationFailureKey = null/,
  );
  assert.match(
    source,
    /generation: \+\+terrainLaunchWarmupGeneration,[\s\S]*missionIdentity,[\s\S]*terrainLaunchWarmupOwner = owner/,
  );
  assert.match(
    source,
    /terrainLaunchWarmupOwner !== owner[\s\S]*ownsCurrentMission[\s\S]*owner\.missionIdentity/,
  );
});

test("rich CASEVAC debrief supersedes the generic modal and restarts authority", () => {
  assert.match(
    source,
    /const richCasevacDebrief = finished && isCasevacState\(state\)/,
  );
  assert.match(source, /readyScreen\.inert = richCasevacDebrief/);
  assert.match(
    source,
    /String\(!showScreen \|\| richCasevacDebrief\)/,
  );
  assert.match(
    source,
    /readyScreen\.dataset\.richDebrief = String\(richCasevacDebrief\)/,
  );
  assert.match(
    indexSource,
    /#ready-screen\[data-rich-debrief="true"\] \.ready-card\s*\{[\s\S]*?visibility:\s*hidden/,
  );
  assert.match(
    source,
    /onFlyAgain: \(\) => \{[\s\S]*primeSelectedMissionAudio\(\);[\s\S]*restartMissionNow\(\);/,
  );
});

test("no-opponent CASEVAC never constructs a bandit frame or emits combat presentation", () => {
  assert.match(source,
    /const opponentPresent = opponentPresentationAllowed\(state\)/);
  assert.match(source,
    /const banditFrame = opponentPresent[\s\S]*\? this\.frameFromState\(state, "b", this\.banditFrame\)[\s\S]*: null/);
  assert.doesNotMatch(source,
    /const banditFrame = this\.frameFromState\(state, "b", this\.banditFrame\)/);
  assert.match(source,
    /this\.targetSlot\.root\.visible = opponentPresentationAllowed\(state\)/);
  assert.match(source,
    /isCasevacState\(\) && \(gkey === 8 \|\| gkey === 9\)/);
  assert.match(source,
    /if \(opponentPresent\) \{[\s\S]*this\.consumeCombatEvents\(state, nowSeconds\)/);
  assert.match(source,
    /muted: casevac[\s\S]*triggerHeld: !casevac && isGkeyHeld\(8\)/);
  assert.match(source,
    /if \(casevacPresentationActive\) \{[\s\S]*cockpitRoot\.visible = false;[\s\S]*playerExteriorRoot\.visible = false/);
  assert.match(source,
    /hudCanvas\.style\.visibility = "hidden"/);
});

test("finished Medevac screen uses disposition and four independent axes", () => {
  assert.match(source,
    /const casevacFacts = casevac \? casevacFinishedFacts\(state\) : null/);
  assert.match(source,
    /if \(casevac\) readySortieLabel\.textContent = "Disposition"/);
  assert.match(source,
    /if \(casevac\) readyConfigLabel\.textContent = "Independent assessment"/);
  assert.match(source,
    /readyConfig\.textContent = state\?\.maintenance_scenario[\s\S]*: casevac[\s\S]*\? casevacFacts\.axes/);
  assert.match(source,
    /readyControls\.textContent = casevac[\s\S]*Primary correction · \$\{casevacFacts\.correction\}/);
});
