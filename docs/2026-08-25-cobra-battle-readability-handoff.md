# Cobra holistic/readability handoff — Build 348

## Current truth

This branch is a substantial Cobra mission-flow and presentation pass. It has **not** been
committed, pushed or deployed.

- Hold the Bridge now briefs and presents one readable sequence: ingress with Ember Lead, destroy
  the objective-locking fortified gun pit, clear/cover the lift, hold the point majority, then RTB
  to Camp Ember and debrief.
- Cobra's two route-cue layers stay fixed in world space. The amber ladder no longer rebuilds from
  ownship every 25 m or animates brightness down the sequence; only a new authority gate/objective
  can replace it.
- The flight brief now teaches the essential flight/fight/map/pause controls and Start goes straight
  to a focused cockpit. It deliberately acknowledges the Cobra lesson instead of opening a second
  controls modal. H still opens the full reference after launch, and brief/map/pause/debrief/control
  layers are mutually exclusive.
- The internal `.garrison` identifier is no longer player copy. Authority publishes distinct
  `fortified` and `objective_lock` semantics; first Tab prioritises the locking gun pit even when a
  secondary hard point is closer. Ordinary hard points read as **GUN POSITION**.
- BINGO is a persistent amber cockpit caution during a live fight instead of an unreachable
  post-combat order. The minimap's third row again carries points, tickets and winning/losing/
  stalemate state rather than repeating objective and AA information already on the HUD.
- The formerly hidden ten-minute combat limit is authority-owned end to end. The brief explains
  contact-start timing and the point/ticket/dead-heat verdict; map chrome protects `T-m:ss` at its
  right edge, terminal state reads FINAL, and timeout debriefs name the actual deciding board.
- Iron Bell is an intact, supported two-lane crossing. The locking hostile pit and friendly hard
  point sit on opposite dry bridgeheads; ground movement rejects the river and combat refinements
  use the exact authored sites.
- Reciprocal ground fire is authority-backed and wall-clock honest. Tapered faction-coloured
  packets leave exact muzzles, directional flashes point at the recorded target, heavy weapons use
  one low powder lobe, and screenshots cannot accumulate seconds of VFX in a few milliseconds.
  The final profile raises only packet width/opacity; effect count, lifetime and draw cost are
  unchanged.
- Plantation is now a route-aligned, terrain-following 340 x 295 m worked parcel with a clear tower
  yard. An upward-normal regression prevents the former failure where valid rows were silently
  back-face culled. The unchanged scenery score rose from 146 to 497.
- Camp Ember's proof camera is on the real 300-degree final. The existing one-draw firebase now has
  more vertical shelters, armed rosettes and a ragged dead-tree perimeter; parked Cobras add a
  distinct glazed canopy and an off-axis rotor silhouette. Apron/rosette/scar triangle winding now
  faces upward instead of being silently culled, and the building-sized red slab on final is a low
  ground-seated approach board.
- Rigid paddies and village compounds now qualify their complete terrain footprint. Streamed Iron
  Bell villages are tested at the actual resident camera position: valid valley compounds remain,
  while the steep gorge-wall piles that looked like bridge debris are rejected.
- Long Fang navigation authority remains, but the fake freestanding slab/obelisk is suppressed.
  A future waterfall must be cut into the heightfield or supplied as authored terrain art; an
  absent honest landmark is preferable to a white wall planted beside the river.

## Owner-flight correction — 2026-08-27

The 42.4-second, 2374×1510 recording showed tightly packed guidance, a persistent centred Lead
caption and weak battle readability. The result screenshot was zero-heavy and repetitive. The video
had no audio stream, so it matched but could not prove the reported silence. Its static preview also
returned HTTP 501 to telemetry POSTs; `web-cobra-*` discovery is fixed, but that server still cannot
ingest a human run.

The prior performance harness waited for Ready but never crossed the visible brief, so it measured
a paused card. A real Apple M5/Metal player-path run exposed the failure:

| Metric | Before | After |
|---|---:|---:|
| Ready | 9.92 s | 1.996 s |
| Input acknowledgement | 948 ms | 16.6 ms |
| Delivered frame rate | 7.36 fps | ~60 fps |
| Frame p95 | 184 ms | 17.3 / 17.6 ms (departure/battle) |
| Terrain-wind field evaluations | 720/s | 60/s |

