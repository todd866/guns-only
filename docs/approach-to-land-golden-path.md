# Approach-to-land: extending the golden path through the groove

Status: design, not yet built. Written 2026-07-31 after the Panther exposed where the current
schedule stops being airframe-agnostic.

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
