# Top Gun build slice

Items 1, 2 and 4 from the 25 Sep 2026 audit. Items 3 and 5 were left.

## 1. Merge on the water

The Tomcat, the MiG-28 and the Case I initial now share the surveyed eastern sea, 8 km east and 20 km north of the old hull point at (30464, 0). That point's sea runs north, but 7 nm south of it is the coast. The ship is 7 nm ahead of the Tomcat's nose, still heading north at 12 m/s, so the pattern translates. The 3 nm initial is inside an 8 nm run from the merge. Terrain placement stays at the origin; this cell did not need a new source anchor.

Procedure source: public Case I picture (initial about 3 nm astern). The old 16 nm steppe cruise was dead time, not a procedure.

Tests: `TopGunEnvironmentTests.MergeAndCaseIInitialShareTheCarriersSurveyedWater`, plus the existing hull-water margin test.

Proof: `.grok-shots/topgun-flight.png` (heading 359, water ahead, ENGAGE strip). The deck is 7 nm ahead at 10,000 ft, so it is a small object on that water rather than a nav symbol. `.grok-shots/topgun-menu.png` shows the two-splash card. Hardware renderer: ANGLE Metal, Apple M5.

Not done: a SoCal atlas, a range boundary, a divert, or a tanker.

## 2. ENGAGE until a jet is down

Handoff phase Available no longer paints "CONTINUE OR RECOVER" while the bandit is the job. The strip stays on ENGAGE. RTB copy remains on the replacement window and on an already-latched return. The picker contract is "Splash two MiG-28s · trap aboard" (middle dot kept so it matches the other programme cards).

Tests: `mission_guidance.test.mjs` ("phase Available, engagement 1, bandit alive" expects `top-gun-engage`). The old `top-gun-continue` assertion was the behaviour this change removes.

Proof: `.grok-shots/topgun-flight.png` objective strip, `.grok-shots/topgun-menu.png` card.

Not done: hiding the O knock-it-off control. Leaving early is still a key, not the headline.

## 4. Case I configuration is the pilot's

Production Top Gun starts with configuration automation off, hook up, gear up, flaps up. U toggles the hook. G and the flap keys are unchanged. A deck contact that would have been the 3-wire is a bolter (`MissedWires`) until the hook is down, the gear is down and locked, and the flaps are at the approach setting. `?configurationPractice=1` turns the existing pattern automation back on, including the hook, and is the practice option.

Procedure source: the hook is down before the ball; gear and flaps are selected on the downwind, not by the aeroplane. Lessons in `mesh_nd_chrome.js` were already that sentence and were left as written.

Tests: `TopGunContinuousCarrierRtbTests.UnconfiguredCaseIPassAtTheThreeWireIsABolter`. `StartConfiguredCarrierRtb` now opts into practice so the stopped-trap test still proves a configured arrestment. `player_action_contract.test.mjs` covers U / `HookToggle` / `hook_down`.

Proof: the kernel test is the groove-contact evidence. The 14-second flight frame is still the merge, so it does not show the groove lesson.

Not done: DLC, on-speed AoA as a separate instrument, a ball call, or Rapier radio with the names swapped.

## Left for later

Item 3 (MiG heater) and item 5 (joker and a military/afterburner split).
