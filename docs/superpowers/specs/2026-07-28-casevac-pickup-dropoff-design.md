# CASEVAC flight — low-level pickup and drop-off

Date: 2026-07-28

Status: accepted CASEVAC flight direction; CASEVAC implementation not started; prior command
prototype parked

Supersedes: [the broader medevac command design](../../medevac-mission-design.md) for the first
playable evacuation slice

## Decision

> The first CASEVAC game is an aviation course: fly one low-level pickup, secure one opaque casualty
> capsule, and deliver it to one fixed handoff point under an urgency clock. The player receives no
> diagnosis, vital signs, treatment controls, patient ranking, or facility-routing problem. Care is
> expressed through how the aircraft is flown.

The player is the pilot, not a remote clinician or logistics commander. The short game is one
aircraft, two locations, and one clock. Its central lesson is:

> The fastest rescue is the fastest flight that can still arrive, load, depart, and hand over
> safely.

`CASEVAC` is a product-development label for this fictional transport loop. It does not claim a
real operational classification, protocol, or standard of care.

## First playable slice

One unarmed, eight-to-twelve-minute sortie:

1. Start airborne near the safe edge of the Soniachne low-level cell.
2. Choose a route to one authored pickup pad.
3. Fly a deliberate low-level profile through terrain, weather, wires, and other authoritative
   obstacles.
4. Make a stable approach, land, and remain stable while one sealed casualty capsule is secured.
5. Fly to one fixed clinic or receiver. The aircraft now reports `OCCUPIED`.
6. Make a second stable approach and remain stable through handoff.
7. Let a short, quiet engine-down beat precede the evidence-based debrief.

The route should offer one legible trade: a shorter, more exposed line and a longer,
terrain-masked line. The first slice uses an authored exposure field to make masking meaningful,
but it has no enemy actors, weapons, procedural ambush, or random attack. The briefing explains what
`MASKED` and `EXPOSED` mean; the requested handoff is the only ticking target. Several routes should
be viable, and neither the shortest nor the most masked route is the predetermined correct answer.
Exposure is a separate evidence axis, not a second countdown or a timer that spawns punishment.

There is one pickup, one receiver, one casualty capsule, and no destination-selection or triage
puzzle. The player chooses route, profile, approach direction, commit or go-around, and whether
aircraft state still permits continuation. Automation may stabilize a selected flight condition;
it may not choose those consequential actions.

## Explicit non-goals

- Patient identity, biography, diagnosis, injury mechanism, physiology, vital signs, waveforms,
  treatment, drugs, interventions, or survival probability.
- An exact `DEATH IN 03:42` countdown or an outcome that claims the player killed or saved someone.
- Multiple casualties, two-slot optimization, receiver capability matching, relays, or triage.
- Autonomous pod dispatch, a last-mile extraction drone, fibre control, RF fallback, repeaters,
  swarms, or a separate logistics command surface.
- Combat, guns, escorts, active threats, target selection, or a renderer-owned threat game.
- Free-form LZ selection, improvised landing surfaces, or safety inferred from the macro terrain.
- A fake helicopter made by retuning fixed-wing G-command dynamics.
- Roguelike rank, permadeath, reputation, patient-value tiers, daily generated missions,
  multiplayer, or generated story scenes.
- A general medical framework or claims of clinical training.

The parked prototype may remain available as research. Its existence does not expand this scope.

## Player-visible information

The in-flight display remains austere.

Flight-critical evidence:

- attitude, flight path, airspeed or groundspeed, vertical speed, and AGL;
- fuel or energy, power margin, wind, and aircraft limits;
- authoritative obstacle and wire cues;
- active pickup or handoff steer, range, bearing, and ETA; and
- the declared safe masking band and a coarse `MASKED` or `EXPOSED` indication from the scenario's
  exposure field.

Mission evidence:

- `TIME SINCE CALL`;
- the authored requested-handoff marker;
- pickup and handoff location;
- `WAITING`, `LOADING`, `OCCUPIED`, `HANDOFF`, or `TRANSFERRED`;
- briefing-visible approach, escape, and stable-contact criteria;
- continuous approach/stable-contact state rather than an after-the-fact failure; and
- loading or handoff progress while the aircraft remains inside its stable gate.

The vehicle-appropriate `vertical_lift_nav` limits panel stays active with authoritative closure,
power margin, endurance, and destination reserve. CASEVAC does not fill the reserved clinical
patient panel. Phase, custody, and clock fit in the quiet mode line or one restrained mission strip;
they do not become a second cockpit dashboard.

