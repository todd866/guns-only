# Docs index

One line per file in `docs/`. **Superseded** marks a design the live product no longer follows.
The current ledger is [STATUS.md](STATUS.md).

## Current

- [STATUS.md](STATUS.md) — production build, next candidate, freeze, experience matrix, open defects.
- [product-north-star.md](product-north-star.md) — Cohort / MMORPG / paediatrics vision, parked 2026-10-01; F-22 Guns Only is the current focus.
- [release-pipeline.md](release-pipeline.md) — what a ship trusts, and the ritual that replaced the long gate waits.
- [content-governance.md](content-governance.md) — authoring contract (2026-07-21). Its own note says constitutional decision #1 is the later historical product, and the shipped F-22 programme is not yet bound to the contract.
- [platform-architecture.md](platform-architecture.md) — active platform direction (2026-07-19). [ADR-0001](adr-0001-f22-first-arcade-pivot.md) says its Korea-first pack ordering is not the current build.
- [graphics-and-60fps-contract.md](graphics-and-60fps-contract.md) — 60 fps as a qualified-device SLO, not a promise for every machine.
- [approach-to-land-golden-path.md](approach-to-land-golden-path.md) — fitted per-airframe recovery. The `stabiliseSpeedMps: 90.0` snippet later in the file is labeled historical.
- [no-mans-land-canon.md](no-mans-land-canon.md) — accepted fiction for the accidental reserve.
- [nav-fabric-canon.md](nav-fabric-canon.md) — accepted fiction for the routing mesh.
- [adr-0003-ghibli-adjacent-world-presentation.md](adr-0003-ghibli-adjacent-world-presentation.md) — accepted no-copy art rule (2026-07-27).
- [adr-0004-generated-presentation-assets.md](adr-0004-generated-presentation-assets.md) — accepted generated presentation assets with retained sources (2026-09-09).

## Design

- [adaptive-teacher-design.md](adaptive-teacher-design.md) — adaptive-teacher AI and data flywheel; design, 2026-07-22.
- [adr-0001-f22-first-arcade-pivot.md](adr-0001-f22-first-arcade-pivot.md) — accepted F-22-first pivot (2026-07-22). **Superseded** as a picture of the live opening: the catalog sortie is two gun engagements then land, not the roguelite opening this ADR also sets.
- [air-war-economy-and-force-management.md](air-war-economy-and-force-management.md) — future campaign-economy design. Not a description of the live Rapier intercept.
- [art-direction.md](art-direction.md) — Ghibli-adjacent soft world and cold instruments. Supersedes the 2026-07-23 TF2-lineage note.
- [auto-gcas.md](auto-gcas.md) — Auto-GCAS training surrogate.
- [carrier-incident-replay.md](carrier-incident-replay.md) — carrier incident replay.
- [carrier-scoring-audit.md](carrier-scoring-audit.md) — carrier recovery scoring audit.
- [complexity-ladder.md](complexity-ladder.md) — platform decides how much jet you fly.
- [drone-war-design.md](drone-war-design.md) — low-level drone war in the valleys (2026-07-23 owner direction).
- [ejection-design.md](ejection-design.md) — Shift-E ejection, the seat, and the walk home.
- [f22-high-alpha-review.md](f22-high-alpha-review.md) — external review of the F-22 high-alpha model.
- [f22-performance-audit.md](f22-performance-audit.md) — F-22 public-data surrogate performance audit.
- [graphics-asset-pipeline.md](graphics-asset-pipeline.md) — graphics asset pipeline.
- [hud-symbology-notes.md](hud-symbology-notes.md) — HUD gunnery symbology notes from the Build 63–64 pass.
- [indoor-microdrone-design.md](indoor-microdrone-design.md) — indoor microdrone: fibre in, radio out.
- [korea-environment-data-sources.md](korea-environment-data-sources.md) — Korean terrain and weather source plan; research handoff, no data downloaded for the document.
- [low-level-playground.md](low-level-playground.md) — valleys and obstacles for low-level flight.
- [medevac-mission-design.md](medevac-mission-design.md) — **Superseded** for the first playable slice. The file marks itself parked; the CASEVAC pickup/drop-off spec replaces its player role.
- [modern-visual-merge.md](modern-visual-merge.md) — modern visual-merge thin slice.
- [pilot-g-physiology.md](pilot-g-physiology.md) — pilot G physiology.
- [rapier-gun-drone-system.md](rapier-gun-drone-system.md) — **Superseded** as the live intercept contract. Production Card 12 is three balloon mines and must not advertise gun-drones. The file still records a one-drone vertical slice.
- [rapier-operations-economy.md](rapier-operations-economy.md) — **Superseded** production contract. It still describes an endless F-22 merge and a dealt Rapier operations ledger; the live sortie is finite and the brief must not advertise that ledger.
- [robot-airframe-design.md](robot-airframe-design.md) — robot airframe, the post-Ace ladder tier.
- [roguelite-loop-design.md](roguelite-loop-design.md) — **Superseded** as the live front door. The catalog Guns Only sortie is two engagements then land, not the roguelite run this design describes.
- [systems-simulation.md](systems-simulation.md) — systems and procedural simulation.
- [telemetry-v2-design.md](telemetry-v2-design.md) — per-decision telemetry; sim-side foundation marked implemented 2026-07-22.
- [telemetry-v2-opponent-kinematics.md](telemetry-v2-opponent-kinematics.md) — opponent-kinematics gap; partly shipped against Build 238. Records the 2026-08-02 F-22 acceptance session.
- [terminal-physics.md](terminal-physics.md) — terminal physics and incident lifecycle.
- [ukraine-low-level-scenery.md](ukraine-low-level-scenery.md) — fictional 2030s Ukraine theatre and evacuation foundation.
- [ux-lab-thesis.md](ux-lab-thesis.md) — consumer interfaces as operational instruments.
- [world-backstory-research.md](world-backstory-research.md) — Korea 1950s / 2030s research memo; not canon.
- [2026-07-29-callsign-and-pilot-identity.md](2026-07-29-callsign-and-pilot-identity.md) — decision record: GHOST 11, and who flies the Rapier.
- [2026-07-31-phone-control-design.md](2026-07-31-phone-control-design.md) — phone layout: left stick throttle/yaw, right stick pitch/roll. This is the layout the repository README still describes. It supersedes an older "left flies / right looks" stick.

