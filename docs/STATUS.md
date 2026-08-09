# Current product and verification status

Updated: 2026-08-09
Production: Build 274, revision `0391eeb98c6cc245c9543b72380bb893d0e5db30`, deployment
`dpl_DRTzGJ2iqHuqxQtQBvZkGXkxRxJn` (verified live via `/api/build-info` 2026-08-09). Builds
253-270 shipped without this ledger always being updated in lock-step; treat per-build claims in
that range with care.
Next candidate: Build 299 (branch `fix/cobra-visual-overhaul`) — a dual Web/Unity visual pass for
F-22, Rapier, Cobra, and Weekend Ride; generated in-world surface/foliage art; a purpose-built
Weekend circuit plus a connected hinterland road network; and state-authoritative, symbol-led
golden paths. This is an in-progress candidate, not the live deployment.


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
| F-22A · Guns Only (`first-merge`) | **production** | Aircraft picker | Build 238 automation plus a recorded 2026-08-02 human acceptance flight (session `web-1785627445839-631596`). Build 264 graduated the sparring pair together; Build 265 aimed Ace fire at the ballistic solution. Build 299 candidate source adds generated Ukraine terrain and RGBA foliage, canopy/sky work, exact asset contracts, and state-authoritative first-merge guidance. Its roughly 3 km published-pixel gate proves asset residency and minimum rendered signal, not art quality or low-level detail. A separate fixed 90 m AGL Web desktop plate is green with the exact generated atlas consumed by both streamed scenery and mission features | Final serialized Build 299 gate; F-22 merge-view polish for the washed terrain, blank horizon band, soft macro detail, and empty sky; native Unity 90 m AGL import/player capture and fixed-camera comparison; fresh human visual/flight acceptance to confirm low-level presentation and Ace gunnery; w1 snapshot despawn; descent sim-step spike; lead/ballistics quality |
| Rapier · Intercept (`rapier-intercept`) | **production** | Aircraft picker | Build 238 automation earns the 24 km/M4.2 shelf, takes one physical M61 pass, then traps and stops at 2,520 s; the no-trigger mirror traps without firing and truthfully ends Draw. Build 299 candidate source adds the Web sensor treatment and native Unity runtime/tableau with authoritative phase/action guidance | Final serialized Build 299 gate; native Unity import/player capture and fixed-camera comparison; fresh representative human launch/intercept/recovery flight |
| Low-level drone intercept (`low-level-drone`) | **quarantined** | Preview acknowledgement only | Runtime and automated contracts exist | Ground-target/player-purpose closure and complete human flight |
| CASEVAC flight course (`medevac`) | **quarantined** | Preview acknowledgement only | Candidate guidance follows the authored orchard-gap route and briefs 32–42 m AGL near the windbreak | End-to-end human pickup, handoff, safe-exit, and debrief flight |
| Rapier circuits (`rapier-circuits`) | **preview** | Preview acknowledgement only | Circuit/recovery automation exists | Re-audit stale quarantines and record a complete representative circuit/trap |
| F9F-2 Panther off Essex (`korea-panther`) | **quarantined** | Preview acknowledgement only | Build 238 ownship-only kernel flies the production terrain catapult/route/return/groove to a physical W2 trap (100/100 focused); packaged route, touch-RTB, HUD, and barrier contracts passed silent-browser acceptance | Complete representative human desktop/touch flights and historical/presentation acceptance before any promotion |
| MIDGE-03 Facility Nine (`indoor`) | **quarantined** | `/indoor/` preview acknowledgement | Candidate UI now enforces doctrine-safe controls and blocks premature return | Re-drive the default stealth route and representative touch/keyboard paths |
| Parked Medevac command prototype (`medevac-command`, `/medevac/`) | **quarantined** | Standalone preview acknowledgement | Deterministic command/logistics prototype | It is research, not the canonical CASEVAC course; move out of production publish closure or explicitly graduate it |
| Cobra Canyon (`cobra-lab`, `/cobra-lab/`) | **production** | Standalone route | Hold the Bridge: AH-1G, sim-owned ground war, tip/hold win/lose, M134 + Camp Ember rearm, Tab/F gunner. Build 270 restored FPV + aviation HUD units. Build 271 added the closed-loop landing and crew-chain harnesses. Build 299 candidate source replaces the canyon art/presentation and adds an exact visual contract plus native Unity consumer | Final serialized Build 299 gate; native Unity import/player capture and fixed-camera comparison; a fixed low-altitude scenery plate at the 90 m AGL reference for terrain, facility/ecology density, and horizon quality; owner verify flare landing, SEAM hold-F ammo drop, moderate climb without stuck LOW ROTOR, and the new scenery/performance envelope. Longer arc: DCS-BS1-grade flight dynamics |
| Weekend Ride (`weekend-ride`, `/weekend-ride/`) | **production** | Aircraft picker + standalone route | YZF-R1 dynamics/powertrain/lean/load and ride telemetry are live. Build 299 candidate source replaces the runway loop with a purpose-built circuit and paddock access, adds a deterministic 15.8 km connected hinterland road network, generated track/landcover/roadside art, shared Web/Unity contracts, and sim-authored symbol-led guidance | **Build 299 release is red:** the native Unity fixed-camera comparator must pass a clean recapture after road-winding/output parity fixes. Remaining gates are the final serialized gate, a fresh representative human lap and paddock-to-hinterland ride, and deeper instrumentation |

## Research-only packages

- **Armstrong cable-strike** is not an experience state and has no catalog or browser exposure.
  Its promotion gate is deliberately `SAFE / INELIGIBLE`. It must not be described as preview,
  quarantined, or production until immutable evidence and the executable promotion gate agree.

## Release health

- Live production is Build 274 (`0391eeb`, `dpl_DRTzGJ2iqHuqxQtQBvZkGXkxRxJn`). Shipped from
  PR #37 and verified live via `/api/build-info` on 2026-08-09.
- Build 299 currently has no production deployment identity. Contract tests, generated-asset
  hashes, and renderer-source validation are candidate evidence; they do not substitute for a
  native Unity import/player run or the named fixed-camera Web/Unity image comparisons.
- Weekend Ride's Build 299 release gate enumerates the complete current pack and requires exact
  canonical, staged-Web, Unity-source, and published-Web bytes for its route, generated art and
  provenance, first-person contract, circuit export, and visual-QA contract. That byte closure does
  not waive the currently red native fixed-camera comparator or human ride blockers above.
- The image-led, minimal-text menu is a product invariant. Contextual state-authoritative symbols
  and short action cues may appear during play; prose-heavy menu or briefing regressions may not.
- A candidate is releasable only when its exact pushed SHA has a complete green gate, or the
  owner accepts a documented flaky-gate exception with live `/api/build-info` verification.
- Production deployment fails closed unless it can pin the current public rollback identity.

## Updating this page

When an experience changes state, update the executable catalog, its tests, this matrix, and the
last human acceptance evidence together. Promotion requires all four; a menu edit or a passing unit
test alone is insufficient.
