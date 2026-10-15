# Rapier PATHFINDERS (design)

Status: Owner-approved concept, 2026-10-16 · Design only · Branch `rapier/pathfinders`.
Grounding: `65b7d886`; references below describe that revision, including conflicts with older docs.
Companion to the Rapier mission/ops, gun-drone and operations-economy documents.

## Thesis

Dawn catches six silver balloons above the cloud tops. Below them, towns are still dark.
One gondola goes black as Rapier tears past; another drifts across a town and must be left alone.
“Tower clear. Stand by.” There is enough fuel for another balloon, perhaps. Then the horizon lights.

**PATHFINDERS is a hunt that becomes an appointment you can miss.** The balloons are the eyes of
a swarm carried by **Vesper**, a fictional launch vehicle operated by an adversary state, the
fictional Karsk Directorate. Kill eyes now, or preserve the position and energy to kill the launch.
The briefing names targets and restrictions; linked tracks, pad activity and the later F-22 night
sortie establish what is at stake. No opening lecture, villain speech or downrange payload chase.

## Decision record

| Choice | Decision |
|---|---|
| Priority | Exciting choices, readable set pieces and worthwhile partial success; physics earns the opportunities |
| Flight regime | Hunt FL650–700 inside the requested FL560–700 operating band; nominal OFT-class dash ~M3.7, not a promised M4 |
| Attack doctrine | One committed ascent pass; hunt along successive balloon lanes, never orbit a missed target |
| Balloon kill | Destroy the gondola; envelope punctures produce a slow sink with the relay still working |
| Weapons | Ownship gun plus four carried gun-drones; one deliberate `F` release per drone, with a clear weapon selector |
| Launch | Seeded uncertainty, visible preparation, bounded holds and real scrubs; never wait for the player to arrive |
| Vehicle classes | Vesper-H: Starship-class return-to-pad booster; Vesper-M: Falcon-class downrange ship recovery |
| Fallback | H offers booster denial on return; M offers none. Booster denial cannot recall an escaped payload |
| Consequence | Ascent breakup before payload escape prevents the raid; lost relay sectors shrink/degrade a surviving raid |
| Delivery | Phase 1 is the complete balloon hunt and recovery; no rocket, campaign sequel or promised future climax required |
| Default entry | Short start: airborne at FL650–700 at dawn, first balloon lane ahead; get to the exciting part fast. Buried-tube departure is an optional full-sortie variant |

## Existing hooks and boundaries

Every reuse below needs a PATHFINDERS-specific configuration or adapter. New systems are identified
explicitly; do not repoint shared fixtures or infer implementation from a similarly named enum.

