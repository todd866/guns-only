# Current product and verification status

Updated: 2026-08-14
Production: Build 328, revision `b13a9fc2f75be4d6d1e1c77ff9a41f9a13138fdb` (verified live via
`/api/build-info` 2026-08-14, with the protected release pipeline complete). Builds 312 (Cobra
contact envelope), 313 (Camp Ember firebase, ramp Cobras, bird swap), 315 (Weekend Ride lap
timing), 318 (authored structure materials), 320 (Top Gun 404 + cockpit depth near-plane), 321
(Camp Ember depth recess), 322 (Cobra scenery pass) and 323 (the Cobra conquest mission: owned
capture points, dug-in garrisons, tickets, minimap and full tactical map) shipped in sequence.
Build 325 (Cobra owner-flight scenery, navigation and gun-aid corrections) also shipped. Builds
253-298 shipped without this ledger always being updated in lock-step; treat per-build claims in
that range with care.
Promoted with Build 311 and still live: Builds 308 (consolidation: bounded long-range terrain marches,
Auto-GCAS reductions, flyby acoustics, tiered cast shadows, frame attribution), 309 (Top Gun ACM
preview) and 310 (rated-arena Multiplayer preview) went live as part of the Build 311
promotion. Multiplayer remains preview-only and fails closed unless `?preview=1` is explicitly
acknowledged. Top Gun is promoted in the Build 326 candidate by explicit owner direction after
the corrected programme-selector launch path passed focused authority/browser checks; no post-fix
human ACM flight is claimed.
Build 326 shipped Cobra first-use/grounded-start safety, provisional warned ground fire and subsystem
damage, mission-legibility and cold-spare turnaround, procedural AH-1G audio, the upper-sky seam
removal and target-designation graphics; plus the Top Gun terrain-owner launch repair and
owner-directed production promotion.
Build 327 shipped the iPhone/WebKit mission-picker hotfix. Deep-linked aircraft are centred inside
the horizontal poster rail without allowing `scrollIntoView()` to shift the overflow-hidden outer
Ready dialog sideways; diagnostics consent, Fly and Settings remain visible and tappable.
Build 328 shipped the owner-flight response: Cobra scenery/HUD/gunner/collision/golden-route work;
Top Gun protected 7.5/11 G controls, authoritative AUTO/MAN wing sweep and dedicated sound; F-22
and Rapier RTB corridors; and the first provenance-recorded Cobra/F-14 surrogate sample beds.
Next candidate: Build 329 (branch `fix/build-329-f14-regressions`) — the first Build 328 owner-flight
hotfix. Top Gun gains a real conventional recovery authority, pilot `O` and automatic Bingo
ceasefire/relief handoff, the shared highway-in-the-sky corridor, and the FUEL/NM, LB/MIN and LB/NM
navigation panel. Manual wing sweep now announces its forward/aft physical stop instead of looking
dead at 20/68 degrees. Both the generic suit/harness G stack and the F-14-specific G-driven intake
and structure layers are removed; measured buffet, airflow, engine and wing-actuator sound remain.

Build 325 shipped the following owner-flight findings and remains the baseline for this candidate.

**The red line, finally identified.** Reported at least three times and never diagnosed; a prior
pass recoloured the road material and cited the complaint in a comment, which made the artifact
less alarming and no less meaningless. `road-and-plantation-bench` is TERRAIN data — a 235 m
half-width shelf the landscape is graded along, carrying `authority.role: "terrain-authority"` —
but the road-decal pass collects any record whose `kind` merely CONTAINS "road", so the bench
passed, authored no width, took the 7 m default, and was drawn as a 7 m laterite stripe down a
13 km contour: across the valley, across the river with no bridge, edge to edge of the map. It
was never navigation. This world authors no road network at all, so the overlay is gone (built
draw calls 16 → 15) and a test forbids a terrain bench from producing one.

**Names.** "Cau Song Ma · THE JAW" and "Thac Nam Ngoi · THE STAIRS" bolted invented all-caps
callsigns onto real toponyms. Now transliterated Vietnamese in the form US 1:50,000 sheets
carried, plus the real designator for a firebase: FSB Ember, Cau Song Ma, Thac Nam Ngoi, Nui Da
Voi, Deo Hai Rang, Chua Trang, Hill 610 Relay, Phu Rieng Plantation and Mill, Dat Do Quarry.

**The chart has land on it.** "Really hard to figure out where to go" was not a styling problem:
the minimap was a dark box with four dots, and a map with no terrain cannot be matched against
anything visible out of the windscreen. It now carries a shaded-relief backdrop baked once per
mission from the SAME sampler the aircraft flies over, the river as a landmark, an objective ring
with range, a north arrow and a scale bar — BF:Vietnam's ordering, terrain first and flags on
top. Four names at 200 px overran the edge and collided, so the minimap names only the objective.

