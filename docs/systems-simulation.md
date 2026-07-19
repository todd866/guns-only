# Systems and procedural simulation

Guns Only treats failures as changes to ordinary system state, not mission-script branches. A
scenario chooses the initiating fault and timing. The aircraft model then produces the dependencies,
indications, degraded capability, pilot actions, aerodynamic consequences, and telemetry that follow.

That is the basis for decision-making sorties such as:

1. launch normally;
2. suffer an engine seizure or utility-hydraulic failure;
3. recognize the failure from RPM, electrical, hydraulic, control, and position indications;
4. configure emergency power or alternate controls;
5. manage energy while preserving finite accumulator/battery/brake capability;
6. use the correct emergency gear, flap, hook, and landing procedure;
7. recover or compound the failure through a poor decision.

Graphics may initially be a HUD, system synoptic, checklist card, and clickable actions. The system
state and consequences remain authoritative whether or not an animated cockpit control exists.

## Product lens: experienced-pilot situational awareness

The target is not a visual replica of an F-86 cockpit. It is the state estimate an experienced
Sabre pilot builds from indications, sound, vibration, aircraft response, elapsed time, configuration,
and context. The simulation therefore keeps three things separate:

1. **Physical truth** — component condition, pressure, power, fuel, position, temperature, loads, and
   aerodynamic state. This is never shown directly merely because the computer knows it.
2. **Available evidence** — what each powered sensor, warning circuit, control feel, and aircraft
   response can reveal, including ambiguity, lag, error, and loss of indication.
3. **Pilot belief and action** — what the player has observed, which test they conduct, which control
   they move, what response they expect, and how that changes their diagnosis and plan.

That separation lets a compact laptop display carry more useful fidelity than a decorative cockpit.
The 3D renderer supplies attitude, motion, energy, traffic, terrain, and deck geometry. A test-flight
console supplies powered indications, trends, and clickable actions. Neither may expose the hidden
fault ID. A debrief can reconstruct the evidence available at every decision and distinguish a sound
procedure from a lucky guess.

## Maintenance test-flight exercise contract

A maintenance test-flight exercise should be data, not bespoke mission code. Its definition owns:

- aircraft/profile and known preflight configuration;
- maintenance write-up or pilot-reported symptom;
- environmental and operating envelope;
- deterministic fault injection conditions, kept outside the player's evidence channel;
- test points, entry conditions, safety gates, expected observable responses, and abort criteria;
- pilot actions that are permitted, required, premature, hazardous, or destructive;
- termination conditions and a timestamped assessment rubric.

The procedure evaluator consumes only observations and pilot actions. It may credit recognition of a
failed normal extension, slowing below 175 KIAS before holding the F-86 emergency release, and
physically obtaining three downlocks; it must not award a diagnosis simply because the injected
failure happens to be `UtilityHydraulicPump`. This makes the same machinery usable for instruction,
assessment, replay, and later maintenance/campaign reliability without teaching the player to game
scenario scripts.

## Current simulation seams

- `J47PerformanceMap` returns one unit-explicit engine operating point: RPM, RPM percent, net thrust
  in newtons and pounds-force, fuel flow in pounds per minute, and running state.
- `FuelModel` integrates the engine's requested physical flow. Its smoothed value is only the cockpit
  indication; it cannot create or remove fuel.
- Aircraft gross mass is fuel-free mass plus remaining usable fuel on every fixed tick.
- Fuel starvation removes combustion thrust and flow. Engine availability is independent of the
  throttle lever so a scenario can inject a seizure, flameout, or fuel-system failure.
- `AirframeSystems` owns command versus actual gear/flap state, three independent gear indications,
  the ground interlock, primary-bus and utility-hydraulic dependencies, warning circuit, emergency
  release, one-shot nose accumulator, two flap motors/circuits, mechanical interconnect, split state,
  and configuration limits.
- Actual gear/flap state feeds lift, drag, and split-flap rolling moment. It also moves the stall and
  corner-speed indications on the IAS tape.
- A scenario-owned atmosphere supplies temperature, pressure, density, and speed of sound. The
  primary tape is ideal CAS/IAS from compressible pitot impact pressure; EAS remains an aerodynamic
  quantity, TAS is air-relative velocity, and the separately labelled G/S is horizontal earth speed.