The cause was CPU authority work, not GPU fill. Terrain and five rotor/tail samples now refresh
deterministically at 10 Hz and hold between 120 Hz authority ticks. Ground-unit geometry is cached
by role, objective focus no longer expands global terrain offsets, and brief/runtime/assets start in
parallel. The replacement hardware gate crosses Start, proves input-to-authority, then measures both
normal departure and live battle.

Player-facing corrections in the same pass:

- Guidance is 12 cues at 120 m spacing with 160 m lookahead.
- Lead calls are short, upper-left and limited to 3.2 seconds.
- Brief and pause expose saved Sound state; Start re-arms enabled audio.
- Debriefs remove internal IDs, zero-value secondary facts and the repeated retry hint.
- Cobra, Okanagan and Weekend Ride enforce terse summary, correction and action copy.
- F-22 promotion ends the survivor's presentation orbit so tactical AI recommits.

A separate closed-loop AI pilot now drives the same standard-gamepad flight path as production and
uses production keyboard Tab/F for target selection and consent. The `engage` goal requires ordered
Depart → Ingress → Engage, real gate-volume entries, visible reciprocal fire, stable world-locked
combat guidance, a selected target, gunner authorization, ammo expenditure, selected-target damage,
zero friendly kills, no protected-departure fire and advancing telemetry.

The final Build 348 full engagement run passed: Ready 1.283 s, Start response 391 ms, 3,546 m
travelled, 185.5 seconds airborne, five gate-volume entries, 119.978 Hz authority and no stall.
Both factions' fire was visible from 172.25 seconds; the gunner authorized at 190.30 seconds and the
same sample carried the selected garrison's authority `gun-hit`. One round dealt exactly 0.55 damage.
Across 162 combat samples, the guidance rebuild count remained unchanged and no time-driven shader
path existed.

That run exposed a real bridge-targeting defect missed by the previous harness. Ground units publish
a ground/reference position, and the LOS march aimed at that low point; Iron Bell's raised roadway
therefore masked its own gun pit near the endpoint. Visual lock, cached gunner LOS, turret geometry,
HUD designation and padlock now share one raised authority aim point. A regression reproduces the
base-point mask and proves the shared point remains visible.

## Latest visual acceptance

Fresh full-resolution silent captures:

- `/tmp/guns-only-battle-stills-holistic-346/cockpit-battle.png`
- `/tmp/guns-only-battle-stills-holistic-346/plantation-fight.png`
- `/tmp/guns-only-battle-stills-holistic-346/iron-bell.png`
- `/tmp/guns-only-battle-stills-holistic-346/camp-ember.png`
- `/tmp/guns-only-battle-stills-holistic-346/mid-gorge.png`
- `/tmp/cobra-ai-engage-348-final2/cobra-ai-engage.png`
- `/tmp/cobra-ai-engage-348-final2/cobra-ai-battle.png`
- `/tmp/cobra-ai-engage-348-final2/cobra-ai-flight.png`

The unchanged scenery gate passes every view, and exact render/authority battle evidence passes in
the cockpit, Iron Bell and Plantation frames. These are the final republished scores after the
subdued Plantation palette, Camp winding and approach-board corrections:

| View | Edge | Spatial | Heterogeneity | Result |
|---|---:|---:|---:|---|
| Camp Ember | 9.30 | 887.6 | 0.990 | PASS |
| Cockpit battle | 14.38 | 1162.9 | 0.727 | PASS |
| Iron Bell | 13.90 | 638.7 | 0.549 | PASS |
| Mid-gorge | 4.95 | 295.2 | 0.648 | PASS |
| Plantation fight | 17.47 | 388.1 | 0.388 | PASS |

Do not treat these numbers as the sign-off by themselves. Every capture above was also inspected at
original resolution.

## Project-wide shell improvements in the same pass

- Unselected aircraft cards retain sortie and aircraft identity instead of becoming unlabeled
  photographs on touch.
- Desktop pause says **ESC · PAUSE**, Escape appears in H quicklook, and broken systems/navigation
  console focus and OPEN/CLOSE CSS selectors are repaired.
- Saved audio preference now carries into Cobra and Okanagan. Root-to-standalone and standalone
  return transitions preserve only the explicit `audioQa=silent` clamp, so a silent QA session
  cannot become audible after navigation.
- Cobra, Weekend Ride and Okanagan now share the canonical unsuffixed Three.js module identity.
  This removes the duplicate-engine load and runtime warning seen in published standalone routes.

## Focused verification completed

