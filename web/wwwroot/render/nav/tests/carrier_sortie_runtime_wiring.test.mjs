import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN,
  carrierSortieRoutePresentation,
  selectCarrierSortieNavigationPresentation,
} from "../carrier_sortie_route_presentation.js";
import {
  syncCarrierSortieTouchRtbControl,
} from "../carrier_sortie_touch_control.js";
import { sortieResultCopy } from "../../debrief/sortie_result.js";

const read = (relativePath) => readFileSync(
  new URL(relativePath, import.meta.url),
  "utf8",
);

const appSource = read("../../../app.js");
const hudSource = read("../../../hud.js");
const indexSource = read("../../../index.html");
const presenterSource = read("../carrier_sortie_route_presentation.js");
const touchAdapterSource = read("../carrier_sortie_touch_control.js");

function routeSnapshot(overrides = {}) {
  return {
    carrier_sortie_route_active: true,
    carrier_sortie_route_profile_id: "PROVISIONAL_KOREA_CARRIER_DAY_V1",
    carrier_sortie_route_phase: "OUTBOUND",
    carrier_sortie_route_phase_code: 3,
    carrier_sortie_route_fix: "OUTBOUND",
    carrier_sortie_route_fix_code: 2,
    carrier_sortie_route_target_x: 8000,
    carrier_sortie_route_target_y: 1378,
    carrier_sortie_route_target_z: 2500,
    carrier_sortie_route_target_bearing_deg: 31.4,
    carrier_sortie_route_target_turn_deg: 12.6,
    carrier_sortie_route_distance_m: 7778.4,
    carrier_sortie_route_target_tas_mps: 154.3332,
    carrier_sortie_route_capture_radius_m: 1100,
    carrier_sortie_route_rtb_available: true,
    carrier_sortie_route_rtb_requested: false,
    ...overrides,
  };
}

function awaitingReturnSnapshot(overrides = {}) {
  return routeSnapshot({
    carrier_sortie_route_phase: "AWAITING_RETURN",
    carrier_sortie_route_phase_code: 5,
    carrier_sortie_route_fix: "TRANSIT",
    carrier_sortie_route_fix_code: 3,
    ...overrides,
  });
}

