import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [appSource, hudSource, indexSource] = await Promise.all([
  new URL("../../../app.js", import.meta.url),
  new URL("../../../hud.js", import.meta.url),
  new URL("../../../index.html", import.meta.url),
].map((url) => readFile(url, "utf8")));

function balancedBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing source marker: ${marker}`);
  const start = source.indexOf("{", markerIndex + marker.length);
  assert.notEqual(start, -1, `missing block after source marker: ${marker}`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (current === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) quote = null;
      continue;
    }
    if (current === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (current === "\"" || current === "'" || current === "`") {
      quote = current;
      continue;
    }
    if (current === "{") depth += 1;
    if (current === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated block after source marker: ${marker}`);
}

function tagAttributes(tag) {
  return Object.fromEntries([...tag.matchAll(
    /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )].map((match) => [match[1], match[2] ?? match[3] ?? match[4] ?? ""]));
}

test("two-finger slew is a temporary manual look and never cancels selected padlock", () => {
  const wheelMarker = 'sceneCanvas.addEventListener("wheel"';
  const wheelBody = balancedBlock(appSource, wheelMarker);
  const wheelTail = appSource.slice(
    appSource.indexOf(wheelMarker) + wheelMarker.length + wheelBody.length,
    appSource.indexOf(wheelMarker) + wheelMarker.length + wheelBody.length + 120,
  );

  assert.match(wheelTail, /passive:\s*false/,
    "the canvas wheel listener must be non-passive so a two-finger look cannot scroll the page");
  assert.match(wheelBody, /event\.preventDefault\(\)/);
  assert.match(wheelBody, /trackpadLookDelta\(event/,
    "wheel input must use the normalized/capped trackpad gesture model");
  assert.match(wheelBody, /applyLookDelta\(/,
    "trackpad deltas must share the same bounded gimbal state as pointer look");
  assert.match(wheelBody, /trackpadLookActive = true/);
  assert.match(wheelBody,
    /trackpadLookActive = true[\s\S]*?padlockTrackEstablished = false[\s\S]*?syncBanditPadlockRollAssist\(\)/,
    "trackpad look must stand down physical assist before the next simulation advance");
  assert.doesNotMatch(wheelBody, /releasePadlock\(|togglePadlock\(|padlock\s*=\s*false/,
    "manual head movement is an override of the camera, not an override of padlock selection");

  const updateGimbal = balancedBlock(appSource, "updateGimbal(dt)");
  assert.match(updateGimbal,
    /if \(manualLookActive\(\)\)\s*\{[\s\S]*?padlockPhase = padlock \? "SLEW" : "FREE";[\s\S]*?return;/,
    "while fingers are down, automatic tracking must yield without changing the selected mode");
  const manualBranch = updateGimbal.match(/if \(manualLookActive\(\)\)\s*(\{[\s\S]*?\n\s*\})/)?.[1] ?? "";
  assert.doesNotMatch(manualBranch, /releasePadlock\(|togglePadlock\(|padlock\s*=/);
});

test("ending a trackpad or pointer look quickly returns to the selected reference", () => {
  const wheelBody = balancedBlock(appSource, 'sceneCanvas.addEventListener("wheel"');
  assert.match(wheelBody, /window\.clearTimeout\(trackpadLookReleaseTimer\)/,
    "continued finger motion must extend one quiet-period release timer");
  assert.match(wheelBody,
    /trackpadLookReleaseTimer\s*=\s*window\.setTimeout\([\s\S]*?trackpadLookActive\s*=\s*false[\s\S]*?gimbalReturnFast\s*=\s*true[\s\S]*?TRACKPAD_LOOK_RELEASE_MS/,
    "after the fingers lift, the camera must enter its quick padlock/forward return path");

  const endDrag = balancedBlock(appSource, "function endDrag(event)");
  assert.match(endDrag, /dragging = false/);
  assert.match(endDrag, /gimbalReturnFast = true/,
    "mouse/pointer slew needs the same release-to-return semantics as a trackpad");
  assert.doesNotMatch(endDrag, /releasePadlock\(|togglePadlock\(|padlock\s*=/);
});

test("padlock owns a specific contact and exposes an honest accessible lifecycle", () => {
  const toggle = balancedBlock(appSource, "function togglePadlock()");
  assert.match(toggle,
    /padlockEntityId = padlockTarget === "bandit"[\s\S]*?projectedId\(latestState\?\.bandit_entity_id\)[\s\S]*?: "carrier"/,
    "selection must bind to the current contact instead of silently following the next one");
  assert.match(appSource,
    /padlockEntityId[\s\S]*?nextBanditEntityId !== padlockEntityId[\s\S]*?releasePadlock\("target changed"\)/,
    "replacement/despawned contacts must explicitly break the old padlock");
  assert.match(appSource,
    /padlockTarget === "carrier"[\s\S]*?carrierPadlockSupersededByCombat\(state\)[\s\S]*?releasePadlock\("combat task"\)/,
    "the trap-to-combat transition must release a stale boat lock before ordinary validity loss");
  assert.match(appSource, /Boat padlock off · V for bandit/,
    "the release announcement must explain the task change and teach the next action");
  assert.match(appSource, /state\.pilot_conscious === false[\s\S]*?releasePadlock/,
    "an incapacitated pilot cannot retain supernatural visual tally");

  const syncUi = balancedBlock(appSource, "function syncPadlockUi(announcement = null)");
  assert.match(syncUi, /classList\.toggle\("active", padlock\)/);
  assert.match(syncUi, /setAttribute\("aria-pressed", String\(padlock\)\)/);
  assert.match(syncUi, /viewStatus\.textContent = announcement/);

  const padlockButtonTag = indexSource.match(/<button\b[^>]*data-pulse-key="KeyV"[^>]*>/)?.[0];
  assert.ok(padlockButtonTag, "touch UI needs the contextual V action");
  assert.equal(tagAttributes(padlockButtonTag)["aria-pressed"], "false",
    "the persistent toggle needs an explicit initial accessibility state");

  const liveTag = indexSource.match(/<[^>]+id="view-status"[^>]*>/)?.[0];
  assert.ok(liveTag, "view mode changes need a screen-reader live region");
  const liveAttributes = tagAttributes(liveTag);
  assert.equal(liveAttributes.role, "status");
  assert.equal(liveAttributes["aria-live"], "polite");
  assert.equal(liveAttributes["aria-atomic"], "true");

  const pulseControls = balancedBlock(
    appSource,
    'touchControls.querySelectorAll("[data-pulse-key]").forEach',
  );
  const padlockToggleIndex = pulseControls.indexOf('if (physicalCode === "KeyV") togglePadlock();');
  const padlockReturnIndex = pulseControls.indexOf('if (physicalCode === "KeyV") return;');
  const transientPulseIndex = pulseControls.indexOf('button.classList.add("active")');
  assert.ok(padlockToggleIndex >= 0 && padlockReturnIndex > padlockToggleIndex,
    "mobile V must drive padlock and then leave persistent UI state to syncPadlockUi");
  assert.ok(transientPulseIndex > padlockReturnIndex,
    "mobile V must return before the generic 140 ms pulse reset");
  assert.match(appSource, /hudFrame\.padlockPhase = padlockPhase/);
  assert.match(appSource, /hudFrame\.manualLookActive = manualLookActive\(\)/);

  const syncAssist = balancedBlock(appSource,
    "function syncBanditPadlockRollAssist()");
  assert.match(syncAssist,
    /padlock && padlockTarget === "bandit"[\s\S]*?padlockTrackEstablished[\s\S]*?!manualLookActive\(\)/,
    "only a tracked, unslewed bandit padlock may request the physical roll hold");
  assert.match(syncAssist, /selected === appliedBanditPadlockRollAssist/,
    "render cadence must collapse to discrete assist-selection transitions");
  assert.match(syncAssist, /bridge\.SetBanditPadlockRollAssist\(selected\)/,
    "the browser must send semantic selection, never a render-derived aileron value");
  assert.doesNotMatch(syncAssist, /sensorYaw|sensorPitch|rollError|SetAnalogRollControl/);

  const updateGimbal = balancedBlock(appSource, "updateGimbal(dt)");
  assert.match(updateGimbal,
    /padlockPhase === "TRACK"[\s\S]*?padlockTrackEstablished = true[\s\S]*?syncBanditPadlockRollAssist\(\)/,
    "assist must wait for first camera acquisition but survive ordinary later servo lag");
  assert.match(updateGimbal,
    /manualLookActive\(\)[\s\S]*?padlockTrackEstablished = false[\s\S]*?syncBanditPadlockRollAssist\(\)/,
    "manual look must stand the assist down and require reacquisition");
  const pointerDown = balancedBlock(appSource,
    'sceneCanvas.addEventListener("pointerdown"');
  assert.match(pointerDown,
    /dragging = true[\s\S]*?padlockTrackEstablished = false[\s\S]*?syncBanditPadlockRollAssist\(\)/,
    "pointer look must stand down physical assist before the next simulation advance");
});

test("padlock retains stabilized primary flight data instead of swapping to a duplicate card", () => {
  assert.match(hudSource, /HudSignalStabilizer/);
  assert.match(hudSource, /this\._signals = new HudSignalStabilizer\(\)/);
  const draw = balancedBlock(hudSource, "draw(frame)");
  assert.match(draw, /this\._signals\.update\(frame\.state, frame\.dt\)/,
    "production draw must consume the presentation-only signal filter every frame");
  assert.match(draw, /const spd = display\.indicatedKts/,
    "speed tape motion must use stabilized IAS, not noisy frame truth");
  assert.match(draw, /value:\s*spd[\s\S]*?displayValue:\s*display\.indicatedDigits/,
    "the IAS scale and hysteretic digits must remain distinct");
  assert.match(draw,
    /drawAirdataLabels\(frame\.state, tapeInset, this\.width - tapeInset, display\)/,
    "secondary G/S and V/S must use the same bounded display filter");
  assert.match(draw, /value:\s*display\.altitudeFt[\s\S]*?displayValue:\s*display\.altitudeDigits/);
  assert.match(draw, /drawHeadingTape\(frame\.state,[^\n]*display/,
    "heading scale/digits must receive stabilized presentation truth");
  assert.doesNotMatch(draw, /if \(!frame\.padlock\)\s*\{\s*const tapeInset/,
    "IAS, altitude, G, power and fuel are primary data and must remain present in padlock");

  const verticalTape = balancedBlock(hudSource, "drawVerticalTape({");
  assert.match(verticalTape, /displayValue/,
    "tape translation and its center digits need independent inputs to prevent digit chatter");
});

test("padlock-only orientation and target cues solve roll-then-pull without permanent clutter", () => {
  assert.match(hudSource, /padlockOrientationModel/);
  assert.match(hudSource, /padlockLiftPlaneModel/);
  assert.match(hudSource, /latchedRectVisibility/,
    "the target box/edge locator boundary needs hysteresis instead of a one-frame hard switch");
  assert.match(hudSource, /this\._gunSolutionCue = new DisplayCueQualifier/,
    "presentation of a marginal gun solution needs qualification; simulation truth remains raw");
  assert.match(hudSource, /visualGunSolution/,
    "qualified gun state must be explicitly display-only");

  const padlockSa = balancedBlock(hudSource, "drawPadlockSa(");
  assert.match(padlockSa, /padlockOrientationModel\(/);
  assert.match(padlockSa,
    /targetRight: this\.relative\.dot\(frame\.playerRight\)[\s\S]*?targetUp: this\.relative\.dot\(frame\.playerUp\)/,
    "roll guidance must come from aircraft body geometry rather than camera-offset pixels");
  assert.match(padlockSa, /wasCaptured: this\._padlockLiftCaptured/,
    "roll-to-pull capture needs hysteresis in the live presentation loop");
  assert.match(padlockSa,
    /padlock_roll_assist_selected[\s\S]*?padlock_roll_error_deg[\s\S]*?padlock_roll_assist_captured/,
    "production symbology and physical hold must consume the same fixed-tick roll-plane truth");
  assert.match(padlockSa,
    /hasOwnProperty\.call\([\s\S]*?padlock_roll_assist_selected[\s\S]*?valid: state\.padlock_roll_assist_selected === true/,
    "a present-but-false kernel selection must not fall back to the zero-dwell JS capture model");
  assert.match(padlockSa, /this\._padlockTrackEstablished[\s\S]*?const steeringAvailable/,
    "ordinary camera-servo lag after first acquisition must not blank physical steering");
  assert.match(padlockSa, /CAMERA SETTLING/,
    "camera lag may be reported but must not masquerade as loss of physical steering");
  assert.match(padlockSa, /rollChevronCount[\s\S]*?drawVectorChevron/,
    "the shortest roll arc needs repeated directional chevrons, not a text instruction");
  assert.match(padlockSa, /lift-plane capture gate[\s\S]*?setLineDash\(\[3, 5\]\)/,
    "the roll destination must be graphically associated with the selected target");
  assert.match(padlockSa, /pullPhase[\s\S]*?drawVectorChevron/,
    "capture must become an outward graphical pull flow along the lift vector");
  assert.doesNotMatch(padlockSa, /ROLL LEFT|ROLL RIGHT|`ROLL \$\{/,
    "tracked padlock steering must not depend on reading left/right command text");
  assert.match(padlockSa, /RELEASE LOOK TO REACQUIRE/,
    "temporary manual look must suppress steering and teach the return behavior once");
  assert.match(padlockSa, /ACQUIRING BANDIT/,
    "camera motion and pilot steering commands must not compete during acquisition");
  assert.match(padlockSa,
    /const steeringAvailable = [\s\S]*?!groundDanger && !centralPullUp/,
    "ground and GCAS warnings must pre-empt combat steering in padlock");
  assert.match(padlockSa, /NOSE/,
    "view-relative ownship nose direction is the essential pull cue");
  assert.match(padlockSa, /padlockPhase|manualLookActive/,
    "the pilot must be told whether padlock is tracking, acquiring, or temporarily slewed");
  assert.match(hudSource, /OWN HDG/,
    "a centred heading tape in an off-axis view must identify itself as ownship heading");

  const bandit = balancedBlock(hudSource, "drawBandit(frame)");
  assert.doesNotMatch(bandit, /if \(!frame\.padlock\)\s*\{\s*const closure/,
    "range and closure belong beside the tracked target even in padlock");
  assert.match(bandit, /targetRangeReadout\(state\.range_m\)/);
  assert.match(bandit, /targetClosureReadout\(state\.closure_kts\)/);
});
