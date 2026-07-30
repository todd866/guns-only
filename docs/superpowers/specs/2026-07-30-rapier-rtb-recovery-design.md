# Rapier RTB — continuous approach-stabilisation solver

Status: design, not implemented
Date: 2026-07-30
Scope: Rapier recovery (RTB → stabilised final). Runtime + presentation. No new airframe physics.

## The problem, from evidence

Reported: "Rapier RTB is basically unflyable, and I'm pretty good at flying this kinda thing."

Two independent findings explain it.

**1. The recovery ladder is an invisible 3D slalom that stalls permanently.**
`RecoveryProcedure.Step` advances the ladder only when three conditions hold on the same tick:

```cs
_inVolume  = rangeM <= gate.HalfM;                        // 3D sphere, 250-700 m radius
_energyOk  = Math.Abs(ktas - gate.TargetKtas) <= 25.0;    // EnergyBandKtas
_configOk  = gate.DirtyConfig ? gearDown && flapsDown : !gearDown && !flapsDown;
if (_inVolume && _energyOk && _configOk && _activeIndex < _gates.Count - 1) _activeIndex++;
```

There is no capture tolerance, no re-sequencing, and no skip. Miss one gate — which arriving from a
Mach 3 intercept you will, since `final_8` sits at 700 m altitude inside a 700 m sphere — and
`_activeIndex` stays put for the remainder of the flight. Everything downstream stays dead.

The schedule is also fixed to the runway centreline, so it presumes you arrive from a prescribed
direction. That is the wrong model: the pilot flies whatever they want from any direction.

**2. Nobody ever drew it.** Field-presence audit of the shipped state against the presentation
layer:

| Truth published every tick | Reaching the pilot |
| --- | --- |
| `recovery_gate_energy_ok`, `_config_ok`, `_dirty`, `_in_volume`, `_target_ktas`, `_active_index`, gate geometry, `recovery_gates_json` | 1 mention in `hud.js`, 0 in `app.js`, 0 in ANCA |
| `rtb_bearing_deg`, `rtb_steer`, `rtb_turn_deg`, `rtb_range_nm`, `rtb_eta_min`, `rtb_closure_kts` | 2 mentions in `hud.js` |
| `fuel_on_arrival_estimate_lb`, `fuel_to_home_estimate_lb`, `fuel_reserve_margin_lb`, `mesh_fuel_to_dest_lb` | 0 anywhere |
| `recovery_point_known`, `recovery_procedure_label`, `runway_recovery_phase_name` | 1 (ANCA only) |

Judging an efficient approach requires energy gates. The gates existed; they were computed every
tick and thrown away. That is why it reads as unflyable rather than merely difficult.

A units defect rides along: `UpdateRecoveryProcedure` computes
`ktas = Player.IndicatedAirspeedMps * AirData.MpsToKnots` and compares it against `TargetKtas` —
indicated measured against true.

## Principle

**The approach is always flyable. Excess energy buys track miles.**

There is no feasibility verdict and no refusal. If you arrive high and fast, the solution is a
longer path — extended downwind, S-turn, or a 360 — exactly as vectoring works in practice. The
solver's output is always a flyable path; the only variable is its length.

**Deriving the profile is machine work. Flying it is the pilot's job.** The solver never commands a
throttle or a gear lever. It publishes the standard; the pilot judges against it.

**Track miles cost fuel, and fuel is the only real limit.** This is where the decision lives:
accept the extension, or fly it tighter and keep the gas. The fuel model needed to price that
already exists and is currently invisible.

## The solver

A pure module in `sim/`, `ApproachSolver`, deterministic and fixed-step, with no I/O:

```
(player state, threshold position + heading, performance limits, wind) -> ApproachSolution
```

**Energy core.** Specific energy `Es = h + V^2 / 2g`. Compare current `Es` against `Es` required at
the stabilisation point (500 ft AGL at Vref, config dirty). The difference divided by achievable
deceleration in the dirtiest legal configuration — idle thrust, boards, gear and flap below the
Rapier's 250 KIAS `GearAndFlapLimitKias` — yields **track distance required**.

**Path synthesis.** Generate the shortest path from present position and heading that provides at
least the required track distance and ends on a stabilised final:

- enough distance on a direct intercept → turn to final, descend and decelerate on profile
- not enough → extend the downwind leg until the distance balances
- still not enough → insert S-turns, then a full 360, in that order

Each is a deterministic geometric construction, not a search. The path is recomputed every tick, so
manoeuvring freely simply re-solves; nothing latches.

**Outputs.**

- the path geometry, for the map
- gates derived *along that path* — distance-to-go, target altitude, target speed, required config
- continuous deviation against the profile: high/low, fast/slow, and excess `Es`
- track miles required vs track miles on the current path
- fuel cost of the current solution, and fuel on arrival if flown

Gates are outputs of the solution, not fixtures of the runway.

## What this replaces

`RecoveryProcedure.BuildSchedule` remains only as the published *standard* pattern geometry
(Overhead / DownwindRejoin / StraightIn) for briefing and for the map's reference depiction. The
sphere-conjunction advance is deleted, and with it the permanent-stall bug and the fixed-approach-
direction assumption. Gate capture becomes a face-plane crossing within a lateral corridor, graded
as deviation rather than as a pass/fail interlock, and always advancing.

