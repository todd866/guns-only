# Approach-to-land: extending the golden path through the groove

Status: built and flight-card calibrated. Written 2026-07-31; implementation reconciled
2026-08-14 after the F-22 and Rapier RTB corridor rollout.

## 2026-08-14 implementation and flight evidence

RTB is now one authority transition rather than a visual-only advisory. In the continuous F-22
fight, `O` or the pause-screen **CALL IT A DAY · RTB** action immediately safes the player's
weapons, suppresses replacement spawns, hands surviving opponents to relief, and latches the home
corridor from the aircraft's current position. Crossing Bingo invokes that exact same path
automatically. Rapier uses the same pilot/Bingo intent and ceasefire boundary, cancels its pursuit,
and moves its mission director to ReturnToBase/Recovery. Already-airborne rounds remain physical;
"knock it off" prevents new fire rather than erasing projectiles in flight. Snapshot truth carries
`rtb_available`, `rtb_reason` (`PILOT_KNOCK_IT_OFF` or `BINGO_FUEL`), and `rtb_automatic` so the
button, radio/copy, telemetry, and world corridor cannot disagree about why the fight ended.

The corridor is generated from live ownship position and the authoritative Home Plate/recovery
site. It does not require the pilot to reach an egress gate before it appears: the first cues start
ahead of the aircraft wherever the request occurs, the bounded transit chain continuously
reanchors as it flies, and detailed approach gates supersede it near home.

The shared `90 m/s` / `D/W = 0.12` production coupling described below is gone for the fitted
F-22 and Rapier profiles. Older, unfitted carrier fixtures deliberately retain their established
`0.12` schedule until they receive their own configuration reconciliation and flight cards; this
keeps an F-22/Rapier rollout from silently retuning the Panther.

- The fitted approach reference derives Vref from current mass, the exact systems-profile landing
  lift increment, and the airframe's own stall margin, then converts calibrated speed to local TAS
  before it enters energy math.
- `SortieSchedule.RecoveryDragToWeight` evaluates the live airframe polar at Vref with the same
  full gear/flap increments that `AirframeSystems` supplies to `AircraftSim`. Production
  `GoldenPath`, `SortieSchedule`, and `ApproachGuidance` all consume that fitted value for profiles
  marked flight-card complete.
- Rapier's former guidance-only `CL +0.18` was corrected to the force model's full-droop
  `CL +0.26`; there is now one landing configuration, not two contradictory ones.

Deterministic closed-loop test cards start each aircraft at its 250 KIAS landing-configuration
placard. They fly the production `SortieSchedule` through its airframe-derived deceleration track,
3-degree groove, 600 m land-runway flare, contact and rollout. Every airborne state is integrated
by `AircraftSim`; the test pilot follows published height/speed/power but cannot move the aircraft.
Contact and braking are owned by `ConventionalRunwayRecoveryModel`. Carrier references publish
zero flare distance and retain the unflared deck approach. Both land cards stop on the runway:

| Airframe | Vref | landing D/W | touchdown | speed / sink | full stop |
|---|---:|---:|---:|---:|---:|
| F-22 public-data surrogate | 136.4 KIAS | 0.097 | 467 m | 136.7 kt / 3.49 m/s | 1,063 m |
| Rapier public-data surrogate | 159.5 KIAS | 0.270 | 498 m | 157.7 kt / 3.21 m/s | 1,261 m |

The fitted dirty deceleration segments are 8.9 NM for F-22 and 1.6 NM for Rapier; the difference is
the intended consequence of their 0.097 versus 0.270 landing D/W. Cards bound peak path error
below 25 m and peak speed error below 20 kt across the full deceleration-to-stop profile. These are
repeatable simulation acceptance flights, not claims of OEM landing data or a human handling-
qualities evaluation. The F-22 gear model and the fictional Rapier polar remain explicitly
labelled public-data/gameplay surrogates; a post-deploy human flight is still useful feel evidence,
but it is no longer the only proof that the generated profile can be flown to a stop.

The remainder of this document records the original problem and design reasoning. Historical
snippets below intentionally show the coupling that was removed.

## What exists, and where it ends

`GoldenPath.Solve` is a pure function that solves an energy schedule **backwards from the
stabilisation point** — the only fixed end of a recovery. It answers: at my present distance-to-go,
what altitude and speed should I hold, how much power does that want, and which limit is shaping
it. It is already airframe-agnostic: stabilisation speed, drag-to-weight and the configuration
placard are all parameters. That design is right and should not change.

**It ends where the hard part begins.** From the stabilisation point to the wire, nothing is
scheduled. That final ~1 km is where the sortie is actually won or lost, and it is the only part
that differs fundamentally between a Rapier recovering to a runway and a Panther meeting a
straight deck.

## The coupling that is actually wrong

Not in `GoldenPath`. In its single call site, `SimulationSession.UpdateGoldenPath`:

