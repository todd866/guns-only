# Armstrong greybox implementation scaffold

Status: design only; no runtime files changed  
First risk slice: attack-run checkpoint through no-landing decision  
Full target: all twelve beats in `armstrong-ejection.sequence.json`

## Why the first build starts at the cable

The launch, full transit, final art and voice are not the central design risk. The first executable
slice should begin at `checkpoint.armstrong.attack-run.v1` and end after
`checkpoint.armstrong.southbound.v1`.

That six-to-eight-minute loop answers the hard questions:

1. Can the authored task carry the player into a required physical collision without feeling like a
   hidden trigger?
2. Can partial right-wing loss create an immediate but recoverable control problem?
3. Can a wingman inspect damage using only observable geometry?
4. Can the no-landing conclusion emerge from demonstrated control margin rather than a cutscene?
5. Do retries preserve history without making the player feel punished for not guessing the plot?

Once that loop works, build outward to *Essex*, southbound flight, ejection, descent and recovery.

## Agency at the mandatory strike

The game does not ask whether the incident happens. It asks how well the player flies into it and
what they do with the damaged aircraft afterward.

- The player retains live flight control throughout the attack, cable contact and first correction.
- The target task, terrain and canonical egress corridor create the collision opportunity; the
  controller never steers, snaps or teleports the aircraft into a cable.
- Damage authority requires a real swept-volume intersection between the rendered cable centerline
  and the outer-right-wing collision volume. Crossing an invisible story trigger is insufficient.
- Player performance determines contact speed, attitude, control state, impulse and the difficulty
  of the recovery, even though the source-bounded wing-loss profile remains an authored invariant.
- A physical avoidance or corridor bypass is a valid simulation observation but a noncanonical
  reconstruction attempt. It restores the attack-run checkpoint with an explicit reconstruction
  notice; it is neither scored as failure to “be Armstrong” nor continued as alternate history.
- Playtests must distinguish dramatic acceptance from learned helplessness. If the required run
  reads as control seizure, collision magnetism or a trick cable, the route design has failed.

## Runtime ownership

| Concern | Proposed owner | Existing seam |
|---|---|---|
| Fixed beat and checkpoint state | `ArmstrongCableStrikeController` | `CasevacMissionController` pattern |
| Monotonic mission events | session-owned sequence allocator plus typed Korea event records | CASEVAC post-commit event sink |
| Route and cable definitions | immutable mission scenario definition | existing terrain and scenario definitions |
| Cable collision | `CableHazardField` | fixed-tick swept collision patterns |
| Damage composition | `PartialAirframeDamageState` plus aerodynamic composer | `AirframeAerodynamicState` |
| Player flight | existing `AircraftSim` | deterministic 120 Hz authority |
| Carpenter formation and inspection | `DamageInspectionFlight` | formation actor/doctrine patterns |
| Radio identity and timing | `ArmstrongRadioDirector` consuming catalog IDs | `MissionRadioDirector` |
| Evidence and replay | `NarrativeEvidenceRecorder` | `IncidentReplayRecorder` bounded samples/events |
| Presentation | projected mission snapshot and event cursor | current observer-safe snapshot boundary |

The sequence JSON remains an authoring and validation artifact in v1. Do not write a generic
reflection-driven story interpreter before one explicit mission has proved the abstractions.

## Proposed source layout

```text
sim/
  Korea/
    ArmstrongCableStrikeContracts.cs
    ArmstrongCableStrikeController.cs
    ArmstrongCableStrikeScenario.cs
    CableHazardField.cs
    PartialAirframeDamage.cs
    DamageInspectionFlight.cs
    EjectionLifecycle.cs
    ParachuteLifecycle.cs
    ArmstrongRadioDirector.cs
    NarrativeEvidenceRecorder.cs

sim.Tests/
  Korea/
    ArmstrongCableStrikeControllerTests.cs
    CableHazardFieldTests.cs
    PartialAirframeDamageTests.cs
    DamageInspectionFlightTests.cs
    EjectionLifecycleTests.cs
    NarrativeEvidenceRecorderTests.cs
    ArmstrongCableStrikeSessionTests.cs
```

Names can change at implementation review. The boundaries should not.

## Controller contract

Use an explicit typed state machine:

```text
Ready
  -> DeckLaunch
  -> Join
  -> ValleyIngress
  -> AttackRun
  -> CableCorridor
  -> DamagedUnstable
  -> DamagedStabilized
  -> Inspection
  -> Southbound
  -> EjectionSetup
  -> Ejection
  -> UnderCanopy
  -> Grounded
  -> Quiet
  -> Complete
```

One `Advance` call represents one unpaused authority tick. Like CASEVAC, it should:

- reject non-monotonic source ticks;
- snapshot mutable state before a tick and restore it if authority throws;
- commit state before notifying presentation observers;
- emit a bounded number of typed events in monotonic sequence order;
- allow at most one primary beat transition per tick, while permitting required same-tick physical
  event pairs such as cable-contact then damage-committed;
- expose an immutable snapshot containing only observer-safe state;
- treat a quiet-skip request as presentation acknowledgement, not a hidden simulation tick.

The controller consumes observations. It does not set aircraft pose, manufacture a collision,
remove a wing, place Carpenter or deploy a parachute.

## Fixed-history restart

Checkpoint state needs more than the current player pose:

- simulation tick and accumulator;
- mission seed and weather state;
- player and Carpenter aircraft state;
- aircraft systems, fuel, stores and damage state;
- route-gate and target state;
- controller phase and event sequence watermark;
- radio queue/cursor and already-consumed line identities;
- evidence-recorder checkpoint marker;
- all active physical entities relevant after restore.

Event identity must remain monotonic across retries even when physical mission time rewinds. A
restart starts a new reconstruction epoch with:

- a fresh epoch event sequence;
- a reference to the checkpoint being restored;
- the same authored conditions and random seed;
- no presentation replay of stale one-shot events.

The failed attempt may remain in local playtest telemetry, but the historical debrief consumes only
the completed epoch plus a bounded retry summary.

## Physical cable

The mission definition owns each cable as immutable geometry:

- stable cable ID;
- two or more world-space support points;
- radius;
- material and render profile;
- history/reconstruction label;
- source references;
- activation bounds and required streaming residency;
- collision layers.

Renderer and collision consume the same centerline. Accessibility may change contrast, thickness
on screen or an instrument cue only within a reviewed visual treatment; it may not move collision
truth.

At 120 Hz a fast jet can cross several metres per tick, so point overlap is inadequate. The first
prototype should sweep the aircraft's damaged-relevant volumes from previous to current pose
against cable capsules. It records:

- cable ID and segment;
- aircraft component ID;
- world contact point;
- cable tangent;
- relative velocity;
- parametric time within the tick;
- pre-contact pose and controls;
- applied impulse;
- resulting damage profile ID.

Only the required outer-right-wing volume is damage-authoritative in the first slice. Other
contacts remain terminal or restart conditions until a broader cable/airframe fracture model is
justified.

## Nonterminal wing damage

Do not route the cable through `BeginCatastrophicDamage`. The existing terminal path turns off
combustion and removes pilot control, which is the opposite of this incident.

The existing `AirframeAerodynamicState` already provides the necessary force-model seam:

- drag increment;
- pitch-moment increment;
- persistent lateral-lift difference;
- roll, pitch and yaw authority fractions.

Add a mission damage state and compose it with the live systems state before each powered tick:

```text
systems configuration
  + aircraft automatic surfaces
  + persistent mission damage
  = effective powered-flight configuration
```

Composition must be explicit and tested. Additive coefficients may add; authority fractions should
multiply and clamp; metadata such as gear fraction must retain one owner. Never overwrite the
systems configuration with damage or vice versa.

The first `PantherRightOuterWingLoss` profile should isolate uncertain values:

- removed span and area;
- tip-tank mass and fuel treatment;
- right-aileron area/authority loss;
- lift and induced/profile drag change;
- rolling and yawing moment;
- structural buffet and loose-part state;
- visual detach boundary.

Calibrate a bounded family, not one magic answer. Acceptance is a corridor:

- the documented-scale loss is survivable at incident speed and altitude with prompt correct input;
- no-input and wrong-input cases depart or hit terrain;
- the aircraft requires persistent lateral input;
- slowing toward a landing envelope exhausts useful roll margin;
- coefficients remain stable across frame schedules because authority runs at fixed ticks.

The exact numbers remain `reconstruction` in the dossier.

## Carpenter

Carpenter's actor has three modes in the risk slice:

1. lead the attack path;
2. remain clear during the initial damaged upset;
3. move to an inspection station after stabilization.

Inspection completion requires relative position, closure, line of sight and dwell. Its observation
contains only renderable component facts such as:

- outer right-wing mesh absent;
- tip tank absent or present;
- aileron geometry intact, partial or absent;
- smoke, fuel or loose structure visible;
- relative attitude and oscillation.

It must not receive aerodynamic coefficients, hidden structural health, controller phase or the
future ejection decision.

The no-landing predicate combines:

- Carpenter's visible damage report;
- player-demonstrated sustained lateral demand;
- simulated roll-authority margin across a bounded slower-speed probe or predicted envelope;
- the historical invariant that the sortie proceeds to ejection.

History owns the conclusion. Physics owns why it is legible.

## Workload-aware radio

Do not place emergency dialogue on a simple elapsed-time schedule.

The radio director consumes:

- committed event sequence;
- current beat;
- roll rate, terrain margin and pilot operational state;
- radio availability;
- inspection geometry;
- line history.