## Presentation

Pure consumers of `ApproachSolution`. No presentation code recomputes the profile.

- **HUD:** next gate — distance, target altitude, target speed — plus live deviation, and the track
  miles required vs available. Follows the existing ANCA rule: steady context, never a manufactured
  priority.
- **Nav display:** see below. This is a first-class deliverable, not a decoration.
- **ANCA Navigate row:** currently renders `—` on every Rapier scenario. It already reads
  `rtb_bearing_deg` and `recovery_point_known`; wire it to the solution so it carries the vector.
- **Fuel:** surface `fuel_on_arrival_estimate_lb` and `fuel_reserve_margin_lb` against the current
  solution, so the cost of extending is visible at the moment the choice is made.

## Nav display

Today's `mesh_nav_map.js` is a free-flight Mesh ND: north-up, pan/zoom/follow, places, free fix,
active-destination drag, spans 15–400 NM. It is the right tool for the Open Segment and the wrong
one for a recovery — the **minimum span is 15 NM**, so the entire approach collapses into a pixel
cluster in the middle of the display.

More fundamentally, a plan view cannot express the thing being judged. "Am I high, am I fast, how
many track miles do I need" is altitude and speed against distance-to-go. That is a vertical
question, and no amount of improving the plan view answers it.

So the nav display becomes two coupled views sharing one solution:

**Plan view** — an approach mode on the existing map rather than a rewrite. Adds: track-up
orientation (selectable, north-up retained), approach-scale spans down to ~1 NM, the solved path
including any extension or 360, the derived gates, the threshold and runway alignment, and the
standard pattern geometry as a faint reference. The free-fly behaviour is untouched; this is a
second mode and scale band, not a replacement.

**Vertical situation display** — new, and the centre of gravity of this feature. Distance-to-go on
the horizontal, altitude on the vertical:

- the required profile from the solution, as a line to the stabilisation point
- own-ship, and a predicted path from current energy and rate
- gates as marks carrying target altitude and speed
- the speed schedule along the bottom, with current speed against it
- excess energy expressed where it is legible: as the along-track distance at which you converge on
  profile, which is the same quantity as track miles required

Both views are pure consumers of `ApproachSolution`. Neither recomputes geometry, and either can be
absent without affecting the other or the solver.

### Benchmark

Measured against a modern transport ND + VSD, which solved this problem long ago. Current state
against the target:

| | today | target |
| --- | --- | --- |
| Orientation | north-up only | track-up ARC, compass rose, heading + track bugs; north-up retained |
| Scale | 15–400 NM | adds 1 / 2 / 5 / 10 / 20 NM approach bands |
| Turn prediction | none | predicted track curve from current bank |
| Energy vs distance | none | altitude range arc |
| Vertical | none | VSD |
| Wind | none | wind vector and drift |
| Path | flat polyline | sequenced legs, active leg emphasis, profile-start marker |

Two elements carry most of the value:

**Altitude range arc.** The arc marking where own-ship reaches a chosen altitude at current descent
and deceleration. This is the plan-view expression of track miles required: if the arc falls beyond
the threshold, the approach needs more track, and the extension the solver synthesises can be read
directly against it. Highest-value single element in this design.

**Predicted track curve.** Where the current bank actually leads. This is what makes arriving from
any direction legible — intercepting the solved path becomes a visual task instead of mental dead
reckoning.

Fighter-side energy cues (E-bracket, AOA indexer) are deliberately not the model: they are terminal
cues for the last mile and say nothing at 40 NM about whether the approach can be made, which is
the actual complaint.

## Verification

- **Unit:** `ApproachSolver` against hand-computed energy cases; assert monotonicity (more excess
  energy never returns a shorter path) and that a solution is always produced.
- **Headless profile harness**, in the style of the existing OFT rigs: seed representative
  post-intercept states — high/fast/close, offset, and from every quadrant — and assert each solves
  to a stabilised final, and that flying the published profile reaches stabilisation.
- **Regression:** the ANCA Navigate row is non-placeholder through a recovery, guarding the class of
  bug found in the audit today.
- **Real sorties:** every flight already records the relevant fields; the recorded solution can be
  compared against what the pilot flew.

## Open, deliberately

- **Deceleration model must be fitted to the real aircraft, not to arithmetic.** The Rapier
  currently overshoots its own documented ceiling (reaching M3.7 against tuning notes that predict
  ~M3.1) and slams into the `RamSpillStartMach` 3.3–3.8 schedule. If it cannot actually decelerate,
  the solver will correctly demand implausible track miles and we would be treating a propulsion
  defect as an approach defect. Fit the drag/decel model from a flown RTB before fixing thresholds.
- Carrier recovery is out of scope here; this covers the Rapier's runway/strip recovery.

## Out of scope

Recovery director or autothrottle; any command cue. Approach lighting, ILS/TACAN modelling.
Changes to the airframe polar or propulsion map — tracked separately with the M3.7 finding.
