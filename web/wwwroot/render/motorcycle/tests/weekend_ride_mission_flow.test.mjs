import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("the browser bridge exposes an authoritative End Ride transition", async () => {
  const bridge = await source("../MotorcycleWebBridge.cs");

  assert.match(bridge, /\[JSExport\]\s+public static void EndRide\(\)/u);
  assert.match(bridge, /EndRide\(\)[\s\S]*?runtime\.Finish\(\)/u);
  assert.match(bridge, /EndRide\(\)[\s\S]*?_accumulatorSeconds = 0\.0/u);
});

test("pause and terminal result are distinct dialogs with explicit actions", async () => {
  const html = await source("weekend-ride/index.html");

  assert.match(html, /id="pause-menu"[^>]*class="mission-overlay mission-pause"[^>]*role="dialog"/u);
  assert.match(html, /id="pause-resume"[\s\S]*id="pause-end"[\s\S]*id="pause-return"/u);
  assert.match(html, /id="ride-result"[^>]*class="mission-overlay mission-result"[^>]*role="dialog"/u);
  assert.match(html, /id="result-retry"[^>]*>Retry<\/button>/u);
  assert.match(html, /id="result-return"[^>]*>Aircraft<\/a>/u);
  assert.match(html, /id="result-correction"[^>]*class="mission-correction"/u);
});

test("a deliberate track-day brief holds authority before the first ride", async () => {
  const [main, html, styles] = await Promise.all([
    source("weekend-ride/main.js"),
    source("weekend-ride/index.html"),
    source("weekend-ride/styles.css"),
  ]);

  assert.match(html, /id="ride-brief"[^>]*class="mission-overlay mission-brief"[^>]*role="dialog"/u);
  assert.match(html,
    /mission-kicker[\s\S]*ride-brief-title[\s\S]*ride-brief-summary[\s\S]*mission-brief-facts[\s\S]*FIRST REP[\s\S]*ride-brief-start[\s\S]*ride-brief-return/u);
  assert.match(main, /function showRideBrief[\s\S]*bridge\.SetPaused\(true\)/u,
    "dispatch must hold runtime authority without masquerading as the pause menu");
  assert.match(main, /function startRideFromBrief[\s\S]*bridge\.SetPaused\(false\)/u);
  assert.match(main, /function startRideFromBrief[\s\S]*document\.body\.dataset\.dispatch = "false"/u);
  assert.match(styles, /body\[data-dispatch="false"\] main \{ grid-template-columns: minmax\(0, 1fr\); \}/u);
  assert.match(styles, /body\[data-dispatch="false"\] aside \{ display: none; \}/u,
    "the reviewed dispatch sidebar must release its track width during the live ride");
  assert.match(main, /if \(!dispatchOpen && !teachingOpen && !paused && !terminal\) bridge\.Advance/u);
  assert.match(main, /focusTarget: canvas/u,
    "controls acknowledgement must return to the live ride surface");
});