Every graded limit is available before the relevant decision through the briefing, ordinary flight
instruments, or an honest predictive cue. The learner-facing snapshot contains no name, age,
demographic information, diagnosis, mechanism, vitals, interventions, prognosis,
patient-specific manoeuvre limit, or hidden urgency tier.

## Urgency-clock contract

The clock is an authored gameplay abstraction, not a physiology model. Its definition contains
integer `initialCallAgeTicks` and `requestedHandoffAgeTicks`. The controller records
`missionBeginTick` at the `Ready -> Active` edge and maintains its own active-mission tick count;
it does not compare the target with raw session `TimeSeconds`, which may remain monotonic across
restart.

- Displayed call age is `initialCallAgeTicks + activeMissionTicks`.
- Active mission ticks advance only while the normal session lifecycle is active. Pause consumes no
  call time. Restart creates a fresh epoch and restores the authored initial call age.
- The display leads with elapsed `TIME SINCE CALL`; the briefing and instrument mark a requested
  handoff time.
- Crossing that marker produces `WINDOW PASSED · COMPLETE IF ABLE`. It neither ends the sortie nor
  changes an unseen patient from alive to dead.
- The crossing event emits once when the previous call age is below the target and the current call
  age is at or above it. The clock stops when handoff, safe abort, or pre-handoff aircraft-loss
  disposition latches.
- The kernel records requested and actual handoff ticks for pacing evidence. It does not infer a
  clinical outcome from either.
- There is no random or hidden patient deterioration in this slice.

Time matters, but it is subordinate to collision margin and controlled terminal flight. The game
must not teach that saving a few seconds justifies an unstable approach.

## Mission and custody state

Mission phase and capsule custody are related but separate authoritative state.

```text
READY
  -> INGRESS
  -> PICKUP_APPROACH
  -> LOADING
  -> OUTBOUND
  -> DROPOFF_APPROACH
  -> HANDOFF
  -> QUIET
  -> COMPLETE

INGRESS, PICKUP_APPROACH, or LOADING -> ABORT_RETURN -> ABORTED
LOADING -> PICKUP_APPROACH when contact is lost
HANDOFF -> DROPOFF_APPROACH when contact is lost
Any pre-handoff active phase -> AIRCRAFT_LOST
```

The opaque capsule has exactly one custody location:

```text
AT_PICKUP
  -> IN_AIRCRAFT
  -> AT_RECEIVER
```

`LOADING` and `HANDOFF` are processes, not custody locations. Interrupted loading remains
`AT_PICKUP`; an interrupted handoff remains `IN_AIRCRAFT`.

Required transitions:

- `INGRESS -> PICKUP_APPROACH` when the aircraft enters the pickup terminal volume.
- `PICKUP_APPROACH -> LOADING` after contact inside the authoritative pad footprint and a continuous
  stable dwell.
- `LOADING -> OUTBOUND` after the entire loading dwell completes. Custody changes to
  `IN_AIRCRAFT` exactly once at this transition.
- `OUTBOUND -> DROPOFF_APPROACH` when the aircraft enters the receiver terminal volume.
- `DROPOFF_APPROACH -> HANDOFF` after the same kind of stable-contact dwell.
- `HANDOFF -> QUIET` after the handoff dwell completes. Custody changes to `AT_RECEIVER`, the
  operational disposition latches, and the urgency clock stops exactly once.
- `QUIET -> COMPLETE` only after the authored quiet-aftermath interval.

A go-around is not failure; the mission remains in the relevant approach phase. A loss of stable
contact that remains inside the exit tolerances pauses loading or handoff. Regaining the enter gate
resumes it. Leaving the exit footprint or losing surface contact resets progress and returns to the
relevant approach phase rather than attaching or transferring the capsule at a distance.

`ABORT_RETURN` is available only while custody is `AT_PICKUP`. It is a flown return through the
declared safe-exit volume, not an immediate menu result. Reaching that volume produces `ABORTED` and
the player-facing `PICKUP INCOMPLETE`. Once the capsule is `IN_AIRCRAFT`, the sole declared safe
destination in v1 is the receiver; diversion and occupied abort logic remain out of scope.

