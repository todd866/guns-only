# Cobra authentic control and canyon wind v2

Updated: 2026-08-11

## Problem

The Build 310 Cobra can be displaced by wind, but it is difficult for wind to create pilot
workload. Two unrelated shortcuts compound:

- the browser captures pitch and roll when cyclic is released and can spend half of total cyclic
  authority returning to that captured attitude, while the published control profile says there
  is no assistance;
- the flight foundation commands body rates through short first-order fits, and production wind
  is a position-only terrain-shaped mean sampled at one point. Wind therefore changes translation
  and inflow without supplying a resolved roll, pitch, or yaw disturbance.

The result is a helicopter that appears to ignore moving air and then freezes in attitude when
the pilot lets go. Increasing a global wind number or weakening every response gain does not fix
that authority error.

## Product contract

### Authentic controls

1. The default production profile is authentic and emits no cyclic command when the pilot has
   released an axis. It does not capture or hold pitch, roll, heading, position, altitude, or
   hover.
2. A keyboard accessibility hold may exist only as an explicit, labeled option. Its cyclic
   authority is capped at the sourced AH-1G SCAS authority fraction (12.5%) and it is never the
   production default.
3. Digital cyclic and pedals retain finite travel; analog axes remain proportional. Collective
   remains a persistent lever.

### Moving canyon air

1. `CobraCanyonWindField` keeps the existing terrain-shaped synoptic mean and composes a bounded,
   deterministic intermittent field over it.
2. Gust texture moves through world space as a pure function of authority time and the authored
   synoptic vector. Wall clock, frame rate, random process state, and renderer time are forbidden.
3. Explicit still air remains exactly zero. The same position, tick, terrain, and seed return the
   same vector bit-for-bit.
4. The runtime samples the vehicle centre for translational air-relative truth, plus main-rotor
   fore/aft/left/right points and the tail-rotor station for spatial disturbance truth.

### Rotorcraft response

1. Uniform airflow cannot invent a gradient moment. Resolved differences across the disc may
   produce bounded roll and pitch moments; tail-versus-centre airflow may produce bounded yaw.
2. Gust moments are integrated through the published AH-1G roll, pitch, and yaw inertias. They do
   not directly write attitude or camera pose.
3. Hands-off rate damping is distinct from pilot-control response. Neutral cyclic must not erase
   essentially all body rate in one second merely because the command is zero.
4. The existing limited yaw SCAS stays bounded at 12.5%. Any cyclic rate feedback uses the same
   explicit authority ceiling and lag; it cannot become an attitude hold.
5. Every provisional gain and safety clamp is centralized, documented, observable, and covered by
   calm-air, gust-response, and determinism tests.
6. Natural hands-off yaw damping is not a low-pass on main-rotor torque. Torque/limited-SCAS
   response retains the authored pilot-axis response time while the released-pedal component
   decays independently.
7. Main-rotor thrust above hover trim acts through the authored longitudinal hub offset and
   mass-scaled pitch inertia. The coupling is zero at trim and after rotor shutdown; it contains no
   canned oscillation.

## Acceptance

- authentic neutral input stays neutral through measured attitude drift;
- a fixed hover samples changing air over authority time when wind is enabled;
- calm air produces no gust moment or spontaneous body rate;
- a resolved vertical gust difference across the main rotor produces the correctly signed,
  finite roll or pitch response;
- a resolved tail-flow difference produces a finite yaw response without bypassing pedal/SCAS;
- a production-rate trim-to-full collective pull has bounded two-sided Nr, torque, load, P/Q/R
  envelopes at 0.25, 0.5 and 1.0 seconds in a genuinely trimmed hover;
- sustained hover at full collective requires finite cyclic and pedal correction from an
  instrumented test pilot, while those corrections materially reduce open-loop pitch and yaw
  error; forward-flight workload remains an owner-flight acceptance item until a sourced cruise
  trim replaces the old constant-cyclic scripted case;
- two complete runtimes with the same route, seed, controls, and ticks retain exact state,
  observation, telemetry, and airflow equality;
- focused owner flight: quartering gusts require cyclic and pedal corrections without becoming
  unrecoverable noise, while deliberate cyclic response remains immediate.

## Candidate tuning (provisional)

- seven-octave, 90 m outer-scale, Hurst 1/3 intermittent texture with a fixed mission seed;
- local gust RMS starts at 22% of synoptic speed, is shaped by AGL/slope/relief, and is capped at
  1.8 m/s per-component target with a 4.8 m/s vector ceiling;
- main-rotor stations are at 70% radius; resolved moment response is capped at 18°/s² roll,
  12°/s² pitch, and 8°/s² yaw through mass-scaled inertia;
- authentic hands-off rate time constants are 3.0 s roll, 3.2 s pitch, and 2.5 s yaw. Pilot-active
  axes retain the existing 0.34/0.38/0.24 s response fits so removing fake stability does not make
  deliberate control sluggish;
- cyclic SCAS is rate-only, uses the existing 0.08 s lag, and cannot exceed 12.5% of axis rate
  authority.
- gust gradients use the live disk load and the single BEMT tip-speed term. They do not multiply by
  an additional `Nr²`, which previously made the same gust collapse approximately with `Nr³`
  during a full-power pull.

These are gameplay-safe reduced-order values, not measured AH-1G stability derivatives. Owner
flight may move them only with before/after telemetry and the calm/gust/determinism gates intact.

## Non-goals and epistemic boundary

This slice is not CFD and does not claim an azimuth-resolved BHC-540 rotor, physical tail-rotor
BEMT, teeter/flapping stops, dynamic stall, or surveyed canyon meteorology. It is a deterministic
reduced-order correction that makes moving-air truth consequential through explicit vehicle
authority. Those higher-fidelity closures remain in `docs/airframes/ah-1g-cobra/10-flight-model.md`.
