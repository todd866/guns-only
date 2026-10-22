# Current product status

Updated: 2026-10-21.
Production: Build 390, revision `cd2efad06322a4dd8a35cb3d0c6c14ffa18a05e7`.
Next candidate: Build 391, not deployed — Area 51½ HD look: a real desert HDRI sky (CC0 Poly Haven) for light, reflections and backdrop, rebalanced lighting, bloom, SMAA and a speed-reactive camera FOV, on by default (?gfx=classic opts out). Key-to-steer latency measured unchanged.
Shipped 2026-10-22: Build 390 — Area 51½: free drive by default with a RACE ring (Forza Horizon style), a Forza-style driving line, Re-Volt skill shortcuts on every track (harder, faster, fall off onto the slow road), a third track (Little Nellie Elementary: slippery gym, cafeteria tables, the playground slide), challenge coins, aggressor callsigns, real CC0/CC-BY RC recordings, 3-2-1-GO, inflatable arches, car-following shadows, dust and skid marks.
Shipped 2026-10-22: Build 389 — hotfix: guns-only.com/rc without a trailing slash now loads Area 51½ (the page pins <base href="/rc/">).
Shipped 2026-10-21: Build 388 — Area 51½ gets its second track, the BX (a big-box base exchange from real Nellis BX photos), with a Liberty Loop / The BX selector.
Shipped 2026-10-21: Build 387 — Area 51½ replaces Weekend Ride on the front door: a Re-Volt-style toy RC racer on a fictional Nellis-flavoured base (rigid-body buggy physics, kid mode by default, AI rivals, cartoon pickups, Liberty Loop housing district).
Shipped 2026-10-16: Build 386 — hands-off F-22 RTB autopilot (Y, 8×), End after combat, and the playtest lab.
Shipped 2026-10-16: Build 385 — every menu shares one bottom console (illustrated aircraft cards, a pause mission strip of mode · clock · engagements, gold Resume/Fly/Again, one line-icon set across pause, picker, debrief, settings and the report card); distant terrain fades into the sky colour along the view ray instead of a white wall; the horizon shoulder is narrower; Enter pressed before a report screenshot finishes encoding now sends when it lands.
Shipped 2026-10-16: Build 383 — in-game feedback reports: F8 or the ⚑ pause button freezes the sim and sends an exact-frame screenshot, the full sim state, the last 120 s of telemetry and inputs, settings, device and recent console errors to private blob storage (/report, same-origin, rate-limited, no overwrite); tools/feedback/pull.mjs fetches them. Visuals: lee slopes and tree shadows go darker (full-lee ~40%→~19% lit), shelterbelt trees use the soft canopy hull with a visible stem, and the bandit keeps its near body to 1,800 m.
Shipped 2026-10-15: Build 381 — the shell around the flying matches the F-22 debrief instrument: one "Couldn't start" card (detail behind ⓘ) replaces the cream fallback and phosphor fatal cards; a failed boot reloads once per build before showing it (a Starlink blip no longer strands the player); the boot chip reads Loading/Updating with a stage gauge instead of runtime machinery; pause is Resume plus one icon row; settings are toggle rows grouped by glyph with a compact key table; the picker's diagnostics checkbox and build line move into Settings.
Shipped 2026-10-14: Build 380 — a slow-link release upgrade no longer bricks boot (the gate waits while the new worker downloads and hands over a verified waiting worker); flight telemetry survives outages and tab close (6,000-row buffer + IndexedDB outbox); the bracket Su-27 collapses onto a committed player (rung-3 pair passive 84%→42%); the overhead pattern owns the throttle cue; airfield light sprites fade at fight range; practice list as instrument rows; the gun assist survives fine forward tracking and stays widened on touch at every rung.
Shipped 2026-10-14: Build 379 — the F-22 RTB reads: chevrons tilt toward the eye and hold a minimum angular size (visible from above and from 10+ NM); fight chrome drops once knock-it-off hands bandits to relief; a Waze-style next-fix row (arrow · NM · fix · height · energy) under the heading tape; V padlocks the runway threshold (FIELD); land recovery says HOME, not BOAT; the full gun assist stays on at every difficulty rung (owner: "keep gun assist").
Shipped 2026-10-13: Build 378 — the stranger gets a fight in seconds: fresh visits go straight to the F-22; rung-0 opens on a trackable slow lead (first hit ~3.4 s in the real-touch receipt); one assisted control contract per phone and a target-independent neutral stick; alternating offensive/defensive BFM ladder (O1→D1→O2→D2→O3→D3→neutral→Ace pair, spec docs/grok-overhaul/design/f22-bfm-ladder.md); phone touch layout (FIRE under the left thumb, throttle lever, LIMIT in portrait) with a HUD/control occupied-area contract; short-final landing practice; runway haze; first-merge receipt smoke; load-proof frame gate.
Shipped 2026-10-01: Build 373 — the F-22 bandit fights: the rung-0 present ends (12 s cap, proximity latch restored, a finished present starts the fight), the chase uses afterburner after a sustained stall, and solution-disciplined tiers throw budgeted pressure bursts ([PR #111](https://github.com/todd866/guns-only/pull/111), `sim.Tests/BanditPressureReport.cs`). Carries the undeployed Build 372 player loop: sortie-steady opponent level and aim assist, recovery-aware debriefs, practice suggestions, briefing and HUD-overlap fixes ([player-loop audit](audits/2026-09-26-player-loop.md)).
Live production is Build 390, revision `cd2efad06322a4dd8a35cb3d0c6c14ffa18a05e7`. This checkout stamps `RELEASE_BUILD` 390 in `web/wwwroot/render/release/release_identity.js`.
Build-by-build narrative, moved verbatim: [status narrative through Build 372](history/status-narrative-through-build-372.md).

## Focus

Owner direction, 2026-10-01: F-22 Guns Only is the core product. Every other mode is frozen — kept live where it already ships, no new feature work. That includes Cobra, Top Gun, Rapier, Fire Boss/Okanagan, Weekend Ride, medevac/CASEVAC, the indoor drone, and arena multiplayer, and every other catalog row that is not Guns Only.

## Release-state meanings

- **production** — on the public front door; launches without `?preview=1`.
- **preview** — kept for development; requires an explicit `?preview=1` acknowledgement.
- **quarantined** — known player-path or acceptance blocker; must fail closed before launch.
- **coming-soon** — teaser only; never launches. No catalog row uses it.
- **retired** — history or migration; must not be routed. No catalog row uses it.

`hidden` HTML is not a release control. Rows and blockers below are the executable catalog in `web/wwwroot/render/progression/campaign_progression.js`, plus the newest audit that speaks to a human flight.

## Experience matrix

Mission-hosted routes are `/?program=<id>`. A null mission defaults to `/<id>/` unless the catalog sets `route`. `top-gun` sets `route` to null and launches from the main-shell picker (`data-program-node="top-gun"` in `web/wwwroot/index.html`); there is no `/top-gun/` page. Frozen means no new feature work.

| Mode | Route | Release state | Frozen? | Known blockers | Last human-flight evidence |
| --- | --- | --- | --- | --- | --- |
| Guns Only (`first-merge`) | `/?program=first-merge` | **production** | no | Full combat-to-landing human flight is not claimed for Build 372 | 2026-08-02 session `web-1785627445839-631596` ([telemetry note](telemetry-v2-opponent-kinematics.md)). [Build 372 audit](audits/2026-09-26-player-loop.md) records picker, practice, and a terrain-loss debrief, and does not claim a human combat-to-landing flight |
| Ace Duel (`ace-duel`) | `/?program=ace-duel` | **preview** | yes | A complete human capstone flight is still outstanding | No file in `docs/audits/` records one |
| Rated arena (`multiplayer`) | `/?program=multiplayer` | **preview** | yes | Rated arena matchmaking and the complete player path still require acceptance | No file in `docs/audits/` records a human match |
| Low-level drone (`low-level-drone`) | `/?program=low-level-drone` | **quarantined** | yes | Ground-target and complete player-path acceptance are outstanding | No file in `docs/audits/` records a human flight |
| CASEVAC (`medevac`) | `/?program=medevac` | **quarantined** | yes | The orchard-gap guidance is wired; an end-to-end human flight is still outstanding | No file in `docs/audits/` records one |
| Rapier circuits (`rapier-circuits`) | `/?program=rapier-circuits` | **preview** | yes | This training route is not part of the production front door yet | No file in `docs/audits/` records a human circuit |
| Rapier intercept (`rapier-intercept`) | `/?program=rapier-intercept` | **production** | yes | Fresh human launch, intercept, and recovery is still open | [Approach-to-land](approach-to-land-golden-path.md) records simulation cards only, and says a human flight is still useful feel evidence |
| Korea Panther (`korea-panther`) | `/?program=korea-panther` | **quarantined** | yes | The terrain-loaded open-water launch is green; full sortie, recovery, and human acceptance are still outstanding | No file in `docs/audits/` records a human flight |
| Facility Nine (`indoor`) | `/indoor/` | **quarantined** | yes | Advertised controls and stealth-failure behavior require player-path acceptance | No file in `docs/audits/` records a human flight |
| Medevac command (`medevac-command`) | `/medevac/` | **quarantined** | yes | This research prototype is not the canonical flight course and has not graduated its player-path acceptance gate | No file in `docs/audits/` records a human flight |
| Cobra Canyon (`cobra-lab`, `/cobra-lab/`) | `/cobra-lab/` | **production** | yes | A human brief-to-RTB sortie on the live build is still open | Owner flew Build 266 ([work order](work-orders/2026-08-07-cobra-build-266-followups.md)) and Build 312 ([handoff](HANDOFF-2026-08-12.md)). The [2026-09-08 control audit](audits/2026-09-08-small-screen-controls.md) and the [2026-09-10 mix audit](audits/2026-09-10-cobra-recorded-mix.md) are not human flights |
| Area 51½ (`area-51`) | `/rc/` | **production** | yes | Owner direction 2026-10-21 replaces Weekend Ride on the front door; no human (or kid) playtest yet | Headless real-keyboard laps on Apple M5 Metal: Liberty Loop and the base route finish with 0 hits; 40 Node physics/race/district tests ([build plan](area-51-build-plan.md)) |
| Weekend Ride (`weekend-ride`) | `/weekend-ride/` | **preview** | yes | Replaced on the front door by Area 51½ (owner, 2026-10-21); route and code kept | [Build 372 audit](audits/2026-09-26-player-loop.md) rode with throttle to check lap/map layout |
| Top Gun (`top-gun`) | main-shell picker; catalog route is null | **production** | yes | Representative human dogfight on the exact public artifact is still unchecked | [Top Gun design](superpowers/specs/2026-08-03-top-gun-design.md) records a Build 328 owner flight that exposed a recovery gap, and leaves the public-artifact dogfight open |
| Okanagan Fire Boss (`okanagan-fireboss`) | `/okanagan/` | **production** | yes | Handling is unverified; a new owner flight is not claimed | [Handling audit](audits/2026-09-10-fireboss-handling.md) is not a human acceptance. [Assist audit](audits/2026-09-10-okanagan-assist-navigation.md) does not claim a new owner flight. [Peachland scenery](audits/2026-09-05-peachland-scenery.md) does not infer a full human flight from tests |

Armstrong cable-strike is not a catalog experience. Its promotion gate is `tools/content/armstrong-promotion-gate.mjs` (status `eligible`, `ineligible`, or `unsafe`). Do not describe it as preview, quarantined, or production from this page.

## Known open defects

- F-22 bandit pressure (2026-10-01): against the climbing `Cohort` pilot profile, rung 0 is still ~90% passive and the rung-3 pair ~70-80% passive (`BanditPressureReport`, 4 seeds). The scripted pilot never slows to turn; a human flight is the acceptance test.

- Build 372 does not claim a human-tested full F-22 combat-to-landing flight. The full release gate was not rerun after the final logbook correction and practice-smoke change. Wider handling, difficulty tuning, cross-mission progression, and fresh human acceptance stay open. [Player-loop audit](audits/2026-09-26-player-loop.md).
- Fire Boss `handlingEvidence` stays unverified and control-direction evidence stays unverified. Automated checks do not claim a new owner flight or OEM fidelity. [Handling](audits/2026-09-10-fireboss-handling.md), [assist and navigation](audits/2026-09-10-okanagan-assist-navigation.md).
- Top Gun's representative human dogfight on the deployed artifact is still an open production checkbox. [Top Gun design](superpowers/specs/2026-08-03-top-gun-design.md).
- Preview and quarantined rows still carry the catalog blockers in the matrix. Frozen does not close them and does not promote them.

## Updating this page

When an experience changes state, update the catalog, its tests, this matrix, and the human-flight citation together. Dated plans and the archived narrative do not override this page.