After handoff, ordinary vehicle physics and controls remain live through `QUIET`, but the transfer
disposition is permanent. A later aircraft incident is recorded separately and cannot turn a
transferred capsule into `AIRCRAFT LOST · OCCUPIED`. Before handoff, the first non-flying terminal
state latches the CASEVAC loss disposition and stops its clock; normal wreck physics may settle
before the session enters `Finished`.

Initial prototype tuning may begin near a two-second stabilization gate and an eight-to-ten-second
loading or handoff dwell. Ground speed, vertical speed, attitude, contact, and footprint thresholds
belong to a versioned vehicle/LZ gate profile and require testing; they are game tuning, not medical
claims.

Each scenario stores integer `stabilizationDwellTicks`, `loadingDwellTicks`, and
`handoffDwellTicks`. A single immutable `LandingZoneObservation` is computed for each authority
tick from vehicle and authored LZ truth. It includes site and approach-attempt ID, footprint/contact
state, ground and vertical speed, attitude, and the applicable gate result. Enter thresholds are
tighter than exit thresholds. Pause, resume, approach-discontinued, and transition events emit only
on edges; progress is snapshot state rather than event spam.

## Terrain, LZ, and vehicle truth

The existing regional and 32 m terrain products are not landing-zone truth. The entire playable
low-level corridor needs collision-authoritative terrain plus every gameplay-relevant wire, pole,
tree, fence, structure, and clearance volume; decorative route scenery cannot substitute for it.
Within that corridor, the first slice needs exactly two fixed, authored sites:

- 1–2 m surface patches with slope, roughness, material, and contact geometry;
- individual local obstacles and rotor-clearance volumes;
- declared approach and escape paths;
- wind, visibility, and surface-effect inputs that agree with the flight model; and
- stable IDs shared by simulation, presentation, events, replay, and debrief.

Decorative scenery cannot become a collision obstacle, safe pad, pickup trigger, or exposure
occluder merely because it is visible. If those two sites are not ready, an early headless prototype
may drive the mission controller with synthetic vehicle samples; it may not ship a flyable landing
exercise against fake geometry.

A required, versioned `ExposureFieldDefinition` gives the baseline its masking truth. It declares a
stable ID, observation sectors, safe low-level band, authoritative terrain/obstacle content hashes,
and deterministic sampling rule. Decorative geometry cannot
occlude it. If the definition is absent or its authority hashes do not match, `Masked` is explicitly
`NOT ASSESSED`; a frozen CASEVAC baseline cannot ship in that state.

A public playable slice also requires an honest vertical-lift dynamics provider with appropriate
semantic controls, mass response, power margin, wind response, and ground-contact behavior.
Fixed-wing `AircraftSim` must not be disguised as a rotorcraft by tuning constants. The first
vehicle may be a clearly fictional reduced-order air-ambulance surrogate, with its fidelity limits
disclosed.

Before that provider enters `SimulationSession`, extract a bounded player-vehicle authority seam
from the session's concrete fixed-wing fields. It must expose a versioned vehicle capability,
semantic command family, immutable state/observation, one fixed-step advance, additive payload
mass, contact state, and generic protection-intervention evidence. A fixed-wing adapter must retain
existing behavior before the vertical-lift implementation lands. This is a small vehicle boundary,
not approval for a generic ECS or a second simulation lifecycle.

Payload mass is an additive input to the authoritative recurring mass ledger while custody is
`IN_AIRCRAFT`; it is derived idempotently from custody every tick and removed when custody becomes
`AT_RECEIVER`. A one-time mass setter would be overwritten by the existing powered-flight mass
refresh and is not sufficient.

## Educational contract

Primary observable capability:

> Given one time-pressured pickup and receiver, choose a feasible low-level route and fly two stable
> terminal approaches without letting urgency erode safety margins.

Assessment reports separate dimensions rather than one opaque arcade score:

1. **Safe** — collision margin, obstacle contacts, generic protection-intervention events, and
   aircraft loss.
2. **Controlled** — stabilized pickup and handoff approaches, appropriate go-arounds, loading
   interruptions, and departure discipline.
3. **Masked** — time inside an authored safe masking band and exposure along the chosen route.
4. **Timely** — call-to-pickup, pickup-to-handoff, and total call-to-handoff time.

Safety and controlled terminal flight are gates. `Masked` and `Timely` are then reported as a paired
trade rather than pass/fail grades: more masking must not automatically beat an otherwise sound
timely route, and raw speed must not beat an otherwise sound masked route. The report preserves both
dimensions and may identify Pareto-dominated choices only against disclosed, authored reference
routes. It does not collapse them into a secretly weighted total.