For example, `line.armstrong.06-damage-report.v1` queues after damage but cannot key until the
initial roll is below the do-not-interrupt threshold. If a line becomes stale at beat exit, its
catalog policy decides whether to drop it or require completion.

Measured generated-audio duration remains presentation metadata. The authoritative decision event
does not wait for a file to finish playing.

## Ejection lifecycle

Build this only after the Panther handbook and seat source lock. The lifecycle still needs an
explicit contract now:

```text
AircraftOccupied
  -> PreparationComplete
  -> SeatFiring
  -> SeatClear
  -> PilotSeatSeparated
  -> ParachuteDeploying
  -> UnderCanopy
  -> GroundContact
  -> Recoverable
```

Aircraft, seat, pilot and canopy are separate authoritative entities after their respective
transitions. The aircraft keeps its damaged aerodynamics and continues to integrate. Presentation
never teleports the camera to a free-floating cinematic transform.

Plot-breaking failure inside the documented ejection sequence restores
`checkpoint.armstrong.ejection-setup.v1`; it does not record Armstrong's death.

## Evidence recorder

`IncidentReplayRecorder` is valuable precedent but currently freezes around terminal carrier
incidents and accepts a narrow set of `SessionEventType` values. Do not overload it with a
nonterminal cable incident and multi-entity ejection lifecycle.

The narrative recorder should keep:

- 10 seconds of pre-cable samples;
- every route, collision, damage, checkpoint, inspection, decision, ejection, parachute and ground
  event;
- 12 Hz player and Carpenter kinematics;
- 120 Hz bounded windows around cable contact, the first recovery input and ejection;
- systems, aerodynamic-damage and control-authority snapshots;
- player inputs and assistance state;
- source/reconstruction profile IDs;
- epoch and checkpoint identity.

It freezes only when the narrative controller reaches `Complete` or an explicit debug export is
requested. Replay reads frozen evidence and never re-runs collision or damage physics.

## Observer-safe projection

The browser needs:

- current beat and objective text ID;
- checkpoint/reconstruction epoch;
- public route/target/cable presentation data;
- player-observable damage and controls;
- Carpenter's projected pose and visible report;
- current radio line ID, timing and caption;
- ejection/parachute entity transforms after those entities exist;
- a monotonic narrative event cursor.

It must not receive:

- future cable collision timing;
- hidden cable visibility boosts not actually rendered;
- undiscovered damage coefficients;
- the next required player input;
- a future phase or success predicate.

## First implementation increments

### Increment A — deterministic controller

- Contracts, phases, observations, events and snapshots.
- Attack-run through southbound checkpoint only.
- Restart epochs and unit tests.
- No aircraft integration yet; use synthetic observations.

### Increment B — physical cable

- Primitive line/capsule rendering from one shared definition.
- Swept component collision.
- Ordered contact and damage events.
- Deterministic collision tests at several speeds and frame schedules.

### Increment C — partial damage

- Damage composition with existing systems aerodynamics.
- One provisional Panther surrogate and sensitivity family.
- Roll-arrest corridor tests and replay capture.

### Increment D — Carpenter and decision

- Formation lead and inspection station.
- Observer-visible damage report.
- Control-margin predicate and no-landing event.
- Sparse text-only radio catalog integration.

### Increment E — expand outward

- Panther and *Essex* launch.
- Full target corridor and southbound route.
- Ejection and parachute after technical source lock.
- Recovery, debrief and source archive.

## Proof matrix

| Proof | Minimum test |
|---|---|
| Required history | Every fixed-history phase is ordered and reachable |
| No hidden trigger | Cable contact fails when geometry does not intersect |
| Required progression | Missing or bypassing the cable restores checkpoint |
| Determinism | Same seed and commands produce the same event and state hashes |
| Damage continuity | Visual detach profile and aerodynamic profile share one damage ID |
| Player authority | Control input remains live from contact through stabilization |
| Inspection safety | Carpenter reports only projected visible component state |
| Decision legibility | No-landing event requires both visible damage and control-margin evidence |
| Radio safety | Lines cannot advance mission state and defer under critical workload |
| Retry hygiene | New epoch does not replay stale collision, damage or radio events |
| Replay truth | Frozen evidence reproduces contact, correction and inspection without physics |
| Accessibility | Alternate cues expose the same facts without moving cable truth |
| Theatre isolation | Ukraine and non-Korea content packs remain byte-for-byte behaviorally stable |

## Definition of a successful first playtest

A player who knows nothing about Armstrong can finish the cable-to-decision loop and accurately say:

- the aircraft hit a physical cable during the route;
- the right wing lost substantial structure;
- speed kept the remaining lateral control effective;
- Carpenter inspected the damage from outside;
- landing was rejected because slowing threatened control.

They should not need to remember a speech, read an essay or be told that the protagonist later went
to the Moon.