| Hook | Source and intended reuse / required change |
|---|---|
| Mission doctrine | `docs/airframes/rapier/00-mission-and-ops.md:7`, `:15`, `:37`, `:52`: buried launch, thin-air dash, single pass, recovery; historical ~M3.69 and 12 G |
| Live envelope conflict | `sim/FlightModel.cs:773`, `:822`, `:824`: canonical Rapier v2 currently commands **6.5 G**, including override. `sim/RapierMission.cs:175` retains legacy M3.55; `:180` binds the balloon target to v2. Keep the requested 12 G doctrine as a documented design ceiling, never grant it as live authority |
| Launch / home | `sim/Doctrine/Beats.cs:1315` inherits the fixed strip/rail/home setup at `:1162`, `:1259`, `:1294`, `:1300`; retain production v2 launcher/load overrides at `:1343` and `:1350`. Compose these into a new factory, replacing gallery targets and mission rules |
| Mission sequencing | `sim/RapierMission.cs:9`, `:1440`: reuse flight phases and RTB/recovery priority. Add a separate PATHFINDERS act director; balloon kills or drone release must not invoke generic no-opponent/egress transitions at `:1451` / `:1483` |
| Existing balloon mission | `sim/Doctrine/Beats.cs:1312`, `:1354`, `:2028`: beat 12 is now a local three-balloon gallery, zero gun-drones, arcade. Preserve it; add a distinct mission ID/factory, assign a free beat index at implementation |
| Economy discrepancy | `docs/rapier-operations-economy.md:13` still says beat 12 deals operations jobs. Actual dealt factory is `sim/Doctrine/Beats.cs:1437`, with `RapierOperations` at `:1505`; explicit seed logic at `:1511`. Reuse deterministic seed practice, not its wall-clock fallback |
| Economy settlement | `sim/RapierEconomy.cs:61`, `:87`, `:115`, `:138`: +90 CR balloon contract, mission-mode gate, recovery and consumables. New adapter supplies one completed balloon objective, not six copies of the existing Boolean |
| Balloon physics | `sim/FlightModel.cs:452`, `:470`, `:516`, `:1720`: buoyant surrogate and force term. Author a separate FL650–700 payload/volume card; existing scientific float is 33.5 km and gallery float is different |
| Wind / weather | `sim/Turbulence/LayeredWindField.cs:47`, `sim/WeatherProfile.cs:11`: shared wind sampling and weather bundle drive balloon drift, debris prediction and visibility; no renderer-only wind |
| Projectile truth | `sim/Doctrine/GunKill.cs:520`, `:546`, `:690`: moving-target swept intersections and ballistic lead. Extend component intersections; existing `sim/RapierMission.cs:186` 56 m envelope hit radius must never become a gondola kill volume |
| Gun-drones / input | `docs/rapier-gun-drone-system.md:18`, `:23`, `:36`; `sim/SimulationSession.Controls.cs:102`; `sim/SimulationSession.cs:2232`; `sim/SimulationSession.Rapier.cs:349`, `:361`, `:400`: four authored, one active today, release currently initiates egress. New selected-weapon routing and bounded actor collection are required |
| Drone flight / recovery | `sim/RapierGunDrone.cs:58`, `:79`, `:94`: inherited release energy, separate pickup, turbine only at ≤M1.15 and ≤12 km. Balloon attacks are gliding attacks; coordinated screening is new work |
| Fuel / exit | `sim/FuelPlan.cs:97`, `:106`, `:113`; `sim/RapierMission.cs:1442`: range-aware reserve and pilot/bingo RTB. Extend the prediction for pad detour and low-altitude return, without weakening reserve floors |
| F-22 sequel | `sim/Doctrine/Beats.cs:1884`, `:1901`, `:2022`; `sim/Doctrine/DroneRaidEvaluation.cs:9`, `:126`; `sim/SimulationSession.Opponents.cs:1050`: beat 8 has four **staged** raiders, defended radius, leak evaluation and target handoff. Parameterize a linked variant; standalone beat 8 stays intact |
| HUD / art | `web/wwwroot/render/mission/rapier_guidance.js:3`; `web/wwwroot/render/scene/high_altitude_balloon.js:81`, `:104`: short phase tokens and balloon mesh with a visible gondola; synchronize its new collision transform with presentation |
| Outcome persistence | `web/wwwroot/render/progression/campaign_progression.js:294`: reuse hash-keyed idempotent application pattern. A versioned cross-mission outcome record is **new**, not an existing campaign capability |
| Instrumentation / perf | `sim/SimulationSession.Telemetry.cs:253`: sequenced tick/entity events; extend payloads for this mission. `docs/graphics-and-60fps-contract.md:22`, `:60`: retain delivered-frame and component budgets |

The existing gallery's proximity-triggered lethal balloon mines
(`sim/SimulationSession.Rapier.cs:495`) are deliberately excluded: these balloons are relays.
The historical 12 G/~M3.7 envelope is an acceptance question for current v2, not permission to
retune shared physics. Phase 1 must demonstrate the requested altitude/speed lane with the live
airframe; use its lower structural limit and adjust geometry. Gate: sustain FL650–700 at M3.5–3.8
for ≥30 s into a valid gondola pass, then recover with the live reserve intact, at canonical fuel/
four-drone mass and without exceeding 6.5 G. If that fails, Phase 1 release is blocked pending an
explicit envelope decision; do not substitute the FL450 gallery, a different jet or inflated thrust.

## Player-facing beats and clocks

