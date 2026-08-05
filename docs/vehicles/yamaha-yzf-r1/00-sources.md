# Yamaha YZF-R1 (2020) — vehicle-model sources

Backs `GunsOnly.Sim.Motorcycle.YzfR1Definition` in `sim/Motorcycle/YzfR1Definition.cs`.

**Profile lock.** The modeled machine is the **2020 YZF-R1** (standard, not R1M Öhlins variant) with
the published 998 cc crossplane inline-four, 6-speed cassette gearbox, and OEM geometry/power
claims. Do not mix R1M suspension, 200/55 rear tyre, or regional wet-weight variants without a
separate definition ID.

**Rights posture.** Figures below are facts located in public OEM and review spec tables — dimensions,
masses, power ratings. No passage text from copyrighted reviews is reproduced here.

## Primary references

1. **Motorcycle.com** — [2020 Yamaha YZF R1 specs](https://www.motorcycle.com/specs/yamaha/sport/2020/yzf/r1/detail.html):
   wet weight 448 lb / 203.2 kg, wheelbase 55.3 in / 1,404.6 mm (we pin 1.405 m), rake 24°, trail
   4.0 in / 102 mm.
2. **Motorcycle.com first ride** — [2020 YZF-R1 review spec table](https://www.motorcycle.com/manufacturer/yamaha/2020-yamaha-yzf-r1-and-r1m-review-first-ride.html):
   curb weight 448 lb, rake/trail 24.0° / 4.0 in, wheelbase 55.3 in, seat height 33.7 in,
   suspension travel 4.7 in front/rear, 200 hp claim, 6-speed.
3. **Yamaha / Total Motorcycle 2020 guide** — [2020 YZF-R1 guide](https://www.totalmotorcycle.com/motorcycles/2020/2020-yamaha-yzf-r1/):
   wheelbase 1,405 mm, rake/trail 24° / 102 mm, seat height 855 mm, ground clearance 130 mm,
   suspension travel 119 mm, 200 PS @ 13,500 rpm, 112.4 N·m @ 11,500 rpm, tyres 120/70-ZR17 /
   190/55-ZR17, maximum lean angle 56°.
4. **Ultimate Specs** — [2020 YZF-R1 technical sheet](https://www.ultimatespecs.com/motorcycles-specs/yamaha/yamaha-yzf-r1-2020):
   cross-checks curb weight, wheelbase, rake/trail, seat height, suspension travel, power/torque
   peaks, tyre sizes.

Australian-market reviews sometimes cite 201 kg wet weight; we pin **203.2 kg** because Motorcycle.com
and Ultimate Specs agree on 448 lb with fluids — the definition targets the US-published curb figure.

## Measured — OEM / published spec used directly

| Constant | Value | Epistemic | Source |
|---|---:|---|---|
| `CurbMassKg` | 203.2 kg (448 lb wet) | measured | Motorcycle.com specs; Ultimate Specs |
| `WheelbaseM` | 1.405 m (55.3 in) | measured | Motorcycle.com; Total Motorcycle (1,405 mm) |
| `RakeRad` | 24° | measured | All primary references |
| `TrailM` | 0.102 m (4.0 in) | measured | All primary references |
| `SeatHeightM` | 0.856 m (33.7 in) | measured | Motorcycle.com; Ultimate Specs (856 mm) |
| `GroundClearanceM` | 0.130 m (5.1 in) | measured | Total Motorcycle dimensions table |
| `FrontSuspensionTravelM` | 0.119 m (4.7 in) | measured | Motorcycle.com; Ultimate Specs |
| `RearSuspensionTravelM` | 0.119 m (4.7 in) | measured | ibid. |
| `PeakCrankPowerW` | 200 hp → 149,140 W (`200 × 745.7`) | measured (claimed crank) | Yamaha 200 hp @ 13,500 rpm claim |
| `PeakPowerRpm` | 13,500 | measured (claimed) | ibid. |
| `PeakTorqueNm` | 112.4 N·m | measured (claimed) | Total Motorcycle / Ultimate Specs |
| `PeakTorqueRpm` | 11,500 | measured (claimed) | ibid. |
| `GearCount` | 6 | measured | All primary references |
| `PrimaryReductionRatio` | 1.634 (67/41) | measured (published spec) | Total Motorcycle 2020 guide transmission table ("Primary Reduction Ratio 1.634"); consistent across 2015–2024 crossplane R1 spec sheets |
| `MaxLeanRad` | 56° | measured (OEM claim) | Total Motorcycle ("56-degree maximum lean angle") |
| `FrontTireRadiusM` | 0.300 m | derived | 120/70-ZR17 rolling radius from nominal section/aspect |
| `RearTireRadiusM` | 0.320 m | derived | 190/55-ZR17 rolling radius from nominal section/aspect |

Tyre radii use standard rolling-radius arithmetic from the published sizes; they are **derived**, not
dyno-measured, and should be replaced if loaded-radius data appears.

## Provisional — defaults with a stated rider, not OEM

| Constant | Value | Basis | Validation target |
|---|---:|---|---|
| `RiderMassKg` | 80.0 kg | Typical geared sport-rider default for sim | Combined CG and load transfer vs. published wet weight + 80 kg ≈ 283 kg gross |
| `RiderCgLateralRangeM` | ±0.12 m | Knee-out hang-off envelope for arrow-key mapping | Steady-state lean gain from full lateral shift at 25 m/s on constant radius |
| `RiderCgForeAftRangeM` | ±0.10 m | Seated↔forward weight transfer envelope | Wheelie/stoppie pitch reflex engages only near balance band |
| `HeadStabilizationFraction` | 0.25 | Helmet view damps 25% of chassis roll | View roll < chassis roll at sustained knee-down lean |
| `MaximumBarSteerRad` | ±0.12 rad | Provisional low-order single-track input range, not a measured handlebar-stop angle | Curvature stays plausible at 25 m/s without immediately reaching the 56° lean cap |
| Lean response | 4.0 rad/s natural frequency, 0.85 damping ratio at 95.0 kg·m² reference inertia | Provisional fixed roll stiffness/damping; angular acceleration is torque divided by `RollInertiaKgM2` | Full steer + rider shift settles without oscillation; lower inertia must enter lean faster than higher inertia; replace with a measured roll transient |
| Rider body-shift steering coupling | 0.50 of combined-CG equilibrium acceleration, full authority by 8 m/s | Provisional low-order coupling; body shift tightens a turn but cannot replace bar input | Full inside shift changes turn rate measurably but by less than 0.05 rad/s in the mild-turn regression |
| Assisted-rider reaction/rates | 7 ticks (58 ms) delay; 3.0 steer units/s, 2.4 body units/s, 2.2 throttle units/s, 4.0 brake units/s | Provisional elite-rider reflex surrogate, not a biometric claim | Default controls remain progressive and complete the sampled circuit; raw mode bypasses the rider controller for comparison |

## Surrogate — physics placeholders pending handbook rows

| Constant | Value | Basis | Validation target |
|---|---:|---|---|
| `RedlineRpm` | 14,500 | Common R1 rev limiter cited in owner community; **no handbook scan held** | Rev limiter clips drive torque; auto-shift window ends below redline |
| `IdleRpm` | 2,000 | Warm-idle order-of-magnitude for liter four | Manual-clutch free-rev floor; stall threshold reference |
| `AutoUpshiftRpm` | 12,000 | Surrogate auto-shift schedule point pending handbook | Auto clutch upshifts itself at/above this coupled RPM; manual requests shift at any RPM |
| `AutoDownshiftRpm` | 4,000 | Surrogate auto-shift schedule point pending handbook | Auto clutch downshifts itself at/below this coupled RPM; manual downshifts are over-rev protected instead |
| `StallRpm` | 1,200 | Surrogate manual-clutch dump stall threshold | Engine dies when clutch engages from rest below this band |
| `EngineInertiaKgM2` | 0.055 | Typical liter-four crank/internals order-of-magnitude | Launch RPM flare with auto-clutch; manual-clutch stall threshold |
| `CombinedCgHeightM` | 0.585 m | Bike-only ~0.52 m + 80 kg rider scaled over wheelbase | Static front/rear load split ≈ 48/52 at rest on level ground |
| `RollInertiaKgM2` | 95.0 | Literature order-of-magnitude for liter sportbike + rider | Lean transient time to 30° roll at 25 m/s with full steer + weight |
| `PitchInertiaKgM2` | 165.0 | ibid. | Hard-brake pitch rate and load transfer magnitude |
| `YawInertiaKgM2` | 110.0 | ibid. | Steady-state yaw rate vs. steer angle at 30 m/s |
| `FrontSpringRateNPerM` | 18_000 | KYB fork scaled to ~119 mm travel and ~283 kg gross | Static sag ~25% travel at rest |
| `RearSpringRateNPerM` | 22_000 | KYB shock scaled likewise | ibid. |
| `FrontDamperCoefficientNPerMps` | 1_800 | Critical-damping fraction ~0.25 at ride height | No undamped pitch oscillation after single bump |
| `RearDamperCoefficientNPerMps` | 2_200 | ibid. | ibid. |
| `GearRatios[0..5]` | 2.846, 2.200, 1.850, 1.600, 1.421, 1.320 | Widely published R1 ratio set; **year-specific handbook not held** | Top speed in 6th ≈ 290 km/h order-of-magnitude; shift RPM drops |
| `FinalDriveRatio` | 2.470 | Chain sprocket pair commonly paired with above ratios | Matches published 6th-gear ratio × final × tyre radius |
| `TirePeakFrictionCoefficient` | 1.05 | Dry asphalt sport tyre peak µ order-of-magnitude | Maximum lateral accel at 45° lean on dry runway |
| `TireLoadSensitivity` | 0.85 | Pacejka-like load exponent placeholder | Combined brake+lean reduces lateral force per Task 6 golden path |
| `TireCamberStiffnessNPerRad` | 1_200 | Lateral force vs. camber slope placeholder | Camber thrust contributes at knee-down lean |

## Estimated — longitudinal resistance (labelled estimates, no test-stand data held)

| Constant | Value | Basis | Validation target |
|---|---:|---|---|
| `AeroDragAreaCdAM2` | 0.35 m² | **Estimate.** Sport bike + tucked rider CdA is commonly cited at 0.30–0.40 m²; no R1 wind-tunnel figure held | WOT top speed emerges drag-limited near the R1's ~299 km/h claim, below the 6th-gear redline ceiling |
| `RollingResistanceCoefficient` | 0.015 | **Estimate.** Motorcycle sport radial on asphalt order-of-magnitude | Closed-throttle coast decays visibly from 100 km/h; no self-propulsion at rest |
| `EngineBrakingTorqueNmAtRedline` | 20 N·m | **Estimate.** Closed-throttle motoring (friction + pumping) torque order-of-magnitude for a 998 cc four at high rpm, linear from idle; includes drivetrain drag | Gear-dependent coast decel through the rear contact patch; zero at idle so the bike cannot creep backwards |

## Known gaps

- **Gearbox ratios and final drive** — surrogate until a 2020 owner's handbook table is scanned;
  wrong ratios show up immediately in top-gear speed and shift RPM tests (Task 7). The **primary
  reduction (1.634)** is now sourced from published spec tables and applied in `TotalRatio`.
- **Longitudinal resistance** — CdA, rolling resistance, and closed-throttle motoring torque are
  labelled estimates; replace with coast-down or dyno data if held.
- **Redline** — surrogate pending handbook; affects rev limiter and auto-shift ceiling.
- **Inertias and CG** — no published 6-DOF inertia tensor located; surrogates must be validated
  against lean transient, wheelie/stoppie, and tip-over golden paths (Tasks 4–6).
- **Pacejka coefficients** — only a friction-circle surrogate is modeled in v1; full tyre parameters
  stay explicitly labeled surrogate with combined-slip validation targets.
- **Electronics** — ABS, traction control, slide control, and launch control are out of scope for v1;
  do not silently fold their authority into tyre µ.
- **Rider-response constants** — the reflex delay and rate limits are gameplay-calibrated provisional
  values. They model a bounded human stabilization loop, not Yamaha electronics or measured
  neuromuscular data, and raw mode remains available as the comparison adapter.

## Operational notes for dynamics consumers

- Use `CurbMassKg + RiderMassKg` for combined mass unless the mission strips the rider.
- Steady turn curvature target: `v²/(ρ g) ≈ tan φ` with roll inertia lag from `RollInertiaKgM2`.
- Resolved tyre force is trajectory authority: planar yaw satisfies `v × yawRate = lateralForce /
  mass`. The earlier direct kinematic-yaw path was rejected because it allowed the bike to corner
  with tens of kilonewtons more force than the contact patches resolved.
- Longitudinal load transfer couples through `CombinedCgHeightM` and wheelbase — not a fixed 50/50 split.
- Rev limiter and peak power map should respect `PeakCrankPowerW` at `PeakPowerRpm`, not exceed
  `RedlineRpm`.