## History

- [history/status-narrative-through-build-372.md](history/status-narrative-through-build-372.md) — verbatim `STATUS.md` as it stood through the Build 372 candidate.
- [HANDOFF-2026-08-12.md](HANDOFF-2026-08-12.md) — handoff stopped before shipping Build 313. Not current status.
- [2026-08-27-autonomous-mission-harness.md](2026-08-27-autonomous-mission-harness.md) — harness status on that date.
- [2026-08-25-cobra-battle-readability-handoff.md](2026-08-25-cobra-battle-readability-handoff.md) — Cobra readability handoff for Build 348.
- [2026-07-31-player-path-map.md](2026-07-31-player-path-map.md) — what a visitor could reach on that date.
- [2026-07-31-panther-sortie-handoff.md](2026-07-31-panther-sortie-handoff.md) — F9F-2 Panther sortie handoff.
- [2026-07-31-bandit-containment-handoff.md](2026-07-31-bandit-containment-handoff.md) — bandit-containment handoff. Its "ready to deploy" line is that day's status, not today's.
- [2026-07-28-rapier-flight-test-reconstruction.md](2026-07-28-rapier-flight-test-reconstruction.md) — Rapier flight-test reconstruction, 28 July 2026.
- [2026-07-26-reclined-seat-and-ukraine-setting.md](2026-07-26-reclined-seat-and-ukraine-setting.md) — idea capture: reclined seating and a 2030s Ukraine setting.
- [2026-07-26-open-work-and-findings.md](2026-07-26-open-work-and-findings.md) — open-work snapshot from 2026-07-26. Not the live defect list; that is [STATUS.md](STATUS.md).
- [2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md](2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md) — **Superseded** numerical launch study. The file says the live launcher is 520 m at 110 m/s.
- [m0-gate.md](m0-gate.md) — **Superseded** Godot M0 feel gate. The file says the browser is canonical.
- [spikes.md](spikes.md) — **Superseded** Godot-era hardware spikes. Results are provenance, not runnable instructions.
- [development-recordings.md](development-recordings.md) — historical note that development videos live in `recordings/` and are not in git.

## Directories

- [airframes/](airframes/README.md) — engineering dossiers. `airframes/rapier/` is superseded Rapier v1; production Rapier is v2.
- [audits/](audits/) — dated verification records cited from [STATUS.md](STATUS.md).
- [art-direction/](art-direction/) — art packs beyond [art-direction.md](art-direction.md).
- [grok-overhaul/](grok-overhaul/) — later build notes for Cobra, Fire Boss, Ride, Top Gun, and the difficulty ramp.
- [research/](research/) — prior-art survey.
- [superpowers/](superpowers/) — feature specs and implementation plans. A spec is not the live ledger.
- [vehicles/](vehicles/) — YZF-R1 sources.
- [work-orders/](work-orders/) — dated Cobra work orders, including the Build 266 owner flight.
