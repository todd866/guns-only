# F-22 high-alpha model: external review findings and direction

*2026-07-23. Distilled from a gpt-5.6-sol advisory pass over `sim/FlightModel.cs` (Build 68) plus
public sources; adopted here as the working direction for the dedicated flight-model build. The
production observation that prompted it: max 43.3° AoA at 77 KIAS with envelope override held,
and the pilot-user's judgement that high-alpha behaviour still does not feel like the public
F-22 demos.*

## What public data supports

- Routine/demo high alpha: trim near **36° at ~80 KCAS**, 40° as the published slow-pass limit
  (official demonstration profiles, AFMAN 11-246 V1).
- Flight test: **controlled beyond 60° AoA**, 1-g maneuvering, high departure/spin resistance
  (AFFTC abstract). This is a capability ceiling, not unlimited three-axis authority.
- Loaded rolls at 36° use full lateral stick plus ~half pedal at 100–150 KCAS; J-turns and pedal
  turns are deliberate yaw-to-roll allocation. Recovery is mandated for beta above 30°.
- No defensible public maximum pitch-rate figure exists; the configured 0.85 rad/s cap is a
  labeled surrogate tuning value, nothing more. Validate whole maneuvers, not that number.

## Defects confirmed in the current model (priority order)

1. **Inherited Sabre departure couplings** — the F-22 does not override `PostStallDragMax`,
   `StallRollCoupling` (0.20), `StallYawCoupling` (0.34), or `StallPitchBreak` (26 kN·m); the
   differential-wing path converts negative post-stall lift slope into autorotation. Contradicts
   the public departure-resistance evidence. Suppress first.
2. **q-independent pitch authority dwarfs TVC.** The ordinary pitch channel supplies a fixed
   absolute moment retaining 85% in fully separated flow: ~2.89 MN·m (~591°/s² at surrogate
   inertia) versus ~0.52 MN·m from TVC at full configured thrust. The "aerodynamic" channel can
   dominate at zero airspeed with engines out.
3. **q-independent rudder authority** — 85% of fixed `YawMomentMaxNm` retained in separated flow
   regardless of q or thrust, while attached roll authority disappears. Inconsistent triad:
   little controlled roll, generic autorotation, enormous pedal.
4. **Generic post-stall force curve** (~CL 0.63 @ 36°, 0.15 @ 60°) does not represent a
   vortex-lifting chined configuration; must at minimum reproduce the 36°/80-KCAS slow pass.
5. **Zero-speed/reverse-flow edge**: alpha snaps toward ±180° through a tail slide and TVC
   disengages exactly when the public demos rely on it.
6. The 11 G override is gameplay, not public data; it must stay outside the surrogate's
   validation story (cap the surrogate claim at 9 G).

## Adopted plan (dedicated build)

1. Containment: zero/provisional-F-22 values for the inherited Sabre couplings.
2. Bounded high-alpha lateral model: alpha-scheduled derivatives scaled by q·S·b, stability-axis
   yaw damper + aileron-rudder interconnect (NASA TN D-8176 pattern); disturbances from real
   beta/rates/damage only — never injected departure.
3. Split demanded pitch moment from available control power: aero portion clamped by an
   alpha/q-dependent `q·S·c·Cm_available`, residual allocated to TVC bounded by thrust, lever
   arm, ±20° travel, and an actuator rate limit (NASA TP-208464 pseudo-controls pattern). Same
   treatment for yaw.
4. Coarse body-axis CN/CA schedule with transparent knots (18/36/45/60/90°).
5. Hard-stop target 60–63° alpha; do not tune past it to chase a telemetry number.
6. Validation corridors at matched mass/CAS: 36°/80 KCAS slow pass (MIL, max 40°), controlled
   60° trim at MAX, loaded roll 30–36° @ 110–150 KCAS, J/pedal turn 75–100 KCAS without
   autorotation, tail-slide zero crossing with bounded beta, engine-out low-q authority collapse,
   perturbed-beta asymmetric entries.

**Anti-goal:** "zero the couplings then raise TVC gain until Space reaches 60°" — that tunes
around the unphysical fixed moments and ships a laterally inert spacecraft.