A safe go-around may score better than continuing an unstable first attempt. `Lowest AGL`, `fastest
run`, and `first-attempt landing` are diagnostics at most, never reward targets. The masking measure
rewards a declared safe band, not shaving clearance.

The first slice does not grade a hidden occupied-flight or jerk limit. A later version may add a
generic, explicitly non-clinical passenger/cargo envelope only when the vehicle model owns it and
the player can see it before making the relevant manoeuvre. It cannot be presented as
patient-specific medical causation.

### Baseline, practice, and transfer

- **Familiarization:** a short, unassessed session teaches the vertical-lift controls, ordinary
  instruments, declared limits, and stable-contact indication. Probe eligibility requires its
  completion or demonstrated equivalent proficiency.
- **Frozen baseline:** one deterministic, uncoached sortie with fixed clock, weather, wind, pads,
  exposure field, and vehicle. Limits remain visible; there is no route ghost, adaptive easing, or
  corrective coaching.
- **Targeted practice:** one 60–120-second drill selected from recorded evidence: route
  commitment, deceleration, go-around recognition, stable contact, loading discipline, or
  power-margin departure.
- **Held-out transfer:** the same capability at calibrated equivalent difficulty, changing one
  principal dimension such as valley geometry, wind/pad orientation, pickup surface context,
  light/weather, or reversed route. Practice cues disappear.
- **Delayed retest:** a later uncoached sortie tests retention rather than route memorization.

Practice and frozen probes keep separate records. The tutor cannot silently make a probe easier
because the player struggled.

## Outcomes and debrief

Player-facing outcomes are operational:

- `HANDOFF · 06:42`
- `HANDOFF 09:18 · REQUESTED 08:00`
- `CONTROLLED ABORT · PICKUP INCOMPLETE`
- `AIRCRAFT LOST`
- `AIRCRAFT LOST · OCCUPIED`

Never render `Victory`, `Defeat`, a kill-style result, patient survival, or a moral grade.

The debrief has three compact layers:

1. the operational outcome;
2. one prioritized, evidence-backed correction tied to an exact recorded moment; and
3. a neutral trace of route, masking band, exposure, approach gates, loading interruptions, time by
   leg, and reserve.

Examples:

- “You entered the pickup terminal area at 04:37; first stable contact occurred 34 seconds later.
  Begin deceleration before the orchard.”
- “The first approach was discontinued at 05:12; stable contact occurred 21 seconds later.”
- “Loading paused twice while lateral ground speed was outside the declared stable-contact
  gate.”

Counterfactual time claims require a validated alternate-trajectory comparison, not ordinary replay
alone. Debrief may correlate authoritative geometry and recorded observations, but it must preserve
what the player could know at the decision and must not invent a patient outcome.

## Emotional and audiovisual contract

The emotional direction is original **pastoral-industrial humanism**, implemented through the
existing soft-world / cold-instruments grammar. “Ghibli” is a conversational reference for
tenderness, ordinary work, weather, and quiet; it is not a request to copy a studio's characters,
assets, compositions, palette, or music.

Humanity comes from ritual rather than biography:

- a clipped dispatcher call over a living landscape;
- ground staff shielding a covered capsule from rain or rotor wash;
- a visible team attending the pickup without exposing the patient's identity;
- the latch taking weight, the aircraft mass changing, and `EMPTY` becoming `OCCUPIED`;
- the pilot making gentler, more deliberate inputs because someone is aboard;
- receiver staff taking custody without a speech; and
- propulsion falling away into wind, rain, insects, cooling metal, and distant ordinary work.

Care lives in the verbs: **stabilize, wait, secure, carry, hand over**.

The mission needs ordinary successful flights and quiet competence, not constant tragedy. No gore,
sobbing exposition, heroic camera orbit, rescue medal, triumphant fanfare, retrospective “it was a
child” reveal, or tragic sting may convert a technical mistake into emotional coercion. Music is
rare punctuation; loading, latches, machinery, weather, and silence carry the scene.

The quiet beat is skippable after its first viewing and has reduced-motion, subtitle, visual-alert,
and mix controls. Restraint must not become a mandatory repeated ritual or an accessibility barrier.

## Authority and implementation seams

CASEVAC uses the production flight lifecycle and authoritative fixed-step clock. It does not ship as
a second one-Hz logistics game beside the flight simulator.