test("production imports are stamped and every presented state reaches the RTB adapter", () => {
  assert.match(appSource,
    /from "\.\/render\/nav\/carrier_sortie_route_presentation\.js\?v=241";/);
  assert.match(appSource,
    /from "\.\/render\/nav\/carrier_sortie_touch_control\.js\?v=241";/);
  assert.match(hudSource,
    /from "\.\/render\/nav\/carrier_sortie_route_presentation\.js\?v=241";/);
  assert.match(touchAdapterSource,
    /from "\.\/carrier_sortie_route_presentation\.js\?v=241";/);
  assert.match(indexSource, /await import\("\.\/app\.js\?v=241"\);/);

  assert.match(appSource,
    /function renderPilotPhysiology\(state\) \{\s*syncMobileControlProfile\(state\);/);
  assert.match(appSource,
    /function syncMobileControlProfile\(state\)[\s\S]*?syncCarrierSortieTouchRtbControl\(touchCarrierRtbButton, state\);/);
  assert.match(appSource, /renderPilotPhysiology\(presentedState\);/);
});

test("runtime navigation is route then Mesh then Home and malformed active route fails closed", () => {
  const mesh = Object.freeze({ active: true, displayName: "MESH" });
  const home = Object.freeze({ recoveryPointKnown: true, displayName: "HOME" });

  const route = selectCarrierSortieNavigationPresentation(
    routeSnapshot(),
    { mesh, home },
  );
  assert.equal(route.source, "route");
  assert.equal(route.presentation.fixToken, "OUTBOUND");

  assert.deepEqual(selectCarrierSortieNavigationPresentation(
    { carrier_sortie_route_active: false },
    { mesh, home },
  ), { source: "mesh", presentation: mesh });
  assert.deepEqual(selectCarrierSortieNavigationPresentation(
    { carrier_sortie_route_active: false },
    { home },
  ), { source: "home", presentation: home });

  assert.equal(selectCarrierSortieNavigationPresentation(
    routeSnapshot({ carrier_sortie_route_target_x: Number.NaN }),
    { mesh, home },
  ), null, "an active malformed route must not leak stale Mesh/Home guidance");
  assert.equal(selectCarrierSortieNavigationPresentation(
    { carrier_sortie_route_active: "true" },
    { mesh, home },
  ), null, "a malformed active discriminator must fail closed");
});

test("route owns geometry while ETA stays unknown and Home owns only fuel and reserve truth", () => {
  assert.match(appSource,
    /const bearingDeg = route\?\.bearingDeg \?\? selectedMesh\?\.bearingDeg \?\? home\.bearingDeg;/);
  assert.match(appSource,
    /const rangeNm = route\?\.rangeNm \?\? selectedMesh\?\.rangeNm \?\? home\.rangeNm;/);
  assert.match(appSource,
    /const turnDeg = route\?\.turnDeg \?\? selectedMesh\?\.turnDeg \?\? home\.turnDeg;/);
  assert.match(appSource,
    /const etaMinutes = route \? null : selectedMesh\?\.etaMinutes \?\? home\.etaMinutes;/);
  assert.match(appSource,
    /const travelState = route \? null : selectedMesh\?\.travelState \?\? home\.travelState;/);
  assert.match(appSource,
    /const fuelSource = route \? home : \(selectedMesh \?\? home\);/);
  assert.match(appSource,
    /const fuelNeedLb = fuelSource\.fuelToDestLb \?\? fuelSource\.fuelToHomeLb;/);
  assert.match(appSource,
    /const reserveTargetLb = fuelSource\.reserveTargetLb;/);
  assert.doesNotMatch(presenterSource, /etaMinutes|travelState/,
    "the route presenter must not invent a time-to-go or travel-state model");
});

test("the validated route target is immutable and is the map target", () => {
  const route = carrierSortieRoutePresentation(routeSnapshot());
  assert.ok(route);
  assert.equal(Object.isFrozen(route), true);
  assert.equal(Object.isFrozen(route.target), true);
  assert.throws(() => {
    route.target.eastM = -1;
  }, TypeError);
  assert.deepEqual(route.target, {
    eastM: 8000,
    altitudeM: 1378,
    northM: 2500,
  });

  assert.match(appSource, /activePlaceId: route \? null : selectedMesh\?\.placeId \?\? null,/);
  assert.match(appSource, /activeEastM: route\?\.target\.eastM \?\? num\("mesh_active_east_m"\),/);
  assert.match(appSource, /activeNorthM: route\?\.target\.northM \?\? num\("mesh_active_north_m"\),/);
});

test("static RTB markup and the live adapter share the canonical KeyO action", () => {
  const markup = indexSource.match(
    /<button\s+id="touch-carrier-rtb"[^>]*>RTB<br>O<\/button>/,
  )?.[0];
  assert.ok(markup, "the RTB control must be real static markup");
  assert.match(markup, /type="button"/);
  assert.match(markup,
    new RegExp(`data-carrier-route-action="${CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN}"`));
  assert.match(markup, /data-pulse-key="KeyO"/);
  assert.match(markup, /\shidden(?:\s|>)/);
  assert.match(markup, /\sdisabled(?:\s|>)/);
  assert.match(appSource,
    /document\.querySelector\("#touch-carrier-rtb"\)/);

  const button = { hidden: true, disabled: true };
  assert.equal(
    syncCarrierSortieTouchRtbControl(button, awaitingReturnSnapshot()),
    CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN,
  );
  assert.deepEqual(button, { hidden: false, disabled: false });
  assert.equal(syncCarrierSortieTouchRtbControl(
    button,
    awaitingReturnSnapshot({ carrier_sortie_route_target_tas_mps: "154" }),
  ), null);
  assert.deepEqual(button, { hidden: true, disabled: true });
});

test("HUD route guidance and caret own the channel while BARRIER remains terminal", () => {
  assert.match(hudSource,
    /const carrierRoute = carrierSortieRoutePresentation\(state\);\s*const carrierRouteActive = state\?\.carrier_sortie_route_active === true;\s*const routeTurn = carrierRoute\?\.turnDeg;/);
  assert.match(hudSource, /source: "carrier-route",[\s\S]*?turnDeg: routeTurn,/);
  assert.match(hudSource,
    /drawCarrierSortieGuidance\(frame, \{ showModeLine: !mobileTactical \}\);/);
  assert.match(hudSource,
    /const guidanceText = route\.guidanceDirective;\s*const promptText = route\.keyboardPrompt;/);
  assert.match(hudSource,
    /const lines = promptText \? \[guidanceText, promptText\] : \[guidanceText\];/,
    "AwaitingReturn must retain route geometry and add the keyboard prompt as a second line");
  assert.match(hudSource,
    /text: lines\.join\(" \| "\),\s*guidanceDirective: route\.guidanceDirective,\s*keyboardPrompt: route\.keyboardPrompt,/,
    "debug truth must retain both the route directive and RTB prompt");
  assert.match(hudSource,
    /if \(!carrierRouteActive && headingValid[\s\S]*?state\.rtb_steer === true/,
    "generic Home steering must not draw over an active carrier route");
  assert.match(hudSource,
    /drawRtbCue\(state\) \{\s*if \(state\.rtb !== true\) return;[\s\S]*?if \(state\?\.carrier_sortie_route_active === true\) return;/,
    "malformed active route truth must also suppress the generic Home/BINGO cue");
  assert.match(hudSource,
    /carrierRouteCaret: null,\s*carrierSortieRoute: null,\s*boatRtbCaret: null,\s*rtbCue: null,/,
    "HUD debug starts with explicit absence for both route and generic recovery cues");
  assert.match(hudSource, /case "BARRIER":\s*case "TERMINAL":/);
  assert.match(hudSource,
    /\["TERMINAL", "ARRESTED", "STOPPED", "CATAPULT", "BARRIER"\][\s\S]*?\.includes\(hudMode\(state\)\)/);
});

test("Panther copy routes O to the ship and debriefs barrier retention distinctly", () => {
  const barrier = sortieResultCopy({
    mission_definition_id: "mission.korea.panther-sortie.v1",
    carrier: true,
    sortie_outcome: "DRAW",
    recovery: "BarrierEngagement",
    barrier_engagement: true,
    arrest_phase: "STOPPED",
    bolter: true,
    hook_outcome: "MissedWires",
    wire: 0,
    touchdown_grade: "NO GRADE",
    touchdown_deviations: "LINEUP",
    touchdown_primary_correction: "ESTABLISH LINEUP EARLIER",
  });
  assert.equal(barrier.title, "Barrier · Missed wires");
  assert.match(barrier.brief, /raised barrier retained the aircraft aboard/i);
  assert.doesNotMatch(`${barrier.title} ${barrier.brief}`, /trap|bolter|mutual/i);

  assert.match(appSource, /"mission\.korea\.panther-sortie\.v1"/);
  assert.match(appSource,
    /if \(recoveryToken === "BARRIERENGAGEMENT"\)[\s\S]*?"missed wires · retained in barrier"/);
  assert.match(appSource, /configuration: "F9F-2 Panther[^\n]*barrier, no bolter"/);
  assert.match(appSource,
    /controls: "Arrows fly · W\/S power · O returns to ship when the route calls RTB\\nSpace G limiter · H controls"/);
});