```csharp
stabiliseAltitudeM: 152.0,
stabiliseSpeedMps: 90.0,
dragToWeight: RecoveryDragToWeight,   // const 0.12
```

`90.0` is **the Rapier's clean stall speed** (90.7 m/s). Applied to everything else it means:

| Airframe | Vs clean | 90 m/s is |
|---|---|---|
| Rapier | 90.7 | 0.99 × Vs |
| Sabre | 61.2 | 1.47 × Vs |
| F9F-2 Panther | 58.3 | 1.54 × Vs |
| GliderStrike | 25.8 | **3.49 × Vs** |

One aircraft's number wearing a generic name. The glider has been scheduled to stabilise at three
and a half times its stall speed the whole time.

**And the obvious fix is wrong too.** Deriving it as `margin × clean stall` was tried and reverted:
it fixes the Panther and the glider and breaks the Rapier, because a delta with landing elevon
droop has an effective landing CLmax far above its clean 1.2. Clean `CLMax` flatters straight wings
and punishes deltas. *The basis has to come from the airframe, not from a formula over one of its
coefficients.*

## Proposal

### 1. Airframes declare their own approach reference

Add to `AircraftParams`, alongside the placards it already carries:

```csharp
double ApproachOnSpeedAoARad = <airframe>,   // carrier convention: fly AoA, not speed
double ApproachStallMargin  = 1.15,          // for the speed the schedule quotes
```

On-speed AoA is the honest primitive — it is what a carrier pilot actually flies, it is already
how `DetentLayer.OnSpeedAoARad` works, and it is invariant to weight in a way speed is not. Speed
for the ribbon is then derived per-tick from current mass and configuration, which also makes the
schedule get *lighter* as fuel burns instead of quoting a fixed number all the way down.

The Panther's measured 114 kt approach (`docs/airframes/f9f-2-panther/00-sources.md`) is the
calibration anchor for the first real airframe.

### 2. `dragToWeight` becomes per-airframe too

`0.12` is shared across a Panther, an F-35C and a Mach-3.7 Rapier. Every track-mile figure the
schedule reports scales directly off it. It should be fitted per airframe from a flown descent —
its own comment already admits this — and until it is, it should at minimum be a field with a
default rather than a `const`.

### 3. The groove is a second schedule, not an extension of the first

From stabilisation to touchdown the governing constraints change completely:

| | Recovery schedule | Groove |
|---|---|---|
| Solved for | energy vs distance | glideslope, lineup, AoA |
| Error that kills you | too much energy | sink rate at the ramp |
| Corrective axis | drag / track miles | power, and only power |
| Time constant | minutes | **seconds, and engine-limited** |

So: keep `GoldenPath` for the recovery, and add a `GroovePath` for the final. Same discipline —
pure, deterministic, airframe-in-parameters — but solving glideslope/lineup/AoA rather than energy.
The handover is the stabilisation point, which both already reference.

### 4. Make the deck a first-class input, because it changes the decision, not the geometry

An angled deck grants a bolter: touching without a wire is recoverable, so late correction is
cheap and the right teaching is "fly the ball". An **axial deck removes that**: past the ramp there
is a barrier, and the go/no-go must be made *before* the aircraft is committed. The two are
different games and should not share a scoring model.

### 5. Where the airframe finally bites: spool

The wave-off decision has to be taken far enough out that the engine can answer. The Panther's
centrifugal J42 is provisionally `SpoolUpTau: 4.5s` against the Sabre's axial J47. On a straight
deck that lag *is* the beat: it converts "should I wave off?" from a reflex into a decision with a
price, which is the whole reason this aircraft is worth simulating.

`GroovePath` should therefore publish the **last moment a wave-off is still achievable**, computed
from the airframe's spool constant, current energy and the ramp — not a fixed distance. That single
output is the thing a paddles LSO was actually for, and it is airframe-derived by construction.

## Build order

1. `ApproachOnSpeedAoARad` on `AircraftParams`; `UpdateGoldenPath` reads it instead of `90.0`.
   Verify with `bin/whose-red` that Rapier, F-35C and glider schedules move only where intended.
2. `dragToWeight` from a field, defaulted to today's 0.12 so nothing shifts on landing.
3. `GroovePath` as a new pure module with its own tests, unwired.
4. Wire it behind the Korea beat first — `Beats.KoreaCarrierApproach()` already exists and is
   isolated from every other mission's recovery, so it is the safe place to be wrong.

## Rejected

- **Deriving stabilisation speed from clean `CLMax`.** Tried, reverted, breaks deltas (above).
- **One margin constant for the fleet.** That is the current bug wearing a new number.
- **Extending `GoldenPath.Solve` with groove terms.** Its energy solution is clean and correct;
  overloading it with glideslope and lineup would make one function answer two unrelated questions
  and give both of them the recovery's time constant.