- Weather profiles combine that hydrostatic atmospheric column with a layered three-dimensional
  wind field. Every aircraft in a session samples the same atmosphere and wind, while carrier
  burble composes locally on top of the ambient field.
- Failure injection is deterministic and named. Random occurrence and maintenance reliability belong
  to scenario/campaign layers, not inside component physics.

## F-86F research basis

The first checked-in systems profile uses T.O. 1F-86F-1 and NACA/NASA data as a research basis:

| Item | Modeled datum |
|---|---:|
| Usable internal fuel | 2,826 lb |
| J47-GE-27 sea-level military thrust | 5,970 lbf |
| J47-GE-27 sea-level military flow | 105.47 lb/min |
| Normal gear extension, including doors | approximately 10 s |
| Normal gear retraction | approximately 8 s |
| Emergency extension | approximately 11 s while held |
| Normal gear/flap limit | 185 KIAS |
| Emergency-extension preparation | slow below 175 KIAS |
| Full flap geometry | 38 degrees |

Primary engine sources are [NASA CR-137674](https://ntrs.nasa.gov/citations/19760003002),
[NACA RM E51B06](https://ntrs.nasa.gov/citations/19930086756), and
[NACA RM E9G09](https://ntrs.nasa.gov/citations/19930093773). The map uses bounded interpolation
between published standard-day rows. Installed-aircraft F-86F charts A-113 through A-116 remain the
validation oracle for the later full cruise surface. Non-standard temperature already affects the
aircraft's density, Mach, dynamic pressure, IAS, and generic-engine thrust. It changes the J47 map's
Mach input, but does not invent a non-standard-day J47 thrust correction absent from the source
deck. The current map also does not yet model inlet-installation losses, EGT, compressor stalls,
relight envelope, or windmilling RPM.

The gear/flap architecture, limits, indications, and emergency sequence come from the reproduced
[F-86F flight manual](https://fliphtml5.com/dqyy/tprw/T.O._1F-86F-1_Flight_Manual_F-86F/49/).
The manual does not publish flap travel time; the profile isolates a phenomenological eight-second
value so it can be replaced without changing system logic.

The F-86F was land-based. This profile is not evidence that a Sabre was carrier qualified.

## Naval Fury boundary

A historically carrier-capable swept-wing Fury is the FJ-3, which entered service after the Korean
War. It uses a J65 rather than the J47. The present broad `Korea 1950s` carrier presentation must not
silently mix F-86 engine figures with an FJ-3 handbook and call the result one exact aircraft.

The accessible FJ-3 handbook supports a future distinct profile with:

- 125–120 KIAS carrier approach references and angle-of-attack as the primary datum;
- speed brakes open on approach to hold higher RPM and improve waveoff response;
- a safe waveoff requirement of 75 to 100 percent RPM within five seconds;
- electric, dual-motor mechanically interconnected flaps with no emergency extension;
- hydraulic/electrically sequenced gear, gravity mains, and a one-shot nose accumulator;
- emergency hook release;
- ram-air-turbine power and alternate/emergency flight controls after seizure;
- finite alternate-pump/accumulator authority and four to five full brake applications after utility
  hydraulic failure;
- clean and landing-configuration dead-engine glide schedules;
- no-flap and barricade recovery procedures.

The reference is the reproduced
[AN 01-60JKC-1 FJ-3 Flight Handbook](https://books.google.com/books/about/North_American_FJ_3_Fury_Pilot_s_Flight.html?id=HwrN3Lb_5MoC).
Exact early-engine performance and confidential catapult/arresting tables were not available in the
public material found; they must remain explicitly unknown rather than invented.

## Next system depth

The next production layers should preserve the same component interfaces:

- engine governor, acceleration enrichment, compressor stall/flameout and relight envelope;
- battery charge, generator load, bus ties, RAT deployment and load shedding;
- normal/alternate flight-control hydraulic pressure, accumulator volume, demand rate and leakage;
- hook, speed-brake, wheel-brake, tire and anti-skid states;
- per-leg door, uplock/downlock, actuator, tire and strut state;
- fuel tanks, boost pumps, feed sequencing, unusable fuel and negative-G interruption;
- fire, temperature, vibration and battle-damage propagation;
- checklist/procedure evaluation based on observed evidence and pilot actions, not hidden fault IDs.

Every added state should be recordable in telemetry and replay, while the player's available display
continues to show only what that airframe and failure leave powered and sensed.
