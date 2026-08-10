# AH-1G flight-model design and acceptance cards

## Architecture decision

`Ah1gCobraDynamics` is a sibling `IPlayerVehicleDynamics` provider. It is not a fixed-wing retune
and does not derive from the fictional CASEVAC vehicle. The shared interface owns semantic input,
mass custody, environment sampling, generic state/observation and fixed 120 Hz authority. The
rotorcraft provider owns every rotor/drivetrain state and its fidelity disclosure.

This preserves one control language across Guns Only while changing physical meaning:

```text
arrows -> cyclic       A/D -> pedals       W pull / S push -> collective lever
                                         |
                                         v
 blade pitch -> rotor thrust/torque -> rotor RPM/governor -> rigid-body forces
```

No input directly sets climb rate, velocity, disk tilt, thrust, engine power or RPM.

### Collective rigging authority

Builds 253-264 reversed the fixed-wing W/S power sense as a real-lever metaphor (S = pull).
On 2026-08-05 the owner overruled that in favour of game convention — W raises collective,
S lowers it — while the lever remains a persistent physical position, not an altitude shortcut:

| Physical input | Lever motion | Semantic result |
|---|---|---|
| Hold **W** | pull toward the pilot | increase collective blade pitch |
| Hold **S** | push away from the pilot | decrease collective blade pitch |
| Hold both | opposed inputs | neutral; neither input silently wins |

`cobra_control_profile.js` owns that browser-facing sign contract while honoring remapped player
bindings. It emits raw collective-rate, cyclic and pedal intent with no filtering or assistance.
`cobra_pilot_input.js` is the production seam Hold the Bridge consumes: digital axes slew and
spring-center, analog gamepad/touch axes stay proportional, and focus loss releases every
spring-centred command while leaving the collective lever where the pilot set it. The simulation
integrates the lever and determines whether the aircraft climbs, settles, droops the rotor or
enters an adverse regime.

## Production fidelity bar

The production target is a demanding, aircraft-derived piloted simulation comparable in method
and validation discipline to a serious desktop flight simulator. Difficulty must emerge from the
AH-1G's coupled dynamics, workload and limits; arbitrary instability, canned turbulence and hidden
control attenuation do not count as fidelity. The aircraft must remain quarantined until the
following replace the reduced-order foundation:

- azimuth- and radial-resolved BHC-540 blade elements with Mach/Reynolds airfoil tables, unsteady
  aerodynamics, reverse-flow handling and dynamic stall;
- teeter/flapping, undersling, pitch-cone coupling, hub moments, stops and mast-contact authority;
- coupled six-degree-of-freedom forces and moments using the sourced inertia tensor, CG, rotor,
  fuselage, stub-wing, fin and tailplane geometry instead of commanded body-rate fits;
- a physical tail-rotor/inflow/wake model with drivetrain coupling, pedal margin, crosswind and
  loss-of-tail-rotor-effectiveness behavior;
- source-closed engine, fuel-control, governor, freewheel, transmission and rotor-energy dynamics;
- flight-test closure for hover torque, climb, speed, control response, autorotation, VRS,
  retreating-blade stall and configuration/weight envelopes across atmosphere and wind;
- explicit AH-1G SCAS with its real limited authority. Any friendlier stability, attitude, heading,
  hover or altitude assistance must be a separately labeled player option and must never alter the
  uncompensated aircraft model.

## Implemented v1 foundation

### Main-rotor thrust

The provider uses a disk-averaged blade-element closure with linear twist:

\[
C_T = \frac{\sigma a}{2}
\left[
\frac{\theta_0}{3}(1+1.5\mu^2)
+\frac{\theta_{tw}}{4}(1+2\mu^2)
-\frac{\lambda}{2}
\right]
\]

\[
T=C_T\rho A(\Omega R)^2
\]

Collective changes effective blade pitch. Rotor speed, inflow, air-relative disk velocity,
density and advance ratio therefore all alter thrust. Negative `C_T` is clipped in this first
tier; reverse-flow quadrants belong in the azimuth-resolved model. A 3.7-times-maximum-gross
numerical guard prevents solver divergence but is not a structural or configuration load-factor
envelope. FM 101-20's weight/store-specific limits remain an explicit validation and integration
item.

### Dynamic inflow, ETL and ground effect

The momentum target is iterated from:

\[
T=2\rho A v_i\sqrt{V_h^2+(V_z+v_i)^2}
\]

