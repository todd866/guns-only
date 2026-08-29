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

test("flight-first UI keeps only steering and flight-critical landing facts", () => {
  for (const field of [
    "casevac_target_relative_bearing_deg",
    "casevac_masking_state",
    "casevac_within_safe_masking_band",
    "casevac_agl_m",
    "casevac_safe_band_min_agl_m",
    "casevac_safe_band_max_agl_m",
    "casevac_power_margin_01",
    "casevac_destination_reserve_kwh",
    "casevac_destination_reserve_min",
    "casevac_lateral_speed_mps",
    "casevac_vertical_speed_mps",
    "casevac_lz_enter_radius_m",
    "casevac_lz_max_lateral_speed_mps",
    "casevac_lz_max_abs_vertical_speed_mps",
  ]) {
    assert.match(source, new RegExp(field), `${field} must be consumed`);
  }
  assert.ok(flightFactsSource.includes("`↑ ${destination} · 000°`"));
  assert.ok(flightFactsSource.includes("`← ${destination} · ${String(Math.abs(rounded))"));
  assert.ok(flightFactsSource.includes("`${destination} · ${String(rounded)"));
  assert.match(flightFactsSource, />AGL</);
  assert.match(flightFactsSource, />SPEED</);
  assert.match(flightFactsSource, />POWER</);
  assert.match(flightFactsSource, />RESERVE</);
  assert.match(source, /data-cvf="groundspeed"/);
  assert.doesNotMatch(flightFactsSource, /data-cvf="wind"/);
  assert.doesNotMatch(flightFactsSource, /CONTACT LIMITS|ENERGY PLAN|WIND VECTOR/);
  assert.match(source, /hold 32–42 m AGL near its 28 m windbreak/,
    "the visible brief must clear the orchard authority rather than advertising a lethal band");
  assert.match(source, /away from the orchard the assessed masking band remains 12–42 m AGL/,
    "route-specific clearance must preserve the authored masking assessment elsewhere");
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
    /const casevacReady = ready && selectedBeat === 13;[\s\S]*readyScreen\.dataset\.casevacReady = String\(casevacReady\)[\s\S]*readyCasevacRouteBriefing\.update\(\{[\s\S]*visible: casevacReady,[\s\S]*routes: state\?\.casevac_routes/);
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

test("CASEVAC suppresses generic grass scatter while preserving normal terrain recovery", () => {
  assert.match(source,
    /const casevacTerrain = isCasevacState\(state\);[\s\S]*const needsAmbientScenery = !casevacTerrain[\s\S]*const needsCasevacScenerySuppression = casevacTerrain[\s\S]*presentation\.disableAmbientScenery/);
  assert.match(source,
    /if \(casevac\) \{[\s\S]*terrainDiagnostics\?\.ambientSceneryEnabled === true[\s\S]*disableAmbientScenery[\s\S]*\} else if \(state\?\.terrain_micro_required !== true/);
  assert.match(source,
    /radarAltitudeFt <= 6_000[\s\S]*terrainDiagnostics\?\.ambientSceneryEnabled === false[\s\S]*enableAmbientScenery/,
    "leaving CASEVAC must retain the normal low-altitude scenery recovery path");
});

test("CASEVAC owns a contrasty warm-key and cool-distance grade", () => {
  assert.match(source,
    /isCasevacState\(state\)[\s\S]*fogLow\.set\(0x6f7054\)[\s\S]*fogHigh\.set\(0x3f5666\)[\s\S]*cloudFogColor\.set\(0x71818a\)/);
  assert.match(source,
    /ambient\.intensity = 0\.6;[\s\S]*sun\.color\.set\(0xffcc82\);[\s\S]*sun\.intensity = 3\.25/);
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
    /const phase = casevacToken\(state\?\.casevac_phase\)[\s\S]*const quiet = state\?\.casevac_quiet === true[\s\S]*casevac_quiet_active === true[\s\S]*phase === "QUIET"/,
  );
  assert.match(
    flightFactsSource,
    /root\.hidden = state\?\.ready === true \|\| state\?\.finished === true \|\| quiet/,
  );
});

test("CASEVAC keeps peripheral vision clear around a stable body-forward optical axis", () => {
  assert.match(source,
    /import \{[\s\S]*advanceLowSpeedLens,[\s\S]*lowSpeedLensTarget,[\s\S]*neutralLowSpeedLens,[\s\S]*low_speed_lens\.js/);
  assert.doesNotMatch(source, /createCasevacCommanderCockpit|casevacCommanderCockpit/);
  assert.doesNotMatch(source,
    /casevacLookYaw|desiredCasevacLookYaw|autoLookActive|casevacBearingDeg \* 0\.74/,
    "the landing target must not steer the pilot's camera");
  assert.doesNotMatch(source,
    /CASEVAC_(?:COAMING|LEFT_PILLAR|RIGHT_PILLAR|TOP_BEAM|WINDSHIELD)/);
  assert.match(source,
    /const casevacForwardView = casevac && !manualLookActive\(\)[\s\S]*casevacForwardView \? 0 : -sensorYaw[\s\S]*casevacForwardView \? -7 \* DEG : sensorPitch/);
  assert.match(source,
    /addScaledVector\(this\.playerUp, casevac \? 1\.15 : 0\.6\)[\s\S]*addScaledVector\(this\.playerForward, casevac \? 1\.25 : 4\.0\)/);
  assert.match(source,
    /casevac[\s\S]*lowSpeedLensTarget\(projectedFinite\(state, "casevac_lateral_speed_mps"\)\)[\s\S]*neutralLowSpeedLens\(\)[\s\S]*advanceLowSpeedLens/);
  assert.match(source,
    /this\.camera\.fov = this\.lowSpeedLens\.fovDeg;[\s\S]*this\.camera\.updateProjectionMatrix\(\)/);
  assert.doesNotMatch(source, /setViewOffset\(/,
    "the low-speed lens must not displace the straight-ahead optical centre");
});

test("portrait touch Medevac keeps combat chips closed and clears the movement stick", () => {
  assert.match(source, /if \(portraitChips\) portraitChips\.hidden = casevac/);
  assert.match(
    indexSource,
    /#portrait-chips\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/,
  );
  assert.match(
    flightFactsSource,
    /@media \(max-width: 760px\) and \(orientation: portrait\)[\s\S]*\.touch-mode\.tilt-fallback \[data-casevac-flight-facts\][\s\S]*bottom: max\(162px, calc\(env\(safe-area-inset-bottom\) \+ min\(36vw, 156px\) \+ 22px\)\)/,
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
    /generation: \+\+terrainLaunchWarmupGeneration,[\s\S]*missionSelector,[\s\S]*missionIdentity,[\s\S]*terrainLaunchWarmupOwner = owner/,
  );
  assert.match(
    source,
    /terrainLaunchWarmupOwner !== owner[\s\S]*ownsCurrentMission = terrainLaunchOwnerMatches\([\s\S]*owner,[\s\S]*selectedTerrainMissionSelector\(\),[\s\S]*latestState/,
  );
});

test("rich CASEVAC debrief supersedes the generic modal and restarts authority", () => {
  assert.match(
    source,
    /const richCasevacDebrief = finished && isCasevacState\(state\)/,
  );
  assert.match(source, /readyScreen\.inert = richCasevacDebrief \|\| settingsPaused/,
    "CASEVAC and settings must each own the generic Ready surface exclusively");
  assert.match(
    source,
    /String\(!showScreen \|\| richCasevacDebrief \|\| settingsPaused\)/,
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
  // The ready chain owns the combined Top Gun carrier pass first, then ordinary combat-handoff
  // custody, then CASEVAC. Those authorities never co-occur, so CASEVAC states still land on
  // disposition + axes.
  assert.match(source,
    /readyConfig\.textContent = carrierHandoff[\s\S]*: result\.handoff[\s\S]*: state\?\.maintenance_scenario[\s\S]*: casevac[\s\S]*\? casevacFacts\.axes/);
  assert.match(source,
    /readyControls\.textContent = carrierHandoff[\s\S]*: result\.handoff[\s\S]*: casevac[\s\S]*Primary correction · \$\{casevacFacts\.correction\}/);
});

test("touch CASEVAC exposes and drives four truthful independent axes", () => {
  assert.match(source,
    /fallbackStickLabel\.textContent = casevac \? "MOVE" : "THR \/ YAW"/);
  assert.match(source,
    /targetStickLabel\.textContent = casevac \? "YAW" : "STICK"/);
  assert.match(source,
    /casevac \? "Yaw control" : "Right stick: pitch and roll"/);
  assert.match(source,
    /casevac[\s\S]*?Drag left or right to yaw\. The control centres when released\./);
  assert.match(source,
    /function updateVirtualStickPointer[\s\S]*?if \(casevac\)[\s\S]*?setCasevacStickAxis\("roll", state\.rollCode\)[\s\S]*?setCasevacStickAxis\("pitch", state\.pitchCode\)/,
    "left touch must own translation and forward/reverse through the CASEVAC key grammar");
  assert.match(source,
    /function syncVirtualStickKeyboard[\s\S]*?isCasevacState\(latestState\)[\s\S]*?setCasevacStickAxis\("roll"[\s\S]*?setCasevacStickAxis\("pitch"/,
    "accessible arrow operation must use the same CASEVAC movement grammar");
  assert.match(source,
    /function updateTargetStickPointer[\s\S]*?if \(casevac\)[\s\S]*?setCasevacStickAxis\("yaw", state\.rollCode === "ArrowLeft"[\s\S]*?"KeyA"[\s\S]*?"KeyD"/,
    "right touch must own yaw without advertising fighter pitch/roll");
  assert.match(source,
    /function applyFlightStick\(\)[\s\S]*?if \(isCasevacState\(latestState\)\)[\s\S]*?releaseDirectFlightAxes\("touch"\)[\s\S]*?return false/,
    "fighter tilt trim must not leak analog lateral translation into CASEVAC");
  assert.match(source,
    /function releaseVirtualStick\(\)[\s\S]*?releaseCasevacStickAxes\("roll", "pitch"\)/);
  assert.match(source,
    /function releaseTargetStick\(\)[\s\S]*?releaseCasevacStickAxes\("yaw"\)/);
  assert.match(source,
    /const casevacReady = selectedBeat === 13 \|\| isCasevacState\(state\);[\s\S]*?casevacReady[\s\S]*?LEFT STICK forward\/reverse\/translate · RIGHT STICK yaw · VERT climb\/descend · ABORT requests return[\s\S]*?Medevac has no target, padlock, or gun controls/,
    "the Ready briefing must teach the CASEVAC touch surface instead of fighter controls");
});

test("CASEVAC Ready copy does not promise the fighter-only gamepad mapping", () => {
  assert.match(source,
    /: casevacReady\s*\? keyboardControls\s*:\s*`\$\{keyboardControls\}\\nController: LS fly/,
    "desktop CASEVAC must stop at its truthful keyboard contract");
});