```text
approved scenario + seed + timestamped pilot inputs
    -> SimulationSession at the production fixed step
        -> vehicle, terrain, weather, LZ, exposure, clock, and custody truth
            -> observer-safe CASEVAC snapshot + sparse ordered events
                -> HUD, sound, replay, assessment, and debrief
```

Add a bounded `CasevacMissionController` beside the existing mission directors. It owns phase,
clock marker, custody, timed gates, disposition, and mission-specific evidence while consuming
authoritative vehicle/LZ samples. It does not own a second lifecycle or recreate flight physics.
`SimulationSession` advances it and remains the single authority.

Likely content and code seams:

- `MissionContract` carries the stable mission identity; `BeatSetup` gains an optional CASEVAC
  scenario definition;
- `CasevacScenarioDefinition`, `CasevacMissionController`, `CasevacPhase`,
  `CasevacDisposition`, `CasevacAssessment`, `LandingZoneDefinition`, and `CapsuleCustody`;
- versioned CASEVAC fields in both snapshot and hot-frame projections, with parity tests;
- a mission strip that consumes observer-safe data;
- mission-specific outcome/debrief copy before the generic combat result path; and
- restart, replay, pause, event-order, and determinism coverage in the normal session tests.

The no-opponent migration is explicit. `BeatSetup` gains `OpponentPresence.Present` as its legacy
default and `OpponentPresence.None` for CASEVAC, with optional opponent initial state. When presence
is `None`, staging does not construct an opponent simulation; weapons, engagement geometry,
padlock, counters, and combat terminal resolution do not run; and the snapshot publishes
`opponent_present=false` without phantom opponent kinematics. Every affected path is presence-gated
and covered by the existing combat missions plus a no-opponent test.

Per-tick update order is fixed:

1. advance vehicle/environment truth and resolve contact, collision, and terminal flight state;
2. derive the one player-vehicle and LZ observation for that tick;
3. latch a pre-handoff loss disposition if the vehicle is no longer flyable, otherwise advance the
   CASEVAC controller;
4. append sparse events and update bounded evidence; and
5. project immutable observer-safe state.

CASEVAC disposition is authoritative for this mission family. Its finish path does not call the
combat `UpdatePendingOutcome()` resolver or translate handoff into `Victory/Defeat/Draw`.

Suggested stable content IDs:

```text
mission.ukraine-2030s.casevac-low-level.prototype.v1
aircraft.casevac-air-ambulance.prototype.v1
location.ukraine.casevac-pickup-a.v1
location.ukraine.casevac-handoff-a.v1
payload.evacuation-capsule.prototype.v1
```

Do not reuse `RapierGunDrone.PickupPoint`; it denotes a loose drone-recovery volume, not a validated
casualty embarkation site.

Sparse semantic events include:

```text
CasevacTaskStarted
PickupApproachEntered
ApproachAttemptStarted
StableContactEntered
StableContactExited
LoadingStarted
LoadingPaused
LoadingResumed
LoadingReset
CapsuleSecured
RequestedHandoffWindowPassed
DropoffApproachEntered
ApproachDiscontinued
HandoffStarted
HandoffPaused
HandoffResumed
HandoffReset
HandoffCompleted
CasevacAborted
CasevacAircraftLost
```

The existing combat-shaped `SessionEvent` is not stretched to hold these records. A versioned
`MissionEventRecord` stream shares one monotonically increasing session sequence with other ordered
events and carries tick, scenario ID, aircraft ID, site/capsule ID where applicable, approach
attempt ID, kind, and schema version. `ApproachDiscontinued` and `StableContactExited` are observed
facts; no `GoAroundDeclared` event exists unless a later semantic pilot command makes the
declaration authoritative. Per-tick progress remains snapshot state, not event spam.

### Bounded CASEVAC evidence

The current carrier-incident buffer and small presentation-event ring cannot reconstruct this
course. A mission-owned `CasevacEvidenceRecorder` keeps:

- per-authority-tick aggregates for time, clearance, exposure, gate deviations, interruptions,
  reserve, and terminal facts without retaining every raw tick;
- a 2 Hz route trace capped at 1,800 samples, enough for a fifteen-minute sortie;
- 12 Hz samples while inside either terminal volume, capped at 10,800 samples; and
- at most three marked correction clips, stored as tick ranges over those bounded samples.