and approached through a finite inflow state. Forward/lateral velocity reduces induced velocity
continuously, so translational lift is telemetry describing the transition—not an acceleration
bonus.

Ground effect uses a clamped Cheeseman–Bennett-style induced-velocity correction, fades with hub
height and horizontal speed, and never multiplies player acceleration. The v1 environment has one
surface sample, so roughness, water and partial-disk terrain are not represented yet.

### Rotor energy, engine, governor and autorotation

The main rotor carries explicit rotational energy using the two published blade inertias:

\[
I_R\dot\Omega=\frac{P_e-P_{MR}-P_{TR}-P_{acc}}{\Omega}
\]

Profile power is proportional to \((\Omega R)^3\), while induced power contains
\(T(v_i+V_z)\). In a sufficiently fast descent that term can be negative, transferring airflow
energy into the rotor. Engine failure immediately removes transmitted engine torque through the
freewheel; the rotor continues to drive tail/accessory loads.

The governor requests the current rotor load plus an RPM-error term, subject to turbine lag,
density lapse and the 1,100 shp transmission limit. This produces the required ordering for a
collective pull: blade pitch/load first, rotor droop, engine torque rise, then recovery if power is
available.

### Adverse regimes

- **Vortex ring state:** severity is continuous in normalized descent and horizontal velocity,
  using Johnson/Army-scaled entry and exit points. Developed VRS increases inflow lag/power and
  reduces delivered thrust; added collective increases the penalty. Translational escape fades it.
- **Retreating-blade stall:** severity grows with advance ratio, rotor droop and loading. It reduces
  disk thrust progressively and adds small deterministic 2/rev feedback. A soft in-plane drag wall
  and cyclic-authority fade engage before authored onset so sustained flight cannot park in
  BLADE STALL (owner 2026-08-08). There is no canned sudden roll because the AH-1G manual
  emphasizes increasing vertical vibration/control feedback for its teetering rotor.
- **Low-g/mast bump:** the provider reports risk from rotor unloading, speed and forward cyclic. It
  does not yet integrate teeter angle or strike the mast; that requires the next rotor tier.

### Airframe and contact

The fuselage has body-axis quadratic drag. The sourced exposed stub-wing area and incidence create
speed-dependent lift and drag through a provisional polar. Four skid points resolve a horizontal
surface sample, distinguishing stable, sliding and hard contact. Published hub offsets drive main
rotor clearance; terrain-distributed disk samples and tail-rotor/obstacle strikes remain open.
Rotor-clearance telemetry is `-1` when the environment supplies no assessable surface, keeping the
authority snapshot finite and serialization-safe.

## Deliberate v1 limitations

The model must not be described as a finished high-fidelity Cobra because it does not yet include:

- azimuth/radial blade integration, BHC-540 Mach tables, compressibility or dynamic stall;
- explicit teeter/flapping, undersling, stops, pitch-cone coupling and mast contact;
- physical tail-rotor BEMT, main-wake/fin interference, pedal margin or crosswind LTE behavior;
- source-derived 6-DOF hub/component moments using the pinned inertia tensor;
- horizontal tail/fin schedules, stores, asymmetric mass/drag, fuel/CG changes;
- distributed terrain/wake, slopes, vegetation/water ground effect, rotor/obstacle collision;
- component damage, fuel, temperature, gearbox/oil systems, engine start/manual governor;
- an articulated finite-ammunition AH-1G turret, ground targets, AI, mission, HUD, art or audio.

Yaw rate from main-rotor torque uses NASA CR-3144 limited-authority SCAS only (±12.5%, 0.05 s).
Build 305's slow autotrim is removed — owner telemetry showed high-TQ heading bias ≈0 deg/s and
the aircraft felt too easy; limited SCAS with residual pedal work is the more realistic AH-1G
channel. Provisional torque→yaw gain keeps hover near SCAS with a mild residual. Engine-out
retains its short left-yaw tendency. Cyclic/pitch still use the reduced-order whole-disk
response. Any friendlier heading/hover assist must be a separately labeled player option.

## Validation matrix

