# Rapier glide-drone vertical slice (design)

Status: Approved in conversation 2026-07-27 · Supersedes the deterministic formation wipe as
the intended Attack outcome · Companion to `docs/rapier-gun-drone-system.md` (system boundary
still provisional; this slice is the first physical proof).

## Thesis

Rapier’s gun-drones are reusable **energy-gliders with a cheap turbine and a gun**, not miniature
interceptors. They leave the carrier inside the Attack window, ride inherited kinetic energy into
the high-slow formation, shoot with ordinary gun rules, then light a turbine and fly home to an
**intermittent pickup point** — not Rapier’s arresting strip. That presence is what makes egress
hard to chase: pursuers face live gunfighters while Rapier keeps its dash.

Today `F` still cheats: consume four drones, catastrophically destroy the formation, start a 1-D
pursuit scalar. Presentation must not keep implying that cheat is the finished swarm.

## Decision record

| Choice | Decision |
|---|---|
| Release energy | Inherit Rapier state; glide / dive — no requirement to outrun Rapier |
| Propulsion | Unpowered at release; cheap turbine below a Mach/altitude arming gate |
| Reuse | Intentional; RTB to intermittent FARP / quiet pickup |
| Pickup | Off Rapier’s strip; drones fly the whole way home |
| First cut | **One** physical drone (Approach A) |
| Scale | Four drones + thin coordinator **only after** the one-drone slice is green |
| Bandits | React: break / evade / optionally engage the drone |

## Concept of operations

1. Mission automation flies Rapier to Attack (unchanged).
2. Pilot presses `F` once. Slice consumes **one** of the authored four-drone load.
3. Kernel spawns one drone aircraft slightly below/aft of Rapier with a short safe-separation
   interval before guidance arms.
4. Drone phases: **Separate → Commit (gun) → Screen/Loiter (optional) → RTB pickup**.
5. At least the threatened bandit leaves scripted rail and becomes reactive toward the drone.
6. Rapier may continue Escape / RTB under the existing director; the drone is an independent actor.
7. Drone “recovers” on reaching a pickup volume under control (or bingo-and-arrive). It does not
   trap on Rapier’s wires in this slice.

## Drone vehicle (provisional public-data sketch)

Exact numbers remain provisional and live in one `AircraftParams` + fuel card so they can move
without rewriting doctrine.

| Property | Intent |
|---|---|
| Role | Reusable gun-only dogfighting drone |
| Mass | Hundreds of kg class (attritable fighterette, not a second Rapier) |
| Aero | Low enough wing loading to turn after energy bleed; glide-capable |
| Gun | Same engagement / hit rules as ownship; bounded ammo |
| Propulsion | Thrust 0 until turbine arming gate; then a cheap low-bypass / small turbojet map |
| Fuel | Fight loiter + RTB to pickup — not dash accompaniment |
| Sensors | Enough for assigned target + self-separation; no full Rapier suite |
| Presentation | Distinct small mesh; not mini-Rapier; not the one-way attack-drone prop |

Thermal/structural honesty: release must respect a **drone skin envelope**. If Rapier is still
outside that envelope, Attack cue / release authority waits or the director has already brought
the pair into a releasable band. Do not silently spawn melting airframes.

## Release and director coupling

- Gate: `RapierMissionPhase.Attack`, drones remaining > 0, not already committed this slice.
- Replace `ExecuteRapierFormationSweep`’s instant wipe as the default path.
- Keep a **dev-only** deterministic wipe flag (default off once slice is green) for regression of
  older egress tests if needed.
- Cue copy: release acknowledges a **drone away**, not “FORMATION DESTROYED”.
- Escape / pursuer scalar: do not arm purely because `F` was pressed. Arm pursuit pressure from
  surviving opponents / doctrine once the fight is actually contested; prefer real geometry over
  the 1-D range integrator when a live drone is present.

## Bandit reaction

On release:

- Promote the assigned contact (and later each committed member) off pure rail onto reactive
  doctrine with the **drone** as a primary threat when inside a simple threat volume.
- Preferred behaviours: break turn, extend, beam the drone; commit to the drone only when
  geometry is lethal and Rapier is already leaving.
- No omniscient awareness: react when the drone is inside range/aspect bounds.

Scripted four-ship staging can remain for the transit; the expensive reactive search starts at
release, not at buried launch (same performance rationale as today’s rail comment in
`Beats.RapierIntercept`).

## Pickup

- Author a fixed intermittent pickup waypoint in the Ukraine / Rapier corridor mission
  environment (quiet strip or FARP marker — presentation can be minimal in the slice).
- Drone RTB guidance targets that point after Commit ends (kill, ammo out, or screen timer).
- Success: enter pickup volume, gear-safe / controlled, fuel ≥ 0. Failure modes: wreck, bingo
  short, or still fighting when the sortie ends — attritable in practice, reusable by intent.

## Scaling (after A is green)

Only then:

1. Release remaining carried drones up to four on the same `F` (or staged releases if envelope
   demands).
2. Thin swarm coordinator: 1:1 assign, no double-commit, one drone may **screen** instead of
   pursue a kill while Rapier egresses.
3. Revisit mass/CG travel for two- vs four-drone load (still open in
   `docs/rapier-gun-drone-system.md`).

## Non-goals (this slice)

- Full four-drone coordinator, datalink-denied autonomy, launch-cell doors, CFD separation
- Drone recovery onto Rapier’s arrestor
- Perfect multi-bandit BFM for all four ships from mission start
- Closing every open packaging question in the system doc

## Player / agent surfaces

| Actor | What they see |
|---|---|
| Player | Visible drone mesh + tracers; cue that a drone is away; bandits break; quiet line does not claim formation destroyed until it is |
| Agent | Headless card: release → sep → gun effect or bandit reaction → turbine arm → pickup volume; JSONL under `analysis/` (schema TBD in plan) |

## Acceptance

1. One `F` in Attack spawns one physical drone; drones remaining decrements by one.
2. Drone is visible and separable in the snapshot / scene.
3. At least one bandit leaves rail and reacts (break/evade/engage drone).
4. Drone can apply gun effects with ordinary combat rules.
5. Drone can arm turbine past the gate and reach the pickup volume in a harness card.
6. Rapier can still egress / recover under the director without the instant wipe.
7. Briefing and `docs/rapier-gun-drone-system.md` stop describing the deterministic wipe as the
   shipped swarm; point at this slice instead.
8. `./bin/check` stays green.

## Open numbers (fill during implementation plan, not blockers for the shape)

- Drone dry mass, wing area, turbine thrust, fuel mass, ammo count
- Turbine arming Mach / altitude gate
- Safe-separation offset and duration
- Pickup lat/long or local ENU relative to strip
- Threat volume for bandit reaction
