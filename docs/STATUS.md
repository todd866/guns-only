# Current product and verification status

Updated: 2026-09-04
Production: Build 351, revision `d1b2c88d6edd0370f65a40edc745cce88e6b9736`.
Next candidate: none queued.
F-22 Guns Only remains an open-ended fight rather than a scored mission.
Call It A Day or Bingo enters one typed, immediate ceasefire/RTB transition and publishes a
terrain-aware left-hand runway pattern. Floating chevrons carry the energy lesson without another
panel: green is on-speed, yellow is too fast and red is too slow. The browser cannot invent a
moving join route or declare success; only a survivable runway touchdown and physical full stop
complete recovery, while a missed final recycles the pattern.

Build 349 made every mission family driven by an autonomous pilot that controls
the production keyboard and gamepad path and keeps an authority tape. The old browser checks could
report green while a route sat paused behind Ready, authority crawled, or a QA shortcut skipped the
part a player actually flies; the new drivers fail closed on crashes, hidden pages, timeouts,
skipped phases and missing terminal evidence. `mission_ai_suite.mjs` dispatches one driver per
family — fixed-wing, Cobra, indoor, weekend, Okanagan and CASEVAC — and refuses unknown missions.

The F-22 gate is not release-qualified, and the harness now says so honestly. Survival was being
read as defensive quality: the two tapes that ran the full 180 seconds untouched both recorded zero
opponent rounds, one of them before the defensive-power repair that appeared to explain it, while
both fatal tapes recorded nine rounds and three hits. A sortie whose opponent never fired and was
never killed is now an invalid defensive sample rather than a quiet pass. Two controller fixes go
with it: ordinary maintenance of an already-captured gun plane no longer trips the tactical
plane-change unload, and the forward-quarter pursuit cap no longer costs the aft quarter its turn
authority, with a stateful handoff trim holding the narrower plane until the live pursuit side is
physically captured. The AI still has never fired a production round; that remains the gate.

Live 350 paraded after WEAPONS HOT: the opening Ace pair was briefed to present, and
`WantsToFire` stayed false until presentation ended. The gun-funnel latch (two seconds inside 12°
and 900 m) never tripped for a visitor who found the fight but never tracked, so the 180-second
untouched tapes with zero opponent rounds were the present orbit, not a quiet Ace. Build 351 ends
the present at Kestrel pop-out and after four seconds inside 1.5 km even without a gun solution.
Splashing the mouth pair hands the first sortie to recovery instead of staging the endless gym;
returning Guns Only visits are unchanged. Top Gun ends after two splashes and sends you to the
boat. Cobra combat works on a standard pad: LB cycles the mark, RB holds gunner consent, and the
triggers stay collective. The player-AI tape still does not consume `lead_solution_valid`.

Build 348 put the first sortie in Kestrel Gorge, a dedicated mountain
cell with one authority-matched, collidable valley surface: steep asymmetric walls, a winding river
and service road, a low-level ingress, and a visible opening into the missile arena. The same
simulation-owned surface drives collision and presentation; it is not a decorative canyon placed
around flat physics. A fixed world-space chevron route and persistent action ladder teach Follow
valley → Fox Two → track → Fox Two → guns / RTB without promoting weapons before the pop-out gate.

The intro stages behind a deliberate Ready interlock. The card explains that the single Fire action
launches the two missiles one at a time and becomes the gun trigger only when they are gone. Choose
another mission safely returns to the aircraft programme. Returning pilots get a visible Replay
valley intro action in the normal picker; it restages the authority once, clears the replay query,
and leaves the next flight to hand off naturally into the full Guns Only programme.

Build 347 closes the connective player journey across the production routes. Shared and standalone
briefs, pause screens and result cards use the same semantic hierarchy, modal ownership, focus
behavior, primary/secondary action language and return-to-aircraft route. Production route smoke
now enumerates every public entry, verifies the correct mission authority behind each brief, and
requires the executable player contract rather than a boot-only canvas check.