| Card | v1 automated evidence | Production closure criterion |
|---|---|---|
| Variant/geometry | exact constants, standard-vs-modified guard | source locators remain locked |
| Hover trim | BEMT inverse and 10 s no-controller hold | Army IGE/OGE torque across mass, density and height |
| Collective/governor | transient droop, power rise, climb | recover N2 within ±0.6% when unsaturated; measured torque trace |
| ETL | forward inflow reduction is continuous | power curve through 12–24 kt, no discontinuity |
| Ground effect | induced velocity/power fall near surface | multi-point disk samples and Army hover chart closure |
| VRS | normalized entry, collective penalty, forward escape | Johnson transient plus Army sink/control cues |
| RBS/high speed | progressive advance-ratio severity | BHC-540 stalled-area/compressibility and 2/rev loads |
| Autorotation | freewheel and collective/rotor-energy ordering | 60 KIAS minimum rate, 90/100 KIAS glide, 60–80 kt RPM peak |
| Contact | four skid points, stable/hard distinction | slopes, gear geometry/drop tests, rotor/tail/object strike |
| Determinism | exact 120 Hz state/observation/telemetry equality | long-run state hash in replay and production smoke |
| Level/climb performance | open | ≈149 KIAS clean level; Army mission climb/speed cards |

## Production integration blockers

### Two-seat crew and turret authority

The playable seat is the rear pilot position. The front-seat copilot/gunner is a deterministic,
simulation-owned AI crew member—not a browser LLM, a presentation animation or a perfect target
oracle. The gun lab reuses the existing dogfight interaction instead of adding turret controls:

- **Trackpad:** pilot freelook only; it never slews or designates the turret.
- **Tab:** cycles the simulation-owned selected target.
- **V:** toggles the ordinary padlock view on that target. Padlock is presentation/attention state,
  not AI knowledge or firing authority.
- **Hold F:** asks the AI gunner to engage the selected target. Release means cease fire.

The AI must acquire the selected authoritative target, retain line of sight, compute lead, remain
inside turret/airframe limits and drive the physical mount through finite servo dynamics. `F` is
engagement consent, not permission to invent a target or bypass a failed solution. The documented
pilot-fixed-forward capability remains a later failure/fallback mode rather than a second primary
control scheme.

`cobra_crew_input.js` owns this browser-side routing contract. It keeps pilot look/padlock/selection
state and AI-gunner engagement consent as separate immutable outputs and deliberately exposes no
turret-angle or weapon-trigger command. The simulation must own target identity, occlusion, crew
state, sight stabilization, mount feedback, weapon safety and every round. Crew callouts are
presentation of deterministic state transitions; they cannot change acquisition or firing
authority.

The AI gunner must have bounded, observable workload and failure modes: acquisition/reacquisition
time, target handoff, masking, gimbal limits, sight error, lost track, weapon inhibit and concise
crew acknowledgements. Difficulty comes from the pilot flying a platform the gunner can use while
managing target priorities and consent. The AI may not silently hold hover or attitude, see
presentation-only scenery, shoot through terrain, teleport the turret, or fire without consent.

Acceptance requires identical fixed-step replay decisions, a complete sight-to-target-to-mount
authority ledger, negative cases for masking/friendlies/out-of-limits/lost track, and proof that raw
trackpad deltas never appear as physical turret angles. A later optional AI transfer of flight
controls is a separate crew command and must never be conflated with normal gunnery assistance.

The current `cobra_crew_input.js` and `CobraAiGunner` implementations are quarantined contracts
only. Neither is imported by the production browser or Cobra Canyon lab, and neither is constructed
by `SimulationSession` or `CobraMissionRuntime`. They prove authority and failure semantics; they do
not make the current preview playable or add a physical turret, weapon or AI crew to a mission.

The production session currently branches between fixed-wing combat and unarmed CASEVAC. Before a
Cobra mission is truthful it needs:

1. Generic player kinematics plus an optional rotorcraft snapshot block; profile-aware keyboard,
   touch and gamepad axes (the existing CASEVAC analog path is incomplete).
2. Rotorcraft HUD/instruments for collective, torque, Nr/N2, IAS/GS/AGL, vertical speed, slip,
   governor/SAS and adverse-regime warnings. Fighter G/AoA/stall/funnel cues cannot be reused.
3. Generic articulated weapon mounts and magazines. The current gun solver assumes a body-forward
   muzzle and fixed four-metre offset; positive player ammo currently means an infinite thermally
   limited gun.
4. Simulation-owned ground targets/colliders/damage. Current scenery is presentation-only.
5. Rotorcraft replay/debrief/audio/presentation state. Rotor phase, turret motion and audio load
   must all be simulation-time driven, never wall-clock animation.

The safe first production beat is therefore an **unarmed Cobra flight lab**, followed by a
cannon-only range after the generic mount/target seam exists.
