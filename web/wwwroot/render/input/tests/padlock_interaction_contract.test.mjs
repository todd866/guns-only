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
    /trackpadLookActive = true[\s\S]*?padlockTrackEstablished = false[\s\S]*?syncPlayerGunTargetPadlockRollAssist\(\)/,
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
  // Selection binds to a SPECIFIC contact rather than silently following the next one. Now that a
  // wave can be a formation the binding is three-way — primary, wingman, or boat — and the wingman
  // id is derived from the primary's so a promoted survivor cannot inherit a stale lock.
  assert.match(toggle,
    /padlockEntityId = padlockTarget === "carrier" \? "carrier"[\s\S]*?padlockTarget === "wingman"[\s\S]*?\.wingman`[\s\S]*?projectedId\(latestState\?\.bandit_entity_id\)/,
    "selection must bind to the current contact instead of silently following the next one");
  // The pilot shoots the leader and presses V expecting the survivor: acquisition must fall
  // through to the wingman while the primary slot still holds the dead leader.
  const defaultTarget = balancedBlock(appSource, "function defaultPadlockTarget()");
  assert.match(defaultTarget,
    /!padlockTargetValid\(latestState, "bandit"\)[\s\S]*?wingmanPadlockAvailable\(\)[\s\S]*?return "wingman"/,
    "a dead primary must not block acquiring the surviving wingman");
  // V is a VIEW toggle and nothing more. Folding target selection into it meant the only route
  // from one bandit to the other ran through the forward view, which in a 1v2 costs sight of both.
  assert.doesNotMatch(toggle, /padlockTarget = "wingman"/,
    "V must not cycle contacts — that is Tab's job, and cycling via OFF loses the tally");
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
    "function syncPlayerGunTargetPadlockRollAssist()");
  assert.match(syncAssist,
    /padlock[\s\S]*?padlockTarget === "bandit"[\s\S]*?padlockTarget === "wingman"[\s\S]*?padlockTrackEstablished[\s\S]*?!manualLookActive\(\)/,
    "either tracked, unslewed combat-target padlock may request the physical roll hold");
  assert.match(syncAssist,
    /semanticSelection === appliedPlayerGunTargetPadlockRollAssist/,
    "render cadence and unchanged target slots must collapse to semantic transitions");
  assert.match(syncAssist,
    /bridge\?\.SetPlayerGunTargetPadlockRollAssist[\s\S]*?\?\? bridge\?\.SetBanditPadlockRollAssist[\s\S]*?applySelection\(selected\)/,
    "the browser must prefer selected-target semantics, retain the legacy bridge fallback, and never send a render-derived aileron value");
  assert.doesNotMatch(syncAssist, /sensorYaw|sensorPitch|rollError|SetAnalogRollControl/);

  const syncGunTarget = balancedBlock(appSource, "function syncPlayerGunTarget()");
  assert.match(syncGunTarget,
    /syncPlayerGunTargetSelection\(\{[\s\S]*?bridge,[\s\S]*?state: latestState,[\s\S]*?selectedTarget: selectedCombatTarget,[\s\S]*?appliedSlot: appliedPlayerGunTargetSlot/,
    "browser selection state must be reconciled through the tested semantic target helper");
  assert.match(syncGunTarget,
    /appliedPlayerGunTargetSlot = result\.appliedSlot/,
    "the browser must cache only the helper's bridge-verified or kernel-reconciled slot");
  assert.match(appSource,
    /latestState = state;[\s\S]*?syncPlayerGunTarget\(\);[\s\S]*?advanceIncidentReplay/,
    "every hot snapshot must reconcile kernel-side retargeting without waiting for another input edge");

  const release = appSource.slice(
    appSource.indexOf("function releasePadlock("),
    appSource.indexOf("function resetMissionPresentation()"),
  );
  assert.match(release,
    /padlock = false[\s\S]*?syncPlayerGunTarget\(\)[\s\S]*?syncPlayerGunTargetPadlockRollAssist\(\)/,
    "releasing padlock must stand down assist while reconciling the persistent gun target");
  assert.doesNotMatch(release, /selectedCombatTarget\s*=\s*["']/,
    "V release must never change the persistent combat target");

  const acquire = balancedBlock(appSource, "function acquirePadlock(");
  assert.match(acquire,
    /padlockTarget = target[\s\S]*?selectedCombatTarget = target[\s\S]*?syncPlayerGunTarget\(\)/,
    "acquiring or cycling padlock must select the same combat target for the gun");
  assert.match(toggle,
    /padlockTarget = defaultPadlockTarget\(\)[\s\S]*?syncPlayerGunTarget\(\)/,
    "manual padlock acquisition must reconcile without inventing another target");
  const cycle = balancedBlock(appSource, "function cyclePadlockTarget()");
  assert.match(cycle,
    /const nextTarget = selectedCombatTarget === "bandit" \? "wingman" : "bandit"[\s\S]*?selectedCombatTarget = nextTarget[\s\S]*?syncPlayerGunTarget\(\)/,
    "Tab changes the persistent gun target even with the camera forward");
  assert.match(cycle,
    /if \(padlock\)[\s\S]*?acquirePadlock\(selectedCombatTarget, "cycle"\)[\s\S]*?else[\s\S]*?TARGET \$\{selectedNumber\} selected/,
    "Tab only moves the camera when padlock is already active");

  const update = balancedBlock(
    appSource,
    "update(state, dt, nowSeconds, renderFrameMs = dt * 1000)",
  );
  const promotionIndex = update.indexOf("wingmanPadlockPromotedToPrimary({");
  const invalidTargetIndex = update.indexOf("!padlockTargetValid(state, padlockTarget)");
  assert.ok(promotionIndex >= 0 && invalidTargetIndex > promotionIndex,
    "w1-to-primary promotion must preserve the same tally before generic kill-cam handling");
  assert.match(update,
    /wingmanPadlockPromotedToPrimary\(\{[\s\S]*?acquirePadlock\("bandit", "promotion"\)/,
    "a promoted w1 must rebind directly to the primary render slot");

  const updateGimbal = balancedBlock(appSource, "updateGimbal(dt)");
  assert.match(updateGimbal,
    /padlockPhase === "TRACK"[\s\S]*?padlockTrackEstablished = true[\s\S]*?syncPlayerGunTargetPadlockRollAssist\(\)/,
    "assist must wait for first camera acquisition but survive ordinary later servo lag");
  assert.match(updateGimbal,
    /manualLookActive\(\)[\s\S]*?padlockTrackEstablished = false[\s\S]*?syncPlayerGunTargetPadlockRollAssist\(\)/,
    "manual look must stand the assist down and require reacquisition");
  const pointerDown = balancedBlock(appSource,
    'sceneCanvas.addEventListener("pointerdown"');
  assert.match(pointerDown,
    /dragging = true[\s\S]*?padlockTrackEstablished = false[\s\S]*?syncPlayerGunTargetPadlockRollAssist\(\)/,
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
  // The live presentation is one quiet body-fixed action strip. It names the selected target and
  // gives exactly one static ROLL or PULL command; attitude/altitude are compact cross-checks.
  const actionStrip = balancedBlock(
    hudSource,
    "pitchDeg, radarAltFt, sinkFpm, targetPosition, targetLabel,\n  })",
  );
  assert.match(padlockSa, /this\.drawPadlockActionStrip\(frame/,
    "padlock steering must render through the compact action strip");
  assert.match(actionStrip, /action = `ROLL \$\{direction\.toUpperCase\(\)\} \$\{degrees\}/,
    "the selected body-frame roll error must become an explicit signed command");
  assert.match(actionStrip,
    /replace\(\/\^TARGET\\s\+\/, "T"\)[\s\S]*?replace\(\/\^ROLL RIGHT \/, "ROLL R "\)/,
    "the drawn phone label must abbreviate identity and direction without changing guidance truth");
  assert.match(actionStrip, /action = "PULL"/,
    "capture must end the roll task with one unmistakable pull command");
  assert.match(actionStrip, /P \$\{pitchDeg[\s\S]*?B \$\{bankDeg[\s\S]*?radarText/,
    "pitch, bank, and radar altitude must remain compact ownship cross-checks");
  assert.match(actionStrip, /targetForward < -0\.17[\s\S]*?`AFT \$\{/,
    "aft-hemisphere geometry must remain explicit without shoulder prose");
  assert.match(actionStrip, /deliberately not animated/,
    "the action cue must stay static instead of competing with world motion");
  assert.doesNotMatch(actionStrip, /setTransform\(/,
    "the action strip must preserve the HUD's HiDPI canvas transform");
  assert.match(actionStrip,
    /ctx\.save\(\)[\s\S]*?ctx\.translate\(arrowX, arrowY\)[\s\S]*?ctx\.restore\(\)/,
    "arrow-local transforms must be bounded by save/restore");
  assert.doesNotMatch(actionStrip, /padlockAttitudeModel|pitch ladder|bank scale/,
    "the live cue must not recreate the miniature attitude instrument");
  assert.match(padlockSa, /RELEASE LOOK TO REACQUIRE/,
    "temporary manual look must suppress steering and teach the return behavior once");
  assert.match(padlockSa, /ACQUIRING \$\{targetLabel\}/,
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

test("Tab selects a persistent combat target and moves the camera only while padlocked", () => {
  const cycle = balancedBlock(appSource, "function cyclePadlockTarget()");
  assert.match(cycle,
    /selectedCombatTarget = nextTarget[\s\S]*?syncPlayerGunTarget\(\)[\s\S]*?if \(padlock\)/,
    "Tab must change the gun target before considering camera state");
  assert.match(cycle,
    /if \(padlock\)[\s\S]*?acquirePadlock\(selectedCombatTarget, "cycle"\)[\s\S]*?else[\s\S]*?TARGET \$\{selectedNumber\} selected/,
    "forward-view Tab must preserve the view while announcing its new target");
  // The whole point: swap targets while STILL padlocked. A release would centre the gimbal and
  // cost the pilot sight of both aircraft for the seconds it takes to come back.
  assert.doesNotMatch(cycle, /releasePadlock\(/,
    "cycling must never let go of the padlock");
  assert.match(cycle,
    /selectedCombatTarget === "bandit" \? "wingman" : "bandit"[\s\S]*?acquirePadlock\(selectedCombatTarget, "cycle"\)/,
    "Tab must alternate between the live contacts");
  // A key that appears to do nothing reads as a bug. Say why instead.
  assert.match(cycle, /!wingmanPadlockAvailable\(\)[\s\S]*?no other contact/,
    "a lone bandit must announce that there is nothing to cycle to");

  // Anchor on installInput: there are several keydown listeners in app.js and only the flight one
  // may claim Tab.
  const keydown = balancedBlock(appSource, "function installInput(view)");
  assert.match(keydown,
    /event\.code === "Tab"[\s\S]*?readyScreen\.classList\.contains\("visible"\)[\s\S]*?settingsScreen\?\.classList\.contains\("visible"\)[\s\S]*?return/,
    "the menus keep their own Tab focus traps — flight must not steal Tab from them");
  assert.match(keydown, /event\.code === "Tab"[\s\S]*?event\.preventDefault\(\)[\s\S]*?cyclePadlockTarget\(\)/,
    "in flight Tab must cycle targets and not walk browser focus out of the canvas");
});