Build 347 also closes two mission-result seams. Top Gun no longer treats a bolter as the end of the
sortie: it keeps the carrier recovery active, uses a Top Gun-only Mk 7 Mod 3 public-data arrestment
surrogate, completes a stopped trap before the result, and combines combat custody with the full
carrier pass in one debrief. Cobra preserves VALLEY HELD / VALLEY LOST even when the aircraft is
lost on recovery, then reports the recovery failure separately with rounds, friendly kills and a
specific next-sortie correction.

Build 347's Cobra pass now covers the full ingress → destroy → clear/cover → hold → RTB loop.
The locking gun pit, ten-minute verdict and BINGO remain explicit. Iron Bell has dry bridgeheads,
Plantation follows terrain, Camp Ember's ground surfaces render, and reciprocal fire uses authority
events. Long Fang keeps navigation truth without the fake waterfall slab.

The owner's 42.4-second recording showed dense close guidance, a persistent centred Lead caption
and little visible sense of battle; the result screenshot was dominated by zero rows and repeated
instructions. The file had no audio stream, so it could not prove the reported silence. Guidance is
now 12 cues at 120 m spacing with 160 m lookahead. The recording also exposed the main amber ladder
rebasing from ownship every 25 m—about every 0.37 seconds at the recorded speed. Both Cobra guidance
layers now keep authored world coordinates until authority advances the route, and the amber shader
has no time-driven highlight. Lead calls move upper-left and expire after 3.2
seconds; brief and pause expose Sound; debriefs suppress raw IDs, empty facts and repeated retry copy.

The old performance harness stopped behind the brief and measured a paused card. A pre-fix Apple M5
hardware run took 9.92 s to Ready and delivered 7.36 fps with 184 ms p95 frames while terrain-shaped
wind performed 720 field evaluations per second. Wind now refreshes deterministically at 10 Hz—60
evaluations per second. The corrected gate crosses Start and measures departure plus live battle;
the same machine now reaches Ready in 1.996 s, acknowledges input in 16.6 ms and runs at about 60 fps.
A closed-loop AI pilot now flies the production gamepad path through active authority gates, then
uses the real Tab/F combat inputs. It rejects a slow or covered boot, paused/frozen authority,
invalid gate progress, moving combat guidance, protected-departure fire, missed visible battle,
friendly kills, a gunner that never authorizes, ammunition that never drains, selected-target
damage that never occurs, or telemetry without advancing Cobra rows. The Build 348 full engagement
run reached Ready in 1.283 s, crossed Depart → Ingress → Engage, travelled 3,546 m through five real
gate-volume entries at 119.978 Hz with no stall, and produced the selected target's authority
`gun-hit` at 190.30 seconds. One round dealt the authored 0.55 damage; both factions' fire was visible,
and 162 combat-guidance samples recorded zero rebuilds. A raised shared target
aim point also removes the Iron Bell bridge-surface self-mask that previously left the gunner stuck
on MASKED; visual lock, LOS cache, servo, HUD bracket and padlock now share that point.

The same consolidation retains aircraft identity on picker cards, preserves explicit silent QA and
saved audio across routes, and removes duplicate Three.js instances. Standalone copy has executable
density limits. F-22 promotion now ends the surviving wingman's presentation orbit so combat AI
recommits instead of flying away.

The first-run HUD now keeps weapons and contact presentation cold until the Kestrel Gorge pop-out,
including the compact mobile tactical rail, while retaining the essential FOLLOW THE VALLEY lesson.
Weekend Ride gives the active road view the full canvas after Start, and Okanagan's dispatch,
objective, reserve and result states are asserted as one continuous player flow. The full gate now
tests the visual scorers, while `bin/look` remains the explicit real-frame capture and scenery veto;
a gate that captured no pictures reports NOT RUN instead of silently counting as green.

