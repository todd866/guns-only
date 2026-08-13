# Current product and verification status

Updated: 2026-08-13
Production: Build 323, revision `7caf763dbf2e12eb2420852ec39eb19ca261645e` (verified live via
/api/build-info 2026-08-13, with remote route smokes on all four routes). Builds 312 (Cobra
contact envelope), 313 (Camp Ember firebase, ramp Cobras, bird swap), 315 (Weekend Ride lap
timing), 318 (authored structure materials), 320 (Top Gun 404 + cockpit depth near-plane), 321
(Camp Ember depth recess), 322 (Cobra scenery pass) and 323 (the Cobra conquest mission: owned
capture points, dug-in garrisons, tickets, minimap and full tactical map) shipped in sequence.
Builds
253-298 shipped without this ledger always being updated in lock-step; treat per-build claims in
that range with care.
Promoted with Build 311 and still live: Builds 308 (consolidation: bounded long-range terrain marches,
Auto-GCAS reductions, flyby acoustics, tiered cast shadows, frame attribution), 309 (Top Gun ACM
preview) and 310 (rated-arena Multiplayer preview) went live as part of the Build 311
promotion. Top Gun and Multiplayer remain preview-only and fail closed unless `?preview=1` is
explicitly acknowledged; their promotion to production routes still requires representative
human ACM and multiplayer player-path acceptance.
Next candidate: Build 324 (branch `feature/cobra-conquest`) — the conquest mission from Build
323 plus five owner findings from flying it.

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

**Open, and NOT fixed:** a grey rectangle artifact remains visible in the upper field of view. It
was hypothesised to be a mist card; that hypothesis was wrong (the mist defect above was real and
separate) and the object is still unidentified. Also, at altitudes well above the mission band the
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
| F-22A · Guns Only (`first-merge`) | **production** | Aircraft picker | Build 238 automation plus a recorded 2026-08-02 human acceptance flight (session `web-1785627445839-631596`). Build 264 graduated the sparring pair together; Build 265 aimed Ace fire at the ballistic solution. Build 308 candidate bounds pathological terrain marches, reduces Auto-GCAS terrain work, and restores physical flyby acoustics and cast shadows | Fresh human flight on Build 266+ to confirm Ace gunnery; w1 snapshot despawn; descent sim-step spike; lead/ballistics quality |
| Rated arena (`multiplayer`) | **preview** | Preview acknowledgement only | Build 310 candidate adds same-origin matchmaking, shared human/bot Elo, bounded bot-only handicap profiles, outcome/fun reporting, and fail-closed launch/storage gates | Complete green gate; configured durable ladder storage; representative match, retry, abandon, and fly-again acceptance; multiplayer product acceptance before promotion |
| Rapier · Intercept (`rapier-intercept`) | **production** | Aircraft picker | Build 238 automation earns the 24 km/M4.2 shelf, takes one physical M61 pass, then traps and stops at 2,520 s; the no-trigger mirror traps without firing and truthfully ends Draw | Fresh representative human launch/intercept/recovery flight and complete green release gate |
| Low-level drone intercept (`low-level-drone`) | **quarantined** | Preview acknowledgement only | Runtime and automated contracts exist | Ground-target/player-purpose closure and complete human flight |
| CASEVAC flight course (`medevac`) | **quarantined** | Preview acknowledgement only | Candidate guidance follows the authored orchard-gap route and briefs 32–42 m AGL near the windbreak | End-to-end human pickup, handoff, safe-exit, and debrief flight |
| Rapier circuits (`rapier-circuits`) | **preview** | Preview acknowledgement only | Circuit/recovery automation exists | Re-audit stale quarantines and record a complete representative circuit/trap |
| F9F-2 Panther off Essex (`korea-panther`) | **quarantined** | Preview acknowledgement only | Build 238 ownship-only kernel flies the production terrain catapult/route/return/groove to a physical W2 trap (100/100 focused); packaged route, touch-RTB, HUD, and barrier contracts passed silent-browser acceptance | Complete representative human desktop/touch flights and historical/presentation acceptance before any promotion |
| MIDGE-03 Facility Nine (`indoor`) | **quarantined** | `/indoor/` preview acknowledgement | Candidate UI now enforces doctrine-safe controls and blocks premature return | Re-drive the default stealth route and representative touch/keyboard paths |
| Parked Medevac command prototype (`medevac-command`, `/medevac/`) | **quarantined** | Standalone preview acknowledgement | Deterministic command/logistics prototype | It is research, not the canonical CASEVAC course; move out of production publish closure or explicitly graduate it |
| Cobra Canyon (`cobra-lab`, `/cobra-lab/`) | **production** | Standalone route | Hold the Bridge / Ember Run: AH-1G, sim-owned ground war, tip/hold win/lose, M134 + Camp Ember rearm, Tab/F gunner. Build 301: land spur Camp Ember FOB, airborne soft gates, denser Iron Bell destroyables. Build 306: limited SCAS only. Build 307: stronger hover TQ residual, cruise weathervane, terrain wind + yaw/wind telem. Build 308 candidate adds tier-bounded cast shadows and real terrain shadow receivers. Build 311: body-aligned HUD eye + heading-relative hover cue, collective hub moment + split torque yaw + loaded gust response, flattened rendered spawn apron + 74-part authored Camp Ember firebase. Build 312: contact envelope with gear-damage/rollover/spin/water tiers, cause cards, touchdown telemetry, autorotation audit. Build 313: FSB-read Camp Ember (dossier-derived), three ramp Cobras + bird swap, FOB INEFFECTIVE terminal, flicker probe + decal bias. Build 322: scenery pass (palm material/scale, tracks-to-nowhere removed). Build 323 candidate makes it a conquest game: four owned capture points, dug-in garrisons only the turret can break, tickets replacing the hidden control threshold, an always-on north-up minimap and a full corridor map on M with the objective as its caption | Owner flight is the gate on both the conquest loop and the Camp Ember flicker. Known open: frame pacing at Camp Ember measured p95 33.3 ms / max 50 ms on Build 321 production telemetry, unexplained. Longer arc: DCS-BS1-grade flight dynamics |
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