Times are **provisional pacing targets**, not rocket measurements. `H+0` is arrival at the first
hunt lane; `L+0` is actual ignition/liftoff. Launch planning starts at sortie creation, independent
of player progress. The H-relative timings below describe the reference route, not trigger gates.
Default short-start hunt: 6–10 minutes including nearby recovery; optional full sortie: 20–30 minutes.
Start airborne at FL650–700 at dawn with the first balloon lane ahead (owner doctrine: get to the
exciting part fast). Keep buried launch as the optional full-sortie opening. The default short start
uses an authored, physically achievable airborne state; no mid-sortie teleport, refuel or frozen
adversary clock.

| Beat / time | What happens and what the pilot decides |
|---|---|
| Optional full-sortie departure, first 5–8 min | Buried tube → ramp flash → turbine climb → ram handover. Sunrise reaches the balloons first. Fuel, not a countdown tutorial, introduces the cost of getting high |
| Act 1, H+0–90 s | First two balloons lie along a clear-ground lane. The huge envelope invites the wrong shot; a puncture wrinkles it, but its relay symbol stays live. The dark gondola and a clean gun/drone kill teach the distinction |
| Act 1, H+90–240 s | One drift footprint crosses a town; a second safe balloon lies farther from the ascent corridor. Keep speed for authority, spend a drone to take a better glide line, or leave both and reposition |
| Act 2 warning, nominal H+90–360 s | AWACS reports venting, service tower/arm retract, hold, resume or scrub. Apparent readiness can be followed by silence. New information changes the crossing uncertainty and the value of one more balloon |
| Act 2 launch, nominal H+180–360 s | Plume is visible from 150 km in clear line of sight. Holds may add up to 120 s; no launch later than reference H+480 s. The rocket continues even if the pilot chose badly |
| Act 2 crossing, target L+60–110 s | Predicted crossing moves across the canopy. Choose head-on alignment or match-and-chase before the turn becomes unaffordable. Band residence and the firing interval come from the class trajectory |
| Act 2 pass, roughly 0.5 s head-on trigger | Near ~2 km/s closure on the authored head-on geometry, shoot once and cross the debris line. A successful structural kill breaks the vehicle apart **at your altitude**. A miss leaves a shrinking plume and a still-useful balloon tally |
| Act 3, H class only, target L+5–8 min | Returning booster crosses FL560–700 during its fictional entry burn. Take the fast high pass, leave with the balloon result, or spend the last margin descending toward the landing burn |
| Act 3 final, near end of that return | Landing burn over the pad, inside the SAM umbrella. A towering target, bright exhaust, a bad place for Rapier to be slow. One low pass; escape immediately, hit or miss |
| Act 4, typically 4–8 min after exit decision | Turn home on remaining fuel. Surviving carried drones can screen real pursuers; spent drones cannot magically reappear. Recovery completes the sortie, while loss still preserves effects already achieved |

Phase 1 ends its hunt after 4–6 minutes or an earlier pilot/bingo exit, then recovers. Its climax
is the last safe gondola window before drift or fuel closes the lane; it contains no launch tease.
In the full mission, a genuine scrub ends the launch threat for this operation. Keep earned relay
kills and return; do not spawn a replacement rocket to force a climax. Scrubs are rare on first play.

## Decisions, tension and failure that remains worth flying

- **Kill the easy envelope or aim properly:** envelope hits buy no relay reduction. Sink changes
  later geometry slowly; a gondola kill gives an immediate dark sector and a physical falling object.
- **Another balloon or the corridor:** show time-to-crossing uncertainty against own arrival, plus
  the existing fuel reserve. A hold can rescue an overcommitment, but is never guaranteed to do so.
- **Own gun or drone:** inherited-energy gliders can set their own approach to a near-stationary
  gondola while Rapier maintains ram speed (~1 km/s overtake). Four is a hard inventory, not a refill.
- **Head-on or match-and-chase:** head-on maximizes intercept opportunity but gives a half-second
  class burst; chase offers steadier initial aim, then the fictional rocket pulls 3–4 g away.
  That is rocket trajectory acceleration, not permission for Rapier to sustain 12 G at low q.