Build 344 established one explicit player lifecycle across the six production programmes. The
aircraft picker names each programme's verb and endpoint; Cobra resolves the ground war into a
flyable RTB and only debriefs after stable Camp Ember recovery; Weekend Ride has an authored End
Ride, result, coaching and return path; and every Okanagan sortie owns dispatch, current objective,
terminal result, correction, replay choice and aircraft-menu return.

Build 344 also replaced the undifferentiated sound stack with causal, profile-specific audio.
YZF-R1 gets an authoritative crossplane engine, road, grass, tyre, brake and shift graph; Cobra rotor,
ground-effect, anti-torque and damage textures follow projected flight truth; Fire Boss scoop and
drop voices follow published water rates; and AIM-9 launch, radio-priority ducking and one bounded
safety-warning arbiter make the important event audible without relying on limiter overload.
All candidate audio acceptance is silent (`?audioQa=silent`).

Production: Build 351, revision `d1b2c88d6edd0370f65a40edc745cce88e6b9736`. Builds 343 (Soniachne first-visit on-ramp), 347 (shared
player journey and Top Gun bolter retry), 349 (mission-AI suite honesty), 350
(conventional F-22 recovery) and 351 (finite billed sorties, presenting Ace, Cobra pad combat)
shipped after the 2026-08-24 pin; treat that date as historical.
Builds 312 (Cobra
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
Build 329 shipped the first Build 328 owner-flight hotfix. Top Gun gained a real conventional
recovery authority, pilot `O` and automatic Bingo
ceasefire/relief handoff, the shared highway-in-the-sky corridor, and the FUEL/NM, LB/MIN and LB/NM
navigation panel. Manual wing sweep now announces its forward/aft physical stop instead of looking
dead at 20/68 degrees. Both the generic suit/harness G stack and the F-14-specific G-driven intake
and structure layers are removed; measured buffet, airflow, engine and wing-actuator sound remain.
Build 333 shipped the recovery/flight-UX candidate: rebuilt Camp Ember operations, F-14A-only Top
Gun route, successive opponents, conventional Case I carrier recovery, a real Escape pause menu,
longer-look-ahead Cobra route ribbon, persistent recovery gates and equivalent F-22 RTB authority.
It also shipped physical F-14 sweep effects and indicator, gun/recovery telemetry, and the 35 NM
Rapier three-balloon-mine intercept at FL450 with no time compression and a guided RTB.
Build 334 improved Cobra's cockpit-visible scene: broken monsoon cloud shelves and a shared sun
aureole, shadow-readable layered jungle, rotor-wash and pad-edge wear, support vehicles and braced
camp silhouettes. Camp Ember remains one merged draw. The scenery comparison camera was corrected
from a retired jungle coordinate to the authoritative firebase.

Build 335 removed the synthetic Cobra
departure-lane target and keeps every hostile outside Camp Ember's protected rear-area perimeter,
including wave selection, movement and chase logic. The shared Cobra/F-14/F-22/Rapier world-space
guidance renderer now retains a valid ladder through a transient empty frame but keys that continuity
to the sortie and procedure so stale routes cannot survive a restart or outbound-to-RTB handoff. The
Top Gun numeric recovery lecture is removed; the F-14 sweep indicator is a recognisable articulated
Tomcat planform. Cold-launched combat missions now carry an executable one-minute intended-profile
ingress acceptance standard.

Build 336 turns Hold the Bridge into an
authored formation departure. The player launches as Dash 2 behind a visible Ember Lead, follows a
dense world-registered climbing corridor through a deliberate dogleg, and receives concise calls
explaining the DShK threat and route handoff. Gate altitude truth now reaches the renderer instead
of being replaced by generic terrain clearance, departure progress advances along the curved path,
and the first hostile objective remains stable until captured. Target garrisons and AA sites have
distinct HUD/map symbology and threat rings. A normal collective pull retains only a small governed
Nr transient, and telemetry now records active-gate geometry, path error, Lead spacing and radio
phase. Cobra directional stability now uses actual sideslip to weathercock the fin/fuselage toward
the relative-air track, with that aerodynamic authority fading at low translational speed so the
tail rotor retains a decisive pedal turn; air track, exact body-frame sideslip, horizontal airspeed
and fin-directional airspeed are recorded for owner-flight diagnosis.

Build 337 added the Civilian aircraft domain and one shared AT-802F Fire Boss/Okanagan system with
three sortie types: Water Circuits,
Solo Initial Attack and Large Force Employment. It includes Kelowna departure/recovery, sourced
NRCan CDEM terrain, an authored Okanagan Lake scoop lane, an evolving exercise fire, continuous
world-space guidance, protected taxi/operational/final reserves, local diagnostic telemetry and a
real pause menu. The extension adds Air Attack, bird dog and helicopter traffic to the solo systems
rather than replacing them with a separate simulation.

Build 338 closed the outstanding review findings from Builds 329–337: one CDEM/shoreline truth for
Okanagan rendering, collision, fire and traffic; terrain-cleared Cobra formation guidance through
the real route join; persistent live-AA cues; mobile cloud-cost containment; terminal mission exit
and sortie-wide telemetry ledgers; a Top Gun carrier recovery corridor that remains over
authoritative water while the ship steams; and explicit provenance for the AH-1G and F-14
surrogate constants.

Build 340 made Fire Boss one coherent Guns Only flight experience: the shared fixed-wing HUD,
controls, target cycle, padlock, highway and pause semantics; scoop and water-drop audio; concise
transient instructor calls; and an unobstructed outside-world view. The Okanagan scenery uses the official BC
Freshwater Atlas lake shoreline with real CDEM relief, corrected scoop-lane water geometry,
recognisable YLW/Highway 97/bridge structure, population placement and elevation-aware dry
ponderosa/Douglas-fir vegetation.

Build 342 replaced the throttle-pitched
sawtooth/triangle Fire Boss engine graph with a real, public-domain single-engine PT6 machinery
bed plus a governed 1,700 RPM, five-blade pressure cadence; separate torque-driven prop wash,
exhaust and reduction-gear broadband layers; an Ng-driven compressor feature; cockpit attenuation;
and unchanged water/scoop/drop effects. Np, torque and Ng are one simulation-owned set of explicit
authorities. Silent OfflineAudioContext QA verifies the 141.7 Hz blade-pass feature, load response,
recording decode/loop and clipping headroom. The former commanded-attitude toy is also replaced by
coefficient-based angle-of-attack, lift/drag, flight-path, roll-rate, coordinated-turn, post-stall,
power-spool and float-planing dynamics, with those states published to sortie telemetry.

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
density and it was structural: the vegetation scatter was a WORLD-FIXED instance budget (desktop
cap 9,000 across a ~156 km² valley) that realised only ~27 props/km² in the near field — one
prop every ~190 m — so the ground was bare by construction. The 9,000-cap figure is a budget, not
a realised density; 9,000 / 156 km² would be ~58/km² and ~132 m spacing. The
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

- **production** — visible on the public front door and launchable without `?preview=1`.
  Human-acceptance evidence lives in the matrix blocker column; a production row may still
  be awaiting a fresh flight of the live SHA.
- **coming-soon** — visible on the public front door as a teaser; selectable for briefing, never launches.
- **preview** — intentionally retained for development; requires explicit preview acknowledgement.
- **quarantined** — has a known player-path or acceptance blocker; must fail closed before launch.
- **retired** — retained only for history or migration and must not be routed.

`hidden` HTML is never a release control. Main-shell routing and standalone sub-apps enforce these
states, while `?preview=1` provides a deliberate testing acknowledgement without promoting a route.

## Experience matrix

| Experience | State | Public surface | Current evidence | Promotion blocker |
| --- | --- | --- | --- | --- |
| F-22A · Guns Only (`first-merge`) | **production** | Aircraft picker; first visit opens the Kestrel Gorge guided sortie; returning pilots can replay it from the picker | Build 238 automation plus a recorded 2026-08-02 human acceptance flight (session `web-1785627445839-631596`). Build 264 graduated the sparring pair together; Build 265 aimed Ace fire at the ballistic solution. Build 308 bounds pathological terrain marches, reduces Auto-GCAS terrain work, and restores physical flyby acoustics and cast shadows. Builds 328-329 add current-position Call It A Day/Bingo RTB, remove the unsourced G-only canopy/seal voice and close conventional runway recovery. Build 343 adds the one-shot valley → two heaters → guns on-ramp; Build 347 adds the deliberate Ready state, authority-matched Kestrel Gorge, cold contact/weapons presentation and replay entry. A promoted surviving wingman now leaves its presentation orbit and recommits under combat AI. Build 351 ends presenting at pop-out or after four seconds inside 1.5 km, and recovers after the mouth pair on the first visit. | Fresh human first-visit, return-visit and promoted-wingman flights on the candidate; corridor/ceasefire/sound/airfield picture from Build 330 remains open |
| F-22A · Ace Duel (`ace-duel`) | **preview** | Hidden deliberate-testing route; requires `?preview=1` | Same F-22/Su-27 physics, one Ace. Metal tape 375 killed in 57.4 s with 3 hits, zero physical roll rocking and zero runaway chase. | Complete representative human capstone flight before any public promotion |
| Rated arena (`multiplayer`) | **preview** | Preview acknowledgement only | Build 310 candidate adds same-origin matchmaking, shared human/bot Elo, bounded bot-only handicap profiles, outcome/fun reporting, and fail-closed launch/storage gates | Complete green gate; configured durable ladder storage; representative match, retry, abandon, and fly-again acceptance; multiplayer product acceptance before promotion |
| Rapier · Intercept (`rapier-intercept`) | **production** | Aircraft picker | Build 333 stages three lethal-drone balloon mines 35 NM away at FL450, provides a visible outbound intercept path and 45-second reaction clock, disables time compression, then hands off to the shared amber RTB corridor and midpoint-arrestor recovery after all three kills. The measured automated handoff is 3:18 at M1.33/FL432 with 29 seconds left on the mine clock. | Fresh representative human launch/intercept/recovery flight on Build 333 |
| Low-level drone intercept (`low-level-drone`) | **quarantined** | Preview acknowledgement only | Runtime and automated contracts exist | Ground-target/player-purpose closure and complete human flight |
| CASEVAC flight course (`medevac`) | **quarantined** | Preview acknowledgement only | Candidate guidance follows the authored orchard-gap route and briefs 32–42 m AGL near the windbreak | End-to-end human pickup, handoff, safe-exit, and debrief flight |
| Rapier circuits (`rapier-circuits`) | **preview** | Preview acknowledgement only | Circuit/recovery automation exists | Re-audit stale quarantines and record a complete representative circuit/trap |
| F9F-2 Panther off Essex (`korea-panther`) | **quarantined** | Preview acknowledgement only | Build 238 ownship-only kernel flies the production terrain catapult/route/return/groove to a physical W2 trap (100/100 focused); packaged route, touch-RTB, HUD, and barrier contracts passed silent-browser acceptance | Complete representative human desktop/touch flights and historical/presentation acceptance before any promotion |
| MIDGE-03 Facility Nine (`indoor`) | **quarantined** | `/indoor/` preview acknowledgement | Candidate UI now enforces doctrine-safe controls and blocks premature return | Re-drive the default stealth route and representative touch/keyboard paths |
| Parked Medevac command prototype (`medevac-command`, `/medevac/`) | **quarantined** | Standalone preview acknowledgement | Deterministic command/logistics prototype | It is research, not the canonical CASEVAC course; move out of production publish closure or explicitly graduate it |
| Cobra Canyon (`cobra-lab`, `/cobra-lab/`) | **production** | Standalone route | Hold the Bridge / Ember Run: AH-1G, sim-owned four-point conquest, objective-locking gun pit, tickets, M134 + Camp Ember rearm, Tab/F or LB/RB gunner, tactical maps and guided ingress. Builds 326-334 added grounded safety, ground fire/damage, turnaround, audio, corrected targeting, denser scenery and rebuilt Camp Ember. Build 347 closes the brief-to-RTB flow, battlefield readability and owner-reported load failure. The corrected hardware gate reaches Ready in 1.996 s, accepts input in 16.6 ms and runs at about 60 fps; a closed-loop production-input pilot checks active gates and advancing telemetry. Build 351 lets a standard-mapping pad cycle with LB and hold gunner consent on RB without stealing collective triggers. | Complete a human brief-to-RTB sortie; authored Long Fang/unit/structure art and insertion ETA remain open. |
| Weekend Ride (`weekend-ride`, `/weekend-ride/`) | **production** | Aircraft picker + standalone route | YZF-R1 dynamics/powertrain/lean/load, lappable circuit from Build 264+. Build 267 adds ride telemetry (speed/gear/lean/lap/frame). Build 308 adds tiered shadows, sky-derived IBL, and horizon/far-plane corrections. Build 315 makes it a game: lap/last/best on the helmet HUD, four sector splits, a live delta to your best, an off-track lap refused as a record, and a best that persists across sessions. Builds 344-347 add the authored brief → ride → pause/end → result/replay loop and collapse the briefing sidebar after Start so the road owns the full canvas. | Owner ride on Build 347: is beating your own best worth trying for? Ghost bike deliberately cut from v1 |
| Top Gun (`top-gun`) | **production** | Aircraft picker / main shell | Build 309 automation covers Tomcat AIM-9, MiG-28 boot and gun fire. Build 326 repairs the programme-selector launch stall and promotes the mission. The owner flew Builds 327 and 328 on 2026-08-14. Build 328 fixed the 13.8 G overshoot and added authoritative indicated AUTO/MAN sweep. Build 329 adds ceasefire/RTB authority, navigation-rate awareness, sweep-stop annunciation and removes the remaining G-driven sounds. Build 331 made the player F-14A-only with successive MiG-28s and Case I recovery. Build 347 keeps recovery active after a bolter and combines combat plus carrier-pass evidence in the debrief. Build 351 ends the fight after two splashes and sends you to the boat; knock-it-off still recovers early. | Owner ruling remains deploy first, then fly the exact public artifact; re-fly two-kill-then-trap, bolter retry, Case I, arrestment, fuel, sweep-limit and audible acceptance. |
| Okanagan Fire Boss (`okanagan-fireboss`, `/okanagan/`) | **production** | Civilian aircraft picker + standalone route | Build 337 adds an NRCan CDEM Okanagan world, Kelowna departure and recovery, live lake scooping, partial loads and water drops, fuel-protected RTB, a deterministic evolving exercise fire, and three shared-system sorties: Water Circuits, Solo Initial Attack and Large Force Employment. Builds 344-347 connect dispatch, live objective, reserve truth, pause/end, outcome, correction, replay and return-to-aircraft across all three sorties, with route smoke asserting the exact authority behind each brief. | Fresh owner flight of the Build 347 artifact; flight/fire models are declared training surrogates, not OEM or operational wildfire forecasts. |

## Research-only packages

- **Armstrong cable-strike** is not an experience state and has no catalog or browser exposure.
  Its promotion gate is deliberately `SAFE / INELIGIBLE`. It must not be described as preview,
  quarantined, or production until immutable evidence and the executable promotion gate agree.

## Release health

- Live production is Build 351, revision `d1b2c88d6edd0370f65a40edc745cce88e6b9736`. Local gate
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
