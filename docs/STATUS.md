# Current product and verification status

Updated: 2026-08-13
Production: Build 318, revision `e9f300720c95add40a52a294d2eb32d58f087816`, deployment
`dpl_w7N1SwXVfabWeUtcrjfsvXFNiksD` (verified live via /api/build-info 2026-08-13, with remote
route smokes on all four routes). Builds 312 (Cobra contact envelope), 313 (Camp Ember
firebase, ramp Cobras, bird swap), 315 (Weekend Ride lap timing) and 318 (authored structure
materials) shipped in sequence. Builds
253-298 shipped without this ledger always being updated in lock-step; treat per-build claims in
that range with care.
Promoted with Build 311 and still live: Builds 308 (consolidation: bounded long-range terrain marches,
Auto-GCAS reductions, flyby acoustics, tiered cast shadows, frame attribution), 309 (Top Gun ACM
preview) and 310 (rated-arena Multiplayer preview) went live as part of the Build 311
promotion. Top Gun and Multiplayer remain preview-only and fail closed unless `?preview=1` is
explicitly acknowledged; their promotion to production routes still requires representative
human ACM and multiplayer player-path acceptance.
Next candidate: Build 320 (branch `feature/cc0-vegetation`). The jungle stops being
cardboard: the canyon's foliage was crossed alpha cards typed into JavaScript while the repo
carried an unused glTF pipeline, and Build 320 imports the Quaternius Ultimate Stylized Nature
palms (CC0-1.0, recorded in `licenses.json`) and instances real geometry for the jungle role.
Roles with an authored mesh render as two batches — a hero batch sized by a per-tier
`maxAuthoredTriangles` allowance and taken at a fixed stride, plus a card field for the rest —
because one palm costs ~470 triangles against a card's dozen; mobile's allowance is zero.
Also: an expo curve on the Cobra cyclic (the hover band had the same resolution as full
deflection, which is why holding a hover was twitchy); infantry silhouettes rebuilt at human
proportions instead of a box under a 0.76 m sphere; the Top Gun `/top-gun/` 404 fixed; and the
cockpit near plane raised 0.12 -> 0.30 for 2.5x depth precision.

Known and NOT fixed in 320: the Camp Ember flicker. Diagnosed conclusively — it is depth
precision, not performance (production telemetry measured a locked 60 fps there). The apron
flattens terrain to exactly the camp elevation and the firebase anchors at that same height, so
essentially the entire ground dressing was authored between -30 mm and +13 mm of the drawn
ground while the cockpit depth quantum is ~5 mm at 100 m. The merged single-material
`polygonOffset` biases the whole camp against the terrain but can never separate the camp's own
layers from each other, so the geometry has to move. A re-stack was attempted and reverted: it
must also rework the six Camp Ember spawn-volume and contact-flatness invariants in the same
change, and those are safety contracts that must not be weakened casually.

This is the evergreen status page. Dated plans, browser-drive reports, and handoffs remain useful
evidence for the build and commit they name, but they do not override this page or the executable
catalog in `web/wwwroot/render/progression/campaign_progression.js`.

## Release-state meanings

- **production** — visible on the public front door and accepted for normal launch.
- **coming-soon** — visible on the public front door as a teaser; selectable for briefing, never launches.
- **preview** — intentionally retained for development; requires explicit preview acknowledgement.
- **quarantined** — has a known player-path or acceptance blocker; must fail closed before launch.
- **retired** — retained only for history or migration and must not be routed.

`hidden` HTML is never a release control. Main-shell routing and standalone sub-apps enforce these
states, while `?preview=1` provides a deliberate testing acknowledgement without promoting a route.

## Experience matrix

