# Current product and verification status

Updated: 2026-08-06
Production: Build 264, revision `2694ac768a9ed5568539d39be42f4eaecbfc73ef`, deployment
`dpl_6JmVziaGpgv8nyfSpKVJ4Xhx35F8` (verified live via /api/build-info 2026-08-05, all four
routes remote-smoke verified). Builds 253-262 shipped 2026-08-03..08-04 without this ledger
being updated; the Build 248 stamp was reused and re-stamped as 249 — treat per-build claims in
that range with care.
Next candidate: Build 265 (branch `fix/campaign-265`) — both sides of the gun problem (the Ace
now fires on the ballistic solution instead of a nose-pointing gate, 0% → 28% hits; the player's
roll assist stops seizing the axis during reversals, 63% → 0%, and finally helps in the tracking
window), bike wobble damping + wheelie/stoppie dynamics, the Cobra gorge world model and its
no-cockpit F-22 HUD, W-up collective, first-run controls onboarding, mobile in-app-browser
rescue, per-contact gunnery telemetry, near-field terrain detail, and new menu posters.

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
| F-22A · Guns Only (`first-merge`) | **production** | Aircraft picker | Build 238 automation plus a recorded 2026-08-02 human acceptance flight (session `web-1785627445839-631596`). Build 264 candidate fixes the wingman-abandonment root cause (the wingman presented forever; pair now graduates together — un-skipped contract test) and decimates approach solves | Open defects, not blockers: opponent fired ZERO rounds in both owner flights on Builds 260/263 (regression, under investigation), w1 despawns from snapshots at the other bandit's kill tick, descent sim-step spike (GCAS suspect), bandit lead/ballistics |
| Rapier · Intercept (`rapier-intercept`) | **production** | Aircraft picker | Build 238 automation earns the 24 km/M4.2 shelf, takes one physical M61 pass, then traps and stops at 2,520 s; the no-trigger mirror traps without firing and truthfully ends Draw | Fresh representative human launch/intercept/recovery flight and complete green release gate |
| Low-level drone intercept (`low-level-drone`) | **quarantined** | Preview acknowledgement only | Runtime and automated contracts exist | Ground-target/player-purpose closure and complete human flight |
| CASEVAC flight course (`medevac`) | **quarantined** | Preview acknowledgement only | Candidate guidance follows the authored orchard-gap route and briefs 32–42 m AGL near the windbreak | End-to-end human pickup, handoff, safe-exit, and debrief flight |
| Rapier circuits (`rapier-circuits`) | **preview** | Preview acknowledgement only | Circuit/recovery automation exists | Re-audit stale quarantines and record a complete representative circuit/trap |
| F9F-2 Panther off Essex (`korea-panther`) | **quarantined** | Preview acknowledgement only | Build 238 ownship-only kernel flies the production terrain catapult/route/return/groove to a physical W2 trap (100/100 focused); packaged route, touch-RTB, HUD, and barrier contracts passed silent-browser acceptance | Complete representative human desktop/touch flights and historical/presentation acceptance before any promotion |
| MIDGE-03 Facility Nine (`indoor`) | **quarantined** | `/indoor/` preview acknowledgement | Candidate UI now enforces doctrine-safe controls and blocks premature return | Re-drive the default stealth route and representative touch/keyboard paths |
| Parked Medevac command prototype (`medevac-command`, `/medevac/`) | **quarantined** | Standalone preview acknowledgement | Deterministic command/logistics prototype | It is research, not the canonical CASEVAC course; move out of production publish closure or explicitly graduate it |
| Cobra Canyon (`cobra-lab`, `/cobra-lab/`) | **production** | Standalone route | **Hold the Bridge** playable mission: River Gorge AH-1G, sim-owned ground war, tip/hold control win (≥+0.55 for 45s) / lose (≤−0.75 for 30s), finite M134 + Camp Ember rearm, Tab/F gunner, full-bleed play shell (`?lab=1` inspection). 2026-08-05 audit found Build 261-263 effectively unplayable: cockpit occluded 98% of the frame, sim ran 0.62× real time at low fps, the mission won itself with zero input, and telemetry destroyed ~97% of its rows. Build 264 candidate fixes all four (occlusion-regression test, real-time-at-any-fps loop, zero-input now loses in ~3.5 min, bounded telemetry on the production batcher) | Fresh representative human Hold-the-Bridge sortie on the fixed artifact, rendered-screenshot review, and complete green release gate. Longer arc: DCS-BS1-grade flight dynamics program |
| Weekend Ride (`weekend-ride`, `/weekend-ride/`) | **production** | Aircraft picker + standalone route | YZF-R1 dynamics/powertrain/lean/load/tip-over, rider assists, painted Rapier-strip circuit, mission runtime, MotorcycleWebBridge, helmet HUD. 2026-08-05 audit found Builds 257-263 unlappable: r≈14 m hairpins forced every drive onto grass (reproducing the "no brakes / no steering" reports), transmission stuck in a too-tall 1st (missing primary reduction), no aero drag/engine braking, off-track a featureless void, zero telemetry instrumentation. Build 264 candidate: r≥38 m paved hairpins with circuit-bound pavement authority, sourced primary reduction + drag/rolling/engine braking + working shifts (dynamics v3), 0.89 g assisted braking, ground plane + beacons off-track, minimap/lap-timer fixes | Fresh representative human lap on the fixed artifact and rendered-screenshot review. Telemetry instrumentation still absent — rides remain unmeasurable |

## Research-only packages

