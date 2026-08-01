# Current product and verification status

Updated: 2026-08-01
Production at start of stabilization: Build 237, revision `e0b3f49b63cec210dcc3f89c1e5aac369730b19f`
Next candidate: Build 238 (local stabilization work); do not deploy until the complete gate is
green and the exact revision is pushed.

This is the evergreen status page. Dated plans, browser-drive reports, and handoffs remain useful
evidence for the build and commit they name, but they do not override this page or the executable
catalog in `web/wwwroot/render/progression/campaign_progression.js`.

## Release-state meanings

- **production** — visible on the public front door and accepted for normal launch.
- **preview** — intentionally retained for development; requires explicit preview acknowledgement.
- **quarantined** — has a known player-path or acceptance blocker; must fail closed before launch.
- **retired** — retained only for history or migration and must not be routed.

`hidden` HTML is never a release control. Main-shell routing and standalone sub-apps enforce these
states, while `?preview=1` provides a deliberate testing acknowledgement without promoting a route.

## Experience matrix

| Experience | State | Public surface | Current evidence | Promotion blocker |
| --- | --- | --- | --- | --- |
| F-22A · Guns Only (`first-merge`) | **production** | Aircraft picker | Build 238 automation proves bounded 24 km support rejoin/departure, sustained late-window Ace defense, and primary/secondary 10–20 NM target-box routing; most recent complete human/player-path record predates this candidate | Fresh candidate flight and complete green exact-SHA release gate |
| Rapier · Intercept (`rapier-intercept`) | **production** | Aircraft picker | Build 238 automation earns the 24 km/M4.2 shelf, takes one physical M61 pass, then traps and stops at 2,520 s; the no-trigger mirror traps without firing and truthfully ends Draw | Fresh representative human launch/intercept/recovery flight and complete green release gate |
| Low-level drone intercept (`low-level-drone`) | **quarantined** | Preview acknowledgement only | Runtime and automated contracts exist | Ground-target/player-purpose closure and complete human flight |
| CASEVAC flight course (`medevac`) | **quarantined** | Preview acknowledgement only | Candidate guidance follows the authored orchard-gap route and briefs 32–42 m AGL near the windbreak | End-to-end human pickup, handoff, safe-exit, and debrief flight |
| Rapier circuits (`rapier-circuits`) | **preview** | Preview acknowledgement only | Circuit/recovery automation exists | Re-audit stale quarantines and record a complete representative circuit/trap |
| F9F-2 Panther off Essex (`korea-panther`) | **quarantined** | Preview acknowledgement only | Build 238 ownship-only kernel flies the production terrain catapult/route/return/groove to a physical W2 trap (100/100 focused); packaged route, touch-RTB, HUD, and barrier contracts passed silent-browser acceptance | Complete representative human desktop/touch flights and historical/presentation acceptance before any promotion |
| MIDGE-03 Facility Nine (`indoor`) | **quarantined** | `/indoor/` preview acknowledgement | Candidate UI now enforces doctrine-safe controls and blocks premature return | Re-drive the default stealth route and representative touch/keyboard paths |
| Parked Medevac command prototype (`medevac-command`, `/medevac/`) | **quarantined** | Standalone preview acknowledgement | Deterministic command/logistics prototype | It is research, not the canonical CASEVAC course; move out of production publish closure or explicitly graduate it |
| Cobra Canyon world lab (`cobra-lab`, `/cobra-lab/`) | **quarantined** | Standalone `?preview=1` acknowledgement only | Authored world routes and bounded presentation prototype | Integrate the AH-1G flight authority, production controls/HUD, player-path acceptance, and release-grade presentation before promotion |

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

- Build 238 is a committed release candidate, not production. It becomes releasable only after
  its exact protected-`main` SHA passes the canonical GitHub Verify workflow and the outstanding
  representative human acceptance flights are recorded.
- A fresh local Node 24.18.0 `./bin/check` is green on the complete Build 238 candidate: 1,231/1,231
  non-browser Node tests, 79/79 Python tests, 1,827/1,827 all-Sim tests, 10/10 server tests, 12/12
  packaged browser smoke tests, and 1,916/1,916 real-HUD assertions, with zero skips. The Release
  solution and four standalone C# tools build with zero warnings and zero errors; staged/published
  terrain is verified at 16 pages, 2,390 chunks, 9,560 records, and 420,792,736 bytes. The corrected
  machine-relative stutter test now honors the intentional Ready interlock, presses the real Fly
  control, reaches a live tick, and passes its unchanged 240-frame outlier sampler. This is local
  candidate evidence, not a substitute for a clean pushed exact-SHA GitHub Verify run.
- GitHub Verify was not a trustworthy release signal at the start: the latest 12 runs were red and
  the last 100 contained 15 successes, 73 failures, and 12 cancellations.
- GitHub currently reports `main` as unprotected. Enabling strict required checks is an
  operator-owned repository setting; production deployment now fails closed until `main` is
  protected and the exact pushed SHA has a successful canonical Verify workflow.
- A candidate is releasable only when its exact pushed SHA has a complete green gate. Production
  build metadata must identify both the Git revision and immutable staged-content/atlas digest.

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