Attempt IDs and ordered events preserve every approach count even if detailed sampling reaches its
declared cap. Snapshot delivery may expose compact aggregates and the selected clip; the full
bounded record remains replay/debrief evidence. Ordinary replay supports factual intervals only.

## Migration from the parked medevac prototype

The separate command-and-logistics prototype is preserved as research, not current architecture.
Only four ideas are candidates for direct salvage after review:

- stable capsule identity;
- exactly-one-place custody conservation;
- timed pickup and handoff transitions; and
- ordered semantic events.

Its two-patient routing, facility capabilities, medical observations, rear-crew assessment, CRM
overrides, autonomous pod network, fibre/RF extraction ladder, independent session lifecycle,
separate bridge, and `/medevac/` UI are outside this slice. They must not leak into the main flight
snapshot under unused or hidden fields.

## Implementation order

1. Freeze this scope and park the broad prototype without deleting it.
2. Build and test the scenario definition, controller, custody invariant, urgency clock, and
   bounded evidence recorder against synthetic authoritative vehicle/LZ samples.
3. Author the authoritative low-level corridor, required exposure field, and exactly two
   high-resolution LZ sites with obstacle/approach truth.
4. Extract the bounded player-vehicle authority seam and prove its fixed-wing adapter is
   behavior-preserving.
5. Add or validate the fictional vertical-lift provider and its disclosed flight envelope.
6. Integrate the controller through `MissionContract`, `BeatSetup`, and `SimulationSession` with
   `OpponentPresence.None` and the CASEVAC-specific terminal resolver. Replace the independent
   built-in index bound with one catalogue authority first: `Beats.BuiltIn` already declares mission
   12 while `SimulationSession.StartBeat` accepts only 1–11.
7. Project the observer-safe mission strip, sparse audio/visual events, replay evidence, and
   mission-specific debrief.
8. Ship the familiarization, frozen baseline, one targeted practice drill, and one held-out
   transfer sortie as a single educational course.

Do not begin clinical modelling or revive the broad logistics UI to unblock any of these steps.

## Acceptance

- A newcomer can state the loop after one attempt: get there, stabilize, secure, carry, hand over.
- One deterministic seed and input stream reproduce phase, custody, clock, event, and assessment
  hashes.
- Pause does not consume the urgency clock; crossing the requested marker never auto-fails or
  invents a patient outcome.
- Restart creates a fresh clock epoch with the authored initial call age, and the window-crossing
  event emits at most once per run.
- Capsule custody has exactly one location. The recurring mass ledger includes payload mass on every
  tick while custody is `IN_AIRCRAFT`, excludes it otherwise, and each custody transition occurs
  once.
- Leaving a pad early cannot complete loading or handoff; a controlled go-around remains valid.
- `CONTROLLED ABORT · PICKUP INCOMPLETE` requires a flown pre-pickup return through the safe-exit
  volume; no airborne menu action ends the mission immediately.
- Pickup and handoff grading use authored high-resolution surfaces and obstacles, never decorative
  scenery or macro terrain.
- The baseline exposure field matches authoritative corridor hashes and adds no second countdown.
- No patient or clinical fields appear in the learner-facing snapshot, HUD, event stream, or
  debrief.
- Every assessed route, approach, contact, and timing limit is visible before it can affect the
  grade.
- The baseline, practice, transfer, and delayed-retest records remain distinguishable.
- The debrief reports separate Safe, Controlled, Masked, and Timely evidence and selects one
  replay-supported correction.
- Evidence remains within the declared route/terminal sample caps while retaining all aggregate and
  approach-count facts.
- CASEVAC publishes `opponent_present=false`, constructs no phantom opponent, and never reaches the
  combat outcome resolver.
- Completion copy says `HANDOFF`, not `Victory`; late handoff remains completion.
- The mission ends with an authored, accessibility-safe quiet interval (skippable after first view)
  and no celebratory rescue treatment.
- Existing flight, HUD, replay, and mission tests remain green.

## Fiction, representation, and use boundary

The aircraft, sites, receiver, capsule, people, exposure field, and incident are fictional
composites. They have no real coordinates, units, organizations, routes, capabilities, or
operational claim.

This is a game and educational flight simulation, not clinical decision support, dispatch software,
real navigation, targeting, or operational planning. It teaches declared aircraft and
margin-management skills only. Any later medical learning objective requires an independently
validated domain model, sourced claims, uncertainty handling, scenario tests, and qualified
subject-matter review.
