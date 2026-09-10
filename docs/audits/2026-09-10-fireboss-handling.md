# Fire Boss handling audit — 10 September 2026

The owner reported that Okanagan's Fire Boss handles incorrectly despite passing tests, and that
its behaviour differs substantially from the F-22. This audit starts from Build 358,
`da061df80d72e4ddf1cb709af85f949e80f9a8e5`. Baseline defects below describe that revision;
subsequent sections describe the Build 359 candidate and its separate validation. This is not
a completed human-flight acceptance report.

## Shared kernel does not mean shared handling

Fire Boss uses the production `AircraftSim` through `FixedWingAircraftVehicleAdapter`, but that
fact alone does not establish either its own handling or equivalence to the F-22. Its
[mission wrapper](../../sim/Okanagan/FireBossDynamics.cs) supplied a separate command translation
at the audited baseline: pitch became a load-factor demand of `1 + 2.5 × pitch` when positive and
`1 + 1.5 × pitch` when negative. Its runway/float resolver owns contact motion and liftoff; its payload, fuel, PT6 shaft
power, cambered-wing coefficients and control parameters differ. The Okanagan page also has its
own controls, coordinate presentation and camera path. Each of those boundaries needs evidence.

The parallel implementation audits identified a mirrored coordinate presentation and a
zero-incidence drag discontinuity caused by applying symmetric-wing angle normalization to the
Fire Boss's nonzero `CL0`. The precise corrections and validation are recorded below. A successful adapter-equivalence test could not detect either class of defect.

## What the old passes established

The file links point to their current versions; the behaviours described in this section refer
to Build 358 before the corrections recorded below.

- [FireBossDynamicsTests](../../sim.Tests/Okanagan/FireBossDynamicsTests.cs) compares one adapter
  step with a second instance of the same kernel, parameter set and command translator. It proves
  integration parity, not aerodynamic or control correctness. The short pitch/roll pulses check
  useful direction and release properties, but cover one empty approach condition and have no
  upper response bound. The takeoff test imposes minimum altitude and speed, so excessive
  performance can also satisfy it.
- Its baseline approach helper closed vertical-speed feedback every 120 Hz physics tick. The
  old [full-route pilot](../../sim.Tests/Okanagan/OkanaganTestPilot.cs) protected loaded airspeed,
  compensated bank lift loss and integrated pitch trim. Completion demonstrated that this
  controller can fly the mission; it cannot establish acceptable unassisted handling.
- The payload acceleration test first scoops the loaded aircraft for fourteen seconds and then
  compares final speeds after four seconds of power. The empty aircraft has not received the same
  preparation, so the result does not isolate acceleration from matched initial conditions.
- [OkanaganFlightPathTests](../../sim.Tests/Okanagan/OkanaganFlightPathTests.cs) checks completion,
  runway stop, water, fuel, clearance and protection outcomes. It does not bound oscillation,
  control effort, response rates or energy behaviour.
- The [browser AI](../../tools/perf/okanagan_ai_player.mjs) traverses production controls using a
  synthetic standard gamepad plus keyboard yaw/drop/scoop events. It reads ideal authority state
  and compensates the gamepad deadzone. This does not validate keyboard pitch/roll, touch, or a
  physical controller. The release gate runs scorer unit tests; its Okanagan browser smoke covers
  dispatch and menus. The long AI flight remains a separate runner.

The earlier [flight-validation record](2026-09-06-okanagan-flight-validation.md) explicitly
distinguished deterministic flight regression from browser-input and human acceptance. Retain
that distinction when describing the model's provisional control derivatives.

## Reproduced oracle gaps and bounded correction

Before the correction, the existing successful scorer fixture still returned `pass: true` after
each independent mutation: reverse reported authority pitch/roll; substitute pitch ±720°, roll
±1080°, TAS 900 m/s and vertical speed ±300 m/s; or hold pitch and roll fully deflected throughout.
These are synthetic falsification probes of the assessment, not claims that the live aircraft
produced those tapes. Its checks only required some substantial requested input and some
substantial reported input, with no correspondence between them.

The existing top-level `pass`, `failures` and `metrics` remain usable by the mission-suite runner.
The result now declares `passScope: mission-lifecycle-and-telemetry-sanity` and separates:

- `lifecycle`: the existing mission, input-presence, audio and debrief checks;
- `telemetrySanity`: required finite observations, nonnegative clocks/speed/stores, normalized
  throttle/engine/axis domains, the mathematical ranges of the reported asin/atan2 angles, and
  equality of vertical speed with the world-velocity Y component;
- `handlingEvidence`: always `unverified`, with `approved: false`;
- `controlDirectionEvidence`: explicitly `unverified`.

The metrics forwarded by `mission_ai_suite` also carry the assessment scope and false handling
approval/control-direction verification flags, so aggregation does not erase the disclosure.

The sanity rules use floating-point tolerance, not newly guessed aircraft response limits.
They do not certify plausible maximum speed, loads, control effort or energy conservation.
Invalid observations survive compact sampling as `null` and fail assessment; the controller's
defensive numeric fallbacks no longer turn missing/NaN observations into convincing zeroes.
The runner stops commanding the aircraft when it encounters an invalid sample.

Sign correlation remains unverified for a concrete timing reason: a sample records the new
command computed **after** observing state, before that command is applied. Meanwhile
`recordTelemetry` publishes input at 0.25-second simulation intervals. The observed input may
belong to an earlier command. The tape now retains `authorityInputSimS` and describes command
timing, but there is still no applied-command timestamp/acknowledgement. Guessing an alignment
window could reject legitimate reversals or bless unrelated inputs. Reversed-sign and saturated
fixtures therefore cannot earn handling approval; this patch does not claim to detect reversal.

## Acceptance missing at the baseline

Independent response envelopes must follow the intended pilot-axis contract rather than be tuned
to a model. The baseline needed fixed-command pitch/roll pulse-and-release tests at approach and cruise speeds,
empty/full matched-state acceleration and climb comparisons, throttle-step/idle-glide energy
checks, and command-continuity checks through wheel/float liftoff. No feedback pilot should correct
the aircraft during those response windows. The current model's separate response and performance
tests are recorded in the final implementation evidence; route-pilot results cannot replace them.

Repeat a short set of taxi/rotation, climb, moderate turn/release, power reduction, approach/flare
and loaded scoop-departure tasks through keyboard, physical standard gamepad, and touch in both
orientations. Record input events, applied authority commands and aircraft/camera response with
aligned timestamps. Record sustained saturation and repeated corrections. A successful circuit
or a nonblank screenshot cannot replace this evidence.

## Validation of this oracle change

The focused scorer and mission-suite run passed 28/28 tests. It covers preserved lifecycle compatibility, rejection of
missing/nonfinite/domain-invalid data, preservation through JSON serialization, and explicit
non-approval of reversed-sign, saturated and mathematically valid extreme-response fixtures.
These are assessment tests. They do not constitute a new flight or a human handling acceptance.

## Gross mass and mission loading correction