| Experience | State | Public surface | Current evidence | Promotion blocker |
| --- | --- | --- | --- | --- |
| F-22A · Guns Only (`first-merge`) | **production** | Aircraft picker | Build 238 automation plus a recorded 2026-08-02 human acceptance flight (session `web-1785627445839-631596`). Build 264 graduated the sparring pair together; Build 265 aimed Ace fire at the ballistic solution. Build 308 candidate bounds pathological terrain marches, reduces Auto-GCAS terrain work, and restores physical flyby acoustics and cast shadows | Fresh human flight on Build 266+ to confirm Ace gunnery; w1 snapshot despawn; descent sim-step spike; lead/ballistics quality |
| Rated arena (`multiplayer`) | **preview** | Preview acknowledgement only | Build 310 candidate adds same-origin matchmaking, shared human/bot Elo, bounded bot-only handicap profiles, outcome/fun reporting, and fail-closed launch/storage gates | Complete green gate; configured durable ladder storage; representative match, retry, abandon, and fly-again acceptance; multiplayer product acceptance before promotion |
| Rapier · Intercept (`rapier-intercept`) | **production** | Aircraft picker | Build 238 automation earns the 24 km/M4.2 shelf, takes one physical M61 pass, then traps and stops at 2,520 s; the no-trigger mirror traps without firing and truthfully ends Draw | Fresh representative human launch/intercept/recovery flight and complete green release gate |
| Low-level drone intercept (`low-level-drone`) | **quarantined** | Preview acknowledgement only | Runtime and automated contracts exist | Ground-target/player-purpose closure and complete human flight |
| CASEVAC flight course (`medevac`) | **quarantined** | Preview acknowledgement only | Candidate guidance follows the authored orchard-gap route and briefs 32–42 m AGL near the windbreak | End-to-end human pickup, handoff, safe-exit, and debrief flight |
| Rapier circuits (`rapier-circuits`) | **preview** | Preview acknowledgement only | Circuit/recovery automation exists | Re-audit stale quarantines and record a complete representative circuit/trap |
| F9F-2 Panther off Essex (`korea-panther`) | **quarantined** | Preview acknowledgement only | Build 238 ownship-only kernel flies the production terrain catapult/route/return/groove to a physical W2 trap (100/100 focused); packaged route, touch-RTB, HUD, and barrier contracts passed silent-browser acceptance | Complete representative human desktop/touch flights and historical/presentation acceptance before any promotion |
| MIDGE-03 Facility Nine (`indoor`) | **quarantined** | `/indoor/` preview acknowledgement | Candidate UI now enforces doctrine-safe controls and blocks premature return | Re-drive the default stealth route and representative touch/keyboard paths |
| Parked Medevac command prototype (`medevac-command`, `/medevac/`) | **quarantined** | Standalone preview acknowledgement | Deterministic command/logistics prototype | It is research, not the canonical CASEVAC course; move out of production publish closure or explicitly graduate it |
| Cobra Canyon (`cobra-lab`, `/cobra-lab/`) | **production** | Standalone route | Hold the Bridge / Ember Run: AH-1G, sim-owned ground war, tip/hold win/lose, M134 + Camp Ember rearm, Tab/F gunner. Build 301: land spur Camp Ember FOB, airborne soft gates, denser Iron Bell destroyables. Build 306: limited SCAS only. Build 307: stronger hover TQ residual, cruise weathervane, terrain wind + yaw/wind telem. Build 308 candidate adds tier-bounded cast shadows and real terrain shadow receivers. Build 311: body-aligned HUD eye + heading-relative hover cue, collective hub moment + split torque yaw + loaded gust response, flattened rendered spawn apron + 74-part authored Camp Ember firebase. Build 312: contact envelope with gear-damage/rollover/spin/water tiers, cause cards, touchdown telemetry, autorotation audit. Build 313: FSB-read Camp Ember (dossier-derived), three ramp Cobras + bird swap, FOB INEFFECTIVE terminal, flicker probe + decal bias | Owner flight is the flicker gate (Build 312 telemetry proved the shimmer is spatial z-fighting at 60 fps, not performance; 313 carries the decal fix). The mission itself is NOT yet a game: conquest points/tickets/map are designed and planned, not built. Longer arc: DCS-BS1-grade flight dynamics |
| Weekend Ride (`weekend-ride`, `/weekend-ride/`) | **production** | Aircraft picker + standalone route | YZF-R1 dynamics/powertrain/lean/load, lappable circuit from Build 264+. Build 267 adds ride telemetry (speed/gear/lean/lap/frame). Build 308 adds tiered shadows, sky-derived IBL, and horizon/far-plane corrections. Build 315 candidate makes it a game: lap/last/best on the helmet HUD, four sector splits, a live delta to your best, an off-track lap refused as a record, and a best that persists across sessions | Owner ride on Build 315: is beating your own best worth trying for? Ghost bike deliberately cut from v1 |
| Top Gun (`top-gun`) | **preview** | Preview acknowledgement only | Build 309 candidate automation, carried unchanged into Build 310: Tomcat AIM-9 path, MiG-28 boot, gun firing, R fox-two browser bind, coarse Tomcat wing-sweep span | Complete green release gate and representative human ACM acceptance flight |

## Research-only packages

- **Armstrong cable-strike** is not an experience state and has no catalog or browser exposure.
  Its promotion gate is deliberately `SAFE / INELIGIBLE`. It must not be described as preview,
  quarantined, or production until immutable evidence and the executable promotion gate agree.

## Release health

- Live production is Build 313, shipped from PR #63 with both CI contexts green. Local gate
  runs on a loaded workstation produce false browser-smoke timeouts (2026-08-12: four smokes
  timed out under an unrelated 200%+ CPU load and all passed in isolation and on CI); CI on
  clean runners is the authoritative check.
  Do not treat that gate as a frame-rate measurement.
- A candidate is releasable only when its exact pushed SHA has a complete green gate, or the
  owner accepts a documented flaky-gate exception with live `/api/build-info` verification.
- Production deployment fails closed unless it can pin the current public rollback identity.

## Updating this page

When an experience changes state, update the executable catalog, its tests, this matrix, and the
last human acceptance evidence together. Promotion requires all four; a menu edit or a passing unit
test alone is insufficient.