test("Escape only owns pause while End Ride owns terminalization", async () => {
  const main = await source("weekend-ride/main.js");

  assert.match(main, /weekendRideEscapeAction\(\{[\s\S]*?onboardingOpen:[\s\S]*?paused,[\s\S]*?terminal,/u);
  assert.match(main, /setRidePaused\(action === "pause"\)/u);
  assert.doesNotMatch(main, /event\.code === "Escape"[\s\S]{0,300}EndRide\(/u);
  assert.match(main, /pauseEnd\?\.addEventListener\("click", endRide\)/u);
  assert.match(main, /function endRide\(\)[\s\S]*?bridge\.EndRide\(\)[\s\S]*?showRideResult/u);
  assert.match(main, /state\.phase === "finished"[\s\S]*?showRideResult\(state\)/u);
});

test("the result follows the shared semantic evidence and next-rep shape", async () => {
  const [main, html, styles] = await Promise.all([
    source("weekend-ride/main.js"),
    source("weekend-ride/index.html"),
    source("weekend-ride/styles.css"),
  ]);

  for (const className of [
    "mission-kicker", "mission-verdict", "mission-metrics", "mission-sectors",
    "mission-correction", "mission-actions", "mission-action--primary",
  ]) assert.match(html, new RegExp(`class="[^"]*${className}`));
  assert.match(main, /weekendRideResult\(state, \{ recordAtStartSeconds \}\)/u);
  assert.match(main, /resultCorrection\.textContent = result\.correction/u);
  assert.match(styles, /\.mission-card > \.mission-correction/u);
});

test("retry and return preserve a deliberate mission handoff", async () => {
  const [main, html] = await Promise.all([
    source("weekend-ride/main.js"),
    source("weekend-ride/index.html"),
  ]);

  assert.equal((html.match(/href="\/\?program=weekend-ride&amp;menu=1"/gu) ?? []).length, 3);
  assert.match(main, /function rideAgain\(\)[\s\S]*?teardownRide\("ride_again"\)[\s\S]*?window\.location\.reload\(\)/u);
  assert.match(main, /RIDE_AGAIN_SESSION_KEY[\s\S]*consumeRideAgainIntent\(\)[\s\S]*startRideFromBrief\(\{ showOnboarding: false \}\)/u,
    "Ride again must skip the already-reviewed brief after reload");
  assert.doesNotMatch(main, /preventDefault[\s\S]{0,200}return_to_aircraft/u,
    "a teardown exception must not cancel the anchors' native navigation");
  assert.match(main, /pagehide[\s\S]*?teardownRide\("pagehide"\)/u);
});

test("dialogs make the background inert and restore focus to the ride surface", async () => {
  const [main, html, styles] = await Promise.all([
    source("weekend-ride/main.js"),
    source("weekend-ride/index.html"),
    source("weekend-ride/styles.css"),
  ]);

  assert.match(html, /<canvas id="scene" tabindex="-1"><\/canvas>/u);
  assert.match(main, /function setMissionBackgroundInert\(inert\)[\s\S]*?node\.inert = inert === true/u);
  assert.match(main, /setMissionBackgroundInert\(paused\)/u);
  assert.match(main, /setMissionBackgroundInert\(true\)/u);
  assert.match(main, /focusOutside = !dialog\.contains\(document\.activeElement\)/u);
  assert.match(main, /event\.stopPropagation\(\)/u,
    "dialog Tab must not leak into ride controls");
  assert.match(main, /canvas\.focus\?\.\(\{ preventScroll: true \}\)/u);
  assert.match(styles, /\.mission-overlay[\s\S]*?inset: 0;/u);
  assert.match(styles, /body\[data-terminal="true"\] #controls-onboarding-reopen/u);
});

test("Weekend Ride owns one shared audio lifecycle from gesture through debrief", async () => {
  const [main, html] = await Promise.all([
    source("weekend-ride/main.js"),
    source("weekend-ride/index.html"),
  ]);

  assert.match(main,
    /import \{[\s\S]*?armFlightAudio,[\s\S]*?setFlightAudioEnabled,[\s\S]*?suspendFlightAudio,[\s\S]*?updateFlightAudio,[\s\S]*?\} from "\.\.\/render\/audio\/flight_audio\.js\?v=\d+"/u,
    "the ride must use the shared audio graph through a release-stamped import");
  assert.match(main, /audio_profile_id = "audio\.yzf-r1\.crossplane\.v1"/u);
  assert.match(main, /updateFlightAudio\(state, \{[\s\S]*?muted: dispatchOpen \|\| teachingOpen \|\| paused \|\| terminal \|\| !playerSettings\.audio/u);
  assert.match(main, /pointerdown", armAudioFromGesture/u);
  assert.match(main, /keydown", armAudioFromGesture/u);
  assert.match(main, /suspendFlightAudio\("weekend-ride-paused"\)/u);
  assert.match(main, /suspendFlightAudio\("weekend-ride-result"\)/u);
  assert.match(main, /function teardownRide\(reason\)[\s\S]*?suspendFlightAudio\(reason\)/u);

  assert.match(html, /id="sound-button"[^>]*aria-pressed="true"/u);
  assert.match(main, /savePlayerSettings\([\s\S]*?audio: Boolean\(nextEnabled\)/u);
  assert.match(main, /event\.code === "KeyM"[\s\S]*?setWeekendAudioEnabled/u);
  assert.match(main, /ride_engine_rpm: state\.rpm/u,
    "audio tuning telemetry must read the projected authority field");
  assert.doesNotMatch(main, /ride_engine_rpm: state\.engine_rpm/u);
});

test("compact touch presentation is honest and removes the prose panel from play", async () => {
  const [main, html, styles] = await Promise.all([
    source("weekend-ride/main.js"),
    source("weekend-ride/index.html"),
    source("weekend-ride/styles.css"),
  ]);

  assert.match(main, /touchPresentation = coarsePointer \|\| touchPreview/u);
  assert.match(html, /device-advisory--brief[^>]*>This ride requires a keyboard or gamepad/u);
  assert.match(html, /device-advisory--play[^>]*>Keyboard or gamepad required · rotate to landscape/u);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*aside \{ display: none; \}/u);
  assert.match(styles, /body\[data-input="touch"\] aside \{ display: none; \}/u);
  assert.match(styles, /@media \(max-height: 520px\)[\s\S]*max-height: calc\(100dvh - 20px\)/u);
});

test("the shared teaching modal holds authority and audio without opening pause", async () => {
  const main = await source("weekend-ride/main.js");

  assert.match(main, /const teachingOpen = onboarding\?\.isOpen\(\) === true;/u);
  assert.match(main, /!dispatchOpen && !teachingOpen && !paused && !terminal/u);
  assert.match(main, /muted: dispatchOpen \|\| teachingOpen \|\| paused \|\| terminal/u);
  assert.doesNotMatch(main, /teachingOpen[\s\S]{0,120}setRidePaused/u,
    "controls teaching is a hold, not a second pause state");
  assert.match(main,
    /if \(dispatchOpen\) return;[\s\S]*if \(onboarding\?\.isOpen\(\) === true\) return;[\s\S]*event\.code === "KeyR"/u,
    "teaching acknowledgement cannot reset, shift, or mutate physics state");
});

test("Weekend Ride widens its rectilinear helmet lens only at low speed", async () => {
  const main = await source("weekend-ride/main.js");

  assert.match(main,
    /advanceLowSpeedLens,[\s\S]*lowSpeedLensTarget,[\s\S]*neutralLowSpeedLens,[\s\S]*low_speed_lens\.js\?v=\d+/u);
  assert.match(main, /wideFovDeg: 74,[\s\S]*cruiseFovDeg: 68,[\s\S]*cruiseSpeedMps: 34/u);
  assert.match(main,
    /rideLens = advanceLowSpeedLens\([\s\S]*lowSpeedLensTarget\(speedMps, WEEKEND_LOW_SPEED_LENS\)[\s\S]*camera\.fov = rideLens\.fovDeg;[\s\S]*camera\.updateProjectionMatrix\(\)/u);
  assert.match(main, /__gunsOnlyWeekendLens[\s\S]*edgeWrapBudget01/u);
});