The [Fire Boss manufacturer's current specifications](https://www.firebossllc.com/specifications-and-performance/)
publish 7,257 kg for land takeoff and scooping, and 5,216 kg for water takeoff, land landing and
full-stop water landing. The original game cap was 8,200 kg. An on-step scoop is therefore distinct
from stopping on water and taking off again. This pass corrects the scoop/gross cap; it does not
invent a crash rule for crossing an operational landing limit.

The same source gives approximate float-equipped empty mass of 3,980–4,070 kg, an 820-US-gallon
(3,104-litre) hopper, and explains that delivery-cycle loads start around 600 gallons and grow
as fuel burns. Its useful-load row does not reconcile exactly with its empty-weight endpoints;
use gross minus a stated operating configuration instead of copying that inconsistent range.

The game's 4,420 kg **operating** mass remains a provisional inclusive configuration, not a
measured empty weight. Its pilot/equipment/ballast breakdown has not been established. Keeping
that assumption explicit avoids silently exchanging it for a bare aircraft to preserve a large
payload. Fuel remains 610 kg for Water Circuits, 760 kg for the basic fire sortie and 925 kg for
defence sorties. At those launch fuel quantities, the corrected cap permits 2,227, 2,077 and
1,912 kg of water respectively, before fuel burn. All are below the former 2,800 kg mission gate.

The [mission coordinator](../../sim/Okanagan/OkanaganFireMission.cs) now captures
`ScoopTargetWaterKg` at entry to the water run from hopper capacity, available gross-mass allowance
and the mission's required climb performance, including retained water. The launch value is a preview; fuel burn during
the scoop does not move the captured target. Reaching it within one litre advances the mission.
`DropTargetWaterKg` is then captured at 85% of the actual acquired load, an explicit exercise
completion allowance derived from the former 2,400/2,800 requirement. It is not an aircraft limit.
Water released before acquisition cannot count toward the new delivery.

Both targets are separate from hopper capacity in the snapshot. Flight-path and browser lifecycle
checks compare achieved loading/delivery against those authority targets. Missing targets fail
the browser assessment. Coordinator tests independently cover fuel-dependent capture, retained
water, an unmet target, zero available load, and short versus completed delivery. Synthetic
protection fixtures now keep their water and gross mass consistent. These changes prevent a
legal partial load from becoming an impossible mission while retaining the existing fuel plan.

## Wing and configuration evidence still bounded

The [Air Tractor 2022 brochure](https://airtractor.com/wp-content/uploads/2022/09/Air-Tractor_802F-Brochure_2022.pdf)
supports 401 ft² (37.254 m²) wing area and 59.25 ft (18.059 m) span. Its 3,197/3,270 kg empty masses
describe one-/two-seat **landplanes** and must not replace Fire Boss float-equipped mass. Its
308-US-gallon standard fuel capacity and optional 380-gallon configuration are volumes; neither
alone establishes a 925 kg usable mission fuel mass without density/configuration assumptions.

The [Wipaire two-seat conversion manual, revision AG](https://www.wipaire.com/wp-content/uploads/2016/10/10000-SMAN-Dual-Seat-Rev-AG.pdf)
identifies added wing/tail vortex generators and extended elevator servo tabs (pages 11 and 76).
These changes substantiate treating float conversion as its own configuration. They do not supply
`CL0`, a complete lift/drag polar, inertias or control derivatives. The game's `CL0 = 0.92` and
`CLalpha = 4.60` imply a linear zero-lift angle of −11.46° in its body reference; this is a model
consequence, not a measured Fire Boss angle. A stall-speed match cannot establish that intercept.
No unsupported aerodynamic coefficient was retuned as part of this mass audit.

## Route-pilot migration

After the conventional elevator change, the unchanged legacy route pilot failed all five real
flight-path tests before scooping: it remained in Depart until fuel required RTB. Water Circuits
eventually returned a terminal Complete state without water; the explicit payload and cycle
assertions rejected that result. The other four cases reached the 6,000-second test limit.
The same run passed 103 other Okanagan cases, including all five new payload-target cases and
the four scripted protection lifecycle cases. Evidence: `/private/tmp/fireboss-mission-target-tests.log`.

The [test-only route pilot](../../sim.Tests/Okanagan/OkanaganTestPilot.cs) now estimates an
attached-flow equilibrium angle from dynamic pressure, mass, actual bank and the current engine's
normal thrust component, combines it with
the requested flight-path angle, and uses elevator feedforward plus pitch-angle and pitch-rate
feedback. The feedforward includes the nonzero body pitch rate of a coordinated banked turn;
damping that rate to zero would fight the turn. Accounting for nose-up propeller support also
prevents excess lift trim from holding a slow approach above the runway. It receives the
aircraft's immutable launch trim from test setup and
subtracts that from its requested elevator position. The old vertical-speed integral and
G-demand bank compensation were removed. The initial pilot migration retained routes, gates, fuel plan and clearance/protection
assertions; later production route and load-planning corrections are recorded below. The surface departure technique is described below. This controller is not installed in the game
and its ability to compensate the aircraft cannot approve human handling. Its new flight-path
results must be recorded separately from the pre-migration failures above.
The browser AI's old flight controller has not been migrated in this pass; its long-flight
acceptance remains pending. Its updated scorer and target checks are not evidence that this
controller can fly the corrected model.

The trace also exposed a production progression defect: the wide departure gates could be passed
below 730 m, after which continuing along the visible route left the departure transition's
2.2 km proximity zone. Departure now still requires flight, 730 m altitude and at least the first
gate, but also accepts an already-passed turn-west gate as evidence of the departure manoeuvre.
It does not require an unadvertised orbit at the airport. Coordinator regressions reject both an
under-height crossing and an ungated shortcut; the test pilot follows the displayed route.

With legal water loaded, immediately holding the 8° float pitch stop trapped the test aircraft
near 43.7 m/s because of high-incidence drag. The mission now advises accelerating on the step
before rotation. Its suggested rotation speed uses current mass, atmospheric density and lift
coefficient at the actual float pitch stop, with a 3% planning margin. It is a guidance value
for this represented model, not a published Fire Boss V-speed. The test pilot follows that same
guidance, keeping the nose down for acceleration and then rotating; no extra thrust or lift is
injected to make the loaded departure work.

The first complete Okanagan run after this migration passed 116/117 cases. Four real routes
completed, but Apex exhausted its outbound fuel margin after a long loaded climb and aborted
before reaching the fire. The inherited 22° climbing hold spent scarce excess power on turning;
the test pilot now limits an established, terrain-clear loaded climbing hold to 12° while its
next gate remains more than 80 m above it. The initial climb-out retains its tighter interception
turn. This is an explicit test-pilot technique change, not additional aircraft power,
relaxed fuel reserves or automatic assistance in the game.

The player receives the same advice as `CLIMB · SHALLOW TURNS WITH LOAD`. The read-only guidance
requires an airborne load over 1,000 kg, range within 2 km of the climbing gate, and altitude above
a sampled holding footprint. The footprint radius is 2 km plus twice the coordinated 12° turn
radius, `V² / (g tan 12°)`, using the greater of gate target speed and current TAS rounded upward
to a 5 m/s band. Seventy-two radial corridors use the existing 100 m terrain sampling and a
150 m margin; results are cached per mission/gate/speed band. These are explicit game guidance
assumptions, not OEM bank limits or guaranteed real-world terrain clearance. Coordinator tests
reject advice during the initial distant interception and a low hold, and allow the established
terrain-clear hold. The guidance does not move any player control.

The failed trace also verified an independent production defect: every defence RTB route began
at the incident's downhill exit, including an abort still tens of kilometres outbound. Before
incident activation/drop, the mission now freezes the actual abort position and builds its
terrain-sampled return corridor from there, with a climb gate before crossing. Engaged/post-drop
egress retains its existing route. A coordinator regression checks the captured origin, absence
of a detour to the fire, fixed route after movement, and sampled return terrain clearance.

The mission had also treated the 55 kg joker margin as an immediate abort during current work,
although [the fuel plan](../../sim/Okanagan/FireBossFuelPlan.cs) defines it as the prohibition on
starting another circuit. Current work now returns at the hard minimum, independent of completed
cycle count; the next-circuit decision still respects joker. Seventeen focused coordinator cases
pass, including both policy boundaries and actual ingress continuation above the minimum versus
abort at it. The existing finite exercises still return after their required delivery.

Correcting joker alone does not make the maximum-gross Apex load feasible. From the corrected
trace, the final 100 seconds of level ingress averaged 51.244 m/s and 0.130464 kg/s fuel burn.
Continuing its remaining 12.627 km to ridge-join would leave about 508.90 kg against a rising
516.97 kg return minimum, before the final ingress/drop. This optimistic straight-flight
forecast is recorded at `/private/tmp/fireboss-apex-fuel-forecast.json`; reserves and block fuel
were not changed to remove that deficit. A performance-based mission load allowance is therefore
required in addition to hopper capacity and the published gross limit.

The [mission performance planner](../../sim/Okanagan/FireBossMissionPerformance.cs) evaluates the
existing full-power engine and aerodynamic kernel at the required route altitude. It finds the
heaviest feasible gross mass for the already-declared 2.5 m/s climb-planning rate with 12° bank,
searching attached-flow speeds above 1.1 times the model's bank-adjusted stall speed. The mission
retains this immutable plan once at construction. The scoop target is limited by this gross
allowance as well as the physical gross limit and hopper capacity, minus actual fuel and
operating mass at scoop entry. An infeasible plan cannot supply a positive water allowance.
The rule applies to every route altitude; it contains no Apex-specific mass or extra fuel.

The climb rate, bank, still-air/standard-atmosphere and clean-configuration assumptions are
explicit game planning choices. The solver is not independent evidence of aircraft fidelity:
its force-balance tests validate the planning calculation against the current kernel, while the
separate measured-anchor and open-loop tests address that kernel. Full-route fuel, delivery,
terrain clearance and site-protection assertions remain necessary after changing planned loads.

The aborted maximum-load trace also arrived at final approach with the water still aboard and
could not sustain the former empty-aircraft approach schedule. During airborne RTB/approach,
the mission now advises `RTB · RELEASE LOAD OVER LAKE` when water remains and gross mass exceeds
the sourced 5,216 kg landing limit. The test pilot follows that advice only over the actual
central-lake footprint and stops releasing once the mass limit is met. This guidance adds no
automatic player input or new crash rule. Jettison cannot credit completed work: a route that
aborts before its required drop still fails the existing cycle, work and protection assertions.

With the planned load, Apex reached and completed its drop with ample fuel and protected 16
sites. The remaining failure was an authored escape route: its apparent downhill continuation
crossed a secondary ridge before the emptied aircraft could climb above it. The corrected
Apex-only escape turns right through geographic waypoints `(49.3823356091, −119.8805749981,
2100 m)` and `(49.3796406755, −119.8512999982, 2200 m)`, then joins the existing sampled return
corridor. Both use 250 m capture radii; the second requires both location and altitude before
turning home. Other incidents and pre-engagement abort routes keep their previous geometry.

Independent CDEM checks reproduced the impact terrain height, then checked the new chords and
500–700 m turn-radius paths with roll/recovery delay. The two valley chords have maximum terrain
heights of about 1,691 m and 1,625 m; the second waypoint's lake-return chord peaks near 1,566 m.
The route regression checks terrain clearance from the observed drop position and rejects a
distant-high or close-low shortcut through the second gate. The real flight remains the final
check that the turn, climb, fuel and site-protection requirements work together.

## Final mission regression evidence

The performance-load full Okanagan run passed 141/142 cases; Apex alone failed on the secondary
ridge escape described above. After changing only that engaged Apex escape, the six targeted
Apex flight/coordinator/route cases passed. The other four rows below come from the full
performance-load run; Apex comes from the subsequent corrected-escape run. They are not
represented as a second full-suite run.

| Route | Duration (s) | Final fuel (kg) | Scoop target (kg) | Minimum work/transit clearance (m) | Sites protected by drop |
| --- | ---: | ---: | ---: | ---: | ---: |
| WaterCircuits | 1108.4 | 506.7 | 2267.6 | 135.2 | 0 |
| BigWhiteDefence | 3353.0 | 560.7 | 1265.9 | 135.7 | 20 |
| SilverStarDefence | 3700.0 | 519.6 | 1451.2 | 99.7 | 29 |
| PeachlandDefence | 2542.3 | 655.7 | 1749.7 | 164.4 | 36 |
| ApexDefence | 4144.0 | 472.6 | 1239.7 | 136.6 | 16 |

Every listed flight reached Complete, stopped on Kelowna's runway, completed its required
water/work cycle and retained the published exercise return reserve. The defence flights also
passed the unchanged site-protection and treated-versus-untreated integrity assertions. Apex
acquired 1,255.3 kg against its 1,239.7 kg target and released 1,160.0 kg. The performance target
is pilot guidance; scoop-retraction latency can produce a small overshoot, which the traces
retain rather than treating the requested target as the observed load. The separate physical
gross limit remains enforced by the dynamics.

Full-run log: `/private/tmp/fireboss-final-performance-loads.log`; four-route traces:
`/private/tmp/fireboss-final-performance-loads/`. Corrected Apex log:
`/private/tmp/fireboss-apex-final-escape.log`; trace:
`/private/tmp/fireboss-apex-final-escape/ApexDefence.json`. The trace also records the immutable
performance plan and actual pitch, incidence, rate, controls and mission cues. These are
route-controller regression results, not human handling approval or OEM validation.

## Conventional controls and continuous contact

Build 359 replaces the Fire Boss's pitch-to-G mapping with an explicit normalized elevator,
an immutable launch-trim setting, and pilot-adjustable trim. The conventional tail supplies
static pitch stability, pitch-rate damping, fin stability and yaw-rate damping as aerodynamic
moments proportional to dynamic pressure. The right-yaw rudder initially pushes the tail left;
it no longer inherits the generic fighter's speed-proportional lateral acceleration. Other
aircraft retain their existing controller unless both the airframe and command explicitly opt
into the conventional-tail branch. These derivatives are provisional, not measured AT-802 data;
the [source ledger](../airframes/at-802f-fireboss/00-sources.md) records equations and limitations.

Surface motion now evaluates the same aerodynamic forces and elevator moment as flight. Wheel
and float reactions remain an explicitly provisional contact model. Rotation unloads that
reaction, and liftoff removes the contact constraint without injecting 0.6 m of height,
1.5 m/s of upward velocity, or resetting angular rates. Surface speed is no longer artificially
capped, and stationary rudder input cannot turn the aircraft in place. Existing touchdown sink,
bank and terrain checks remain enforced. This pass does not establish a measured hydrodynamic
pitching-moment model, propwash derivatives, movable CG or a complete flap/configuration envelope.

A final contact review also found Euler pitch/bank/heading rates being stored directly as body
P/Q/R during steering. Contact now converts between those frames; independent quaternion
finite-difference tests cover simultaneous bank, rotation and steering at wheel and float
liftoff. Both handoff cases failed before the correction. All six new kinematics cases and the
existing dynamics/handling cases passed together (37 total), without changing force constants
or acceptance thresholds. Touchdown nose/float strikes and crosswind acceptance remain outside
the current contact checks.

The drag correction selects high-lift normalization from the sign of lift, rather than angle
of attack. At the audited 60 m/s, 1,500 m state, the former zero-incidence crossing jumped from
approximately 97.94 kN to 8.14 kN of drag. The corrected polar is continuous at that crossing;
sampled symmetric-wing fighter polars retain their previous results. Matching two evaluations
of the old kernel could never expose this discontinuity.

## Independent response and performance checks

The new handling tests apply fixed controls or predefined pulses without a feedback pilot.
At 5,030 and 7,257 kg, opposite 0.2-elevator pulses for 0.5 seconds produce opposite pitch and
load responses, followed by damping during four seconds of release. Observed differential
pitch rates were approximately ±6.5°/s during the pulse and ±0.3°/s after release. Provisional
15°/s rate and 15° excursion ceilings are declared guardrails, not certification limits.
Other cases check quadratic airspeed scaling, vanishing stopped-aircraft authority, rudder
force/moment signs, fixed-trim power/energy response, banked lift loss, actual-body-bank command
translation, and wheel/loaded-float liftoff continuity. Negative controls reproduced the former
liftoff kick and low-speed fixed-moment behaviour.

The old drag coefficients also permitted approximately 163.7 kt level flight and 1,565 ft/min
best climb at the manufacturer's 7,257 kg reference mass. The provisional whole-aircraft drag
fit now gives 149.89 kt and 887 ft/min under the stated sea-level surrogate conditions, against
the manufacturer's 150 KIAS and 892 ft/min anchors. A fixed-command 30-second climb checks that
the initial force balance persists without a controller correcting the trajectory. Source-based
regression bands are 145–155 kt equivalent airspeed and 800–1,000 ft/min, rather than exact fitted
outputs. Instrument corrections and missing manufacturer test conditions remain unverified.

Approach unit fixtures no longer correct vertical speed every tick. Their trim and power are
selected once from initial force balance; the runway case uses one predefined small flare near
the surface. Loaded-versus-empty acceleration now compares speed gain after matching position,
velocity, attitude and engine state. These changes remove controller assistance and unequal
preparation from tests that previously looked like direct handling evidence.

## Camera and actual browser input

The Okanagan renderer previously mixed east/up/north geographic positions with a camera that
mirrored the view. The scene now converts north to negative render Z at one geographic boundary,
with matching cockpit, padlock and HUD conversion. Terrain, collision, map and mission data keep
their original coordinates. Geometry tests cover compass headings, visual turn direction,
pitch/bank horizon response, padlock alignment and flight-path-vector projection. A baseline
browser right-rudder input moved a fixed departure cue right; the corrected view moves it left.

The final-physics browser check used the actual published game and ordinary keyboard events in
headed Chromium on Apple M5/ANGLE Metal. It covered takeoff, climb, six airborne axis holds and
releases, short airborne taps, runway taps, trim and restart. A press/release wholly between
authority ticks was retained for two fixed ticks without becoming a stuck control. There were
no page or console errors. Across 2,728 observed frames, median cadence was 16.7 ms, p95 was
18 ms and simulation/wall-clock ratio was 1.0014. These are session observations, not a universal
performance benchmark. Audio ran through the real graph in silent QA mode; browser and server
were closed after the check.

Evidence for that run is in `/tmp/fireboss-handling-20260910/candidate-final/acceptance-summary.json`
and `findings.md`. The raw telemetry SHA-256 is
`c05ff2645f2ff6fd810bac68788ad354391025f7d3a1599ce07686a14a96803a`.
It used the final physics with Build 358 cache markers, before the subsequent drop-release and
pending-control telemetry corrections. It was an empty-water departure, not a completed browser
scoop/drop/recovery, physical-gamepad check, or human handling approval.

Drop-button pointer capture now owns the hold through release outside the button, cancellation
and capture loss. Releasing or pausing controls clears pending inputs while preserving the
historical command last flown by the simulation. Terminal mission frames no longer consume
queued taps after flight has stopped. These interaction boundaries have focused unit coverage and the browser checks recorded below.


## Final interaction and presentation checks

The Build 359 UI check used trusted mouse/touch events in headed Chromium on Apple M5/ANGLE
Metal. It verified drop-button release outside the button, touch cancellation, joystick pitch/roll
and neutral, ±2% trim buttons, and pause/resume clearing pending inputs while preserving historical
applied commands. This is browser touch emulation, not physical-phone performance evidence.
A keyboard takeoff followed by a deliberate crash reached a genuine terminal state; a subsequently
queued tap and `Advance(0.1)` advanced zero ticks and preserved time, history and counters. No flight
state was injected. There were no page/console errors, and the real audio graph's output gain was
zero. All browser/server resources were closed.

A Fire Boss-only HUD cue layout keeps long loaded-climb and water-departure instructions below the
telemetry header and clear of the hopper and trim controls. Screenshots were checked at 390×844,
667×375 and 844×390. The final combined record is
`/tmp/fireboss-handling-20260910/final-ui-summary.json`, with separate input and cue/terminal
artifact identities. Input raw telemetry SHA-256:
`9d070f556ec7c49793d24731d5c9cb770d253b0623193013fe15e231f13203df`.
This UI candidate predates the final mission load/fuel/escape corrections; it proves those
unchanged interactions, not the later mission routes. The final source run of Okanagan/HUD/scorer
Node tests passed 247/247. Canonical release CI will rebuild and check the full committed tree.


## Fresh release-artifact browser check

The final Build 359 publish at `/private/tmp/fireboss-build359-final/wwwroot` includes the final
performance planner, fuel decisions and Apex escape. A fresh headed Chromium context on Apple M5
Metal reached the Water Circuits menu in 2.801 seconds. Preview and started scoop target were
exactly 2,227 kg and the fuel-plan fields agreed. Ordinary keyboard full power and pull reached
liftoff at 7.442 simulation seconds; releasing elevator and explicitly setting +10% pilot trim
reached 11.05 m AGL at 18.175 seconds, alive at 110.71 KTAS. There were no page/console errors,
the real audio graph remained silent, and browser/server cleanup completed.

This is a new-context local cold boot, not a flushed operating-system cache or phone measurement.
An animation-frame timestamp cannot measure the Start event's synchronous duration: its apparent
0.3 ms delta was rejected. The event-spanning long task was 635 ms; cold boot also had a 1,059 ms
long task whose work cannot all be attributed to the planner. The evidence and individual static/
WASM hashes are in `/tmp/fireboss-handling-20260910/final-artifact/summary.json`. The boot manifest
SHA-256 is `d9259f49f1e2fb1b1f4b69475fee1896d9c4bbc236d22bd6ee346b26015b11e7`.


The mountain planning path was checked separately in a fresh Apex browser context. Initial
menu readiness was 3.974 seconds; a separate warmed `PreviewPlan` call took 1.323 seconds and
the synchronous Start event took 2.849 seconds. The initial 2.646-second long task includes
initialization as well as planning. These are observed startup costs, not frame-time or physics
throughput measurements. The first harness compared a live return-minimum value after simulation
had advanced against the frozen preview and rejected a 0.000094 kg difference; that comparison
was invalid because position/fuel had changed. The captured immutable fields match exactly: scoop target 1,197.284740447998 kg, drop target
zero, block fuel 925 kg, outbound allowance 306.102210212105 kg and working margin
49.963119456331015 kg. The raw failed dynamic-field assertion remains in the evidence beside
this explicitly scoped assessment. Evidence: `/tmp/fireboss-handling-20260910/apex-start/`.