**The golden path**, requested repeatedly and never built: a soft wind-drifted ribbon of haze
flowing from ahead of the aircraft toward the objective, fading on arrival. One mesh, one draw
call, additive and depth-tested, opacity pinned under a subtlety guard. The first cut was 76 m
across at its far end and read as a flat sheet lying over the ground; it is a smoke trail now.

**The F-22 gun aid could only ever say "pull harder."** Its ease-off authority was gated on
`GDemand >= 2.0`, added for a real Build 80 complaint but keyed to how hard the pilot pulls
rather than to geometry — so on a tracking pass (median 5.7 G, at the envelope cap 56% of the
time) the clamp was live throughout and the correction was exactly 0.000 for 34.6% of nominally
active samples. Inside 1° of lead, 71% of required corrections were the ones it was forbidden to
make. Owner session `web-1786607256301-334574`: 808 rounds, 6 hits, 0.74%; lead error converged
at −1.21°/s while the aid acted and DIVERGED at +1.62°/s while clamped. The gate is now
geometric — ease only once the nose is PAST the lead line, bounded to 1 G — and the ballistics
were verified correct, so this was the aid and not the gun.

**The scenery, systemically.** The owner's fourth report of bad scenery, after two colour-fitting
passes and a prop-rescaling pass that all moved numbers without moving the picture. The cause was
density and it was structural: the vegetation scatter was WORLD-FIXED at 9,000 instances (desktop)
across a ~156 km² valley — one prop every 190 m, so the ground was bare by construction. The
terrain shader was never at fault; it already runs five noise octaves, a cultivation grammar,
drainage and slope faces under a scene with nothing standing on it.

Placement is now a deterministic 160 m tiled scatter that follows the camera, spending the same
per-tier allowance inside a radius. Positions derive from a spatial hash of world position, so a
prop holds its place and cannot pop, swim or re-roll. Measured at the same caps: desktop 27
props/km² → 1,273-1,459/km² within 500 m (~40-50×), balanced 15 → 787-1,500; draw calls unchanged
at 7, triangles 232,858 against a 900,000 ceiling, frame cost mean 0.13 ms / p99 4.2 ms.

Prop SIZES were wrong in three places, all the same defect — one sizing path serving several kinds
of object and branching only on role, so the descriptor that already carried the distinction was
never read. Ridge grass took the canopy band (16-30 m, ~20× life size); a fence-and-cart cluster
took the village-compound band (32 m wide); red-earth scrub took a rock band reaching 62 m tall.
Each now has its own band, pinned by a test that walks every role against the kinds that reach it.

Mist and water accents were untextured MeshBasicMaterial quads at 0.42 opacity, double-sided —
every card a hard-edged translucent grey slab. They now carry a radial falloff ramp.

**Build 326 correction:** the upper-field grey rectangle was the painted-cumulus shader's
non-periodic `atan` branch cut, not a mist card. The divergent cloud block is removed and the
canonical smooth cool sky remains. At altitudes well above the mission band the
valley sheds to bare ground via the pre-existing AGL shed — previously invisible because the scatter
was sparse everywhere. And the vegetation is one repeated silhouette, so it reads as conifers
rather than tropical jungle; density is fixed, variety is not.

