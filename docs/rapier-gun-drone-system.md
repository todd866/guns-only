# Rapier gun-drone system

Status: **vertical slice shipped** for one physical drone (separate → commit → RTB pickup). System
architecture and four-drone scale remain provisional. Deterministic formation wipe is **no longer**
the default Attack contract — opt in via `DeterministicSwarmWipe` on `ScriptedInterceptConfig`
for legacy egress cards only.

Design spec:
[`docs/superpowers/specs/2026-07-27-rapier-glide-drone-vertical-slice-design.md`](superpowers/specs/2026-07-27-rapier-glide-drone-vertical-slice-design.md)

Implementation plan:
[`docs/superpowers/plans/2026-07-27-rapier-glide-drone-vertical-slice.md`](superpowers/plans/2026-07-27-rapier-glide-drone-vertical-slice.md)

Agent OFT: `analysis/glide-drone-oft/` (`guns-only.glide-drone-oft.v1`).

## Current authored contract

Rapier carries four reusable gun-only dogfighting drones. Four is the mission load, not yet an
engineering claim about what fits inside the aircraft. It sits at the upper end of the intended
two-to-four range because the first scripted target is a four-aircraft formation and the swarm
must also complicate pursuit during egress.

**Briefing honesty:** the live slice releases **one** physical drone per `F` press. Each release
consumes one of the authored four-drone load, spawns a real `RapierGunDrone` actor (own sim, gun,
phase AI), and promotes threatened bandits to reactive inside a threat volume. The pilot still
chooses when to release; mission automation does not. Scale to four coordinated drones comes
**after** this slice is green — do not brief or present as if four independent airframes are already
in the sim.

The pilot retains the consequential decision. Mission automation flies the long intercept profile,
but it does not release the swarm. Inside the attack window, one press of `F` commits **one**
drone (today). That drone glides on inherited energy, may employ the gun under ordinary hit rules,
lights a cheap turbine below a Mach/altitude gate, and RTBs to an intermittent pickup point — not
Rapier's arresting strip. Rapier may continue Escape while the drone fights or flies home.

What is **not** yet simulated: four-drone coordinator, screen assignment, datalink-denied modes,
landing on Rapier wires, perfect CFD separation. Presentation and briefing must not imply those
details are finished.

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

The one-drone vertical slice proves physical launch from Rapier, autonomous separation, target
assignment, same-flight-model gun engagement, bandit reaction, turbine-gated RTB, and a bounded
end state (pickup volume or RTB progress). Only after that slice stays green should the load be
balanced between two, three, and four drones with a thin coordinator. Until then, four remains the
clear authored gameplay load and every physical number remains provisional.