- **Respect the town or take the shot:** ROE applies to predicted debris, not the target's map pin.
  Waiting for drift, changing approach, or leaving the target are valid wins in judgment.
- **Return high or gamble low:** a missed ascent never demands the booster dive. Lost fuel, inlet
  response, actual available lift and SAM warning make the final chance frightening without a hidden
  scripted death. Booster denial is a separate result; surviving to land is still valuable.

No mandatory restart for a missed shot, one surviving balloon or missed ascent. Debrief shows
relay sectors denied, payload escaped/prevented, booster denied/returned, ROE and recovery as
separate facts. Ownship loss retains prior confirmed effects; abandoning before launch cannot
turn an unresolved launch into a scrub. No kill reward for violating the debris restriction.

## HUD and radio: two compact rows, one crossing symbol

Keep flight tapes, lead pipper and reserve in their existing positions. Replace the mission cue
area with **two aligned rows**, no panel title or explanatory paragraph. Example hunt/launch state:

```text
◉  ●●○○○○   2/6 BLIND   [DRONE ▾]   F DRONE 3
◇  ├──┼─┤   +18…42 s XING             ◌ HOLD
```

First row: dead/live relay sectors plus selected weapon and remaining carried drones. `GUN/DRONE`
is a standard labelled selector; **F operates only the selected weapon** (hold for gun, rising edge
for one drone). `F DRONE 3` becomes `F GUN` when GUN is selected; retain inventory beside the selector.
PATHFINDERS routes input before the legacy sweep latch/weapon step: GUN cannot set the sweep latch;
DRONE cannot set gun trigger state. Clear held/latch state on selector change, pause and restart;
require release before rearming. The act director alone enables egress; the legacy drone-away flag
cannot force it. Test taps, holds, repeats and selector changes across fixed ticks with both weapons.
Second row: player arrival error relative to the predicted crossing interval; after launch, it
contracts to a time estimate with uncertainty. Before launch it is a readiness-based window, never
a leaked seed timer. `HOLD`, `VENT`, `ARM`, `FLIGHT`, `SCRUB` replace one short state token.

The conformal diamond marks where the trajectory next crosses **current Rapier altitude**; a
short bar shows timing error, a hollow diamond means prediction uncertain, a crossed diamond means
unreachable. Update as own altitude changes; do not point at the rocket's current position as if it
were the intercept. Selected balloon has a gondola bracket; crossed bracket plus amber/red tint
means debris footprint blocked. Colour always has a shape counterpart. No automatic target hopping.
Descriptions, units, footprint map and uncertainty explanation live in existing detail/help surfaces;
accessible labels carry the same meaning. No in-flight CR or tutorial paragraph.

Radio is event-driven and short: “Venting.” “Tower retracting.” “Holding.” “Scrub confirmed.”
“Launch. Crossing sixty-five thousand.” “Payload away.” “Booster returning.” “Bingo. Home.”
Priority: immediate threat/ROE → crossing → fuel → pad observation; suppress duplicate chatter and
leave the trigger interval quiet. No rocket roar at 150 km; any later acoustic effect obeys delay.
Before HUD implementation, compare three graphical cue variants at this density in dawn/night;
retain two rows. Then inspect actual laptop/phone viewport captures, detail open/closed and 200%
text, with headless QA. This spec does not claim an implemented or visually verified HUD.

## Simulation contract per object

