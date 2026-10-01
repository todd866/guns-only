# Current product status

Updated: 2026-10-01.
Production: Build 371, revision `0e8ea60a8159b2da6ba9f246c334c3bc1ae35493`.
Next candidate: Build 372, not deployed — holds F-22 opponent level and aiming assistance steady within each sortie while earning the next one; adds recovery-aware debriefs and direct practice suggestions; simplifies the briefing and fixes poster/Ride HUD overlap. Limits: [player-loop audit](audits/2026-09-26-player-loop.md).
Live production is Build 371, revision `0e8ea60a8159b2da6ba9f246c334c3bc1ae35493`. This checkout stamps `RELEASE_BUILD` 372 in `web/wwwroot/render/release/release_identity.js`.
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
| Weekend Ride (`weekend-ride`) | `/weekend-ride/` | **production** | yes | Owner ride that asks whether beating your best is worth it is still open ([lap-timing design](superpowers/specs/2026-08-12-weekend-ride-lap-timing-design.md)) | [Build 372 audit](audits/2026-09-26-player-loop.md) rode with throttle to check lap/map layout, not that gate |
| Top Gun (`top-gun`) | main-shell picker; catalog route is null | **production** | yes | Representative human dogfight on the exact public artifact is still unchecked | [Top Gun design](superpowers/specs/2026-08-03-top-gun-design.md) records a Build 328 owner flight that exposed a recovery gap, and leaves the public-artifact dogfight open |
| Okanagan Fire Boss (`okanagan-fireboss`) | `/okanagan/` | **production** | yes | Handling is unverified; a new owner flight is not claimed | [Handling audit](audits/2026-09-10-fireboss-handling.md) is not a human acceptance. [Assist audit](audits/2026-09-10-okanagan-assist-navigation.md) does not claim a new owner flight. [Peachland scenery](audits/2026-09-05-peachland-scenery.md) does not infer a full human flight from tests |

Armstrong cable-strike is not a catalog experience. Its promotion gate is `tools/content/armstrong-promotion-gate.mjs` (status `eligible`, `ineligible`, or `unsafe`). Do not describe it as preview, quarantined, or production from this page.

## Known open defects

- Build 372 does not claim a human-tested full F-22 combat-to-landing flight. The full release gate was not rerun after the final logbook correction and practice-smoke change. Wider handling, difficulty tuning, cross-mission progression, and fresh human acceptance stay open. [Player-loop audit](audits/2026-09-26-player-loop.md).
- Fire Boss `handlingEvidence` stays unverified and control-direction evidence stays unverified. Automated checks do not claim a new owner flight or OEM fidelity. [Handling](audits/2026-09-10-fireboss-handling.md), [assist and navigation](audits/2026-09-10-okanagan-assist-navigation.md).
- Top Gun's representative human dogfight on the deployed artifact is still an open production checkbox. [Top Gun design](superpowers/specs/2026-08-03-top-gun-design.md).
- Preview and quarantined rows still carry the catalog blockers in the matrix. Frozen does not close them and does not promote them.

## Updating this page

When an experience changes state, update the catalog, its tests, this matrix, and the human-flight citation together. Dated plans and the archived narrative do not override this page.