- **Armstrong cable-strike** is not an experience state and has no catalog or browser exposure.
  Its promotion gate is deliberately `SAFE / INELIGIBLE`: 0/6 reviews, 0/7 gates, 0/14
  workstreams, 0/15 proofs, 0/12 runtime beats, and 0/3 companions, with ten open research
  blockers. Contemporary incident records support 3 September 1951 and an F9F-2 mission
  identity, while the BuNo/configuration anomaly, target and cable account, loadout, damage
  aerodynamics, radio, seat/ejection details, wind/parachute path, and ground recovery remain
  explicit research or reconstruction. It must not be described as preview, quarantined, or
  production until immutable evidence and the executable promotion gate agree. Promotion proof
  is accepted only from the protected-main deterministic GitHub Actions job for the exact source,
  Build, authority-manifest, test, runtime, and workflow provenance; locally forged or merely
  self-hashed result files fail closed.

## Release health

- Build 238 is production, promoted 2026-08-02 from protected-`main` SHA
  `e4c4c3fbc19705548619bb1829b148c4de521a37` with live post-promotion verification green.
- A representative human F-22A `first-merge` acceptance flight was recorded on 2026-08-02 against
  that exact production artifact (telemetry session `web-1785627445839-631596`, stamped
  `238+rev.e4c4c3f…+dep.dpl_AJiXvkTmPk64agpux1xvj58QyMvE`): 3 engagements to tier 3, 5 kills,
  573 rounds for 6 hits. The opponent fired 99 rounds across 87 trigger-down snapshots, so the
  long-standing "bandit never shoots" defect is closed; bandit lead/ballistics remains open.
  The Rapier `rapier-intercept` human flight is still outstanding.
- Open defects found by that flight: a descent-phase sim-step cost spike of 39-47 ms against a
  6-14 ms baseline (terrain build and load counters were flat, so this is not chunk building);
  tier 1 appeared in only 15 snapshots against 3,012 for tier 2.
- A fresh local Node 24.18.0 `./bin/check` is green on the complete Build 238 candidate: 1,231/1,231
  non-browser Node tests, 79/79 Python tests, 1,827/1,827 all-Sim tests, 10/10 server tests, 12/12
  packaged browser smoke tests, and 1,916/1,916 real-HUD assertions, with zero skips. The Release
  solution and four standalone C# tools build with zero warnings and zero errors; staged/published
  terrain is verified at 16 pages, 2,390 chunks, 9,560 records, and 420,792,736 bytes. The corrected
  machine-relative stutter test now honors the intentional Ready interlock, presses the real Fly
  control, reaches a live tick, and gates application-owned Long Tasks against its 240-frame,
  6x-median, at-most-three-outlier contract. Raw SwiftShader/compositor gaps remain diagnostic
  rather than being misreported as render-loop work. This is local candidate evidence, not a
  substitute for a clean pushed exact-SHA GitHub Verify run.
- GitHub Verify was not a trustworthy release signal at the start: the latest 12 runs were red and
  the last 100 contained 15 successes, 73 failures, and 12 cancellations.
- GitHub `main` now has strict, admin-enforced protection requiring the deterministic-contract and
  published-browser/HUD Verify jobs. Production deployment fails closed unless that protection is
  intact and the exact pushed SHA has a successful canonical Verify workflow.
- A candidate is releasable only when its exact pushed SHA has a complete green gate. Production
  build metadata must identify both the Git revision and immutable staged-content/atlas digest.
- That green canonical Verify run **is** the release provenance: `bin/deploy-web` no longer
  re-runs the whole of `bin/check` locally to re-derive it. Every fail-closed property is
  unchanged, including all post-promotion live verification and rollback. See
  `docs/release-pipeline.md` for what is trusted from CI, what is still checked locally (the
  gitignored terrain atlas), and `GUNS_DEPLOY_FULL_GATE=1` to force the old behaviour.

Record the canonical Build 238 protected-`main` Verify URL in release evidence at promotion; do
not treat local or pull-request green gates as remote release provenance.

## Current policy and governance

- Hosted flight diagnostics are off by default and require explicit pilot opt-in. Opt-out clears
  unsent diagnostics; core play remains available.
- The current checked-in Hume public-library radio corpus has production-rights approval from the
  project owner. Casting remains provisional for final ear review; that polish note is not a
  rights or release blocker.
- Terrain runtime caching now reserves 32 MiB and cools failed whole-page retries for five minutes,
  but the 420.8 MB atlas still lacks published-browser online-prime → offline-reload/fly acceptance.
  Do not advertise reliable data-constrained/mobile offline flight until that path is driven.
- Production deployment fails closed unless it can pin the current public rollback identity. The
  audited `GUNS_DEPLOY_BREAK_GLASS_BUILD_INFO_OUTAGE=1` path is emergency-only: it permits the
  Vercel control-plane deployment ID when public build-info is itself the outage, but never relaxes
  candidate or post-promotion verification and never rolls back an alias owned by another deploy.
- Production shell paintings are project-generated fiction with hashes and known/missing generator
  metadata recorded in `web/wwwroot/art/SOURCES.md`.
- Public multiplayer Origin checks are a browser boundary, not authentication. Worker identities
  use trusted edge-source admission (12 new identities/source/hour), a separate 1,200/hour global
  backstop, 90-day expiry/reclamation, bounded capacity metrics, and an operator recovery path.
- `main` should be protected and production should require a pushed, green SHA. Repository security
  scanning should remain enabled once configured.

## Updating this page

When an experience changes state, update the executable catalog, its tests, this matrix, and the
last human acceptance evidence together. Promotion requires all four; a menu edit or a passing unit
test alone is insufficient.