| Object | Minimum credible model; bounded work |
|---|---|
| Relay balloon | Six maximum. Independent seeded wind drift from the shared sounding; vertical buoyancy/drag equilibrium at 19.8–21.3 km. Separate leak state reduces lifting-gas support continuously; provisional puncture sink 0.5–2 m/s, bounded by buoyancy/drag rather than instant altitude loss. Gondola remains powered while sinking |
| Gondola / envelope | Distinct component IDs and transforms. Start from the visible 5.6 × 2.8 × 4.2 m gondola box; geometry is surrogate, damage threshold provisional. Swept projectile/component intersection at sim cadence; one confirmed disabling gondola hit kills the relay. Envelope hits only leak; suspended rigging/panels are not a giant lethal sphere |
| Debris / ROE | New conservative footprint from current altitude, velocity, wind uncertainty and component descent/drag. Include live rounds and falling gondola; test footprint against authored inhabited polygons, not only terrain type. Unknown/overlapping footprint blocks drone release and autonomous fire; player gun remains controllable and violations are recorded. Recheck drone authorization at firing time |
| Pad / launch controller | Seeded Vent → Retract → Armed → Launch, with authored Hold/Resume/Scrub edges. Observations can lag truth; estimates expose that uncertainty. Hard upper bound on holds; the same seed/input history reproduces outcome. Pad damage is not an alternative prelaunch win condition |
| Ascent vehicle | One table evaluator shared by both classes, with absolute liftoff epoch and local launch-axis transform. Position, speed, acceleration, stage state and plume all derive from the same sampled curve. Gun damage resolves a physical breakup; no F-key proximity kill or cue-driven success |
| Returning booster | A branch/stage of the same evaluator, preserving separation position/velocity. H boostback, high entry burn and landing burn are table segments. M continues to a downrange ship outside the playable interception opportunity. An ascent destruction cancels only descendants physically lost with it |
| Gun-drone | Own physical actor, inherited energy, separation delay, gondola target assignment, finite ammunition and release-envelope check. Up to four active; one assignment per target unless a prior drone fails. Glide attack at hunt altitude, turbine/RTB only after existing gates. Screen assignment uses actual pursuer geometry; no scalar range bonus |
| Pursuers / SAM umbrella | Small authored set: at most two reactive pursuers and two pad threat sites. Pursuit starts from detection/alert facts, not every F press. New pad threat adapter must provide acquisition, warning, missile travel and escape geometry; no invisible damage volume. No detailed real-world battery model required |
| Payload / sequel | No downrange simulated chase. Record escape once; derive a deterministic city-bound raid manifest from surviving relay sectors. Renderer, debrief and sequel all consume that authoritative record |

### One ascent/return model, per-class data

Each class owns ordered rows **`time_s, altitude_m, downrange_m, speed_mps, accel_mps2`**, plus
stage/event, source locator and epistemic label per quantity. Coordinates are geometric altitude
above launch datum and distance along the authored launch axis. Rows include ignition, band entry/
exit, separation, boostback, entry-burn limits, landing-burn limits and touchdown/ship recovery.
Interpolate a position/velocity-consistent curve; derive acceleration and compare it with the row
value. Reject non-monotonic time, discontinuous separation, impossible endpoints and derivative
mismatch; do not independently interpolate five columns into contradictory motion. No class-specific
physics fork. Holds shift liftoff, never stretch the seconds after liftoff. Weather affects sightings
and balloons; it cannot slow the rocket to rescue the player.
Rocket lead must predict the table's acceleration over projectile flight time; the existing
constant-velocity solution is only a starting estimate. Verify predicted and actual swept hits.

| Parameter / anchor | Vesper-H | Vesper-M | Evidence / label |
|---|---|---|---|
| Vehicle and military payload | Heavy reusable, return to pad | Medium reusable, downrange ship | **fiction**; real class names describe scale, not operators or exact replicas |
| Ascent band crossing | Target L+60–110 s | Target L+60–110 s | **provisional** pacing envelope; source trajectory samples before freezing either table |
| Pursuit acceleration | 3–4 g over the short chase opportunity | Same target range, class-specific duration | **fiction** requirement; not a measured Starship/Falcon acceleration claim |
| Return opportunity | Target L+5–8 min; high burn then pad | None within Rapier's sortie area | **fiction** H burn/route; M ship disposition is authored, not a claim that Falcon always lands at sea |
| Medium timing anchor | Not copied as heavy flight data | Separation 160 s; first listed entry burn 449 s; landing 569 s | NASA Crew-1 planned timeline, p1 [S1]; **surrogate** when used for Vesper, not measured flight |
| Burn sequence anchor | Entry/landing sequence informs fictional return only | Separation 144 s; entry burn 392 s; landing burn 453 s | SpaceX CRS-10 planned timeline, p2 [S2]; **surrogate**, explicitly an RTLS mission, not the M ship route |
| Heavy separation anchor | Approximately 180 s, Starship flight 3 | Not used | NASA flight report [S3], observed approximate event; **surrogate** for Vesper, no implied return/altitude data |