VERIFICATION CAVEAT (carried from Build 321, the Camp Ember depth recess, and still open):
headless SwiftShader does not reproduce the symptom — the pad renders
clean in BOTH the before and after builds, so the harness cannot demonstrate the improvement.
Two speckle metrics were tried and both were shown to be measuring anti-aliased edges rather
than depth flips (the fix adds a real 25 cm step edge, which is why their counts rose). What is
confirmed: the camp still renders correctly, nothing buried, and separation went from 5 mm to
45 mm. Final confirmation needs a look on real hardware.

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
| F-22A · Guns Only (`first-merge`) | **production** | Aircraft picker | Build 238 automation plus a recorded 2026-08-02 human acceptance flight (session `web-1785627445839-631596`). Build 264 graduated the sparring pair together; Build 265 aimed Ace fire at the ballistic solution. Build 308 bounds pathological terrain marches, reduces Auto-GCAS terrain work, and restores physical flyby acoustics and cast shadows. Build 328 candidate adds current-position Call It A Day/Bingo RTB and removes the unsourced G-only canopy/seal voice. | Fresh human flight on Build 328 to confirm the corridor, ceasefire and revised sound; w1 snapshot despawn; descent sim-step spike; lead/ballistics quality |
| Rated arena (`multiplayer`) | **preview** | Preview acknowledgement only | Build 310 candidate adds same-origin matchmaking, shared human/bot Elo, bounded bot-only handicap profiles, outcome/fun reporting, and fail-closed launch/storage gates | Complete green gate; configured durable ladder storage; representative match, retry, abandon, and fly-again acceptance; multiplayer product acceptance before promotion |
| Rapier · Intercept (`rapier-intercept`) | **production** | Aircraft picker | Build 238 automation earns the 24 km/M4.2 shelf, takes one physical M61 pass, then traps and stops at 2,520 s; the no-trigger mirror traps without firing and truthfully ends Draw. Build 328 candidate adds fitted recovery energy, shared current-position Call It A Day/Bingo RTB, and authoritative player/enemy ceasefire. | Fresh representative human launch/intercept/recovery flight on Build 328 |
| Low-level drone intercept (`low-level-drone`) | **quarantined** | Preview acknowledgement only | Runtime and automated contracts exist | Ground-target/player-purpose closure and complete human flight |
| CASEVAC flight course (`medevac`) | **quarantined** | Preview acknowledgement only | Candidate guidance follows the authored orchard-gap route and briefs 32–42 m AGL near the windbreak | End-to-end human pickup, handoff, safe-exit, and debrief flight |
| Rapier circuits (`rapier-circuits`) | **preview** | Preview acknowledgement only | Circuit/recovery automation exists | Re-audit stale quarantines and record a complete representative circuit/trap |
| F9F-2 Panther off Essex (`korea-panther`) | **quarantined** | Preview acknowledgement only | Build 238 ownship-only kernel flies the production terrain catapult/route/return/groove to a physical W2 trap (100/100 focused); packaged route, touch-RTB, HUD, and barrier contracts passed silent-browser acceptance | Complete representative human desktop/touch flights and historical/presentation acceptance before any promotion |
| MIDGE-03 Facility Nine (`indoor`) | **quarantined** | `/indoor/` preview acknowledgement | Candidate UI now enforces doctrine-safe controls and blocks premature return | Re-drive the default stealth route and representative touch/keyboard paths |
| Parked Medevac command prototype (`medevac-command`, `/medevac/`) | **quarantined** | Standalone preview acknowledgement | Deterministic command/logistics prototype | It is research, not the canonical CASEVAC course; move out of production publish closure or explicitly graduate it |
| Cobra Canyon (`cobra-lab`, `/cobra-lab/`) | **production** | Standalone route | Hold the Bridge / Ember Run: AH-1G, sim-owned four-point conquest, dug-in garrisons, tickets, M134 + Camp Ember rearm, Tab/F gunner, north-up minimap/full map and golden path. Build 326 adds grounded Ready/swap safety, warned ground fire and subsystem damage, cold-spare turnaround, sky/target graphics and procedural AH-1G audio. Build 328 candidate responds to the recorded owner flight with denser/clearer scenery, corrected HUD/range/ticket staging, an improved golden route, LOS-owned V selection with an F firing chain, fortified-garrison collision and a provenance-recorded UH-1H/T53 surrogate bed. | Fresh owner flight on Build 328. Known open: ground-fire lethality and turnaround timing are provisional gameplay closures, not production-combat fidelity. Longer arc: DCS-BS1-grade flight dynamics. |
| Weekend Ride (`weekend-ride`, `/weekend-ride/`) | **production** | Aircraft picker + standalone route | YZF-R1 dynamics/powertrain/lean/load, lappable circuit from Build 264+. Build 267 adds ride telemetry (speed/gear/lean/lap/frame). Build 308 adds tiered shadows, sky-derived IBL, and horizon/far-plane corrections. Build 315 candidate makes it a game: lap/last/best on the helmet HUD, four sector splits, a live delta to your best, an off-track lap refused as a record, and a best that persists across sessions | Owner ride on Build 315: is beating your own best worth trying for? Ghost bike deliberately cut from v1 |
| Top Gun (`top-gun`) | **production** | Aircraft picker / main shell | Build 309 automation covers Tomcat AIM-9, MiG-28 boot and gun fire. Build 326 repairs the programme-selector launch stall and promotes the mission. The owner flew Builds 327 and 328 on 2026-08-14. Build 328 fixed the 13.8 G overshoot and added authoritative indicated AUTO/MAN sweep, but its first owner flight exposed missing RTB/fuel navigation, ambiguous sweep-limit feedback and two remaining synthetic pull-G sound paths. Build 329 candidate adds the conventional home corridor, `O`/Bingo ceasefire, navigation-rate panel, sweep-stop annunciation and removes those G-driven sounds. | Owner ruling remains deploy first, then fly the exact public artifact; re-fly Build 329 for RTB, fuel awareness, sweep-limit and audible acceptance. |

## Research-only packages

- **Armstrong cable-strike** is not an experience state and has no catalog or browser exposure.
  Its promotion gate is deliberately `SAFE / INELIGIBLE`. It must not be described as preview,
  quarantined, or production until immutable evidence and the executable promotion gate agree.

## Release health

- Live production is Build 327, revision `15acf65ac3ae6939f90dfb493986406051b60ee0`, shipped from
  PR #72 with both required Verify contexts green. Local gate
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