- 206/206 consolidated focused JavaScript tests across canyon presentation/allocation, Camp Ember,
  parked Cobras, ground units/effects, mission flow, target semantics, HUD/map/clock/debrief,
  onboarding, shell UX and silent route inheritance.
- 77/77 focused simulation authority tests across Cobra canyon, ground war and mission runtime.
- Shared picker/pause/console pass: 47/47 focused tests and 13/13 release-shell tests.
- Audio/route inheritance: 62 focused contracts plus a published silent browser smoke covering
  root → Cobra, all three standalone returns, saved mute and Okanagan persistence.
- A real in-app browser pass covered picker → Cobra brief → direct cockpit, H controls, Escape
  close/pause, tactical map and focus restoration under `audioQa=silent`; the fresh module graph
  produced zero warnings or errors.
- Unchanged scenery gate and battle-evidence gate both pass after the final republish.
- The corrected Apple M5/Metal gate passes departure and live battle: Ready 1.996 s, input 16.6 ms,
  about 60 fps, and frame p95 17.3/17.6 ms respectively.
- The player-path and closed-loop pilot/controller/engagement contracts pass; the final real
  hardware run completed flight, target selection, gunner consent, firing and damage. The local
  telemetry receiver is independently tested.
- The four authored Iron Bell approach/pier hazards are now pinned at 18. Density probes retain the
  800 props/km² floor while staying outside the deliberately open battle bowl.
- The full Cobra JavaScript suite passes 428/428. Release, debrief, Okanagan, input and perf
  contracts pass 149/149 under the required Node 24 runtime. The wind/F-22 focused simulation pass
  is 48/48.
- The current consolidated Cobra/perf JavaScript run passes 445/445; the post-review guidance and
  adversarial engagement subset passes 37/37. The full simulation suite passes 2,374/2,377 with
  three intentional skips and no failures.
- Later exact-artifact frame reruns were not accepted while the host was saturated by Spotlight,
  Codex and Chrome renderers. The gate remains strict; rerun it on an idle host rather than treating
  a contended red as either a product regression or a waiver.

## Remaining work, in priority order

1. Rerun the exact-artifact hardware frame gate on an idle host; keep the clean post-fix M5 pass as
   evidence, but do not replace it with a host-contended sample.
2. Fly one complete human brief → first target → capture → verdict → RTB → recovery/debrief.
3. Add gamepad targeting/fire; the autonomous acceptance can operate the production keyboard path,
   but player combat is still keyboard Tab/F when using a gamepad for flight.
4. Use the telemetry-capable harness for owner runs; a generic static file server still cannot
   ingest playthrough telemetry.
5. Add authored Long Fang terrain, Camp Ember materials and faction/role silhouettes; avoid more
   generic boxes. Publish insertion phase/ETA with the inbound slick.
6. Run the broad production-route smoke after this dirty candidate is consolidated.

## Reproduction

```sh
node --test \
  web/wwwroot/render/cobra/tests/cobra_canyon_asset_kit.test.mjs \
  web/wwwroot/render/cobra/tests/cobra_canyon_presentation.test.mjs \
  web/wwwroot/render/cobra/tests/cobra_camp_ember_firebase.test.mjs \
  web/wwwroot/render/cobra/tests/cobra_parked_airframe.test.mjs \
  web/wwwroot/render/cobra/tests/cobra_ground_war.test.mjs \
  web/wwwroot/render/cobra/tests/cobra_ground_war_battlefield.test.mjs

OPEN=0 GUNS_PREVIEW_OUT=/tmp/guns-only-web-holistic-346 bin/preview-web
COBRA_SCENERY_WWWROOT=/tmp/guns-only-web-holistic-346/wwwroot \
COBRA_SCENERY_SHOT_DIR=/tmp/guns-only-battle-stills-holistic-346 \
node tools/cobra-scenery-gate/shot.mjs

# Run these in separate terminals against the final published tree.
GUNS_WWWROOT=/tmp/guns-only-web/wwwroot node tools/perf/serve_fixed.mjs
node tools/perf/run_attribution.mjs --mode cobra --dpr 1 --gate

GUNS_WWWROOT=/tmp/guns-only-web/wwwroot OUT=/tmp/cobra-ai-flight \
node tools/perf/cobra_ai_pilot.mjs --goal engage --hardware
```

All browser/audio QA must keep `?audioQa=silent` unless audible ownership is explicitly registered.