[S1]: https://www.nasa.gov/wp-content/uploads/2021/05/crew-1_timeline_nov15.pdf
[S2]: https://www.nasa.gov/wp-content/uploads/2018/07/crs10presskitfinal.pdf
[S3]: https://www.nasa.gov/directorates/esdmd/artemis-campaign-development-division/human-landing-system-program/nasa-artemis-mission-progresses-with-spacex-starship-test-flight/

[NASA Crew-1 timeline][S1] and [SpaceX CRS-10 press kit][S2] establish event ordering and minute-scale
anchors, **not altitude/downrange/speed curves**; [NASA's flight-3 report][S3] adds a heavy-class event.
S1 repeats an “entry burn” label at 539 s; do not silently relabel or use that ambiguous row.
Before Phase 2 flies, obtain per-class primary webcast/
flight-data samples with timestamp and uncertainty; unsupported interpolants stay `provisional`.
Reserve `measured` for actual sampled observations with provenance. Do not make up missing telemetry.
The H high-altitude entry burn is an intentional Vesper fiction, not an assertion about Super Heavy.
~1 km/s balloon closure, ~2 km/s head-on closure and a ~0.5 s burst are geometry targets to measure,
not constants that override relative velocity, firing solution, hitbox or trigger duration.

## Consequence and economy

Snapshot the relay tally at payload escape (or at confirmed ascent prevention), not at later landing.
Each balloon serves one sector. A dead relay leaves its swarm group without terminal updates;
some vehicles fail to reach the city, survivors follow less accurate preloaded routes. No exposition
is needed when the sequel has fewer tracks, larger gaps and less precise approaches.

Provisional mapping: `B = killed gondolas / initial gondolas`; full city-bound count `N = 12`.
Divide N evenly among the rung's three or six relay sectors. An intact sector sends its full group;
a dead sector sends half, using preloaded coordinates; the other half never reaches the city.
Thus escaped payload gives `N × (1 − 0.5B)` raiders: B=0 yields 12 fully cued; B=0.5 yields 9
(three degraded, six cued); B=1 yields 6, all degraded. The half-blind description refers to lost
relay coverage, not a fixed 50% accuracy debuff. Degradation means
seeded lateral/arrival dispersion and no terminal retargeting, not random invulnerability or weaker
bullets. Every gondola kill removes one city-bound raider on six-balloon rungs, two on the first rung.
Ascent breakup before escape: **zero**. Scrub: zero for this operation, separately labelled postponed.
Booster kill after separation: **unchanged current swarm**, plus confirmed launcher denial.

Use beat 8's staged-stream evaluator for the linked night-over-city variant: counts describe the
whole raid, not simultaneous simulated aircraft. Degraded groups need a new routing adapter and
explicit off-target resolution, without counting misses as F-22 gun kills. A zero raid bypasses
construction (`DroneRaidScenarioDefinition` rejects empty targets at `sim/Doctrine/DroneRaidEvaluation.cs:20`)
and displays the quiet city/raid-prevented result. New follow-up contract has two kinds:
`NoRaid(reason, sourceHash)` and `Raid(manifest, sourceHash)`; NoRaid never invokes the raid evaluator.
Never spawn a token enemy to keep the beat running.
Standalone beat 8 retains its four-target exercise; linked state is opt-in and versioned.

Persist mission/seed/version, class, killed relay IDs, payload state, booster state, ROE, recovery
and a finalized outcome hash. Apply once across replay/reload; unfinished records cannot overwrite
finished ones. Freeze the authoritative seed/config schedule at sortie creation. On loss/exit,
advance that same sim-time schedule to scrub or payload escape, without player input or new drone
kills; use the kill tally at exit. Radio observations and wall-clock absence cannot change it.
Seal once; resume/reload cannot reroll launch or scrub. Test menu exit, loss and prelaunch abandonment.
Restart is a new attempt. Phase 1 seals at hunt exit with launch state `not_applicable`; it never
creates a linked raid or a false prevented-launch result.

PATHFINDERS explicitly opts into `RapierOperations`: retain **one +90 CR balloon contract** for
meeting the rung's safe gondola quota, plus existing recovery/consumable/inspection settlement.
No per-envelope payout, per-balloon multiplication or invented rocket bounty. Ascent prevention
and booster denial have their own outcome fields, not fake balloon neutralizations. No economic
HUD; physical mission effects survive an ROE violation, but the contract credit does not.

## Difficulty and ladder variety

Rungs change information, geometry and competing demands, not hitbox size, rocket toughness or
Rapier's available G. Keep cockpit/control complexity orthogonal
(`docs/complexity-ladder.md:36`). Explicit seeds vary launch window, hold/scrub sequence, class,
wind/drift, weather and dawn/night; pair comparable seeds so variety is not simply escalating count.

| Rung | Hunt / safe-kill quota | Launch / exit demand |
|---|---|---|
| 1 — First light | 3 balloons, quota 1; two safe lanes, one plainly blocked; clear dawn | H, broad readiness estimate, no first-sortie scrub; head-on setup generous; booster dive optional |
| 2 — Moving windows | 6, quota 2; crossing town footprint, meaningful drone reserve | H/M disclosed by identification; 0–1 hold, rare scrub; choose chase/head-on early; pursuers on exit |
| 3 — Last margin | 6, quota 3; shifting wind, broken cloud or night silhouette | 0–2 bounded holds or scrub, narrower observed timing; strong pad pressure and costly low diversion |

Every seed must have at least one safe ballistic/drone opportunity and a feasible conservative
route to the ascent pass with recovery reserve. Not every optional balloon is collectible.
First-play seeds cannot secretly launch before a correctly flown arrival. Later bad positioning
can miss the launch; log that as a decision outcome, not an impossible seed disguised as difficulty.

## Assets and performance

| Asset | Deliverable / bounded presentation |
|---|---|
| Balloon | Reuse envelope/rigging art; distinct relay gondola, puncture/sink and relay-dead states; LOD silhouette keeps gondola aim cue honest |
| Rocket | Two fictional Vesper silhouettes sharing attachment/stage schema, damaged parts and one breakup system |
| Plume | Pad vent, ascent, entry and landing variants; clear-weather 150 km visibility, terrain/cloud occlusion, bounded particles and emissive impostor at distance |
| Booster | H separated body, boostback orientation, entry/landing burns and breakup; M distant departure only |
| Pad / tower | Launch mount, retracting service structure, landing pad, two visible threat sites; night lighting and simple state animation |
| Sound / consequence | Short AWACS set, local gun/breakup cues, existing Rapier ambience; linked F-22 city-at-night presentation and quiet zero-raid result |

End-to-end **p95 ≤18.5 ms**, ≥59 delivered FPS, p99 ≤22 ms, ≤3% frames over 18.5 ms and MAX ≤100 ms.
Retain existing 8 ms normalized simulation and 12 ms GPU ceilings; provisional incremental targets:
PATHFINDERS logic ≤0.5 ms/delivered frame, added effects ≤1 ms GPU. Component budgets are not additive.
Six drifting balloons, one launch assembly/two separated stages, four drones, two pursuers and two
SAM sites are hard scenario maxima; pool debris and cap particles. Simplify distant visuals before
reducing authoritative collision cadence. Preload/decode this bounded asset set before departure;
no shader compilation or asset download at the ascent pass. Test cold entry plus offline transitions.
Measure the hunt, 150 km plume, burst/breakup, booster/SAM dive and four-drone egress separately in
eligible five-second windows. Per workload, run two ≥60 s seeded live-sim/render legs after 15 s
preparation; count all ACTIVE frames, including first plume/burst/breakup. Exclude only pause/replay/
background per `docs/graphics-and-60fps-contract.md:16`; measure cold loading separately. Record
raw frame deltas, workload/seed, build/asset hashes, viewport/DPR, quality, hardware renderer and power.
Use headless full Chromium with the hardware renderer verified; label
software evidence separately. Close harness browsers/servers; never seize the owner's browser.
Owner's headless-only QA direction supersedes the contract's older headed-focus harness clause.

## Telemetry and acceptance: does it make people want another run?

Log seed/class/rung, airframe/data hashes, act/phase, authoritative time, fuel/reserve, q/Mach/G,
selected weapon, drone inventory/assignment, component hit, ROE footprint state, pad observation,
launch truth versus displayed estimate, crossing prediction/error, actual closure/window, outcome.
Emit transition events and bounded sampled rows; keep a short high-rate ring around each pass.

| Question | Initial playtest gate / diagnostic (provisional, not claimed results) |
|---|---|
| Does Act 1 stand alone? | ≥70% of new pilots achieve a safe gondola kill; median first useful shot ≤90 s after H+0; ≥70% rate hunt tension ≥4/5 |
| Do players reach the main event? | ≥80% of non-scrub rung-1 starts reach a physically valid ascent firing opportunity; report all-start rate too, including loss/quit. Reaching means ROE-clear lead within gun range and live flight authority, not merely phase=Attack |
| Are the choices real? | Count leave-hunt time, safe targets declined, drone spend/reserve and chosen pass geometry; investigate if one tactic exceeds 80% after learning |
| Is uncertainty tense or idle? | Time since meaningful shot, decision or changed observation; investigate gaps >60 s in the hunt/launch section and quits during holds |
| Is failure still satisfying? | Record miss→continue→recover and optional booster attempts; target ≥60% of ascent misses continue, plus direct player reports that their balloon work mattered |
| Are cues fair? | Prediction error at commitment, late ROE changes, envelope-hit→gondola correction; zero false clearances in deterministic footprint tests |
| Is the sequel causal? | Test zero/partial/full raid manifests, post-separation booster kill, scrub, loss, exit and reload; no duplicated credits or effects |

Use at least 12 observed first-play sessions across starter seeds before tuning targets; separate
automation and manual runs. Review flight recordings and ask what decision felt best/worst;
percentages cannot prove excitement. Validate reference seeds with actual flown energy/fuel,
swept high-closure hits, sustained envelope-only fire, moving ROE boundaries and drone ammo exhaustion.

## Phased build plan

1. **PHASE 1 — Balloon hunt, independently fun and shippable.** Separate mission entry, three/six
   relay balloons, real gondola kills, drift/sink, debris ROE, four carried drones with explicit
   release/weapon routing, hunt deadline, safe-kill contract, egress and recovery. Establish the
   FL650–700 flown envelope first. Initial engineering slice has one active drone; Phase 1 exit
   scope includes the bounded four-actor path. No rocket dependency or linked-sequel dependency.
   Gate: standalone fun metrics, physical hit/ROE tests, HUD viewport review, perf and existing
   Rapier/gallery/economy regressions. End cleanly with denied sectors and the recovered aircraft.
2. **PHASE 2 — Launch and one pass.** Source/validate both class tables, add pad states, bounded
   uncertainty, 150 km plume and crossing prediction. Prove head-on and chase geometry, local
   breakup and miss→egress. Ship only once conservative players can reach the ascent pass;
   never solve a failed gate by buffing Rapier or pausing the rocket.
3. **PHASE 3 — Return gamble and contested egress.** H high burn, low pad pass and bounded SAM
   model; M explicitly has no fallback. Physical drone screening and detection-driven pursuers.
   Gate: declining the gamble remains viable, booster denial leaves escaped payload intact,
   and return fuel/performance remain credible under the worst allowed actor/effect load.
4. **PHASE 4 — Consequence and variety.** Persist immutable results, parameterize the linked beat-8
   night raid and zero-raid bypass, add degraded routing, then seed ladder variants. Gate:
   deterministic manifests/reload, NoRaid bypass without evaluator/target construction, unchanged
   standalone beats, measured fun funnel and perf matrix.

No code accompanies this design. Orbital pursuit, detailed orbital mechanics, new Rapier propulsion,
real military launch-site reconstruction and a general campaign economy are outside this mission.
