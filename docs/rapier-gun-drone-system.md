# Rapier gun-drone system

Status: gameplay contract implemented; physical system architecture provisional.

## Current authored contract

Rapier carries four reusable gun-only dogfighting drones. Four is the mission load, not yet an
engineering claim about what fits inside the aircraft. It sits at the upper end of the intended
two-to-four range because the first scripted target is a four-aircraft formation and the swarm
must also complicate pursuit during egress.

The pilot retains the consequential decision. Mission automation flies the long intercept profile,
but it does not release the swarm. Inside the attack window, one press of `F` commits all four
drones. They split into simultaneous close fights, can each service more than one aircraft, and
leave pursuers spending time and geometry on the swarm while Rapier keeps its Mach-4 egress.

The current simulation represents that outcome deterministically: release consumes the four-drone
load, defeats the staged four-ship formation, and starts a two-pursuer separation problem. It does
not yet simulate individual sub-drone kinematics, gun ammunition, damage, recovery, or a physical
launch transient. Presentation and briefing must not imply that those unimplemented details have
already been solved.

## System boundary to engineer

The eventual system has five explicit parts:

1. The Rapier carrier aircraft provides protected carriage, electrical/thermal conditioning,
   mission data, release authority, and initial separation.
2. Two to four launch cells provide positive retention and a release envelope compatible with the
   carrier's speed, temperature, and local flow field.
3. Each drone provides propulsion, flight control, sensing, a bounded gun/ammunition package, and
   enough autonomy to continue when the carrier leaves or the datalink is denied.
4. The swarm coordinator allocates targets, prevents duplicate commitments and collisions, and
   decides when a drone screens the carrier instead of pursuing a kill.
5. Recovery support identifies surviving drones, routes them away from the Rapier approach, and
   either recovers them to a separate strip or declares them expended.

This keeps automation consistent with the plot without deleting pilot agency: the pilot chooses
release and may retake the Rapier at any time; the swarm owns the high-rate coordination that would
be unreasonable to perform from a keyboard cockpit.

## Questions that remain open

- Packaged mass, volume, centre-of-gravity travel, and the credible difference between a two- and
  four-drone load.
- Safe separation from a Mach-4-class carrier, including inlet/nozzle interactions, thermal soak,
  doors or ejectors, and the actual release-speed envelope.
- Gun calibre, ammunition count, recoil management, dispersion, cooling, and how many useful
  engagements one drone can really support.
- Drone propulsion, dash time, combat endurance, and whether reuse survives the mass required for
  landing gear or another recovery method.
- Sensor apertures, track quality, identification rules, and operation when the carrier is already
  leaving the fight.
- Datalink topology, emission control, electronic-warfare failure modes, and the exact autonomy
  permitted after loss of command.
- Target allocation, fratricide avoidance, collision avoidance, abort logic, and behaviour around
  damaged or surrendering aircraft.
- Turnaround labour, reload/recharge time, recovered-drone inspection, and the cost threshold at
  which “reusable” stops being worthwhile.

## Next implementation acceptance

Before individual drones replace the deterministic sweep, a vertical slice should prove one
physical launch from Rapier, autonomous separation, target assignment, a same-flight-model gun
engagement, pursuit-screen behaviour, datalink-loss behaviour, and a bounded end state. Only after
that slice should the load be balanced between two, three, and four drones. Until then, four remains
the clear authored gameplay load and every physical number remains provisional.
